import { useState, useEffect } from 'react'

/**
 * Returns true when the viewport is large enough for bigger album art / cassette display.
 * Breakpoint: 1280×1080.
 */
export function useLargeViewport() {
  const [isLargeViewport, setIsLargeViewport] = useState(false)

  useEffect(() => {
    const checkViewportSize = () => {
      setIsLargeViewport(window.innerWidth >= 1280 && window.innerHeight >= 1080)
    }

    checkViewportSize()
    window.addEventListener('resize', checkViewportSize)
    return () => window.removeEventListener('resize', checkViewportSize)
  }, [])

  return isLargeViewport
}
