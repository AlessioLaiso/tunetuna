import type { BaseItemDto } from './types'

/** Jellyfin ticks per second (1 tick = 100ns). */
export const TICKS_PER_SECOND = 10_000_000

export type JellyfinRepeatMode = 'RepeatNone' | 'RepeatAll' | 'RepeatOne'
export type JellyfinPlaybackOrder = 'Default' | 'Shuffle'

export interface QueueItem {
  Id: string
  PlaylistItemId?: string
}

/** Body of /Sessions/Playing and /Sessions/Playing/Progress. */
export interface PlaybackReport {
  ItemId: string
  PositionTicks: number
  IsPaused: boolean
  IsMuted: boolean
  VolumeLevel: number
  CanSeek: boolean
  PlayMethod: 'DirectPlay'
  RepeatMode: JellyfinRepeatMode
  PlaybackOrder: JellyfinPlaybackOrder
  NowPlayingQueue: QueueItem[]
  PlaylistItemId?: string
}

export interface PlaybackStopReport {
  ItemId: string
  PositionTicks: number
  NowPlayingQueue?: QueueItem[]
}

/** The parts of Jellyfin's SessionInfoDto that remote control reads. */
export interface SessionInfo {
  Id: string
  UserId: string
  Client?: string
  DeviceId?: string
  DeviceName?: string
  LastActivityDate?: string
  SupportsRemoteControl?: boolean
  NowPlayingItem?: BaseItemDto | null
  NowPlayingQueue?: QueueItem[] | null
  PlaylistItemId?: string | null
  PlayState?: {
    PositionTicks?: number | null
    IsPaused?: boolean
    VolumeLevel?: number | null
    RepeatMode?: JellyfinRepeatMode
    PlaybackOrder?: JellyfinPlaybackOrder
  } | null
}
