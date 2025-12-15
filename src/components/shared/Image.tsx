import { useState, useEffect } from 'react'

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


  // Update imgSrc when src prop changes
  useEffect(() => {
    setImgSrc(src)
    setError(false)
    setShouldHide(false)
  }, [src])

  const handleError = () => {
    if (!error && fallback) {
      setImgSrc(fallback)
      setError(true)
    } else {
      // Call onError callback if provided, otherwise show placeholder
      if (onError) {
        onError()
        setShouldHide(true)
      } else {
        setImgSrc('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300"%3E%3Crect fill="%23333" width="300" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E')
      }
    }
  }

  if (shouldHide) {
    return null
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






