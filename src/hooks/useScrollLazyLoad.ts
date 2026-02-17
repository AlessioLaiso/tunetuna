import { useEffect, useCallback, useRef } from 'react'

interface UseScrollLazyLoadOptions {
  /** Total number of items */
  totalCount: number
  /** Current visible count */
  visibleCount: number
  /** Increment amount when loading more */
  increment: number
  /** Callback to update visible count */
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>
  /** How many viewports from bottom to trigger load (default 1.0) */
  threshold?: number
  /** Whether this lazy loading is enabled (default true) */
  enabled?: boolean
}

/**
 * Hook for scroll-based lazy loading that uses a single, efficient scroll listener.
 * Listens on .main-scrollable container (the app's scrollable viewport).
 */
export function useScrollLazyLoad({
  totalCount,
  visibleCount,
  increment,
  setVisibleCount,
  threshold = 1.0,
  enabled = true
}: UseScrollLazyLoadOptions) {
  const lastScrollTime = useRef(0)
  const throttleMs = 100 // Throttle scroll handling

  const handleScroll = useCallback(() => {
    const container = document.querySelector('.main-scrollable')
    if (!container) return

    // Throttle scroll events
    const now = Date.now()
    if (now - lastScrollTime.current < throttleMs) return
    lastScrollTime.current = now

    // Already showing all items
    if (visibleCount >= totalCount) return

    const { scrollTop, clientHeight, scrollHeight } = container

    // Calculate approximate position of the last visible-image item.
    // Since all items are rendered but only `visibleCount` have images,
    // we estimate where the image boundary is based on the ratio of
    // visible items to total items, then trigger when user scrolls near it.
    const visibleRatio = visibleCount / totalCount
    const estimatedImageBoundary = scrollHeight * visibleRatio

    // Load more when scrolled within threshold viewports of the image boundary
    if (scrollTop + clientHeight * (1 + threshold) >= estimatedImageBoundary) {
      setVisibleCount(prev => Math.min(prev + increment, totalCount))
    }
  }, [totalCount, visibleCount, increment, setVisibleCount, threshold])

  useEffect(() => {
    if (!enabled) return

    const container = document.querySelector('.main-scrollable')
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })

    // Initial check in case content is short
    handleScroll()

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll, enabled])
}
