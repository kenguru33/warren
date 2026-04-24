import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

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
}
