import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useLayoutEffect, lazy, Suspense, ReactNode } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import LoginForm from './components/auth/LoginForm'
import Layout from './components/layout/Layout'
import PageTransition from './components/layout/PageTransition'
import ScrollToTop from './ScrollToTop'
import ToastContainer from './components/shared/Toast'
import { SkeletonPage } from './components/shared/Skeleton'
import ComponentErrorBoundary from './components/shared/ComponentErrorBoundary'
import { useServerUrlResolver } from './hooks/useServerUrlResolver'
import { jellyfinClient } from './api/jellyfin'
import { useToastStore } from './stores/toastStore'
import { probeAndUpdateServerUrl } from './utils/serverUrl'
import { applyTheme } from './utils/themes'

const SESSION_EXPIRED_KEY = 'tunetuna-session-expired'

// Lazy load pages for code splitting
const HomePage = lazy(() => import('./components/home/HomePage'))
const ArtistsPage = lazy(() => import('./components/artists/ArtistsPage'))
const AlbumsPage = lazy(() => import('./components/albums/AlbumsPage'))
const SongsPage = lazy(() => import('./components/songs/SongsPage'))
const GenresPage = lazy(() => import('./components/genres/GenresPage'))
const PlaylistsPage = lazy(() => import('./components/playlists/PlaylistsPage'))
const PlaylistDetailPage = lazy(() => import('./components/playlists/PlaylistDetailPage'))
const SettingsPage = lazy(() => import('./components/shared/SettingsPage'))
const ArtistDetailPage = lazy(() => import('./components/artists/ArtistDetailPage'))
const AlbumDetailPage = lazy(() => import('./components/albums/AlbumDetailPage'))
const GenreSongsPage = lazy(() => import('./components/genres/GenreSongsPage'))
const CollectionPage = lazy(() => import('./components/collection/CollectionPage'))
const CollectionDetailPage = lazy(() => import('./components/collection/CollectionDetailPage'))
const StatsPage = lazy(() => import('./components/stats/StatsPage'))
const StatsDetailPage = lazy(() => import('./components/stats/StatsDetailPage'))
const ArtistTopSongsDetailPage = lazy(() => import('./components/stats/ArtistTopSongsDetailPage'))
const SongDetailPage = lazy(() => import('./components/songs/SongDetailPage'))
const SmartPlaylistDetailPage = lazy(() => import('./components/smart/SmartPlaylistDetailPage'))
const SmartPickerPage = lazy(() => import('./components/smart/SmartPickerPage'))

// Wrapper to add error boundary to pages
function withErrorBoundary(element: ReactNode, name: string) {
  return <ComponentErrorBoundary componentName={name}>{element}</ComponentErrorBoundary>
}

function App() {
  const { isAuthenticated, logout } = useAuthStore()
  const { pageVisibility } = useSettingsStore()
  const theme = useSettingsStore(s => s.theme)
  const customThemeColors = useSettingsStore(s => s.customThemeColors)
  const customArtTint = useSettingsStore(s => s.customArtTint)

  // Before paint, so the persisted theme shows without a flash of the default
  useLayoutEffect(() => applyTheme(theme, customThemeColors, customArtTint), [theme, customThemeColors, customArtTint])

  // Re-probe local/remote server URL on foreground
  useServerUrlResolver()

  // Handle 401 from Jellyfin API — session expired.
  // logout() reloads the page, so the toast is deferred via sessionStorage.
  useEffect(() => {
    let handled = false
    jellyfinClient.setOnUnauthorized(() => {
      if (handled) return
      handled = true
      try { sessionStorage.setItem(SESSION_EXPIRED_KEY, '1') } catch { /* ignore */ }
      logout()
    })
  }, [logout])

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
        sessionStorage.removeItem(SESSION_EXPIRED_KEY)
        useToastStore.getState().addToast('Session expired — please log in again', 'error', 5000)
      }
    } catch { /* ignore */ }
  }, [])

  // On network failure, re-probe LAN/remote so the next retry may swap server URL
  useEffect(() => {
    jellyfinClient.setOnNetworkError(() => probeAndUpdateServerUrl())
  }, [])

  if (!isAuthenticated) {
    return (
      <>
        <LoginForm />
        <ToastContainer />
      </>
    )
  }

  return (
    <>
      <BrowserRouter>
        <Layout>
          <PageTransition>
            <ScrollToTop />
            <Suspense fallback={<SkeletonPage />}>
              <Routes>
                <Route path="/" element={withErrorBoundary(<HomePage />, 'Home')} />
                <Route path="/song/:id" element={withErrorBoundary(<SongDetailPage />, 'Song')} />
                <Route path="/mood/:moodValue" element={withErrorBoundary(<PlaylistDetailPage />, 'Mood')} />
                <Route path="/smart/picker/:pickerId" element={withErrorBoundary(<SmartPickerPage />, 'Smart picker')} />
                <Route path="/smart/:smartId" element={withErrorBoundary(<SmartPlaylistDetailPage />, 'Smart playlist')} />
                <Route path="/settings" element={withErrorBoundary(<SettingsPage />, 'Settings')} />
                {pageVisibility.artists && (
                  <>
                    <Route path="/artists" element={withErrorBoundary(<ArtistsPage />, 'Artists')} />
                    <Route path="/artist/:id" element={withErrorBoundary(<ArtistDetailPage />, 'Artist')} />
                  </>
                )}
                {pageVisibility.albums && (
                  <>
                    <Route path="/albums" element={withErrorBoundary(<AlbumsPage />, 'Albums')} />
                    <Route path="/album/:id" element={withErrorBoundary(<AlbumDetailPage />, 'Album')} />
                  </>
                )}
                {pageVisibility.songs && <Route path="/songs" element={withErrorBoundary(<SongsPage />, 'Songs')} />}
                {pageVisibility.genres && (
                  <>
                    <Route path="/genres" element={withErrorBoundary(<GenresPage />, 'Genres')} />
                    <Route path="/genre/:id" element={withErrorBoundary(<GenreSongsPage />, 'Genre')} />
                  </>
                )}
                {pageVisibility.playlists && (
                  <>
                    <Route path="/playlists" element={withErrorBoundary(<PlaylistsPage />, 'Playlists')} />
                    <Route path="/playlist/:id" element={withErrorBoundary(<PlaylistDetailPage />, 'Playlist')} />
                  </>
                )}
                {pageVisibility.collection && (
                  <>
                    <Route path="/collection" element={withErrorBoundary(<CollectionPage />, 'Collection')} />
                    <Route path="/collection/:releaseId" element={withErrorBoundary(<CollectionDetailPage />, 'Collection detail')} />
                  </>
                )}
                {pageVisibility.stats && (
                  <>
                    <Route path="/stats" element={withErrorBoundary(<StatsPage />, 'Stats')} />
                    <Route path="/stats/artist/songs" element={withErrorBoundary(<ArtistTopSongsDetailPage />, 'Artist top songs')} />
                    <Route path="/stats/:category" element={withErrorBoundary(<StatsDetailPage />, 'Stats detail')} />
                  </>
                )}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </PageTransition>
        </Layout>
      </BrowserRouter>
      <ToastContainer />
    </>
  )
}

export default App

