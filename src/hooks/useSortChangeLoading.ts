import { useState, useRef, useEffect } from 'react'

/**
 * Tracks whether a sort order change is in progress (after the initial load).
 * Returns `isLoadingSortChange` and a `clearSortLoading` callback to call in
 * the data-fetch `finally` block.
 */
export function useSortChangeLoading(sortOrder: string) {
  const isInitialLoad = useRef(true)
  const [isLoadingSortChange, setIsLoadingSortChange] = useState(false)
  const prevSortOrderRef = useRef(sortOrder)

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }
  }, [])

  const checkSortChange = () => {
    if (!isInitialLoad.current && prevSortOrderRef.current !== sortOrder) {
      setIsLoadingSortChange(true)
    }
    prevSortOrderRef.current = sortOrder
  }

  const clearSortLoading = () => {
    setIsLoadingSortChange(false)
  }

  return { isInitialLoad, isLoadingSortChange, checkSortChange, clearSortLoading }
}
