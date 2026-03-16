import { useState, useEffect, useRef } from 'react'

/**
 * Manages the cassette wheel rotation animation.
 * Returns the current wheel rotation angle (in degrees) that updates via requestAnimationFrame.
 * Speed: one full rotation (360°) per 10 seconds.
 */
export function useCassetteWheelAnimation(isPlaying: boolean) {
  const [wheelRotation, setWheelRotation] = useState(0)
  const wheelRotationRef = useRef<number>(0)
  const wheelAnimFrameRef = useRef<number | null>(null)
  const wheelLastTimeRef = useRef<number>(0)

  useEffect(() => {
    if (isPlaying) {
      const animate = (currentTime: number) => {
        if (wheelLastTimeRef.current === 0) {
          wheelLastTimeRef.current = currentTime
        }
        const dt = currentTime - wheelLastTimeRef.current
        const speed = 360 / 10000 // 360° per 10s
        wheelRotationRef.current = (wheelRotationRef.current + speed * dt) % 360
        setWheelRotation(wheelRotationRef.current)
        wheelLastTimeRef.current = currentTime
        wheelAnimFrameRef.current = requestAnimationFrame(animate)
      }
      wheelLastTimeRef.current = 0
      wheelAnimFrameRef.current = requestAnimationFrame(animate)
    } else {
      if (wheelAnimFrameRef.current) {
        cancelAnimationFrame(wheelAnimFrameRef.current)
        wheelAnimFrameRef.current = null
      }
      wheelLastTimeRef.current = 0
    }
    return () => {
      if (wheelAnimFrameRef.current) {
        cancelAnimationFrame(wheelAnimFrameRef.current)
      }
    }
  }, [isPlaying])

  return wheelRotation
}
