export type SensorType = 'temperature' | 'humidity' | 'camera' | 'motion' | 'light' | 'lightlevel'

export type SensorOrigin = 'esp32' | 'hue'

export interface SensorCapabilities {
  brightness?: boolean
  colorTemp?: boolean
  color?: boolean
}

export interface SensorView {
  id: number
  roomId: number
  type: SensorType
  deviceId: string | null
  label: string | null
  bridgeName?: string | null
  displayName?: string | null
  latestValue: number | null
  lastRecordedAt: number | null
  streamUrl: string | null
  snapshotUrl: string | null
  lastMotion: number | null
  heaterActive: boolean | null
  fanActive: boolean | null
  origin?: SensorOrigin
  capabilities?: SensorCapabilities
  lightOn?: boolean | null
  lightBrightness?: number | null
  lightReachable?: boolean | null
}

export interface RoomReference {
  refTemp: number | null
  refHumidity: number | null
}

export interface RoomWithSensors {
  id: number
  name: string
  reference: RoomReference | null
  sensors: SensorView[]
}

export interface DiscoveredSensor {
  deviceId: string | null
  sensorId?: number          // set for unassigned persisted sensors (re-assign instead of insert)
  sensorType: string
  label?: string | null
  bridgeName?: string | null
  displayName?: string | null
  lastSeen: number
  latestValue: number | null
  streamUrl?: string | null
  snapshotUrl?: string | null
  origin?: SensorOrigin
  capabilities?: SensorCapabilities
}
