import { useState, useEffect, useCallback, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

interface ImageProps {
  src: string
  alt: string
  className?: string
  fallback?: string
  fallbackIcon?: LucideIcon
  style?: React.CSSProperties
  showOutline?: boolean
  rounded?: string
  loading?: 'lazy' | 'eager'
  onError?: () => void
}

export default function Image({ src, alt, className = '', fallback, fallbackIcon: FallbackIcon, style, showOutline, rounded = 'rounded', loading = 'lazy', onError }: ImageProps) {
  const [imgSrc, setImgSrc] = useState(src)
  const [error, setError] = useState(false)
  const [shouldHide, setShouldHide] = useState(false)
  const [showIcon, setShowIcon] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [needsFade, setNeedsFade] = useState(true)
  const imgRef = useRef<HTMLImageElement>(null)

  // Update imgSrc when src prop changes
  useEffect(() => {
    setImgSrc(src)
    setError(false)
    setShouldHide(false)
    setShowIcon(false)
    setLoaded(false)
    setNeedsFade(true)
  }, [src])

  // If the image is already cached, skip fade
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true)
      setNeedsFade(false)
    }
  }, [imgSrc])

  const handleLoad = useCallback(() => setLoaded(true), [])

  const handleError = () => {
    if (!error && fallback) {
      setImgSrc(fallback)
      setError(true)
    } else {
      // Call onError callback if provided, otherwise show icon placeholder
      if (onError) {
        onError()
        setShouldHide(true)
      } else {
        setShowIcon(true)
      }
    }
  }

  if (shouldHide) {
    return null
  }

  if (showIcon) {
    return (
      <div className="relative w-full h-full bg-zinc-800 flex items-center justify-center">
        {FallbackIcon && <FallbackIcon className="w-1/3 h-1/3 text-zinc-600" />}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <img
        ref={imgRef}
        src={imgSrc}
        alt={alt}
        className={`block ${needsFade ? `transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}` : ''} ${className}`}
        onError={handleError}
        onLoad={handleLoad}
        loading={loading}
        style={style}
      />
      {showOutline && (
        <div
          className={`absolute inset-0 pointer-events-none border ${rounded}`}
          style={{ borderColor: 'rgba(117, 117, 117, 0.3)', borderWidth: '1px' }}
        />
      )}
    </div>
  )
}






