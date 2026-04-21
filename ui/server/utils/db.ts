import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dir = join(process.cwd(), '.data')
  mkdirSync(dir, { recursive: true })

  _db = new Database(join(dir, 'homenut.db'))
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
      ref_temp     REAL NOT NULL DEFAULT 21.0,
      ref_humidity REAL NOT NULL DEFAULT 50.0
    );

    CREATE TABLE IF NOT EXISTS sensor_announcements (
      device_id    TEXT NOT NULL,
      type         TEXT NOT NULL,
      stream_url   TEXT,
      snapshot_url TEXT,
      last_seen    INTEGER NOT NULL,
      PRIMARY KEY (device_id, type)
    );
  `)

  // Migrations: add columns that may be missing from older DB files
  const columns = db.pragma('table_info(sensors)') as { name: string }[]
  if (!columns.some(c => c.name === 'device_id')) {
    db.exec('ALTER TABLE sensors ADD COLUMN device_id TEXT')
  }
}
