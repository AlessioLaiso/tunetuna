import { createContext, useContext } from 'react'

export interface AppBackgroundArt {
  /** Pre-blurred data URL of the art being shown */
  url: string | null
  /** Previous art, kept underneath while `url` fades in */
  prevUrl: string | null
  /** When `url` last changed (performance.now()), to keep every copy's fade-in in sync */
  changedAt: number
}

/** Extra darkening for the bottom bars so the player bar reads as its own surface */
export const BOTTOM_BAR_TINT = 'bg-black/75'

/** Fades hero images into the app background, matching the black gradient used without it */
export const HERO_FADE_MASK =
  'linear-gradient(to bottom, black 35%, rgba(0,0,0,0.98) 48%, rgba(0,0,0,0.9) 61%, rgba(0,0,0,0.7) 74%, rgba(0,0,0,0.35) 87%, transparent 100%)'

/** Null when the blurred app background is turned off */
export const AppBackgroundContext = createContext<AppBackgroundArt | null>(null)

export function useAppBackground() {
  return useContext(AppBackgroundContext)
}

/** True when surfaces should let the blurred app background show instead of painting black */
export function useAppBackgroundActive() {
  return useContext(AppBackgroundContext) !== null
}
