import { useEffect, useState } from 'react'
import { Laptop, Smartphone, Tablet, TabletSmartphone } from 'lucide-react'
import ResponsiveModal from '../shared/ResponsiveModal'
import { refreshSessions, useRemoteStore } from '../../remote/remoteStore'
import type { DeviceKind } from '../../remote/remoteStore'
import { usePlayerStore } from '../../stores/playerStore'

const KIND_ICONS = { phone: Smartphone, tablet: Tablet, computer: Laptop } satisfies Record<DeviceKind, unknown>

interface DevicePickerProps {
  isOpen: boolean
  onClose: () => void
}

function nowPlayingLabel(nowPlaying: { title: string; artist: string } | null, isPaused: boolean): string {
  if (!nowPlaying) return 'Nothing playing'
  const song = nowPlaying.artist ? `${nowPlaying.title} · ${nowPlaying.artist}` : nowPlaying.title
  return isPaused ? `Paused · ${song}` : song
}

/** Choose which of the user's Tunetuna devices the player controls. */
export default function DevicePicker({ isOpen, onClose }: DevicePickerProps) {
  const devices = useRemoteStore(s => s.devices)
  const targetSessionId = useRemoteStore(s => s.targetSessionId)
  const selfName = useRemoteStore(s => s.selfName)
  const selfKind = useRemoteStore(s => s.selfKind)
  const selectDevice = useRemoteStore(s => s.selectDevice)
  const localTrack = usePlayerStore(s => (s.currentIndex >= 0 ? s.songs[s.currentIndex] ?? null : null))
  const localPlaying = usePlayerStore(s => s.isPlaying)

  // Fresh list and now-playing info while the picker is open
  useEffect(() => {
    if (isOpen) void refreshSessions()
  }, [isOpen])

  const rows = [
    {
      sessionId: null as string | null,
      name: `${selfName} (this device)`,
      kind: selfKind,
      detail: nowPlayingLabel(
        localTrack ? { title: localTrack.Name || '', artist: localTrack.ArtistItems?.[0]?.Name || localTrack.AlbumArtist || '' } : null,
        !localPlaying,
      ),
    },
    ...devices.map(d => ({
      sessionId: d.sessionId as string | null,
      name: d.name,
      kind: d.kind,
      detail: nowPlayingLabel(d.nowPlaying, d.isPaused),
    })),
  ]

  const handleSelect = (sessionId: string | null) => {
    selectDevice(sessionId)
    onClose()
  }

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose}>
      <div className="px-6 pb-6">
        <h3 className="text-white text-lg font-semibold mb-4">Control playback on</h3>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Device">
          {rows.map(row => {
            const selected = row.sessionId === targetSessionId
            const Icon = KIND_ICONS[row.kind]
            return (
              <button
                key={row.sessionId ?? 'self'}
                role="radio"
                aria-checked={selected}
                onClick={() => handleSelect(row.sessionId)}
                className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg transition-colors ${
                  selected ? 'bg-white/10' : 'hover:bg-white/15'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${selected ? 'text-[var(--accent-color)]' : 'text-white/60'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm truncate ${selected ? 'text-[var(--accent-color)]' : 'text-white'}`}>{row.name}</div>
                  <div className="text-xs text-white/50 truncate">{row.detail}</div>
                </div>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    selected ? 'border-[var(--accent-color)]' : 'border-white/40'
                  }`}
                  aria-hidden="true"
                >
                  {selected && <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-fill)]" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </ResponsiveModal>
  )
}

/**
 * The picker, wrapped so taps inside it stay inside it: React events bubble out
 * of portals, and the player bar and player screen react to taps and swipes.
 */
export function DevicePickerSheet({ isOpen, onClose }: DevicePickerProps) {
  return (
    <span
      className="contents"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <DevicePicker isOpen={isOpen} onClose={onClose} />
    </span>
  )
}

interface DevicesButtonProps {
  /** Layout classes; the color is set here (accent while controlling another device) */
  className?: string
  iconClassName?: string
}

/**
 * Opens the device picker. Only shown while another Tunetuna device is online
 * (or being controlled). While controlling another device it shows that
 * device's icon (phone, tablet, laptop) in the accent color.
 */
export function DevicesButton({ className = '', iconClassName = 'w-5 h-5' }: DevicesButtonProps) {
  const [open, setOpen] = useState(false)
  const hasDevices = useRemoteStore(s => s.devices.length > 0)
  const isRemote = useRemoteStore(s => s.targetSessionId !== null)
  const targetKind = useRemoteStore(s => s.devices.find(d => d.sessionId === s.targetSessionId)?.kind ?? null)

  if (!hasDevices && !isRemote) return null

  const Icon = isRemote && targetKind ? KIND_ICONS[targetKind] : TabletSmartphone

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        onTouchStart={(e) => e.stopPropagation()}
        aria-label="Choose a device"
        title="Choose a device"
        className={`${className} ${isRemote ? 'text-[var(--accent-color)]' : 'text-white hover:text-white/80'}`}
      >
        <Icon className={iconClassName} />
      </button>
      <DevicePickerSheet isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}
