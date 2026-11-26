import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { startRemotePlayback } from '../remote/receiver'

/** Remote control between the user's Tunetuna devices, while signed in. */
export function useRemotePlayback() {
  const { accessToken, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return
    return startRemotePlayback()
  }, [isAuthenticated, accessToken])
}
