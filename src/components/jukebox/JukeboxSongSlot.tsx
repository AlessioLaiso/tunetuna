import { Disc } from 'lucide-react'
import type { LightweightSong } from '../../api/types'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'

interface JukeboxSongSlotProps {
  song: LightweightSong
  index: number
  onSelect: (song: LightweightSong) => void
  buttonPosition?: 'left' | 'right'
}

// All sizes use clamp() so elements scale from small phones to 4K desktops.
// The min is for ~iPhone 13 mini portrait, the max is for large landscape displays.
// The preferred value uses vw so it scales with the viewport.
const SIZE = {
  button: 'clamp(32px, 4.5vw, 64px)',
  buttonPad: 'clamp(3px, 0.4vw, 6px)',
  buttonGap: 'clamp(4px, 0.6vw, 10px)',
  art: 'clamp(32px, 4.5vw, 64px)',
  titleFont: 'clamp(11px, 1.5vw, 22px)',
  artistFont: 'clamp(9px, 1.2vw, 18px)',
  numFont: 'clamp(12px, 1.6vw, 26px)',
  textPadX: 'clamp(6px, 0.8vw, 16px)',
  textPadY: 'clamp(4px, 0.5vw, 10px)',
  slotPadX: 'clamp(2px, 0.3vw, 6px)',
  slotPadY: 'clamp(2px, 0.4vw, 6px)',
  framePad: 'clamp(1px, 0.15vw, 3px)',
}

