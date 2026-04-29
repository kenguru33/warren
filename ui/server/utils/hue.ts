// Philips Hue Bridge v1 HTTP client.
//
// Stays on v1 (HTTP, no TLS pinning) — v2 EventStream is intentionally deferred.
// All callers should branch on the typed errors below to surface accurate UI states.

export class HueUnauthorizedError extends Error {
  constructor(msg = 'unauthorized') { super(msg); this.name = 'HueUnauthorizedError' }
}

export class HueLinkButtonError extends Error {
  constructor(msg = 'link button not pressed') { super(msg); this.name = 'HueLinkButtonError' }
}

export class HueUnreachableError extends Error {
  constructor(msg = 'bridge unreachable') { super(msg); this.name = 'HueUnreachableError' }
}

export interface HueBridgeCandidate {
  id: string
  internalipaddress: string
}

export interface HueBridgeConfig {
  bridgeid: string
  name: string
  modelid: string
}

export interface HueLightRaw {
  id: string
  name: string
  type?: string
  modelid?: string
  state: {
    on: boolean
    bri?: number
    reachable?: boolean
    [k: string]: unknown
  }
  capabilities?: {
    control?: { mindimlevel?: number }
    [k: string]: unknown
  }
  [k: string]: unknown
}

export interface HueSensorRaw {
  id: string
  name: string
  type: string
  modelid?: string
  state: Record<string, unknown> & { lastupdated?: string }
  config?: Record<string, unknown>
  [k: string]: unknown
}

const FAKE = process.env.HUE_FAKE === '1'

