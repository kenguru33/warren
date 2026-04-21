import { InfluxDBClient } from '@influxdata/influxdb3-client'

let _client: InfluxDBClient | null = null

export function getInfluxClient(): InfluxDBClient {
  if (_client) return _client
  _client = new InfluxDBClient({
    host: process.env.INFLUXDB_URL ?? 'http://localhost:8086',
    token: process.env.INFLUXDB_TOKEN ?? '',
    database: process.env.INFLUXDB_DATABASE ?? 'homenut',
  })
  return _client
}

export async function queryInflux(sql: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  try {
    for await (const row of getInfluxClient().query(sql)) rows.push(row)
  } catch (e: any) {
    if (!e?.message?.includes('not found')) throw e
  }
  return rows
}
