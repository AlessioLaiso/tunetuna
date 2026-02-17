import { useState, useEffect } from 'react'
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


  // Update imgSrc when src prop changes
  useEffect(() => {
    setImgSrc(src)
    setError(false)
    setShouldHide(false)
    setShowIcon(false)
  }, [src])

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
        src={imgSrc}
        alt={alt}
        className={`block ${className}`}
        onError={handleError}
        loading={loading}
        style={style}
      />
      {showOutline && (
        <div
          className={`absolute inset-0 pointer-events-none border ${rounded}`}
          style={{ borderColor: 'rgba(24, 24, 27, 0.6)', borderWidth: '1px' }}
        />
      )}
    </div>
  )
}






