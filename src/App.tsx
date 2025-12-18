import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import LoginForm from './components/auth/LoginForm'
import Layout from './components/layout/Layout'
import ScrollToTop from './ScrollToTop'

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

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function App() {
  const { isAuthenticated, logout } = useAuthStore()
  const { pageVisibility } = useSettingsStore()

  // Debug: Add logout button if authenticated (temporary) - moved to useEffect to avoid hook order issues
  // CRITICAL: useEffect must be called BEFORE any conditional returns to ensure consistent hook order
  // Note: logout is a stable function from zustand store, so we can omit it from deps
  useEffect(() => {
    if (isAuthenticated && window.location.search.includes('logout=true')) {
      logout()
      window.location.search = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])


  if (!isAuthenticated) {
    return <LoginForm />
  }

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {pageVisibility.artists && (
              <>
                <Route path="/artists" element={<ArtistsPage />} />
                <Route path="/artist/:id" element={<ArtistDetailPage />} />
              </>
            )}
            {pageVisibility.albums && (
              <>
                <Route path="/albums" element={<AlbumsPage />} />
                <Route path="/album/:id" element={<AlbumDetailPage />} />
              </>
            )}
            {pageVisibility.songs && <Route path="/songs" element={<SongsPage />} />}
            {pageVisibility.genres && (
              <>
                <Route path="/genres" element={<GenresPage />} />
                <Route path="/genre/:id" element={<GenreSongsPage />} />
              </>
            )}
            {pageVisibility.playlists && (
              <>
                <Route path="/playlists" element={<PlaylistsPage />} />
                <Route path="/playlist/:id" element={<PlaylistDetailPage />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  )
}

export default App