export default function JukeboxSongSlot({ song, index, onSelect, buttonPosition = 'left' }: JukeboxSongSlotProps) {
  const artist = song.AlbumArtist || song.ArtistItems?.[0]?.Name || ''
  const num = String(index + 1)
  const isRight = buttonPosition === 'right'

  // Wurlitzer-style typewriter paper card colors (various off-whites, faded pastels)
  const cardColors = [
    'linear-gradient(180deg, #fdfbf7 0%, #eae5d9 100%)', // Aged white
    'linear-gradient(180deg, #f0f4f8 0%, #d9e2ec 100%)', // Pale blue
    'linear-gradient(180deg, #fff3e0 0%, #ffe0b2 100%)', // Pale orange
    'linear-gradient(180deg, #fce4ec 0%, #f8bbd0 100%)', // Pale pink
    'linear-gradient(180deg, #e8f5e9 0%, #c8e6c9 100%)', // Pale green
    'linear-gradient(180deg, #fffde7 0%, #fff9c4 100%)', // Pale yellow
  ]

  const cardBg = cardColors[index % cardColors.length]

  const albumArt = (
    <div className="flex-shrink-0 self-stretch" style={{
      width: SIZE.art,
      minHeight: SIZE.art,
    }}>
      {song.AlbumId ? (
        <Image
          src={jellyfinClient.getAlbumArtUrl(song.AlbumId, 96)}
          alt=""
          className="w-full h-full object-cover"
          fallbackIcon={Disc}
          showOutline={false}
          rounded=""
        />
      ) : (
        <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
          <Disc className="w-4 h-4 text-zinc-600" />
        </div>
      )}
    </div>
  )

  return (
    <button
      onClick={() => onSelect(song)}
      className={`jb-slot flex items-center w-full text-left group active:translate-y-[1px] active:scale-[0.98] ${isRight ? 'flex-row-reverse' : ''}`}
      style={{
        animationDelay: `${index * 80}ms`,
        padding: `${SIZE.slotPadY} ${SIZE.slotPadX}`,
        borderRadius: '8px',
        gap: '0',
        transition: 'transform 0.1s ease',
      }}
    >
      {/* === CHROME BUTTON with number === */}
      <div className="flex-shrink-0 relative" style={{ [isRight ? 'marginLeft' : 'marginRight']: SIZE.buttonGap }}>
        {/* Glow behind button — visible on hover */}
        <div
          className="absolute rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100"
          style={{
            inset: '-6px',
            background: 'var(--accent-color)',
            filter: 'blur(10px)',
          }}
        />
        {/* Outer chrome bezel */}
        <div
          className="relative rounded-full flex items-center justify-center transition-transform duration-150 group-hover:scale-95 group-hover:translate-y-[1px]"
          style={{
            width: SIZE.button,
            height: SIZE.button,
            background: 'conic-gradient(from 135deg, #e6e6e6, #fff, #b3b3b3, #808080, #b3b3b3, #fff, #e6e6e6)',
            boxShadow: `
              0 3px 8px rgba(0,0,0,0.8),
              0 1px 3px rgba(0,0,0,0.5),
              inset 0 0 0 1.5px rgba(255,255,255,0.4),
              inset 0 0 0 3px rgba(0,0,0,0.1)`,
            padding: SIZE.buttonPad,
          }}
        >
          {/* Inner button face */}
          <div
            className="w-full h-full rounded-full flex items-center justify-center font-mono font-black relative overflow-hidden transition-shadow duration-150 group-hover:shadow-[inset_0_4px_10px_rgba(0,0,0,0.7)] group-active:shadow-[inset_0_4px_12px_rgba(0,0,0,0.9)]"
            style={{
              fontSize: SIZE.numFont,
              background: 'radial-gradient(circle at 35% 25%, rgba(255,255,255,0.6) 0%, var(--accent-color) 40%, rgba(0,0,0,0.8) 100%)',
              boxShadow: 'inset 0 3px 6px rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.8)',
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              letterSpacing: '-0.5px',
            }}
          >
            {num}
            {/* Specular highlight — fades on hover to sell the press */}
            <div
              className="absolute top-0 left-1/4 w-1/2 h-2/5 pointer-events-none transition-opacity duration-150 group-hover:opacity-30"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
                borderRadius: '0 0 50% 50%',
              }}
            />
          </div>
        </div>
      </div>

      {/* === Song label strip with integrated album art — Wurlitzer paper card in a metal frame === */}
      <div
        className="flex-1 min-w-0 relative group-active:brightness-90 flex"
        style={{
          borderRadius: '3px',
          padding: SIZE.framePad,
          background: 'linear-gradient(180deg, #d3d3d3 0%, #808080 30%, #505050 70%, #d3d3d3 100%)',
          boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.5)',
          transition: 'filter 0.1s ease',
        }}
      >
        {/* Inner paper card with album art embedded */}
        <div
          className={`flex-1 min-w-0 flex overflow-hidden relative ${isRight ? 'flex-row-reverse' : ''}`}
          style={{
            background: cardBg,
            borderRadius: '2px',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2), inset 0 0 2px rgba(0,0,0,0.1)',
          }}
        >
          {/* Album art inside the frame */}
          {albumArt}

          {/* Dirt/texture noise overlay on the paper */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
          }} />

          {/* Typewriter text area */}
          <div className="flex-1 min-w-0 relative flex flex-col justify-center" style={{
            padding: `${SIZE.textPadY} ${SIZE.textPadX}`,
          }}>
            {/* faint horizontal ruled guiding line */}
            <div className="absolute inset-x-0 top-[55%] h-[1px] bg-black/10" />

            <div
              className="font-mono tracking-tight truncate leading-none z-10"
              style={{
                fontSize: SIZE.titleFont,
                marginBottom: 'clamp(1px, 0.15vw, 3px)',
                color: '#1a1820',
                textShadow: '0 0.5px 0.5px rgba(0,0,0,0.1), 0 0 1px rgba(0,0,0,0.2)',
                fontFamily: '"Courier New", Courier, monospace',
                fontWeight: 700,
              }}
            >
              {song.Name.toUpperCase()}
            </div>
            {artist && (
              <div
                className="font-mono tracking-tight truncate leading-none z-10"
                style={{
                  fontSize: SIZE.artistFont,
                  color: '#9e2a2b',
                  fontFamily: '"Courier New", Courier, monospace',
                  fontWeight: 600,
                  opacity: 0.9,
                }}
              >
                {artist.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
