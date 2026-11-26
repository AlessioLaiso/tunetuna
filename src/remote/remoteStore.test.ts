import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '../api/sessionTypes'

const { sendGeneralCommand, addToast, setRemotePlaybackDelegate } = vi.hoisted(() => ({
  sendGeneralCommand: vi.fn(() => Promise.resolve()),
  addToast: vi.fn(),
  setRemotePlaybackDelegate: vi.fn(),
}))

vi.mock('../api/jellyfin', () => ({
  jellyfinClient: {
    deviceId: 'me',
    currentUserId: 'user1',
    sendGeneralCommand,
    sendPlaystateCommand: vi.fn(() => Promise.resolve()),
    getItemsByIds: vi.fn(() => Promise.resolve([])),
    getControllableSessions: vi.fn(() => Promise.resolve([])),
  },
}))
vi.mock('../stores/musicStore', () => ({ useMusicStore: { getState: () => ({ songs: [] }) } }))
vi.mock('../stores/toastStore', () => ({ useToastStore: { getState: () => ({ addToast }) } }))
vi.mock('../stores/playerStore', () => ({ setRemotePlaybackDelegate }))

import { handleSessions, handleRemoteState, deviceKind, remotePosition, useRemoteStore } from './remoteStore'
import { decodeRemoteMessage, encodeRemoteMessage } from './protocol'

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    Id: 'session-' + (overrides.DeviceId ?? 'x'),
    UserId: 'user1',
    Client: 'Tunetuna',
    DeviceName: 'Mac',
    SupportsRemoteControl: true,
    ...overrides,
  }
}

beforeEach(() => {
  useRemoteStore.getState().selectDevice(null)
  useRemoteStore.setState({ devices: [], selfSessionId: null, remote: null })
  vi.clearAllMocks()
})

