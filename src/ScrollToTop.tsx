import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

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
