import { useRef, useCallback } from 'react'

interface UseLongPressOptions {
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void
  onClick?: (e: React.MouseEvent | React.TouchEvent) => void
  delay?: number
  moveThreshold?: number
}

export function useLongPress({
  onLongPress,
  onClick,
  delay = 500,
  moveThreshold = 10,
}: UseLongPressOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const targetRef = useRef<EventTarget | null>(null)
  const longPressTriggeredRef = useRef<boolean>(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const hasMovedRef = useRef<boolean>(false)

  const start = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      longPressTriggeredRef.current = false
      hasMovedRef.current = false
      targetRef.current = e.target

      // Ignore right clicks (or other non-primary clicks)
      if ('button' in e && e.button !== 0) return

      e.preventDefault()

      // Store initial touch position for touch events
      if ('touches' in e && e.touches.length > 0) {
        touchStartPosRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        }
      } else {
        touchStartPosRef.current = null
      }

      timeoutRef.current = setTimeout(() => {
        // Only trigger long press if there was no significant movement
        if (!hasMovedRef.current) {
          longPressTriggeredRef.current = true
          onLongPress(e)
        }
      }, delay)
    },
    [onLongPress, delay]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartPosRef.current || e.touches.length === 0) return

      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const deltaX = Math.abs(currentX - touchStartPosRef.current.x)
      const deltaY = Math.abs(currentY - touchStartPosRef.current.y)
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      // If movement exceeds threshold, cancel long press
      if (distance > moveThreshold) {
        hasMovedRef.current = true
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      }
    },
    [moveThreshold]
  )

  const clear = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Ignore right clicks and other non-primary clicks
      if ('button' in e && e.button !== 0) {
        longPressTriggeredRef.current = false
        hasMovedRef.current = false
        targetRef.current = null
        touchStartPosRef.current = null
        return
      }

      const wasLongPress = longPressTriggeredRef.current
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      // Only call onClick if long press was NOT triggered and there was no significant movement
      if (onClick && targetRef.current === e.target && !wasLongPress && !hasMovedRef.current) {
        onClick(e)
      }
      longPressTriggeredRef.current = false
      hasMovedRef.current = false
      targetRef.current = null
      touchStartPosRef.current = null
    },
    [onClick]
  )

  return {
    onMouseDown: start,
    onTouchStart: start,
    onTouchMove: handleTouchMove,
    onMouseUp: clear,
    onMouseLeave: (e: React.MouseEvent) => {
      // Only clear timeout on mouseleave, don't trigger onClick
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      longPressTriggeredRef.current = false
      hasMovedRef.current = false
      targetRef.current = null
      touchStartPosRef.current = null
    },
    onTouchEnd: clear,
  }
}




