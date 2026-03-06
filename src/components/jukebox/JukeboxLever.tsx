import { Shuffle, Sparkles } from 'lucide-react'

interface JukeboxLeverProps {
  mode: 'shuffle' | 'recommendations'
  onToggle: (mode: 'shuffle' | 'recommendations') => void
}

export default function JukeboxLever({ mode, onToggle }: JukeboxLeverProps) {
  const isShuffle = mode === 'shuffle'

  return (
    <div className="flex items-center gap-2">
      {/* Shuffle indicator + label */}
      <button
        onClick={() => onToggle('shuffle')}
        className="flex items-center gap-1 cursor-pointer active:scale-95"
        style={{ transition: 'transform 0.1s ease' }}
      >
        {/* Jewel LED indicator */}
        <div className="relative">
          <div
            className="absolute rounded-full transition-all duration-500"
            style={{
              inset: '-5px',
              background: 'var(--accent-color)',
              filter: 'blur(8px)',
              opacity: isShuffle ? 0.7 : 0,
            }}
          />
          <div
            className="relative w-3 h-3 rounded-full transition-all duration-500"
            style={{
              background: isShuffle
                ? 'radial-gradient(circle at 35% 30%, #fff 0%, var(--accent-color) 45%, rgba(0,0,0,0.3) 100%)'
                : 'radial-gradient(circle at 35% 30%, #444 0%, #1a1a1a 100%)',
              boxShadow: isShuffle
                ? `0 0 4px var(--accent-color), 0 0 10px var(--accent-color),
                   inset 0 0 3px rgba(255,255,255,0.5),
                   0 0 0 1px rgba(218,165,32,0.4)`
                : `inset 0 1px 2px rgba(0,0,0,0.7),
                   0 0 0 1px rgba(255,255,255,0.06)`,
            }}
          />
        </div>
        <span className={`font-mono tracking-wider uppercase flex items-center gap-0.5 transition-all duration-300 ${isShuffle ? 'text-white' : 'text-zinc-600'}`}
          style={{ fontSize: '8px', textShadow: isShuffle ? '0 0 8px var(--accent-color)' : 'none' }}
        >
          <Shuffle className="w-2.5 h-2.5" />
          Shuffle
        </span>
      </button>

      {/* ====== Heavy chrome toggle switch ====== */}
      <button
        onClick={() => onToggle(isShuffle ? 'recommendations' : 'shuffle')}
        className="relative cursor-pointer group active:scale-[0.97]"
        aria-label={`Switch to ${isShuffle ? 'recommendations' : 'shuffle'}`}
        style={{ width: '48px', height: '26px', transition: 'transform 0.1s ease' }}
      >
        {/* Outer chrome housing */}
        <div
          className="absolute rounded-full"
          style={{
            inset: '-2px',
            background: 'conic-gradient(from 180deg, #888, #ccc, #eee, #ccc, #888, #555, #888)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        />
        {/* Inner recessed track */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 40%, #111 100%)',
            boxShadow: `
              inset 0 2px 5px rgba(0,0,0,0.8),
              inset 0 -1px 1px rgba(255,255,255,0.05)`,
          }}
        />

        {/* Active side glow */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full transition-all duration-300"
          style={{
            width: '10px',
            [isShuffle ? 'left' : 'right']: '6px',
            background: 'var(--accent-color)',
            filter: 'blur(3px)',
            opacity: 0.5,
          }}
        />

        {/* Heavy chrome lever knob */}
        <div
          className="absolute top-[3px] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{
            left: isShuffle ? '3px' : 'calc(100% - 23px)',
            width: '20px',
            height: '20px',
          }}
        >
          <div
            className="w-full h-full rounded-full relative overflow-hidden"
            style={{
              background: `conic-gradient(from 150deg,
                #bbb, #e0e0e0, #fff, #e0e0e0, #bbb, #888, #666, #888, #bbb)`,
              boxShadow: `
                inset 0 2px 3px rgba(255,255,255,0.5),
                inset 0 -2px 3px rgba(0,0,0,0.3),
                0 3px 8px rgba(0,0,0,0.6),
                0 0 0 1px rgba(0,0,0,0.15)`,
            }}
          >
            {/* Grip knurling pattern */}
            <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 flex flex-col gap-[1.5px]">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex">
                  <div className="flex-1 h-[1px] rounded" style={{ background: 'rgba(0,0,0,0.12)' }} />
                  <div className="flex-1 h-[1px] rounded" style={{ background: 'rgba(255,255,255,0.2)', marginTop: '1px' }} />
                </div>
              ))}
            </div>
            {/* Specular highlight */}
            <div
              className="absolute top-0 inset-x-0 h-2/5 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 100%)',
                borderRadius: '50%',
              }}
            />
          </div>
        </div>
      </button>

      {/* Recs indicator + label */}
      <button
        onClick={() => onToggle('recommendations')}
        className="flex items-center gap-1 cursor-pointer active:scale-95"
        style={{ transition: 'transform 0.1s ease' }}
      >
        <span className={`font-mono tracking-wider uppercase flex items-center gap-0.5 transition-all duration-300 ${!isShuffle ? 'text-white' : 'text-zinc-600'}`}
          style={{ fontSize: '8px', textShadow: !isShuffle ? '0 0 8px var(--accent-color)' : 'none' }}
        >
          Recs
          <Sparkles className="w-2.5 h-2.5" />
        </span>
        {/* Jewel LED indicator */}
        <div className="relative">
          <div
            className="absolute rounded-full transition-all duration-500"
            style={{
              inset: '-5px',
              background: 'var(--accent-color)',
              filter: 'blur(8px)',
              opacity: !isShuffle ? 0.7 : 0,
            }}
          />
          <div
            className="relative w-3 h-3 rounded-full transition-all duration-500"
            style={{
              background: !isShuffle
                ? 'radial-gradient(circle at 35% 30%, #fff 0%, var(--accent-color) 45%, rgba(0,0,0,0.3) 100%)'
                : 'radial-gradient(circle at 35% 30%, #444 0%, #1a1a1a 100%)',
              boxShadow: !isShuffle
                ? `0 0 4px var(--accent-color), 0 0 10px var(--accent-color),
                   inset 0 0 3px rgba(255,255,255,0.5),
                   0 0 0 1px rgba(218,165,32,0.4)`
                : `inset 0 1px 2px rgba(0,0,0,0.7),
                   0 0 0 1px rgba(255,255,255,0.06)`,
            }}
          />
        </div>
      </button>
    </div>
  )
}
