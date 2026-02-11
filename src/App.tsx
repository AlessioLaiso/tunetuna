import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense, ReactNode } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import LoginForm from './components/auth/LoginForm'
import Layout from './components/layout/Layout'
import ScrollToTop from './ScrollToTop'
import ToastContainer from './components/shared/Toast'
import ComponentErrorBoundary from './components/shared/ComponentErrorBoundary'

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
const StatsPage = lazy(() => import('./components/stats/StatsPage'))
const SongDetailPage = lazy(() => import('./components/songs/SongDetailPage'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// Wrapper to add error boundary to pages
function withErrorBoundary(element: ReactNode, name: string) {
  return <ComponentErrorBoundary componentName={name}>{element}</ComponentErrorBoundary>
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
        <ScrollToTop />
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={withErrorBoundary(<HomePage />, 'Home')} />
              <Route path="/song/:id" element={withErrorBoundary(<SongDetailPage />, 'Song')} />
              <Route path="/mood/:moodValue" element={withErrorBoundary(<PlaylistDetailPage />, 'Mood')} />
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
              {pageVisibility.stats && (
                <>
                  <Route path="/stats" element={withErrorBoundary(<StatsPage />, 'Stats')} />
                </>
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
      <ToastContainer />
    </>
  )
}

export default App

