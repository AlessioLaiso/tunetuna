import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useJukeboxSongs } from './useJukeboxSongs'
import JukeboxSongSlot from './JukeboxSongSlot'
import JukeboxLever from './JukeboxLever'
import type { LightweightSong } from '../../api/types'

interface JukeboxModalProps {
  onClose: () => void
}

const landscapeMq = '(orientation: landscape)'
const wideMq = '(min-width: 768px)'

export default function JukeboxModal({ onClose }: JukeboxModalProps) {
  const [isLandscape, setIsLandscape] = useState(() => window.matchMedia(landscapeMq).matches)
  const [isWide, setIsWide] = useState(() => window.matchMedia(wideMq).matches)
  const [isVisible, setIsVisible] = useState(false)
  const [leverMode, setLeverMode] = useState<'shuffle' | 'recommendations'>('recommendations')
  const { songs, isLoading, refresh } = useJukeboxSongs(true)

  useEffect(() => {
    const mq = window.matchMedia(landscapeMq)
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia(wideMq)
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => { requestAnimationFrame(() => setIsVisible(true)) }, [])

  useEffect(() => {
    const bodyOv = window.getComputedStyle(document.body).overflowY
    const htmlOv = window.getComputedStyle(document.documentElement).overflowY
    document.body.style.overflowY = 'hidden'
    document.documentElement.style.overflowY = 'hidden'
    const rootEl = document.getElementById('root')
    const rootOv = rootEl ? window.getComputedStyle(rootEl).overflowY : ''
    if (rootEl) rootEl.style.overflowY = 'hidden'
    return () => {
      document.body.style.overflowY = bodyOv
      document.documentElement.style.overflowY = htmlOv
      if (rootEl) rootEl.style.overflowY = rootOv
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 400)
  }, [onClose])

  const handleSelectSong = useCallback(async (song: LightweightSong) => {
    const { playTrack, shuffleAllSongs } = usePlayerStore.getState()
    const { setShowQueueRecommendations } = useSettingsStore.getState()
    if (leverMode === 'shuffle') {
      await shuffleAllSongs(song)
    } else {
      playTrack(song)
      setShowQueueRecommendations(true)
    }
    handleClose()
  }, [leverMode, handleClose])

  const bubblerDots = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      y: (i / 11) * 100,
      delay: `${(Math.random() * 3).toFixed(2)}s`,
      duration: `${(2 + Math.random() * 2).toFixed(1)}s`,
    })), []
  )

  // Shared constants for arch/strip alignment (percentages of the jukebox width)
  const OUTER = { outerEdge: 1, innerEdge: 10 }
  const INNER = { outerEdge: 10, innerEdge: 20 }
  const DARK_INSET = 20

  // Chrome ribbing helper
  const chromeRibbing = (
    <div className="absolute inset-0" style={{
      backgroundImage: `repeating-linear-gradient(180deg,
        transparent, transparent 2px,
        rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px,
        rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 4px)`,
    }} />
  )

  // Bubbler tube component
  const bubblerTube = (side: 'left' | 'right') => (
    <div
      key={`bubbler-${side}`}
      className="absolute jb-rainbow"
      style={{
        [side]: `${DARK_INSET + 0.5}%`,
        top: 0,
        bottom: 0,
        width: '16px',
        borderRadius: '8px',
        zIndex: 5,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[10px] rounded-t-full" style={{
        background: 'linear-gradient(180deg, #e0e0e0 0%, #b0b0b0 40%, #888 70%, #aaa 100%)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.5)',
        zIndex: 3,
      }} />
      <div className="absolute bottom-0 left-0 right-0 h-[10px] rounded-b-full" style={{
        background: 'linear-gradient(180deg, #aaa 0%, #888 30%, #b0b0b0 60%, #e0e0e0 100%)',
        boxShadow: '0 -2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.5)',
        zIndex: 3,
      }} />
      <div className="absolute inset-x-0 top-[10px] bottom-[10px] rounded-[4px] overflow-hidden" style={{
        background: `linear-gradient(90deg,
          rgba(0,0,0,0.4) 0%, rgba(40,20,5,0.3) 15%,
          rgba(255,140,0,0.08) 35%, rgba(255,200,100,0.12) 50%,
          rgba(255,140,0,0.08) 65%, rgba(40,20,5,0.3) 85%,
          rgba(0,0,0,0.4) 100%)`,
        boxShadow: `inset 3px 0 6px rgba(0,0,0,0.5), inset -3px 0 6px rgba(0,0,0,0.5),
          inset 0 0 12px rgba(255,140,0,0.15), 0 0 20px rgba(255,140,0,0.12),
          0 0 0 1px rgba(218,165,32,0.4)`,
      }}>
        <div className="absolute inset-y-0 pointer-events-none" style={{
          left: '25%', width: '20%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), rgba(255,255,255,0.08), transparent)',
        }} />
        <div className="absolute inset-y-0 pointer-events-none" style={{
          right: '15%', width: '10%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
        }} />
        {bubblerDots.map((dot, i) => (
          <div key={i} className="absolute jb-bubble" style={{
            left: '50%', top: `${dot.y}%`, transform: 'translateX(-50%)',
            animationDelay: dot.delay, animationDuration: dot.duration,
          }}>
            <div className="rounded-full" style={{
              width: '5px', height: '5px',
              background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), var(--accent-color) 60%)',
              boxShadow: '0 0 6px var(--accent-color)',
            }} />
          </div>
        ))}
      </div>
    </div>
  )

  // Chrome shoulder bracket component
  const shoulderBracket = (side: 'left' | 'right') => (
    <div key={`shoulder-${side}`} className="absolute" style={{
      [side]: `${OUTER.outerEdge - 1}%`,
      width: `${DARK_INSET - OUTER.outerEdge + 2}%`,
      top: 0,
      height: '100%',
      zIndex: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      {[0, 1, 2].map(barIdx => (
        <div key={`bar-${barIdx}`} style={{ display: 'contents' }}>
          <div style={{
            flex: 3,
            background: 'linear-gradient(180deg, #d8d8d8 0%, #bbb 30%, #999 60%, #ccc 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -1px 1px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)',
            borderRadius: barIdx === 0 ? '3px 3px 0 0' : barIdx === 2 ? '0 0 3px 3px' : '0',
          }} />
          {barIdx < 2 && (
            <div className="jb-glow-outer" style={{
              flex: 2,
              background: 'linear-gradient(180deg, #ff6600 0%, #ff8c00 100%)',
              boxShadow: '0 0 8px rgba(255,140,0,0.6), inset 0 0 4px rgba(255,255,255,0.3)',
            }} />
          )}
        </div>
      ))}
    </div>
  )

  const modal = (
    <>
      <style>{`
        @keyframes jbSlotIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes jbBulbChase {
          0% { opacity: 0.15; transform: scale(0.7); }
          10% { opacity: 1; transform: scale(1.3); }
          25% { opacity: 0.15; transform: scale(0.7); }
          100% { opacity: 0.15; transform: scale(0.7); }
        }
        @keyframes jbNeonFlicker {
          0%, 15%, 20%, 100% { opacity: 1; }
          17%, 19% { opacity: 0.6; }
        }
        @keyframes jbGrillePulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.5; }
        }
        @keyframes jbBubble {
          0% { transform: translateY(0) scale(1); opacity: 0.7; }
          50% { transform: translateY(-15px) scale(1.4); opacity: 1; }
          100% { transform: translateY(-30px) scale(0.6); opacity: 0; }
        }
        @keyframes jbRainbowGlow {
          0% { filter: hue-rotate(0deg) brightness(1); }
          50% { filter: hue-rotate(180deg) brightness(1.3); }
          100% { filter: hue-rotate(360deg) brightness(1); }
        }
        @keyframes jbColorCycleOuter {
          0%   { filter: hue-rotate(0deg) brightness(1); }
          25%  { filter: hue-rotate(-30deg) brightness(1.1); }
          50%  { filter: hue-rotate(20deg) brightness(1.15); }
          75%  { filter: hue-rotate(-15deg) brightness(1.05); }
          100% { filter: hue-rotate(0deg) brightness(1); }
        }
        @keyframes jbColorCycleInner {
          0%   { filter: hue-rotate(0deg) brightness(1); }
          25%  { filter: hue-rotate(120deg) brightness(1.15); }
          50%  { filter: hue-rotate(200deg) brightness(1.1); }
          75%  { filter: hue-rotate(80deg) brightness(1.1); }
          100% { filter: hue-rotate(0deg) brightness(1); }
        }
        .jb-slot { opacity: 0; animation: jbSlotIn 0.35s ease-out forwards; }
        .jb-chase { animation: jbBulbChase 2.4s ease-in-out infinite; }
        .jb-bubble { animation: jbBubble 3s ease-in-out infinite; }
        .jb-rainbow { animation: jbRainbowGlow 6s linear infinite; }
        .jb-glow-outer {
          animation: jbColorCycleOuter 24s ease-in-out infinite;
          box-shadow: 0 0 30px rgba(255,102,0,0.5), inset 0 0 15px rgba(255,255,255,0.3);
        }
        .jb-glow-inner {
          animation: jbColorCycleInner 30s ease-in-out infinite;
          box-shadow: 0 0 30px rgba(255,215,0,0.5), inset 0 0 15px rgba(255,255,255,0.3);
        }
      `}</style>

      {/* FULL-SCREEN VIEWPORT */}
      <div
        className={`fixed inset-0 z-[70] overflow-hidden transition-opacity duration-400 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, #1a0e04 0%, #080402 40%, #020101 100%)',
        }}
      >
        {/* Ambient floor glow */}
        <div className="absolute bottom-0 inset-x-0 h-[30%] pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 100%, rgba(255,140,0,0.08) 0%, transparent 70%)',
        }} />

        {/* ================================================================ */}
        {/* MAIN LAYOUT — centered flex column filling the viewport          */}
        {/* Songs are the primary element; decorations surround them         */}
        {/* ================================================================ */}
        <div
          className="absolute inset-0 flex flex-col items-center"
          style={{ paddingTop: isLandscape ? 0 : 'env(safe-area-inset-top)' }}
        >
          {/* ============================================================ */}
          {/* ARCH DECORATION — peeks from top, clipped by viewport         */}
          {/* In portrait: visible dome. In landscape: just the bottom arc  */}
          {/* ============================================================ */}
          <div
            className="relative flex-shrink-0 overflow-hidden"
            style={{
              width: isWide ? '85%' : '100%',
              maxWidth: isLandscape ? '1400px' : '700px',
              aspectRatio: isLandscape ? '4 / 1' : '5 / 3',
            }}
          >
            {/* Inner 1:1 square for perfect semicircle geometry */}
            <div
              className="absolute bottom-0 w-full"
              style={{
                aspectRatio: '1 / 1',
              }}
            >
              {/* Wood dome */}
              <div className="absolute inset-0" style={{
                borderRadius: '50% 50% 0 0',
                background: `linear-gradient(180deg,
                  #5a2d0c 0%, #4a2610 20%, #3d1f0a 50%,
                  #2a1608 80%, #1a0e04 100%)`,
                boxShadow: `
                  0 0 80px rgba(255,140,0,0.1),
                  0 10px 40px rgba(0,0,0,0.8),
                  inset 0 0 0 3px #1a0e04,
                  inset 0 0 0 6px rgba(218,165,32,0.35),
                  inset 0 0 0 9px #1a0e04`,
              }}>
                <div className="absolute inset-0 rounded-[inherit]" style={{
                  backgroundImage: `
                    repeating-linear-gradient(92deg,
                      transparent, transparent 2px,
                      rgba(200,150,80,0.08) 2px, rgba(200,150,80,0.08) 3px),
                    repeating-linear-gradient(88deg,
                      transparent, transparent 7px,
                      rgba(160,100,40,0.06) 7px, rgba(160,100,40,0.06) 8px)`,
                }} />
              </div>

              {/* Neon arches */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute bottom-0 jb-glow-outer" style={{
                  left: `${OUTER.outerEdge}%`, right: `${OUTER.outerEdge}%`,
                  top: `${OUTER.outerEdge}%`, borderRadius: '50% 50% 0 0',
                  background: 'linear-gradient(180deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)',
                }} />
                <div className="absolute bottom-0 jb-glow-inner" style={{
                  left: `${INNER.outerEdge}%`, right: `${INNER.outerEdge}%`,
                  top: `${INNER.outerEdge}%`, borderRadius: '50% 50% 0 0',
                  background: 'linear-gradient(180deg, #ffee00 0%, #ffd700 50%, #ffa500 100%)',
                }} />
                {/* Dark center cutout */}
                <div className="absolute bottom-0" style={{
                  left: `${DARK_INSET}%`, right: `${DARK_INSET}%`,
                  top: `${DARK_INSET}%`, borderRadius: '50% 50% 0 0',
                  background: 'linear-gradient(180deg, #1c1812 0%, #12100c 30%, #0a0908 100%)',
                  boxShadow: 'inset 0 10px 40px rgba(0,0,0,0.9), inset 0 0 20px rgba(0,0,0,0.9)',
                }}>
                  <div className="absolute top-[18%] inset-x-0 text-center" style={{ animation: 'jbNeonFlicker 7s ease-in-out infinite' }}>
                    <h1
                      className="font-mono font-black tracking-[0.4em] uppercase inline-block"
                      style={{
                        fontSize: 'clamp(12px, 3.5vw, 28px)',
                        background: 'linear-gradient(180deg, #fff5cc 0%, #ffe066 20%, #ffaa00 50%, #ff6600 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        filter: 'drop-shadow(0 0 10px rgba(255,170,0,0.8))',
                      }}
                    >
                      Jukebox
                    </h1>
                  </div>
                </div>

                {/* Chrome crown */}
                <div className="absolute left-1/2 -translate-x-1/2" style={{
                  top: '0%', width: '14%', height: `${DARK_INSET + 2}%`, zIndex: 15,
                }}>
                  <div className="absolute inset-x-[10%] top-[2%] bottom-0" style={{
                    background: `linear-gradient(180deg,
                      #e8e8e8 0%, #d0d0d0 10%, #aaa 25%,
                      #c0c0c0 40%, #e0e0e0 55%, #b0b0b0 70%,
                      #999 85%, #bbb 100%)`,
                    borderRadius: '40% 40% 8px 8px',
                    boxShadow: `0 4px 12px rgba(0,0,0,0.6),
                      inset 0 2px 4px rgba(255,255,255,0.5),
                      inset 0 -2px 3px rgba(0,0,0,0.3),
                      3px 0 8px rgba(0,0,0,0.3), -3px 0 8px rgba(0,0,0,0.3)`,
                  }}>
                    {chromeRibbing}
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[30%]" style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                      borderRadius: 'inherit',
                    }} />
                  </div>
                  <div className="absolute -top-[4%] left-1/2 -translate-x-1/2 w-[50%] h-[14%] rounded-full" style={{
                    background: 'radial-gradient(circle at 40% 30%, #fff 0%, #ddd 20%, #aaa 50%, #777 100%)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.6)',
                  }} />
                  {(['left', 'right'] as const).map(s => (
                    <div key={`crown-wing-${s}`} className="absolute bottom-0" style={{
                      [s]: 0, width: '30%', height: '18%',
                      background: `linear-gradient(${s === 'left' ? '135deg' : '225deg'}, #d0d0d0 0%, #aaa 40%, #888 100%)`,
                      borderRadius: s === 'left' ? '0 0 0 6px' : '0 0 6px 0',
                      boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.4)',
                    }} />
                  ))}
                </div>

                {/* Chasing bulbs */}
                {Array.from({ length: 18 }, (_, i) => {
                  const angle = (i / 17) * 180
                  const rad = (angle * Math.PI) / 180
                  const hue = (i / 18) * 360
                  const x = 50 + 49 * Math.cos(Math.PI - rad)
                  const y = 98 - 96 * Math.sin(rad)
                  return (
                    <div key={`bulb-${i}`} className="absolute jb-chase" style={{
                      left: `${x}%`, top: `${y}%`,
                      animationDelay: `${(i * 0.12).toFixed(2)}s`,
                      transform: 'translate(-50%, -50%)', zIndex: 10,
                    }}>
                      <div className="relative">
                        <div className="absolute rounded-full" style={{
                          width: '12px', height: '12px', left: '-3px', top: '-3px',
                          background: `hsl(${hue}, 100%, 60%)`, filter: 'blur(5px)', opacity: 0.5,
                        }} />
                        <div className="rounded-full" style={{
                          width: '5px', height: '5px',
                          background: `radial-gradient(circle at 35% 30%, #fff 20%, hsl(${hue}, 100%, 60%) 70%)`,
                          boxShadow: `0 0 4px hsl(${hue}, 100%, 60%)`,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* BODY — fills remaining space below the arch                   */}
          {/* Contains neon strips, song window, controls, grille           */}
          {/* ============================================================ */}
          <div
            className="relative flex-1 min-h-0"
            style={{
              width: isWide ? '85%' : '100%',
              maxWidth: isLandscape ? '1400px' : '700px',
            }}
          >
            {/* Wood body background */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(180deg, #1a0e04 0%, #170c03 10%, #100a02 30%, #0c0802 100%)',
            }}>
              <div className="absolute inset-0" style={{
                backgroundImage: `
                  repeating-linear-gradient(92deg, transparent, transparent 2px,
                    rgba(200,150,80,0.08) 2px, rgba(200,150,80,0.08) 3px),
                  repeating-linear-gradient(88deg, transparent, transparent 7px,
                    rgba(160,100,40,0.06) 7px, rgba(160,100,40,0.06) 8px)`,
              }} />
            </div>

            {/* Chrome shoulder brackets */}
            <div className="absolute left-0 right-0 top-0" style={{ height: isLandscape ? 'clamp(24px, 4vw, 50px)' : 'clamp(20px, 7vw, 40px)' }}>
              {shoulderBracket('left')}
              {shoulderBracket('right')}
            </div>

            {/* Outer neon strips */}
            {(['left', 'right'] as const).map(side => (
              <div key={`outer-strip-${side}`} className="absolute jb-glow-outer" style={{
                [side]: `${OUTER.outerEdge}%`,
                width: `${OUTER.innerEdge - OUTER.outerEdge}%`,
                top: isLandscape ? 'clamp(24px, 4vw, 50px)' : 'clamp(20px, 7vw, 40px)',
                bottom: isLandscape ? '10%' : '25%',
                background: 'linear-gradient(180deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)',
              }} />
            ))}

            {/* Inner neon strips */}
            {(['left', 'right'] as const).map(side => (
              <div key={`inner-strip-${side}`} className="absolute jb-glow-inner" style={{
                [side]: `${INNER.outerEdge}%`,
                width: `${INNER.innerEdge - INNER.outerEdge}%`,
                top: isLandscape ? 'clamp(24px, 4vw, 50px)' : 'clamp(20px, 7vw, 40px)',
                bottom: isLandscape ? '10%' : '25%',
                background: 'linear-gradient(180deg, #ffee00 0%, #ffd700 50%, #ffa500 100%)',
              }} />
            ))}

            {/* Dark center panel */}
            <div className="absolute" style={{
              left: `${DARK_INSET}%`, right: `${DARK_INSET}%`,
              top: 0, bottom: isLandscape ? '10%' : '25%',
              background: 'linear-gradient(180deg, #0a0908 0%, #080706 50%, #060504 100%)',
              boxShadow: 'inset 4px 0 15px rgba(0,0,0,0.8), inset -4px 0 15px rgba(0,0,0,0.8)',
            }} />

            {/* Bubbler tubes */}
            <div className="absolute" style={{
              left: `${DARK_INSET}%`, right: `${DARK_INSET}%`,
              top: 0, bottom: isLandscape ? '15%' : '30%',
            }}>
              {bubblerTube('left')}
              {bubblerTube('right')}
            </div>

            {/* ========================================================== */}
            {/* SONG SELECTION WINDOW — the main content, always visible    */}
            {/* ========================================================== */}
            <div
              className="absolute z-10"
              style={{
                top: isLandscape ? 'clamp(28px, 4.5vw, 54px)' : '3%',
                left: `${DARK_INSET + 3}%`,
                right: `${DARK_INSET + 3}%`,
                bottom: isLandscape ? '12%' : '35%',
              }}
            >
              {/* Chrome frame */}
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  background: `linear-gradient(180deg,
                    #c0c0c0 0%, #e8e8e8 5%, #a0a0a0 15%,
                    #707070 50%,
                    #a0a0a0 85%, #e8e8e8 95%, #c0c0c0 100%)`,
                  padding: '3px',
                  boxShadow: `0 4px 20px rgba(0,0,0,0.6),
                    inset 0 1px 2px rgba(255,255,255,0.6),
                    0 0 0 1px rgba(0,0,0,0.3)`,
                }}
              >
                <div
                  className="w-full h-full rounded-md overflow-hidden relative flex flex-col"
                  style={{
                    background: 'linear-gradient(180deg, #0d0b09 0%, #080706 50%, #0a0908 100%)',
                    boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.9)',
                  }}
                >
                  {/* Glass reflection */}
                  <div className="absolute inset-0 pointer-events-none z-20" style={{
                    background: `linear-gradient(165deg,
                      rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 25%,
                      transparent 50%, rgba(255,255,255,0.01) 75%,
                      rgba(255,255,255,0.04) 100%)`,
                    borderRadius: 'inherit',
                  }} />
                  <div className="absolute top-0 inset-x-[10%] h-[8%] pointer-events-none z-20" style={{
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 80%)',
                  }} />

                  {/* Songs — scale factor based on container width so elements grow on larger screens */}
                  <div className="flex-1 z-10 flex flex-col justify-start" style={{
                    // On landscape, each column is ~half the container; on portrait, full width
                    // Base reference: 300px = scale 1. Larger screens get bigger elements.
                    // Using container-width-based padding too
                    padding: 'clamp(4px, 1%, 12px) clamp(6px, 1.5%, 16px)',
                  }}>
                    {isLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="w-10 h-10 border-3 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin" style={{
                          boxShadow: '0 0 20px var(--accent-color)',
                        }} />
                      </div>
                    ) : isLandscape ? (
                      <div className="grid grid-cols-2 gap-x-0 h-full" style={{ alignContent: 'start', gap: 'clamp(2px, 0.4vh, 6px) 0' }}>
                        {songs.map((song, i) => (
                          <JukeboxSongSlot key={song.Id} song={song} index={i} onSelect={handleSelectSong} buttonPosition={i % 2 === 0 ? 'left' : 'right'} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col justify-start h-full" style={{ gap: 'clamp(1px, 0.3vh, 4px)' }}>
                        {songs.map((song, i) => (
                          <JukeboxSongSlot key={song.Id} song={song} index={i} onSelect={handleSelectSong} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* CONTROLS ROW */}
            <div
              className="absolute z-10 flex items-center justify-center gap-3"
              style={{
                left: `${DARK_INSET}%`,
                right: `${DARK_INSET}%`,
                bottom: isLandscape ? '11%' : '32%',
                height: isLandscape ? '6%' : '5%',
              }}
            >
              <JukeboxLever mode={leverMode} onToggle={setLeverMode} />
              <button
                onClick={refresh}
                className="group relative active:translate-y-[2px]"
                style={{ transition: 'transform 0.1s ease' }}
              >
                <div className="absolute inset-0 rounded-lg" style={{
                  background: '#111', top: '2px',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.6)', borderRadius: '8px',
                }} />
                <div
                  className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono tracking-widest uppercase"
                  style={{
                    fontSize: '9px',
                    background: 'linear-gradient(180deg, #777 0%, #555 30%, #333 60%, #222 100%)',
                    boxShadow: `inset 0 1px 3px rgba(255,255,255,0.3),
                      inset 0 -1px 2px rgba(0,0,0,0.4),
                      0 0 0 1px rgba(255,255,255,0.08),
                      0 0 0 2px rgba(218,165,32,0.2)`,
                    color: '#ccc',
                    transition: 'filter 0.1s ease',
                  }}
                >
                  <RefreshCw className="w-3 h-3 group-hover:text-[var(--accent-color)] transition-colors" style={{
                    filter: 'drop-shadow(0 0 3px rgba(255,200,100,0.3))',
                  }} />
                  <span className="group-hover:text-white transition-colors">New Picks</span>
                  <div className="absolute top-0 inset-x-2 h-1/3 pointer-events-none rounded-t-lg" style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)',
                  }} />
                </div>
              </button>
            </div>

            {/* SPEAKER GRILLE — only in portrait */}
            {!isLandscape && (
              <div
                className="absolute rounded-2xl z-[3]"
                style={{
                  left: '10%', right: '10%',
                  bottom: '14%', height: '14%',
                  padding: '4px',
                  background: `linear-gradient(145deg,
                    #ffd700 0%, #daa520 15%, #b8860b 30%,
                    #8b6508 50%, #b8860b 70%, #daa520 85%, #ffd700 100%)`,
                  boxShadow: `0 4px 20px rgba(0,0,0,0.6),
                    inset 0 1px 2px rgba(255,255,255,0.4),
                    0 0 0 2px #1a0e04, 0 0 30px rgba(218,165,32,0.15)`,
                }}
              >
                {[
                  { top: '6px', left: '6px' },
                  { top: '6px', right: '6px' },
                  { bottom: '6px', left: '6px' },
                  { bottom: '6px', right: '6px' },
                ].map((pos, i) => (
                  <div key={i} className="absolute w-2.5 h-2.5 rounded-full z-10" style={{
                    ...pos,
                    background: 'radial-gradient(circle at 35% 30%, #ffd700 0%, #b8860b 60%, #8b6508 100%)',
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.5)',
                  }} />
                ))}
                <div className="w-full h-full rounded-xl overflow-hidden relative" style={{ background: '#100808' }}>
                  <div className="absolute inset-0 flex items-stretch justify-center gap-[3px] px-2 py-1">
                    {Array.from({ length: 16 }, (_, i) => (
                      <div key={i} className="flex-1 rounded-sm" style={{
                        background: `linear-gradient(90deg,
                          rgba(80,80,80,0.4) 0%, rgba(180,180,180,0.3) 30%,
                          rgba(220,220,220,0.35) 50%, rgba(180,180,180,0.3) 70%,
                          rgba(80,80,80,0.4) 100%)`,
                        boxShadow: 'inset 0 0 1px rgba(255,255,255,0.1)',
                      }} />
                    ))}
                  </div>
                  <div className="absolute inset-0" style={{
                    backgroundImage: `
                      radial-gradient(circle, rgba(218,165,32,0.15) 1px, transparent 1px),
                      radial-gradient(circle, rgba(218,165,32,0.08) 1px, transparent 1px)`,
                    backgroundSize: '5px 5px, 2.5px 2.5px',
                    backgroundPosition: '0 0, 2.5px 2.5px',
                    animation: 'jbGrillePulse 4s ease-in-out infinite',
                  }} />
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'radial-gradient(ellipse at 50% 50%, rgba(255,140,0,0.06) 0%, transparent 70%)',
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CLOSE BUTTON — always fixed top-right */}
        <button
          onClick={handleClose}
          className="fixed z-[80] top-3 right-3 w-10 h-10 flex items-center justify-center text-white bg-zinc-800/50 hover:bg-zinc-700/50 backdrop-blur-md rounded-full transition-colors"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </>
  )

  return createPortal(modal, document.body)
}
