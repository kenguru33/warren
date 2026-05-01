import { InfluxDBClient } from '@influxdata/influxdb3-client'

let _client: InfluxDBClient | null = null

export function getInfluxClient(): InfluxDBClient {
  if (_client) return _client
  _client = new InfluxDBClient({
    host: process.env.INFLUXDB_URL ?? 'http://127.0.0.1:8086',
    token: process.env.INFLUXDB_TOKEN ?? '',
    database: process.env.INFLUXDB_DATABASE ?? 'warren',
  })
  return _client
}

export async function queryInflux(sql: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  try {
    for await (const row of getInfluxClient().query(sql)) rows.push(row)
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message ?? ''
    if (!msg.includes('not found')) throw e
  }
  return rows
}

export function toMs(timeNs: bigint | number | undefined | null): number | null {
  if (timeNs == null) return null
  if (typeof timeNs === 'bigint') return Number(timeNs / 1_000_000n)
  return Math.floor(timeNs / 1_000_000)
}
