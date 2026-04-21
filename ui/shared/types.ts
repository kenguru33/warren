export type SensorType = 'temperature' | 'humidity' | 'camera' | 'motion'

export interface SensorView {
  id: number
  roomId: number
  type: SensorType
  deviceId: string | null
  label: string | null
  latestValue: number | null
  lastRecordedAt: number | null
  streamUrl: string | null
  snapshotUrl: string | null
  lastMotion: number | null
}

export interface RoomReference {
  refTemp: number
  refHumidity: number
}

export interface RoomWithSensors {
  id: number
  name: string
  reference: RoomReference | null
  sensors: SensorView[]
}

export interface DiscoveredSensor {
  deviceId: string
  sensorType: string
  lastSeen: number
  latestValue: number | null
  streamUrl?: string | null
  snapshotUrl?: string | null
}
