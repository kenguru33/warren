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

export type MusicSourceKind = 'playlist' | 'album' | 'track'

export interface MusicSourceView {
  id: number
  name: string
  kind: MusicSourceKind
  contentId: string
  position: number
  isDefault: boolean
  /** Found unplayable (deleted, private, region-blocked) on a previous attempt. */
  unavailable: boolean
  /** Will not resolve anonymously, so it plays on the browser target only. */
  browserOnly: boolean
}

/** The browser is always available as a target; cast targets are discovered or manual. */
export const BROWSER_TARGET_ID = 'browser'

export interface MusicTargetView {
  targetId: string
  friendlyName: string
  model: string | null
  origin: 'discovered' | 'manual'
  reachable: boolean
  lastSeen: number
}

/**
 * `unknown` is a real state, not a placeholder: a cast target is selected but
 * its state could not be read. It must never be rendered as `idle`.
 */
export type MusicPlaybackStatus =
  | 'idle' | 'playing' | 'paused' | 'loading'
  | 'target-offline' | 'unknown' | 'error'

export interface MusicPlaybackState {
  status: MusicPlaybackStatus
  /** Null means the browser target. */
  targetId: string | null
  targetName: string | null
  sourceId: number | null
  title: string | null
  artist: string | null
  artworkUrl: string | null
  elapsedMs: number | null
  durationMs: number | null
  volume: number | null
  /** Human-readable reason when status is 'error'. */
  error: string | null
  /** When the state was last confirmed against the device. */
  updatedAt: number
}

/**
 * The player is a single global component, not a per-room one: there is one
 * source library, one selected output, and one playback state for the whole
 * house. Rooms know nothing about music.
 */
export interface MusicView {
  configured: boolean
  sources: MusicSourceView[]
  preferredTargetId: string | null
  playback: MusicPlaybackState
}

export const MAX_MUSIC_SOURCES = 12

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
