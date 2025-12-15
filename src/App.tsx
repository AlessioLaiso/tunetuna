import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import LoginForm from './components/auth/LoginForm'
import Layout from './components/layout/Layout'
import HomePage from './components/home/HomePage'
import ArtistsPage from './components/artists/ArtistsPage'
import AlbumsPage from './components/albums/AlbumsPage'
import SongsPage from './components/songs/SongsPage'
import GenresPage from './components/genres/GenresPage'
import PlaylistsPage from './components/playlists/PlaylistsPage'
import PlaylistDetailPage from './components/playlists/PlaylistDetailPage'
import SettingsPage from './components/shared/SettingsPage'
import ArtistDetailPage from './components/artists/ArtistDetailPage'
import AlbumDetailPage from './components/albums/AlbumDetailPage'
import GenreSongsPage from './components/genres/GenreSongsPage'
import ScrollToTop from './ScrollToTop'

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
      </Layout>
    </BrowserRouter>
  )
}

export default App

