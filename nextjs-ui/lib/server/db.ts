import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export async function hashUserPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = await scryptAsync(plain, salt, 64) as Buffer
  return `${salt}:${hash.toString('hex')}`
}

export async function verifyUserPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = await scryptAsync(plain, salt, 64) as Buffer
  const stored_buf = Buffer.from(hash, 'hex')
  if (derived.length !== stored_buf.length) return false
  return timingSafeEqual(derived, stored_buf)
}

let _db: Database.Database | null = null

function resolveDataDir(): string {
  return process.env.WARREN_DATA_DIR ?? join(process.cwd(), '.data')
}

export function getDb(): Database.Database {
  if (_db) return _db

  const dir = resolveDataDir()
  mkdirSync(dir, { recursive: true })

  _db = new Database(join(dir, 'warren.db'))
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}

// Schema changes that alter any table shape (column add/remove/rename, type
// change, CHECK constraint change) must bump SNAPSHOT_SCHEMA_VERSION in
// lib/shared/backup.ts so the restore engine refuses incompatible snapshots.
export function initDb() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS sensors (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id      INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      type         TEXT    NOT NULL CHECK(type IN ('temperature','humidity','camera','motion')),
      device_id    TEXT,
      label        TEXT,
      stream_url   TEXT,
      snapshot_url TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS room_references (
      room_id      INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
      ref_temp     REAL,
      ref_humidity REAL
    );

    CREATE TABLE IF NOT EXISTS sensor_announcements (
      device_id    TEXT NOT NULL,
      type         TEXT NOT NULL,
      stream_url   TEXT,
      snapshot_url TEXT,
      last_seen    INTEGER NOT NULL,
      PRIMARY KEY (device_id, type)
    );

    CREATE TABLE IF NOT EXISTS blocked_sensors (
      device_id TEXT NOT NULL,
      type      TEXT NOT NULL,
      PRIMARY KEY (device_id, type)
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sensor_config (
      device_id             TEXT    PRIMARY KEY,
      ref_temp              REAL,
      heater_on_offset      REAL    NOT NULL DEFAULT 2.0,
      heater_off_offset     REAL    NOT NULL DEFAULT 2.0,
      fan_threshold         REAL    NOT NULL DEFAULT 10.0,
      poll_interval         INTEGER NOT NULL DEFAULT 5,
      config_fetch_interval INTEGER NOT NULL DEFAULT 60,
      updated_at            TEXT,
      last_fetched_at       TEXT
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS hue_bridge (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      bridge_id       TEXT    NOT NULL,
      name            TEXT,
      model           TEXT,
      ip              TEXT    NOT NULL,
      app_key         TEXT    NOT NULL,
      last_sync_at    INTEGER,
      last_status     TEXT,
      last_status_at  INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS hue_devices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id       TEXT    NOT NULL UNIQUE,
      bridge_id       TEXT    NOT NULL,
      hue_resource_id TEXT    NOT NULL,
      kind            TEXT    NOT NULL CHECK(kind IN ('light','sensor')),
      subtype         TEXT,
      name            TEXT,
      model           TEXT,
      capabilities    TEXT,
      last_seen       INTEGER NOT NULL,
      available       INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_hue_devices_bridge ON hue_devices(bridge_id);
    CREATE INDEX IF NOT EXISTS idx_hue_devices_kind   ON hue_devices(kind);

    CREATE TABLE IF NOT EXISTS hue_light_state (
      device_id  TEXT    PRIMARY KEY REFERENCES hue_devices(device_id) ON DELETE CASCADE,
      on_state   INTEGER NOT NULL DEFAULT 0,
      brightness INTEGER,
      reachable  INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS light_groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      theme      TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      UNIQUE (room_id, name)
    );

    CREATE TABLE IF NOT EXISTS light_group_members (
      group_id  INTEGER NOT NULL REFERENCES light_groups(id) ON DELETE CASCADE,
      sensor_id INTEGER NOT NULL UNIQUE REFERENCES sensors(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, sensor_id)
    );

    CREATE INDEX IF NOT EXISTS idx_light_groups_room ON light_groups(room_id);

    -- Music is a single global component, not a per-room one: one source
    -- library, one selected output, one playback state for the whole house.
    -- Deliberately NOT modeled as a sensor type: a player produces no readings
    -- and must stay out of sensor discovery and the InfluxDB pipeline.
    CREATE TABLE IF NOT EXISTS music_config (
      id                  INTEGER PRIMARY KEY CHECK(id = 1),
      preferred_target_id TEXT,
      created_at          INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at          INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS music_sources (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      kind         TEXT    NOT NULL CHECK(kind IN ('playlist','album','track')),
      content_id   TEXT    NOT NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      is_default   INTEGER NOT NULL DEFAULT 0,
      unavailable  INTEGER NOT NULL DEFAULT 0,
      browser_only INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_music_sources_position ON music_sources(position);

    -- Cast targets are shared across rooms. Discovered rows are a cache of what
    -- mDNS saw and may be pruned; manual rows are user configuration and never are.
    CREATE TABLE IF NOT EXISTS music_targets (
      target_id     TEXT    PRIMARY KEY,
      friendly_name TEXT    NOT NULL,
      address       TEXT    NOT NULL,
      port          INTEGER NOT NULL DEFAULT 8009,
      model         TEXT,
      origin        TEXT    NOT NULL DEFAULT 'discovered' CHECK(origin IN ('discovered','manual')),
      last_seen     INTEGER NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    -- Per target, so the browser and each speaker keep independent volumes.
    CREATE TABLE IF NOT EXISTS music_volume (
      target_id TEXT    PRIMARY KEY,
      volume    INTEGER NOT NULL
    );
  `)

  migrateMusicOffRooms(db)

  const columns = db.pragma('table_info(sensors)') as { name: string; notnull: number }[]
  if (!columns.some(c => c.name === 'device_id')) {
    db.exec('ALTER TABLE sensors ADD COLUMN device_id TEXT')
  }

  const lgCols = db.pragma('table_info(light_groups)') as { name: string }[]
  if (!lgCols.some(c => c.name === 'theme')) {
    db.exec('ALTER TABLE light_groups ADD COLUMN theme TEXT')
  }

  const hlsCols = db.pragma('table_info(hue_light_state)') as { name: string }[]
  if (!hlsCols.some(c => c.name === 'theme')) {
    db.exec('ALTER TABLE hue_light_state ADD COLUMN theme TEXT')
  }

  const roomIdCol = columns.find(c => c.name === 'room_id')
  if (roomIdCol?.notnull) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE sensors_migrated (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id      INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
        type         TEXT NOT NULL CHECK(type IN ('temperature','humidity','camera','motion')),
        device_id    TEXT,
        label        TEXT,
        stream_url   TEXT,
        snapshot_url TEXT,
        created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );
      INSERT INTO sensors_migrated SELECT * FROM sensors;
      DROP TABLE sensors;
      ALTER TABLE sensors_migrated RENAME TO sensors;
    `)
    db.pragma('foreign_keys = ON')
  }

  const refCols = db.pragma('table_info(room_references)') as { name: string; notnull: number }[]
  if (refCols.find(c => c.name === 'ref_temp')?.notnull === 1) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE room_references_new (
        room_id      INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
        ref_temp     REAL,
        ref_humidity REAL
      );
      INSERT INTO room_references_new SELECT * FROM room_references;
      DROP TABLE room_references;
      ALTER TABLE room_references_new RENAME TO room_references;
    `)
    db.pragma('foreign_keys = ON')
  }

  const hueSchemaRow = db.prepare(`SELECT value FROM meta WHERE key = 'hue_schema_v1'`).get() as { value: string } | undefined
  if (!hueSchemaRow) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE sensors_hue_v1 (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id      INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
        type         TEXT NOT NULL CHECK(type IN ('temperature','humidity','camera','motion','light','lightlevel','daylight')),
        device_id    TEXT,
        label        TEXT,
        stream_url   TEXT,
        snapshot_url TEXT,
        created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );
      INSERT INTO sensors_hue_v1 SELECT * FROM sensors;
      DROP TABLE sensors;
      ALTER TABLE sensors_hue_v1 RENAME TO sensors;
      INSERT INTO meta (key, value) VALUES ('hue_schema_v1', '1');
    `)
    db.pragma('foreign_keys = ON')
  }
}

/**
 * Collapse the original per-room music schema into the single global player.
 *
 * The first cut scoped music to a room (`room_music`, `music_sources.room_id`,
 * `music_volume.room_id`). One player for the house replaces that, so the
 * room-keyed tables have to be rebuilt — SQLite cannot drop a column in place,
 * hence the shadow-table dance this file uses elsewhere.
 *
 * Sources from every room merge into one library, de-duplicated by content_id
 * because the same playlist saved in two rooms is one entry now. Positions are
 * renumbered and exactly one default survives. Nothing is discarded silently:
 * the merged library keeps every distinct source even if that exceeds
 * MAX_MUSIC_SOURCES, which only guards *new* additions.
 */
function migrateMusicOffRooms(db: Database.Database) {
  const sourceCols = db.pragma('table_info(music_sources)') as { name: string }[]
  const needsSourceMigration = sourceCols.some(c => c.name === 'room_id')

  const volumeCols = db.pragma('table_info(music_volume)') as { name: string }[]
  const needsVolumeMigration = volumeCols.some(c => c.name === 'room_id')

  const roomMusicExists = !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room_music'")
    .get()

  if (!needsSourceMigration && !needsVolumeMigration && !roomMusicExists) return

  db.pragma('foreign_keys = OFF')
  db.transaction(() => {
    if (needsSourceMigration) {
      db.exec(`
        CREATE TABLE music_sources_global (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT    NOT NULL,
          kind         TEXT    NOT NULL CHECK(kind IN ('playlist','album','track')),
          content_id   TEXT    NOT NULL,
          position     INTEGER NOT NULL DEFAULT 0,
          is_default   INTEGER NOT NULL DEFAULT 0,
          unavailable  INTEGER NOT NULL DEFAULT 0,
          browser_only INTEGER NOT NULL DEFAULT 0,
          created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
        );
        INSERT INTO music_sources_global
          (name, kind, content_id, position, is_default, unavailable, browser_only, created_at)
        SELECT name, kind, content_id,
               ROW_NUMBER() OVER (ORDER BY room_id, position, id) - 1,
               0, unavailable, browser_only, created_at
        FROM music_sources
        WHERE id IN (SELECT MIN(id) FROM music_sources GROUP BY content_id);

        DROP TABLE music_sources;
        ALTER TABLE music_sources_global RENAME TO music_sources;
        CREATE INDEX IF NOT EXISTS idx_music_sources_position ON music_sources(position);

        UPDATE music_sources SET is_default = 1
        WHERE id = (SELECT id FROM music_sources ORDER BY position ASC, id ASC LIMIT 1);
      `)
    }

    if (needsVolumeMigration) {
      // One volume per target now; keep the loudest of the per-room values
      // rather than an arbitrary row, so nothing silently goes quiet.
      db.exec(`
        CREATE TABLE music_volume_global (
          target_id TEXT    PRIMARY KEY,
          volume    INTEGER NOT NULL
        );
        INSERT INTO music_volume_global (target_id, volume)
        SELECT target_id, MAX(volume) FROM music_volume GROUP BY target_id;
        DROP TABLE music_volume;
        ALTER TABLE music_volume_global RENAME TO music_volume;
      `)
    }

    if (roomMusicExists) {
      // Any room that had music configured means the house has music
      // configured. The first room's target becomes the global one.
      db.exec(`
        INSERT OR IGNORE INTO music_config (id, preferred_target_id)
        SELECT 1, preferred_target_id FROM room_music ORDER BY room_id ASC LIMIT 1;
        DROP TABLE room_music;
      `)
    }
  })()
  db.pragma('foreign_keys = ON')
}
