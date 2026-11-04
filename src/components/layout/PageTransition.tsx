import { ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { UNSAFE_LocationContext, useLocation, useNavigationType } from 'react-router-dom'

/** Tailwind's md breakpoint: tablets and up, leaving phones with instant navigation */
const ANIMATED_MEDIA_QUERY = '(min-width: 768px) and (prefers-reduced-motion: no-preference)'
const FADE_OUT_MS = 90
const FADE_IN_MS = 160

/**
 * Fades the routed page out and the next one in, leaving Layout's fixed surfaces (tab bar, player
 * bar, queue) untouched since they render outside of it.
 *
 * The outgoing page stays mounted during its fade, so everything inside sees the location it was
 * rendered for. This overrides the router's context rather than using <Routes location>, which
 * would report every navigation as POP and trigger scroll restoration in the pages that check it.
 * Only opacity is animated: a transform would turn this into the containing block of the pages'
 * position: fixed headers.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [displayed, setDisplayed] = useState({ location, navigationType })
  const containerRef = useRef<HTMLDivElement>(null)
  const fadeRef = useRef<Animation | null>(null)
  const latestRef = useRef({ location, navigationType })

  const isPageChanging = location.pathname !== displayed.location.pathname

  // Updates within a page (search params, route state) and non-animated navigation apply right away
  if (location !== displayed.location && (!isPageChanging || !window.matchMedia(ANIMATED_MEDIA_QUERY).matches)) {
    setDisplayed({ location, navigationType })
  }

  useLayoutEffect(() => {
    latestRef.current = { location, navigationType }
  }, [location, navigationType])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Starts from the current opacity so navigating again mid-fade doesn't flash
    const fadeTo = (opacity: number, duration: number) => {
      const from = getComputedStyle(el).opacity
      fadeRef.current?.cancel()
      const fade = el.animate([{ opacity: from }, { opacity }], { duration, easing: 'ease-out', fill: 'both' })
      fadeRef.current = fade
      return fade
    }

    if (isPageChanging) {
      fadeTo(0, FADE_OUT_MS).onfinish = () => setDisplayed(latestRef.current)
    } else if (fadeRef.current) {
      const fade = fadeTo(1, FADE_IN_MS)
      fade.onfinish = () => {
        // A filling animation keeps a stacking context around the page, so remove it when done
        fade.cancel()
        fadeRef.current = null
      }
    }
  }, [isPageChanging, location.pathname])

  return (
    <UNSAFE_LocationContext.Provider value={displayed}>
      <div ref={containerRef}>{children}</div>
    </UNSAFE_LocationContext.Provider>
  )
}