describe('handleSessions', () => {
  it('lists other controllable Tunetuna sessions of this user only', () => {
    handleSessions([
      session({ DeviceId: 'me', DeviceName: 'iPhone' }),
      session({ DeviceId: 'mac' }),
      session({ DeviceId: 'web', Client: 'Jellyfin Web' }),
      session({ DeviceId: 'other-user', UserId: 'user2' }),
      session({ DeviceId: 'no-socket', SupportsRemoteControl: false }),
    ])
    const { devices, selfSessionId } = useRemoteStore.getState()
    expect(devices.map(d => d.deviceId)).toEqual(['mac'])
    expect(selfSessionId).toBe('session-me')
  })

  it('numbers devices sharing a name in DeviceId order, this device included', () => {
    handleSessions([
      session({ DeviceId: 'me', DeviceName: 'iPhone' }),
      session({ DeviceId: 'aaa', DeviceName: 'iPhone' }),
      session({ DeviceId: 'zzz', DeviceName: 'iPhone' }),
    ])
    const { devices, selfName } = useRemoteStore.getState()
    expect(devices.map(d => d.name)).toEqual(['iPhone', 'iPhone 3'])
    expect(selfName).toBe('iPhone 2')
  })

  it('shows what each device plays', () => {
    handleSessions([
      session({
        DeviceId: 'mac',
        NowPlayingItem: { Id: 's1', Name: 'Song', ArtistItems: [{ Id: 'a', Name: 'Artist' }] },
        PlayState: { IsPaused: false },
      }),
    ])
    expect(useRemoteStore.getState().devices[0]).toMatchObject({
      nowPlaying: { title: 'Song', artist: 'Artist' },
      isPaused: false,
      kind: 'computer',
    })
  })

  it('falls back to this device once the controlled one has been gone a while', () => {
    vi.useFakeTimers()
    handleSessions([session({ DeviceId: 'me' }), session({ DeviceId: 'mac' })])
    useRemoteStore.getState().selectDevice('session-mac')

    handleSessions([session({ DeviceId: 'me' })])
    expect(useRemoteStore.getState().targetSessionId).toBe('session-mac')
    vi.advanceTimersByTime(16_000)
    handleSessions([session({ DeviceId: 'me' })])
    expect(useRemoteStore.getState().targetSessionId).toBeNull()
    expect(addToast).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('selectDevice', () => {
  it('subscribes to the device and seeds what it plays from the session list', () => {
    handleSessions([
      session({ DeviceId: 'me' }),
      session({
        DeviceId: 'mac',
        NowPlayingItem: { Id: 's1', Name: 'Song', RunTimeTicks: 1_800_000_000 },
        PlayState: { IsPaused: true, PositionTicks: 300_000_000, PlaybackOrder: 'Shuffle', RepeatMode: 'RepeatOne' },
      }),
    ])
    useRemoteStore.getState().selectDevice('session-mac')

    const remote = useRemoteStore.getState().remote!
    expect(remote.songs.map(s => s.Id)).toEqual(['s1'])
    expect(remote).toMatchObject({ currentIndex: 0, isPlaying: false, position: 30, duration: 180, shuffle: true, repeat: 'one' })
    expect(setRemotePlaybackDelegate).toHaveBeenCalledWith(expect.any(Object))

    const [target, name, args] = sendGeneralCommand.mock.calls[0] as unknown as [string, string, { String: string }]
    expect([target, name]).toEqual(['session-mac', 'SendString'])
    expect(decodeRemoteMessage(args.String)).toMatchObject({ op: 'subscribe', replyTo: 'session-me' })
  })

  it('stops routing to the device when switching back', () => {
    handleSessions([session({ DeviceId: 'me' }), session({ DeviceId: 'mac' })])
    useRemoteStore.getState().selectDevice('session-mac')
    useRemoteStore.getState().selectDevice(null)
    expect(setRemotePlaybackDelegate).toHaveBeenLastCalledWith(null)
    expect(useRemoteStore.getState().remote).toBeNull()
  })
})

describe('handleRemoteState', () => {
  it('only accepts state from the controlled device, with indices relative to the window', () => {
    handleSessions([session({ DeviceId: 'me' }), session({ DeviceId: 'mac' })])
    useRemoteStore.getState().selectDevice('session-mac')
    const state = {
      op: 'state' as const, offset: 10, total: 30, items: ['a', 'b', 'c'], sources: 'uur',
      currentIndex: 11, isPlaying: true, position: 5, duration: 100, shuffle: false, repeat: 'off' as const,
      showRecommendations: true,
    }

    handleRemoteState({ ...state, from: 'session-elsewhere' })
    expect(useRemoteStore.getState().remote).toBeNull()

    handleRemoteState({ ...state, from: 'session-mac' })
    const remote = useRemoteStore.getState().remote!
    expect(remote.currentIndex).toBe(1)
    expect(remote.songs.map(s => s.source)).toEqual(['user', 'user', 'recommendation'])
  })
})

describe('helpers', () => {
  it('guesses the device kind from its name', () => {
    expect(deviceKind('iPhone 2')).toBe('phone')
    expect(deviceKind('Android tablet')).toBe('tablet')
    expect(deviceKind('Windows PC')).toBe('computer')
  })

  it('advances the position only while playing, capped at the duration', () => {
    const base = { songs: [], offset: 0, total: 0, currentIndex: 0, position: 10, positionAt: 1000, duration: 12, shuffle: false, repeat: 'off' as const, showRecommendations: false }
    expect(remotePosition({ ...base, isPlaying: true }, 2000)).toBe(11)
    expect(remotePosition({ ...base, isPlaying: true }, 9000)).toBe(12)
    expect(remotePosition({ ...base, isPlaying: false }, 9000)).toBe(10)
  })

  it('ignores SendString payloads that are not Tunetuna messages', () => {
    expect(decodeRemoteMessage('hello')).toBeNull()
    expect(decodeRemoteMessage(JSON.stringify({ op: 'skipTo' }))).toBeNull()
    expect(decodeRemoteMessage(encodeRemoteMessage({ op: 'clearUpcoming' }))).toMatchObject({ op: 'clearUpcoming' })
  })
})
