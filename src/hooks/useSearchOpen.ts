import { useRef, useCallback, useState } from 'react'

/**
 * Hook that manages search overlay open state with iOS keyboard support.
 *
 * iOS Safari only opens the keyboard for programmatic focus() if it happens
 * synchronously within a user gesture (tap). Since the SearchInput doesn't
 * mount until after a React state update + useEffect cycle, by the time it
 * mounts the gesture context is lost.
 *
 * This hook provides a hidden proxy <input> that gets focused synchronously
 * in the tap handler, "activating" the keyboard. When the real SearchInput
 * mounts and calls focus(), iOS transfers the keyboard to it.
 *
 * Usage:
 *   const { isSearchOpen, openSearch, closeSearch, proxyInputProps } = useSearchOpen()
 *   // Render: <input {...proxyInputProps} />
 *   // Button: <button onClick={openSearch}>Search</button>
 */
export function useSearchOpen() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const proxyRef = useRef<HTMLInputElement>(null)

  const openSearch = useCallback(() => {
    // Focus proxy input synchronously within the tap gesture —
    // this activates the iOS keyboard before React re-renders
    proxyRef.current?.focus()
    setIsSearchOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
  }, [])

  const proxyInputProps = {
    ref: proxyRef,
    'aria-hidden': true as const,
    tabIndex: -1,
    style: { position: 'fixed' as const, opacity: 0, pointerEvents: 'none' as const, width: 0, height: 0 },
  }

  return { isSearchOpen, setIsSearchOpen, openSearch, closeSearch, proxyInputProps }
}
