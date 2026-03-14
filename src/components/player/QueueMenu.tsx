import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, ListPlus, Moon } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { useSleepTimerStore } from '../../stores/sleepTimerStore'
import PlaylistPicker from '../playlists/PlaylistPicker'
import SleepTimerPicker from './SleepTimerPicker'

interface QueueMenuProps {
  buttonClassName?: string
  menuClassName?: string
}

export default function QueueMenu({
  buttonClassName = 'text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-zinc-800',
  menuClassName = '',
}: QueueMenuProps) {
  const songs = usePlayerStore((s) => s.songs)
  const sleepTimerMode = useSleepTimerStore((s) => s.mode)
  const [menuOpen, setMenuOpen] = useState(false)
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false)
  const [sleepTimerPickerOpen, setSleepTimerPickerOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setMenuOpen(!menuOpen)}
          disabled={songs.length === 0}
          aria-label="Queue options"
          className={`${buttonClassName} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            className={`absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 whitespace-nowrap py-1 ${menuClassName}`}
          >
            <button
              onClick={() => {
                setMenuOpen(false)
                setPlaylistPickerOpen(true)
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-zinc-800 transition-colors"
            >
              <ListPlus className="w-4 h-4 text-gray-400" />
              Add Queue to Playlist
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                setSleepTimerPickerOpen(true)
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-zinc-800 transition-colors"
            >
              <Moon className={`w-4 h-4 ${sleepTimerMode !== 'off' ? 'text-[var(--accent-color)]' : 'text-gray-400'}`} />
              Pause Playback
            </button>
          </div>
        )}
      </div>
      <PlaylistPicker
        isOpen={playlistPickerOpen}
        onClose={() => setPlaylistPickerOpen(false)}
        itemIds={songs.map((s) => s.Id)}
      />
      <SleepTimerPicker
        isOpen={sleepTimerPickerOpen}
        onClose={() => setSleepTimerPickerOpen(false)}
      />
    </>
  )
}
