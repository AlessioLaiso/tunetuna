import { useEffect, useState, useRef } from 'react'

interface UseVinylAnimationOptions {
  isPlaying: boolean
  hasImage: boolean
  enabled?: boolean // false for cassettes
}

interface UseVinylAnimationResult {
  showVinyl: boolean
  hideAlbumArt: boolean
  shouldSplitRef: React.MutableRefObject<boolean>
}

export function useVinylAnimation({
  isPlaying,
  hasImage,
  enabled = true,
}: UseVinylAnimationOptions): UseVinylAnimationResult {
  const [showVinyl, setShowVinyl] = useState(false)
  const [hideAlbumArt, setHideAlbumArt] = useState(false)

  const shouldSplitRef = useRef(false)
  const hasInitializedRef = useRef(false)
  const reverseAnimationStartedRef = useRef(false)
  const previousPlayingRef = useRef(false)
  // Use a ref for isPlaying so the setTimeout callback reads the latest value
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  // Vinyl visibility
  useEffect(() => {
    if (!enabled) {
      setShowVinyl(false)
      setHideAlbumArt(false)
      hasInitializedRef.current = true
      return
    }

    const playbackStateChanged = previousPlayingRef.current !== isPlaying
    if (playbackStateChanged) {
      reverseAnimationStartedRef.current = false
    }
    previousPlayingRef.current = isPlaying

    if (!hasImage) {
      setShowVinyl(false)
      setHideAlbumArt(false)
      return
    }

    if (isPlaying) {
      if (!hasInitializedRef.current || !showVinyl) {
        setShowVinyl(true)
        setHideAlbumArt(false)
        hasInitializedRef.current = true
      }

      shouldSplitRef.current = window.innerWidth >= 560

      if (!reverseAnimationStartedRef.current) {
        reverseAnimationStartedRef.current = true
        setTimeout(() => {
          if (isPlayingRef.current) {
            setHideAlbumArt(true)
          }
        }, 500)
      }
    } else if (hasInitializedRef.current && showVinyl) {
      if (!reverseAnimationStartedRef.current) {
        reverseAnimationStartedRef.current = true
        setHideAlbumArt(false)
      }
    } else if (!hasInitializedRef.current) {
      setShowVinyl(false)
      setHideAlbumArt(false)
      hasInitializedRef.current = true
    }
  }, [isPlaying, showVinyl, hasImage, enabled])

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (isPlaying && showVinyl) {
        shouldSplitRef.current = window.innerWidth >= 560
        if (hideAlbumArt) {
          setHideAlbumArt(false)
          setTimeout(() => setHideAlbumArt(true), 10)
        }
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isPlaying, showVinyl, hideAlbumArt])

  return { showVinyl, hideAlbumArt, shouldSplitRef }
}
