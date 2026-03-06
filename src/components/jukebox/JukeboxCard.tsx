import { useState } from 'react'
import { useMusicStore } from '../../stores/musicStore'
import JukeboxModal from './JukeboxModal'

export default function JukeboxCard() {
  const [isOpen, setIsOpen] = useState(false)
  const songs = useMusicStore(s => s.songs)

  if (songs.length === 0) return null

  return (
    <>
      <div className="px-4 pt-2 mb-3">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full relative overflow-hidden rounded-xl transition-all group text-left active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, #1a1510 0%, #12100d 50%, #0e0c0a 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,200,100,0.1)',
          }}
        >
          {/* Warm accent tint overlay */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity group-hover:opacity-[0.12]"
            style={{
              background: `linear-gradient(135deg, var(--accent-color) 0%, transparent 70%)`,
              opacity: 0.06,
            }}
          />

          {/* Top chrome trim */}
          <div
            className="absolute top-0 inset-x-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(200,180,140,0.3), transparent)' }}
          />

          {/* Mini bulbs along top */}
          <div className="absolute top-1.5 inset-x-0 flex justify-center gap-5">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="relative">
                <div
                  className="w-1 h-1 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, #fff 0%, var(--accent-color) 60%)`,
                    boxShadow: `0 0 3px var(--accent-color), 0 0 6px var(--accent-color)`,
                    animation: `jbCardBulb 2s ease-in-out ${i * 0.35}s infinite`,
                  }}
                />
              </div>
            ))}
          </div>

          <div className="relative flex items-center gap-3 px-4 py-3.5 pt-5">
            {/* Jukebox mini icon — chrome button style */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-shadow group-hover:shadow-[0_0_12px_var(--accent-color)]"
              style={{
                background: 'linear-gradient(145deg, #b0b0b0 0%, #808080 30%, #505050 70%, #333 100%)',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)',
              }}
            >
              {/* Musical note / vinyl icon */}
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="8" strokeWidth="1.5" opacity="0.6" />
                <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
                <line x1="15" y1="12" x2="20" y2="12" strokeWidth="1" opacity="0.4" />
              </svg>
            </div>

            <div className="min-w-0">
              <div
                className="font-mono font-black text-sm tracking-[0.15em] uppercase"
                style={{
                  background: 'linear-gradient(180deg, #ffd700 0%, #ff8c00 50%, #cc6600 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 4px rgba(255,165,0,0.3))',
                }}
              >
                Jukebox
              </div>
              <div className="text-[11px] text-amber-100/40 font-mono truncate">
                Pick a song, let the music flow
              </div>
            </div>
          </div>

          {/* Bottom chrome trim */}
          <div
            className="absolute bottom-0 inset-x-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(200,180,140,0.15), transparent)' }}
          />
        </button>
      </div>

      <style>{`
        @keyframes jbCardBulb {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>

      {isOpen && <JukeboxModal onClose={() => setIsOpen(false)} />}
    </>
  )
}
