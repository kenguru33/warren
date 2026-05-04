import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export function getOrCreateHostId(db: Database.Database): string {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key = 'host_id'`)
    .get() as { value: string } | undefined

  if (row?.value) return row.value

  const id = randomUUID()
  db.prepare(`INSERT INTO meta (key, value) VALUES ('host_id', ?)`).run(id)
  return id
}
