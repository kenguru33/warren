export type SensorType = 'temperature' | 'humidity' | 'camera' | 'motion' | 'light' | 'lightlevel'

export type SensorOrigin = 'esp32' | 'hue'

export interface SensorCapabilities {
  brightness?: boolean
  colorTemp?: boolean
  color?: boolean
}

import type { LightThemeKey } from './light-themes'

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
  heaterActive: boolean | null
  fanActive: boolean | null
  origin?: SensorOrigin
  capabilities?: SensorCapabilities
  lightOn?: boolean | null
  lightBrightness?: number | null
  lightReachable?: boolean | null
  lightTheme?: LightThemeKey | null
  hueName?: string | null
  groupId?: number | null
  groupName?: string | null
}

export type LightGroupState = 'all-on' | 'all-off' | 'mixed'

export interface LightGroupView {
  id: number
  roomId: number
  name: string
  memberSensorIds: number[]
  memberCount: number
  state: LightGroupState
  brightness: number | null
  unreachableCount: number
  hasBrightnessCapableMember: boolean
  hasColorCapableMember: boolean
  theme: LightThemeKey
}

export interface MasterState {
  state: LightGroupState
  memberCount: number
  unreachableCount: number
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
  lightGroups: LightGroupView[]
  lightMaster: MasterState | null
}

export interface DiscoveredSensor {
  deviceId: string | null
  sensorId?: number
  sensorType: string
  label?: string | null
  lastSeen: number
  latestValue: number | null
  streamUrl?: string | null
  snapshotUrl?: string | null
  origin?: SensorOrigin
  capabilities?: SensorCapabilities
}
