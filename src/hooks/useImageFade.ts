import { SyntheticEvent, TransitionEvent, useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Fades an image in once it is ready to paint.
 * - `loading`: not ready; the image is transparent
 * - `fading`: fading in, so anything placed behind it must stay until it's opaque
 * - `done`: faded in. The transition stays on the element: removing it can repaint a large image.
 * - `cached`: already in the browser's cache, so it is shown straight away with no fade
 *
 * `slow` is for large images that would otherwise flash as they come in over a dark page.
 */
export function useImageFade(src: string, slow = false) {
  const [phase, setPhase] = useState<'loading' | 'fading' | 'done' | 'cached'>('loading')
  const [phaseSrc, setPhaseSrc] = useState(src)
  const ref = useRef<HTMLImageElement>(null)

  // Reset during render so a new image never paints a frame with the previous image's state
  if (src !== phaseSrc) {
    setPhaseSrc(src)
    setPhase('loading')
  }

  // Before paint: checking any later shows cached images as transparent for a frame
  useLayoutEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth > 0) setPhase('cached')
  }, [src])

  const onLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const loadedSrc = img.src
    // Wait for decoding too, otherwise large images can start fading before they can paint
    const startFade = () => {
      if (img.src === loadedSrc) setPhase(current => (current === 'loading' ? 'fading' : current))
    }
    img.decode().then(startFade, startFade)
  }, [])

  const onTransitionEnd = useCallback((e: TransitionEvent<HTMLImageElement>) => {
    if (e.propertyName === 'opacity') setPhase('done')
  }, [])

  const fadeClassName = phase === 'cached'
    ? ''
    : `transition-opacity ${slow ? 'duration-700' : 'duration-300'} ease-out ${phase === 'loading' ? 'opacity-0' : 'opacity-100'}`
  const isOpaque = phase === 'done' || phase === 'cached'

  return { ref, isOpaque, fadeClassName, onLoad, onTransitionEnd }
}
