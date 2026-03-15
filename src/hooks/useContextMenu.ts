import { useState, useRef, useCallback } from 'react'
import { useLongPress } from './useLongPress'

interface UseContextMenuOptions<T> {
  item: T
  onContextMenu?: (item: T, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => void
}

/**
 * Consolidates context menu boilerplate used across all interactive list/card items.
 *
 * Two modes:
 * - **Delegating**: pass `onContextMenu` callback — the hook calls it and manages only the ref.
 * - **Local**: omit `onContextMenu` — the hook manages open/mode/position state internally.
 *
 * Returns handlers for right-click, long-press, and a click guard to prevent navigation
 * when a context menu was just opened.
 */
export function useContextMenu<T>({ item, onContextMenu }: UseContextMenuOptions<T>) {
  // Local state — only meaningful when no external handler is provided
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'mobile' | 'desktop'>('mobile')
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const justOpenedRef = useRef(false)

  const openMenu = useCallback((menuMode: 'mobile' | 'desktop', menuPosition?: { x: number; y: number }) => {
    justOpenedRef.current = true
    if (onContextMenu) {
      onContextMenu(item, menuMode, menuPosition)
    } else {
      setMode(menuMode)
      setPosition(menuPosition || null)
      setIsOpen(true)
    }
    setTimeout(() => {
      justOpenedRef.current = false
    }, 300)
  }, [item, onContextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent?.preventDefault?.()
    e.nativeEvent?.stopImmediatePropagation?.()
    openMenu('desktop', { x: e.clientX, y: e.clientY })
  }, [openMenu])

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      openMenu('mobile')
    },
  })

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  /**
   * Returns true if the click should be suppressed (context menu was just opened).
   * Call this at the top of your click handler.
   */
  const shouldSuppressClick = useCallback(() => {
    if (isOpen || justOpenedRef.current) {
      justOpenedRef.current = false
      return true
    }
    return false
  }, [isOpen])

  return {
    /** Attach to `onContextMenu` on the element */
    handleContextMenu,
    /** Spread onto the element for long-press support */
    longPressHandlers,
    /** Call at the top of your click handler; returns true if click should be ignored */
    shouldSuppressClick,
    /** Local context menu state — only used when no external onContextMenu is provided */
    menuState: {
      isOpen,
      mode,
      position,
      close,
    },
  }
}
