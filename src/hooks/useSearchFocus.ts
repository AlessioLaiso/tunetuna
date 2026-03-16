import { useEffect, type RefObject } from 'react'

/**
 * Focuses the appropriate search input (desktop vs mobile) when the search overlay opens.
 * Places the cursor at the end of any existing text.
 */
export function useSearchFocus(
  isSearchOpen: boolean,
  searchInputRef: RefObject<HTMLInputElement | null>,
  desktopSearchInputRef: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    if (isSearchOpen) {
      const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches
      const inputRef = isDesktop ? desktopSearchInputRef : searchInputRef
      setTimeout(() => {
        inputRef.current?.focus()
        if (inputRef.current) {
          const length = inputRef.current.value.length
          inputRef.current.setSelectionRange(length, length)
        }
      }, 50)
    }
  }, [isSearchOpen])
}
