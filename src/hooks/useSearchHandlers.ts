import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../stores/playerStore'
import type { BaseItemDto } from '../api/types'

interface UseSearchHandlersOptions {
  setSearchQuery: (query: string) => void
  isSearchOpen: boolean
  setIsSearchOpen: (open: boolean) => void
  openSearch: () => void
  clearSearch: () => void
  clearAll: () => void
  searchResults: { songs?: BaseItemDto[] } | null
}

/**
 * Shared search overlay handlers used by list pages (Songs, Albums, Artists).
 * Handles navigation, playback, and search state management.
 */
export function useSearchHandlers({
  setSearchQuery,
  isSearchOpen,
  setIsSearchOpen,
  openSearch,
  clearSearch,
  clearAll,
  searchResults,
}: UseSearchHandlersOptions) {
  const navigate = useNavigate()
  const playTrack = usePlayerStore((state) => state.playTrack)
  const playAlbum = usePlayerStore((state) => state.playAlbum)
  const addToQueue = usePlayerStore((state) => state.addToQueue)

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (query.trim().length > 0 && !isSearchOpen) {
      openSearch()
    }
  }, [setSearchQuery, isSearchOpen, openSearch])

  const handleClearSearch = useCallback(() => {
    clearSearch()
  }, [clearSearch])

  const handleCancelSearch = useCallback(() => {
    setIsSearchOpen(false)
    clearAll()
  }, [setIsSearchOpen, clearAll])

  const handleArtistClick = useCallback((artistId: string) => {
    navigate(`/artist/${artistId}`)
    setIsSearchOpen(false)
    clearSearch()
  }, [navigate, setIsSearchOpen, clearSearch])

  const handleAlbumClick = useCallback((albumId: string) => {
    navigate(`/album/${albumId}`)
    setIsSearchOpen(false)
    clearSearch()
  }, [navigate, setIsSearchOpen, clearSearch])

  const handleSongClick = useCallback((song: BaseItemDto) => {
    playTrack(song, [song])
  }, [playTrack])

  const handlePlayAllSongs = useCallback(() => {
    if (searchResults?.songs && searchResults.songs.length > 0) {
      playAlbum(searchResults.songs)
    }
  }, [searchResults, playAlbum])

  const handleAddSongsToQueue = useCallback(() => {
    if (searchResults?.songs && searchResults.songs.length > 0) {
      addToQueue(searchResults.songs)
    }
  }, [searchResults, addToQueue])

  const handlePlaylistClick = useCallback((playlistId: string) => {
    navigate(`/playlist/${playlistId}`)
    setIsSearchOpen(false)
    clearSearch()
  }, [navigate, setIsSearchOpen, clearSearch])

  return {
    handleSearch,
    handleClearSearch,
    handleCancelSearch,
    handleArtistClick,
    handleAlbumClick,
    handleSongClick,
    handlePlayAllSongs,
    handleAddSongsToQueue,
    handlePlaylistClick,
  }
}
