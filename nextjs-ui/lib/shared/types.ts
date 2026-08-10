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

/** Which stack drives a target. The browser is neither, and has no row. */
export type MusicTargetProtocol = 'cast' | 'sonos'

export interface MusicTargetView {
  targetId: string
  friendlyName: string
  model: string | null
  origin: 'discovered' | 'manual'
  protocol: MusicTargetProtocol
  /**
   * Sonos only: the other rooms a group coordinator carries with it. Non-empty
   * means selecting this target fills every one of those rooms with sound, so
   * the UI must say so rather than let the single room name imply otherwise.
   */
  groupRooms: string[]
  reachable: boolean
  lastSeen: number
}

/**
 * A Sonos favorite, offered instead of Warren's YouTube library when the
 * output is a Sonos speaker.
 *
 * Warren cannot hand a Sonos speaker a YouTube identifier — YouTube Music is a
 * Sonos music service resolved against the user's linked account, not
 * something a LAN controller can push. Favorites are the supported way in: the
 * user saves a playlist as a favorite in the Sonos app once, and Warren can
 * start it from then on. These are read live from the speaker and never
 * stored, because the Sonos app owns the list.
 */
export interface SonosFavoriteView {
  id: string
  title: string
  artworkUrl: string | null
}

/**
 * One entry in a Sonos speaker's queue.
 *
 * The queue is the only content surface the local Sonos stack exposes that
 * Warren does not already show: the linked music services are not browsable
 * over the LAN at all, so this is what "choose what plays next" can mean
 * without an account. Read live — the queue belongs to the speaker and any
 * Sonos client can change it.
 */
export interface SonosQueueEntryView {
  /** 1-based, matching the speaker's own Q:0/N addressing. */
  index: number
  title: string
  artist: string | null
  album: string | null
  artworkUrl: string | null
  isCurrent: boolean
}

/** What the speaker is doing, when that changes what a queue view means. */
export type SonosQueueMode =
  /** A normal queue, populated or not. */
  | 'queue'
  /**
   * A radio stream is playing. Any queue behind it is left over from an
   * earlier session and is not what the room is playing, so showing it as
   * "up next" would be a lie.
   */
  | 'stream'

export interface SonosQueueView {
  mode: SonosQueueMode
  entries: SonosQueueEntryView[]
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
