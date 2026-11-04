import { ImgHTMLAttributes, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useImageFade } from '../../hooks/useImageFade'

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
  /** A longer fade for large images */
  slowFade?: boolean
}

export default function Image({ src, alt, className = '', fallback, fallbackIcon: FallbackIcon, style, showOutline, rounded = 'rounded', loading = 'lazy', onError, slowFade }: ImageProps) {
  const [imgSrc, setImgSrc] = useState(src)
  const [propSrc, setPropSrc] = useState(src)
  const [error, setError] = useState(false)
  const [shouldHide, setShouldHide] = useState(false)
  const [showIcon, setShowIcon] = useState(false)
  const { ref, isOpaque, fadeClassName, onLoad, onTransitionEnd } = useImageFade(imgSrc, slowFade)

  // Reset during render so a new image never paints a frame with the previous image's state
  if (src !== propSrc) {
    setPropSrc(src)
    setImgSrc(src)
    setError(false)
    setShouldHide(false)
    setShowIcon(false)
  }

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
      <div className="relative w-full h-full bg-white/15 flex items-center justify-center">
        {FallbackIcon && <FallbackIcon className="w-1/3 h-1/3 text-white/30" />}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {/* A plain tile while loading. It stays until the image is opaque so the fade never dips
          through to the page; the icon is only for images that failed. */}
      {FallbackIcon && !isOpaque && (
        <div className="absolute inset-0 bg-white/15" />
      )}
      <img
        ref={ref}
        src={imgSrc}
        alt={alt}
        className={`relative block ${fadeClassName} ${className}`}
        onError={handleError}
        onLoad={onLoad}
        onTransitionEnd={onTransitionEnd}
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

/** A plain <img> that fades in like Image, for layouts that can't take Image's wrapper element */
export function FadeImage({ src, className = '', slowFade, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string; slowFade?: boolean }) {
  const { ref, fadeClassName, onLoad, onTransitionEnd } = useImageFade(src, slowFade)
  return (
    <img
      {...props}
      ref={ref}
      src={src}
      className={`${fadeClassName} ${className}`}
      onLoad={onLoad}
      onTransitionEnd={onTransitionEnd}
    />
  )
}