export async function discoverBridges(): Promise<HueBridgeCandidate[]> {
  if (FAKE) return [{ id: 'fakebridge0001', internalipaddress: '127.0.0.1' }]
  try {
    const res = await fetch('https://discovery.meethue.com', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json() as HueBridgeCandidate[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function pingBridge(ip: string): Promise<HueBridgeConfig | null> {
  if (FAKE) return { bridgeid: 'fakebridge0001', name: 'Fake Hue', modelid: 'BSB002' }
  try {
    const res = await fetch(`http://${ip}/api/0/config`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json() as Partial<HueBridgeConfig>
    if (!data?.bridgeid) return null
    return { bridgeid: data.bridgeid, name: data.name ?? 'Hue Bridge', modelid: data.modelid ?? '' }
  } catch {
    return null
  }
}

type RequestKeyResponse =
  | [{ success: { username: string } }]
  | [{ error: { type: number; description: string; address?: string } }]

export async function requestAppKey(ip: string): Promise<RequestKeyResponse> {
  const res = await fetch(`http://${ip}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ devicetype: 'warren#nuxt' }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new HueUnreachableError(`HTTP ${res.status}`)
  return await res.json() as RequestKeyResponse
}

export async function pollForAppKey(
  ip: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  if (FAKE) return process.env.HUE_FAKE_KEY ?? 'fake-app-key-0123456789'

  const timeoutMs = opts.timeoutMs ?? 30_000
  const intervalMs = opts.intervalMs ?? 1_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    let res: RequestKeyResponse
    try {
      res = await requestAppKey(ip)
    } catch (e) {
      if (e instanceof HueUnreachableError) throw e
      throw new HueUnreachableError(String((e as Error).message ?? e))
    }

    const first = res[0]
    if (first && 'success' in first) return first.success.username
    if (first && 'error' in first && first.error.type !== 101) {
      throw new HueUnreachableError(first.error.description)
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new HueLinkButtonError()
}

interface HueErrorWrapper { error: { type: number; description: string } }

function isUnauthorized(arr: unknown): boolean {
  return Array.isArray(arr)
    && arr.length > 0
    && typeof arr[0] === 'object'
    && arr[0] !== null
    && 'error' in (arr[0] as Record<string, unknown>)
    && (arr[0] as HueErrorWrapper).error?.type === 1
}

const FAKE_LIGHTS: HueLightRaw[] = [
  { id: '1', name: 'Fake Living Room', type: 'Extended color light', modelid: 'LCT015',
    state: { on: false, bri: 128, reachable: true } },
  { id: '2', name: 'Fake Office', type: 'Dimmable light', modelid: 'LWB010',
    state: { on: true, bri: 200, reachable: true } },
]

const FAKE_SENSORS: HueSensorRaw[] = [
  { id: '1', name: 'Fake Daylight', type: 'Daylight', state: { daylight: false, lastupdated: '2024-01-01T00:00:00' } },
  { id: '2', name: 'Fake Hallway Motion', type: 'ZLLPresence', modelid: 'SML001',
    state: { presence: false, lastupdated: '2024-01-01T00:00:00' } },
  { id: '3', name: 'Fake Hallway Temperature', type: 'ZLLTemperature', modelid: 'SML001',
    state: { temperature: 2150, lastupdated: '2024-01-01T00:00:00' } },
  { id: '4', name: 'Fake Hallway Light Level', type: 'ZLLLightLevel', modelid: 'SML001',
    state: { lightlevel: 12000, dark: false, daylight: true, lastupdated: '2024-01-01T00:00:00' } },
]

export async function getLights(ip: string, key: string): Promise<HueLightRaw[]> {
  if (FAKE) return FAKE_LIGHTS
  let res: Response
  try {
    res = await fetch(`http://${ip}/api/${key}/lights`, { signal: AbortSignal.timeout(5000) })
  } catch (e) {
    throw new HueUnreachableError(String((e as Error).message ?? e))
  }
  if (!res.ok) throw new HueUnreachableError(`HTTP ${res.status}`)
  const data = await res.json() as Record<string, HueLightRaw> | unknown
  if (isUnauthorized(data)) throw new HueUnauthorizedError()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  return Object.entries(data as Record<string, HueLightRaw>).map(([id, light]) => ({ ...light, id }))
}

export async function getSensors(ip: string, key: string): Promise<HueSensorRaw[]> {
  if (FAKE) return FAKE_SENSORS
  let res: Response
  try {
    res = await fetch(`http://${ip}/api/${key}/sensors`, { signal: AbortSignal.timeout(5000) })
  } catch (e) {
    throw new HueUnreachableError(String((e as Error).message ?? e))
  }
  if (!res.ok) throw new HueUnreachableError(`HTTP ${res.status}`)
  const data = await res.json() as Record<string, HueSensorRaw> | unknown
  if (isUnauthorized(data)) throw new HueUnauthorizedError()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  return Object.entries(data as Record<string, HueSensorRaw>).map(([id, sensor]) => ({ ...sensor, id }))
}

export async function setLightState(
  ip: string,
  key: string,
  hueResourceId: string,
  body: { on?: boolean; bri?: number; xy?: [number, number] },
): Promise<void> {
  if (FAKE) return
  let res: Response
  try {
    res = await fetch(`http://${ip}/api/${key}/lights/${hueResourceId}/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
  } catch (e) {
    throw new HueUnreachableError(String((e as Error).message ?? e))
  }
  if (!res.ok) throw new HueUnreachableError(`HTTP ${res.status}`)
  const data = await res.json() as unknown[]
  if (isUnauthorized(data)) throw new HueUnauthorizedError()
  for (const item of data) {
    if (item && typeof item === 'object' && 'error' in item) {
      const err = (item as HueErrorWrapper).error
      throw new HueUnreachableError(err.description)
    }
  }
}

// Map a Hue sensor type to Warren's sensor_type tag, or null to ignore.
export function mapHueSensorType(hueType: string): 'temperature' | 'motion' | 'lightlevel' | 'daylight' | null {
  switch (hueType) {
    case 'ZLLTemperature':
    case 'CLIPTemperature':
      return 'temperature'
    case 'ZLLPresence':
    case 'CLIPPresence':
      return 'motion'
    case 'ZLLLightLevel':
    case 'CLIPLightLevel':
      return 'lightlevel'
    case 'Daylight':
      return 'daylight'
    default:
      return null
  }
}

// Convert a raw Hue sensor reading into a numeric value Warren stores in InfluxDB.
export function sensorValue(hueType: string, state: Record<string, unknown>): number | null {
  const mapped = mapHueSensorType(hueType)
  if (!mapped) return null
  switch (mapped) {
    case 'temperature':
      return typeof state.temperature === 'number' ? state.temperature / 100 : null
    case 'motion':
      return state.presence === true ? 1 : state.presence === false ? 0 : null
    case 'lightlevel': {
      // Hue lightlevel is 10000 * log10(lux) + 1; convert back to lux.
      const ll = typeof state.lightlevel === 'number' ? state.lightlevel : null
      if (ll === null) return null
      return Math.pow(10, (ll - 1) / 10000)
    }
    case 'daylight':
      return state.daylight === true ? 1 : state.daylight === false ? 0 : null
  }
}

export function lightCapabilities(light: HueLightRaw): { brightness: boolean; colorTemp: boolean; color: boolean } {
  const t = (light.type ?? '').toLowerCase()
  return {
    brightness: t.includes('dimmable') || t.includes('color') || typeof light.state.bri === 'number',
    colorTemp: t.includes('color temperature') || t.includes('extended color'),
    color: t.includes('color'),
  }
}

export function lightSubtype(light: HueLightRaw): 'onoff' | 'dimmable' | 'color' {
  const caps = lightCapabilities(light)
  if (caps.color) return 'color'
  if (caps.brightness) return 'dimmable'
  return 'onoff'
}

export function buildDeviceId(bridgeId: string, hueResourceId: string): string {
  return `hue-${bridgeId}-${hueResourceId}`
}
