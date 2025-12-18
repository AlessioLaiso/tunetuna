import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Find the main scrollable container
    const scrollContainer = document.querySelector('.main-scrollable')
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [pathname])

  return null
}



