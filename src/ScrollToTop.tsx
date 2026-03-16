import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Saves the current scroll position for the active pathname.
 * Called eagerly (e.g. on click) before navigation happens,
 * so the position is captured while content is still rendered.
 */
export function saveScrollPosition() {
  const scrollContainer = document.querySelector('.main-scrollable')
  if (scrollContainer) {
    sessionStorage.setItem(
      'scroll:' + window.location.pathname,
      String(scrollContainer.scrollTop)
    )
  }
}

export function getSavedScrollPosition(pathname: string): number | null {
  const saved = sessionStorage.getItem('scroll:' + pathname)
  return saved ? Number(saved) : null
}

export default function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    // On forward navigation, scroll to top.
    // Back/forward (POP) does nothing — pages restore scroll themselves after loading.
    if (navigationType !== 'POP') {
      const scrollContainer = document.querySelector('.main-scrollable')
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'auto' })
      }
    }
  }, [pathname, navigationType])

  return null
}
