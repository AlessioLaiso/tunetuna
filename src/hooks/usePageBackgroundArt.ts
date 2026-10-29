import { useEffect } from 'react'
import { useBackgroundArtStore } from '../stores/backgroundArtStore'

/**
 * Uses this item's art for the app background and artwork accent while the calling view is
 * mounted. The most recently mounted view wins (e.g. the player over the page beneath it).
 * Pass null/undefined while the item is loading to keep the player bar track's art.
 */
export function usePageBackgroundArt(itemId: string | null | undefined) {
  useEffect(() => {
    if (!itemId) return
    const token = Symbol(itemId)
    const { addClaim, removeClaim } = useBackgroundArtStore.getState()
    addClaim({ token, itemId })
    return () => removeClaim(token)
  }, [itemId])
}
