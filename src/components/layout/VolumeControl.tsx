import { useState, useRef, useCallback, useEffect } from 'react'
import { Volume, Volume1, Volume2 } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'

type VolumeControlVariant = 'horizontal' | 'vertical' | 'compact'

interface VolumeControlProps {
  variant?: VolumeControlVariant
  onClose?: () => void
  onOpenPopover?: () => void
  popoverPosition?: { top: number; left: number } | null
  popoverDirection?: 'up' | 'down'
  className?: string
  onRef?: (element: HTMLElement | null) => void
}

export default function VolumeControl({ variant = 'horizontal', onClose, onOpenPopover, popoverPosition, popoverDirection = 'up', className, onRef }: VolumeControlProps) {
  const { volume, setVolume } = usePlayerStore()
  const [isDragging, setIsDragging] = useState(false)
  const [lastNonZeroVolume, setLastNonZeroVolume] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  // Callback refs
  const setIconRef = (element: HTMLButtonElement | null) => {
    if (onRef && variant === 'compact') {
      onRef(element)
    }
  }

  const setContainerRef = (element: HTMLDivElement | null) => {
    if (onRef && variant === 'horizontal') {
      onRef(element)
    }
  }

  // Initialize lastNonZeroVolume from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('lastNonZeroVolume')
    if (stored) {
      setLastNonZeroVolume(Math.max(0.01, Math.min(1, parseFloat(stored))))
    } else if (volume > 0) {
      setLastNonZeroVolume(volume)
    }
  }, [])

  // Track non-zero volume for toggle
  useEffect(() => {
    if (volume > 0) {
      setLastNonZeroVolume(volume)
      localStorage.setItem('lastNonZeroVolume', volume.toString())
    }
  }, [volume])

  const getVolumeIcon = () => {
    if (volume === 0) return Volume
    if (volume <= 0.5) return Volume1
    return Volume2
  }

  const handleVolumeChange = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    let clientX: number
    let clientY: number

    if (e instanceof TouchEvent || (e as any).touches) {
      clientX = (e as TouchEvent).touches[0].clientX
      clientY = (e as TouchEvent).touches[0].clientY
    } else {
      clientX = (e as MouseEvent).clientX
      clientY = (e as MouseEvent).clientY
    }

    if (variant === 'horizontal') {
      // Horizontal slider (left to right)
      const relativeX = clientX - rect.left
      const newVolume = Math.max(0, Math.min(1, relativeX / rect.width))
      setVolume(newVolume)
    } else {
      // Vertical slider (bottom to top)
      const relativeY = rect.bottom - clientY
      const newVolume = Math.max(0, Math.min(1, relativeY / rect.height))
      setVolume(newVolume)
    }
  }, [setVolume, variant])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    handleVolumeChange(e)
  }

  const handleMouseDownSlider = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleMouseDown(e)
  }

  const handleTouchStartSlider = (e: React.TouchEvent) => {
    e.stopPropagation()
    handleTouchStart(e)
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
      handleVolumeChange(e)
    }
  }, [isDragging, handleVolumeChange])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    handleVolumeChange(e)
  }

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
      handleVolumeChange(e)
    }
  }, [isDragging, handleVolumeChange])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const currentVolume = usePlayerStore.getState().volume

    if (currentVolume > 0) {
      setVolume(0)
    } else {
      setVolume(lastNonZeroVolume)
    }
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])

  const Icon = getVolumeIcon()

  // Compact variant - icon only
  if (variant === 'compact') {
    return (
      <button
        ref={setIconRef}
        onClick={(e) => {
          e.stopPropagation()
          if (onOpenPopover) {
            onOpenPopover()
          }
        }}
        className={className || "text-gray-400 hover:text-zinc-300 transition-colors"}
      >
        <Icon className="w-6 h-6" />
      </button>
    )
  }

  if (variant === 'horizontal') {
    return (
      <div ref={setContainerRef} className="flex items-center gap-2 px-2 select-none" style={{ width: '120px' }} onClick={handleContainerClick}>
        <button
          onClick={handleIconClick}
          className="text-gray-400 hover:text-zinc-300 flex-shrink-0"
        >
          <Icon className="w-5 h-5" />
        </button>
        <div
          ref={containerRef}
          className="flex-1 relative cursor-pointer"
          style={{ height: '24px' }}
          onMouseDown={handleMouseDownSlider}
          onTouchStart={handleTouchStartSlider}
        >
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-400 rounded-full transition-all duration-100"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  // Vertical variant - popover positioned near trigger
  const popoverStyle: React.CSSProperties = popoverPosition
    ? {
        position: 'fixed',
        top: `${popoverPosition.top}px`,
        left: `${popoverPosition.left}px`,
        transform: popoverDirection === 'down'
          ? 'translate(-50%, 8px)'
          : 'translate(-50%, calc(-100% - 8px))'
      }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0"
        onClick={onClose}
        onTouchStart={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div
        className="relative z-10 bg-zinc-900 rounded-lg py-4 px-0 shadow-xl border border-zinc-700"
        style={popoverStyle}
      >
        <div className="h-[200px] w-[38px] cursor-pointer group relative touch-none mx-auto">
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className="absolute inset-0"
          />

          {/* Visual bar - narrow and centered */}
          <div className="h-full w-1 bg-zinc-800 rounded-full relative flex flex-col justify-end mx-auto">
            <div
              className="w-full bg-gray-400 rounded-full transition-all"
              style={{ height: `${volume * 100}%` }}
            />
            <div
              className="absolute left-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ bottom: `${volume * 100}%`, transform: 'translate(-50%, 50%)' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
