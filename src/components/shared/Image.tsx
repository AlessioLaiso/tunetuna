import { useState, useEffect } from 'react'
import { Disc } from 'lucide-react'

interface ImageProps {
  src: string
  alt: string
  className?: string
  fallback?: string
  style?: React.CSSProperties
  showOutline?: boolean
  rounded?: string
  onError?: () => void
}

export default function Image({ src, alt, className = '', fallback, style, showOutline, rounded = 'rounded', onError }: ImageProps) {
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
      <div className="relative w-full h-full flex items-center justify-center bg-zinc-900">
        <Disc className="w-12 h-12 text-gray-500" />
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
        loading="lazy"
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






