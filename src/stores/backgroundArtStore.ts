import { create } from 'zustand'

interface ArtClaim {
  token: symbol
  itemId: string
}

interface BackgroundArtState {
  /** Items whose art mounted views want for the app background and accent; the latest wins */
  claims: ArtClaim[]
  addClaim: (claim: ArtClaim) => void
  removeClaim: (token: symbol) => void
}

export const useBackgroundArtStore = create<BackgroundArtState>()((set) => ({
  claims: [],
  addClaim: (claim) => set((state) => ({ claims: [...state.claims, claim] })),
  removeClaim: (token) => set((state) => ({ claims: state.claims.filter((c) => c.token !== token) })),
}))

/** The item whose art should be shown; null falls back to the player bar track */
export function selectArtItemId(state: BackgroundArtState) {
  return state.claims.length > 0 ? state.claims[state.claims.length - 1].itemId : null
}
