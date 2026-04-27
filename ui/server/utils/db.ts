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

export function getDb(): Database.Database {
  if (_db) return _db

  const dir = join(process.cwd(), '.data')
  mkdirSync(dir, { recursive: true })

  _db = new Database(join(dir, 'warren.db'))
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}

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
  `)

  // Migrations: add columns that may be missing from older DB files
  const columns = db.pragma('table_info(sensors)') as { name: string; notnull: number }[]
  if (!columns.some(c => c.name === 'device_id')) {
    db.exec('ALTER TABLE sensors ADD COLUMN device_id TEXT')
  }

  // Make sensors.room_id nullable so sensors can be unassigned from a room without being deleted
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

  // Make room_references columns nullable (drop NOT NULL constraints)
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

  // Relax sensors.type CHECK to accept Hue types ('light', 'lightlevel', 'daylight').
  // Gated on a meta sentinel because the CHECK constraint is not visible via PRAGMA.
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
