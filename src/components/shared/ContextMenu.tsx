import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, ListStart, ListEnd, Shuffle, RefreshCw, User, Guitar, Disc, Music, ExternalLink, ListPlus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import BottomSheet from './BottomSheet'
import ResponsiveModal from './ResponsiveModal'
import PlatformPicker from './PlatformPicker'
import PlaylistPicker from '../playlists/PlaylistPicker'
import PlaylistFormModal from '../playlists/PlaylistFormModal'
import { jellyfinClient } from '../../api/jellyfin'
import { createSearchLinksResponse, type OdesliResponse } from '../../api/feed'
import { usePlayerStore } from '../../stores/playerStore'
import { useSyncStore } from '../../stores/syncStore'
import { useMusicStore } from '../../stores/musicStore'
import { useStatsStore } from '../../stores/statsStore'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import type { BaseItemDto, LightweightSong } from '../../api/types'
import { logger } from '../../utils/logger'

const JellyfinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" role="img" aria-label="Jellyfin">
    <path d="M12.0001 2C9.35508 2 0.835078 17.448 2.13408 20.055C3.43308 22.662 20.5841 22.633 21.8691 20.055C23.1541 17.477 14.6481 2 12.0001 2ZM18.4691 17.793C17.6291 19.483 6.39208 19.501 5.54108 17.793C4.69008 16.085 10.2671 5.963 12.0001 5.963C13.7331 5.963 19.3111 16.1 18.4691 17.793ZM12.0001 9.664C11.1221 9.664 8.30008 14.789 8.72508 15.655C9.15008 16.521 14.8491 16.511 15.2751 15.655C15.7011 14.799 12.8801 9.664 12.0001 9.664Z"/>
  </svg>
)

interface ContextMenuProps {
  item: BaseItemDto | LightweightSong | null
  itemType: 'album' | 'song' | 'artist' | 'playlist' | null
  isOpen: boolean
  onClose: () => void
  zIndex?: number
  /**
   * Optional callback invoked when a navigation action is triggered
   * from this context menu (e.g. go to album/artist/genre).
   *
   * Used in the queue view to close the player modal when navigating away.
   */
  onNavigate?: () => void
  /**
   * Display mode for the context menu
   * 'mobile' - shows bottom sheet (default, for touch/long press)
   * 'desktop' - shows positioned menu (for right-click)
   */
  mode?: 'mobile' | 'desktop'
  /**
   * Position for desktop mode (coordinates relative to viewport)
   */
  position?: { x: number, y: number }
  /**
   * Additional actions appended to the action list (e.g. "Remove from Playlist")
   */
  extraActions?: Array<{ id: string; label: string; icon: LucideIcon }>
  /**
   * Handler for extra actions
   */
  onExtraAction?: (actionId: string, item: BaseItemDto | LightweightSong) => void
}


export default function ContextMenu({ item, itemType, isOpen, onClose, zIndex, onNavigate, mode = 'mobile', position, extraActions, onExtraAction }: ContextMenuProps) {

  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [fetchedGenreName, setFetchedGenreName] = useState<string | null>(null)
  const [platformPickerOpen, setPlatformPickerOpen] = useState(false)
  const [platformPickerJellyfinId, setPlatformPickerJellyfinId] = useState<string | null>(null)
  const [odesliData, setOdesliData] = useState<OdesliResponse | null>(null)
  const [odesliLoading, setOdesliLoading] = useState(false)
  const [odesliTitle, setOdesliTitle] = useState('')
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false)
  const [playlistPickerItemIds, setPlaylistPickerItemIds] = useState<string[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteTargetName, setDeleteTargetName] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showEditPlaylist, setShowEditPlaylist] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [editTargetName, setEditTargetName] = useState('')
  const [editHasExistingImage, setEditHasExistingImage] = useState(false)
  const [editImageCacheBust, setEditImageCacheBust] = useState(0)
  const { playTrack, playAlbum, addToQueueWithToast, playNext, shuffleArtist, toggleShuffle } = usePlayerStore()
  const startSync = useSyncStore(s => s.startSync)
  const completeSync = useSyncStore(s => s.completeSync)
  const genres = useMusicStore(s => s.genres)
  const { updateEventMetadata } = useStatsStore()

  // Use ref to always have access to the latest item and itemType in async callbacks
  // This prevents stale closure issues when item changes during async operations
  const itemRef = useRef(item)
  const itemTypeRef = useRef(itemType)
  useEffect(() => {
    itemRef.current = item
    itemTypeRef.current = itemType
  }, [item, itemType])

  // Fetch genre from first song when opening menu for album or artist
  useEffect(() => {
    if (!isOpen || !item) {
      setFetchedGenreName(null)
      return
    }

    const fetchGenre = async () => {
      try {
        if (itemType === 'album') {
          const tracks = await jellyfinClient.getAlbumTracks(item.Id)
          if (tracks.length > 0 && tracks[0].Genres?.[0]) {
            setFetchedGenreName(tracks[0].Genres[0])
          }
        } else if (itemType === 'artist') {
          const { songs } = await jellyfinClient.getArtistItems(item.Id)
          if (songs.length > 0 && songs[0].Genres?.[0]) {
            setFetchedGenreName(songs[0].Genres[0])
          }
        }
      } catch (error) {
        logger.error('Failed to fetch genre:', error)
      }
    }

    fetchGenre()
  }, [isOpen, item?.Id, itemType])

  // Helper to get genre ID from genre name
  const getGenreId = (genreName: string | undefined): string | null => {
    if (!genreName) return null
    const genre = genres.find(g => g.Name?.toLowerCase() === genreName.toLowerCase())
    return genre?.Id || null
  }

  // Use useCallback with refs to ensure we always use the latest item/itemType
  const handleAction = useCallback(async (action: string) => {
    // Use ref to get the current item value, preventing stale closure issues
    const currentItem = itemRef.current
    const currentItemType = itemTypeRef.current

    if (!currentItem) return

    // Handle extra actions from parent
    if (extraActions?.some(a => a.id === action)) {
      onClose()
      onExtraAction?.(action, currentItem)
      return
    }

    // Handle "Add to Playlist" (no loading state, opens picker)
    if (action === 'addToPlaylist') {
      if (currentItemType === 'song') {
        setPlaylistPickerItemIds([currentItem.Id])
        onClose()
        setPlaylistPickerOpen(true)
      } else if (currentItemType === 'album') {
        setLoading(true)
        setLoadingAction(action)
        try {
          const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
          setPlaylistPickerItemIds(tracks.map(t => t.Id))
          onClose()
          setPlaylistPickerOpen(true)
        } catch (error) {
          logger.error('Failed to fetch album tracks:', error)
        } finally {
          setLoading(false)
          setLoadingAction(null)
        }
      }
      return
    }

    // Handle playlist management actions
    if (action === 'deletePlaylist') {
      setDeleteTargetId(currentItem.Id)
      setDeleteTargetName(currentItem.Name || 'this playlist')
      onClose()
      setShowDeleteConfirm(true)
      return
    }
    if (action === 'renamePlaylist') {
      setEditTargetId(currentItem.Id)
      setEditTargetName(currentItem.Name || '')
      setEditHasExistingImage(!!('ImageTags' in currentItem && currentItem.ImageTags?.Primary))
      onClose()
      setShowEditPlaylist(true)
      return
    }

    // Handle navigation actions (don't need loading state)
    if (action === 'viewDetails') {
      onClose()
      if (onNavigate) {
        onNavigate()
      }
      navigate(`/song/${currentItem.Id}`)
      return
    }
    if (action === 'openInJellyfin') {
      const serverUrl = useAuthStore.getState().serverUrl
      const serverId = useAuthStore.getState().serverId
      const base = serverUrl?.replace(/\/$/, '') ?? ''
      if (base && currentItem.Id) {
        let sid = serverId
        if (!sid) {
          try {
            const r = await fetch(`${base}/System/Info/Public`)
            if (r.ok) {
              const info = await r.json()
              sid = info.Id ?? ''
            }
          } catch { /* ignore */ }
        }
        if (sid) {
          window.open(`${base}/web/#/details?id=${currentItem.Id}&serverId=${sid}`, '_blank', 'noopener,noreferrer')
        }
      }
      onClose()
      return
    }
    if (action === 'openIn') {
      const artistName = currentItem.ArtistItems?.[0]?.Name || currentItem.AlbumArtist || currentItem.Name || ''
      let title = ''
      if (currentItemType === 'song') {
        title = currentItem.Name || ''
      } else if (currentItemType === 'album') {
        title = currentItem.Name || ''
      } else if (currentItemType === 'artist') {
        title = ''
      }
      setOdesliTitle(currentItemType === 'artist' ? artistName : `${artistName} - ${title}`)
      setOdesliLoading(true)
      setOdesliData(null)
      setPlatformPickerJellyfinId(currentItem.Id ?? null)
      onClose()
      setPlatformPickerOpen(true)
      const searchLinks = createSearchLinksResponse(artistName, title)
      setOdesliData(searchLinks)
      setOdesliLoading(false)
      return
    }
    if (action.startsWith('goTo')) {
      onClose()
      // Allow parent to react to navigation (e.g. close modals in queue view)
      if (onNavigate) {
        onNavigate()
      }
      if (action === 'goToArtist') {
        const artistId = currentItem.ArtistItems?.[0]?.Id ||
          ('AlbumArtists' in currentItem ? currentItem.AlbumArtists?.[0]?.Id : undefined)
        if (artistId) {
          navigate(`/artist/${artistId}`)
        }
      } else if (action === 'goToAlbum') {
        if (currentItem.AlbumId) {
          navigate(`/album/${currentItem.AlbumId}`)
        }
      } else if (action === 'goToGenre') {
        // For albums and artists, use the fetched genre from first song
        // For songs, use the song's own genre
        const genreName = (currentItemType === 'album' || currentItemType === 'artist')
          ? fetchedGenreName
          : currentItem.Genres?.[0]
        if (genreName) {
          const genreId = getGenreId(genreName)
          if (genreId) {
            navigate(`/genre/${encodeURIComponent(genreId)}`)
          } else {
            // If genre not found in cache, fetch genres and try again
            const allGenres = await jellyfinClient.getGenres()
            const genre = allGenres.find(g => g.Name?.toLowerCase() === genreName.toLowerCase())
            if (genre?.Id) {
              navigate(`/genre/${encodeURIComponent(genre.Id)}`)
            }
          }
        }
      }
      return
    }

    setLoading(true)
    setLoadingAction(action)

    try {
      switch (currentItemType) {
        case 'album': {
          if (action === 'play') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            // Disable shuffle if it's currently enabled
            const { shuffle } = usePlayerStore.getState()
            if (shuffle) {
              toggleShuffle()
            }
            playAlbum(tracks)
          } else if (action === 'shuffle') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            // Disable shuffle first if it's enabled, then play album, then enable shuffle
            const { shuffle } = usePlayerStore.getState()
            if (shuffle) {
              toggleShuffle()
            }
            playAlbum(tracks)
            // Enable shuffle after playAlbum sets up the queue
            // Use requestAnimationFrame to ensure state update happens after playAlbum
            requestAnimationFrame(() => {
              const { shuffle: currentShuffle } = usePlayerStore.getState()
              if (!currentShuffle) {
                toggleShuffle()
              }
            })
          } else if (action === 'playNext') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            playNext(tracks)
          } else if (action === 'addToQueue') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            addToQueueWithToast(tracks)
          } else if (action === 'sync') {
            // Sync this album by preloading its tracks
            startSync('context-menu', `Syncing ${currentItem.Name}...`)
            try {
              const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
              // Update stats events for all songs in this album
              tracks.forEach(track => {
                updateEventMetadata('song', track.Id, {
                  songName: track.Name || 'Unknown',
                  artistNames: track.ArtistItems?.length ? track.ArtistItems.map(a => a.Name || 'Unknown') : [track.AlbumArtist || 'Unknown'],
                  albumName: track.Album || 'Unknown',
                  genres: track.Genres || [],
                  year: track.ProductionYear || null,
                })
              })
              completeSync(true, `${currentItem.Name} synced`)
            } catch (error) {
              completeSync(false, `Failed to sync ${currentItem.Name}`)
            }
          }
          break
        }
        case 'song': {
          if (action === 'play') {
            logger.log('ContextMenu: Playing song', currentItem.Name)
            playTrack(currentItem)
          } else if (action === 'playNext') {
            logger.log('ContextMenu: Adding song to play next', currentItem.Name)
            playNext([currentItem])
          } else if (action === 'addToQueue') {
            logger.log('ContextMenu: Adding song to queue', currentItem.Name)
            addToQueueWithToast([currentItem])
          } else if (action === 'sync') {
              // Sync this song and invalidate related genre caches
              startSync('context-menu', `Syncing ${currentItem.Name}...`)
              try {
                const updatedSong = await jellyfinClient.getSongById(currentItem.Id)

                // Clear genre caches for this song's current genres
                if (updatedSong.Genres) {
                  const allGenres = await jellyfinClient.getGenres()

                  updatedSong.Genres.forEach(genreName => {
                    const genre = allGenres.find(g => g.Name?.toLowerCase() === genreName.toLowerCase())
                    if (genre?.Id) {
                      useMusicStore.getState().clearGenreSongsForGenre(genre.Id)
                    }
                  })
                }

                // Update stats events with fresh metadata
                updateEventMetadata('song', currentItem.Id, {
                  songName: updatedSong.Name || 'Unknown',
                  artistNames: updatedSong.ArtistItems?.length ? updatedSong.ArtistItems.map(a => a.Name || 'Unknown') : [updatedSong.AlbumArtist || 'Unknown'],
                  albumName: updatedSong.Album || 'Unknown',
                  genres: updatedSong.Genres || [],
                  year: updatedSong.ProductionYear || null,
                })

                completeSync(true, `${currentItem.Name} synced`)
              } catch (error) {
                completeSync(false, `Failed to sync ${currentItem.Name}`)
              }
          }
          break
        }
        case 'artist': {
          if (action === 'shuffle') {
            const { songs } = await jellyfinClient.getArtistItems(currentItem.Id)
            shuffleArtist(songs)
          } else if (action === 'playNext') {
            const { songs } = await jellyfinClient.getArtistItems(currentItem.Id)
            playNext(songs)
          } else if (action === 'addToQueue') {
            const { songs } = await jellyfinClient.getArtistItems(currentItem.Id)
            addToQueueWithToast(songs)
          } else if (action === 'sync') {
            // Sync this artist by preloading their items
            startSync('context-menu', `Syncing ${currentItem.Name}...`)
            try {
              const { songs } = await jellyfinClient.getArtistItems(currentItem.Id)
              // Update stats events for all songs by this artist
              songs.forEach(track => {
                updateEventMetadata('song', track.Id, {
                  songName: track.Name || 'Unknown',
                  artistNames: track.ArtistItems?.length ? track.ArtistItems.map(a => a.Name || 'Unknown') : [track.AlbumArtist || 'Unknown'],
                  albumName: track.Album || 'Unknown',
                  genres: track.Genres || [],
                  year: track.ProductionYear || null,
                })
              })
              completeSync(true, `${currentItem.Name} synced`)
            } catch (error) {
              completeSync(false, `Failed to sync ${currentItem.Name}`)
            }
          }
          break
        }
        case 'playlist': {
          if (action === 'play') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            if (tracks.length === 0) break
            // Disable shuffle if it's currently enabled
            const { shuffle } = usePlayerStore.getState()
            if (shuffle) {
              toggleShuffle()
            }
            playAlbum(tracks)
          } else if (action === 'shuffle') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            if (tracks.length === 0) break
            // Disable shuffle first if it's enabled, then play album, then enable shuffle
            const { shuffle } = usePlayerStore.getState()
            if (shuffle) {
              toggleShuffle()
            }
            playAlbum(tracks)
            // Enable shuffle after playAlbum sets up the queue
            // Use requestAnimationFrame to ensure state update happens after playAlbum
            requestAnimationFrame(() => {
              const { shuffle: currentShuffle } = usePlayerStore.getState()
              if (!currentShuffle) {
                toggleShuffle()
              }
            })
          } else if (action === 'playNext') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            if (tracks.length === 0) break
            playNext(tracks)
          } else if (action === 'addToQueue') {
            const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
            if (tracks.length === 0) break
            addToQueueWithToast(tracks)
          } else if (action === 'sync') {
            startSync('context-menu', `Syncing ${currentItem.Name}...`)
            try {
              const tracks = await jellyfinClient.getAlbumTracks(currentItem.Id)
              tracks.forEach(track => {
                updateEventMetadata('song', track.Id, {
                  songName: track.Name || 'Unknown',
                  artistNames: track.ArtistItems?.length ? track.ArtistItems.map(a => a.Name || 'Unknown') : [track.AlbumArtist || 'Unknown'],
                  albumName: track.Album || 'Unknown',
                  genres: track.Genres || [],
                  year: track.ProductionYear || null,
                })
              })
              completeSync(true, `${currentItem.Name} synced`)
            } catch (error) {
              completeSync(false, `Failed to sync ${currentItem.Name}`)
            }
          }
          break
        }
      }
      onClose()
    } catch (error) {
      logger.error('Context menu action failed:', error)
    } finally {
      setLoading(false)
      setLoadingAction(null)
    }
  }, [onClose, onNavigate, navigate, fetchedGenreName, getGenreId, playTrack, playAlbum, addToQueueWithToast, playNext, shuffleArtist, toggleShuffle, startSync, completeSync])

  const handleDeletePlaylist = async () => {
    if (!deleteTargetId) return
    setDeleteLoading(true)
    try {
      await jellyfinClient.deleteItem(deleteTargetId)
      useToastStore.getState().addToast('Playlist deleted', 'success', 2000)
      setShowDeleteConfirm(false)
      window.dispatchEvent(new CustomEvent('playlistUpdated'))
      navigate('/playlists')
    } catch {
      useToastStore.getState().addToast('Failed to delete playlist', 'error', 3000)
    } finally {
      setDeleteLoading(false)
    }
  }

  const playlistModals = (
    <>
      <PlaylistPicker
        isOpen={playlistPickerOpen}
        onClose={() => setPlaylistPickerOpen(false)}
        itemIds={playlistPickerItemIds}
        zIndex={zIndex}
      />
      <ResponsiveModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <div className="pb-6">
          <div className="mb-6 px-4 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-lg font-semibold text-white">Delete Playlist?</div>
              <div className="text-sm text-gray-400 mt-1">
                &ldquo;{deleteTargetName}&rdquo; will be permanently deleted. This cannot be undone.
              </div>
            </div>
          </div>
          <div className="px-4 flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 bg-transparent border border-red-500 text-red-500 hover:bg-red-500/10 font-semibold rounded-full transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeletePlaylist}
              disabled={deleteLoading}
              className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-full transition-colors disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </ResponsiveModal>
      <PlaylistFormModal
        isOpen={showEditPlaylist}
        onClose={() => setShowEditPlaylist(false)}
        editPlaylistId={editTargetId}
        initialName={editTargetName}
        hasExistingImage={editHasExistingImage}
        imageCacheBust={editImageCacheBust}
        onSaved={() => setEditImageCacheBust(Date.now())}
      />
    </>
  )

  if (!item || !itemType) {
    return (
      <>
        <PlatformPicker
          isOpen={platformPickerOpen}
          onClose={() => { setPlatformPickerOpen(false); setOdesliData(null); setPlatformPickerJellyfinId(null) }}
          odesliData={odesliData}
          loading={odesliLoading}
          title={odesliTitle}
          mode={mode}
          position={position}
          jellyfinItemId={platformPickerJellyfinId}
        />
        {playlistModals}
      </>
    )
  }

  // Always call getActions after the early return to ensure consistent hook calls
  const getActions = () => {
    switch (itemType) {
      case 'album': {
        const artistName = item.ArtistItems?.[0]?.Name ||
          ('AlbumArtists' in item ? item.AlbumArtists?.[0]?.Name : undefined) || 'Artist'
        const genreName = fetchedGenreName || 'Genre'
        return [
          { id: 'play', label: 'Play', icon: Play },
          { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
          { id: 'playNext', label: 'Play Next', icon: ListStart },
          { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
          { id: 'goToArtist', label: `Go to ${artistName}`, icon: User },
          { id: 'goToGenre', label: `Go to ${genreName}`, icon: Guitar },
          { id: 'addToPlaylist', label: 'Add to Playlist', icon: ListPlus },
          { id: 'sync', label: 'Sync', icon: RefreshCw },
          { id: 'openIn', label: 'Open in\u2026', icon: ExternalLink },
        ]
      }
      case 'song': {
        const artistName = item.ArtistItems?.[0]?.Name || item.AlbumArtist || 'Artist'
        const albumName = item.Album || 'Album'
        const genreName = item.Genres?.[0] || 'Genre'
        const baseActions = [
          { id: 'play', label: 'Play', icon: Play },
          { id: 'playNext', label: 'Play Next', icon: ListStart },
          { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
          { id: 'viewDetails', label: 'Go to Song Details', icon: Music },
          { id: 'goToAlbum', label: `Go to ${albumName}`, icon: Disc },
          { id: 'goToArtist', label: `Go to ${artistName}`, icon: User },
          { id: 'goToGenre', label: `Go to ${genreName}`, icon: Guitar },
          { id: 'addToPlaylist', label: 'Add to Playlist', icon: ListPlus },
          ...(extraActions || []),
          { id: 'sync', label: 'Sync', icon: RefreshCw },
          { id: 'openIn', label: 'Open in\u2026', icon: ExternalLink },
        ]
        return baseActions
      }
      case 'artist': {
        const genreName = fetchedGenreName || 'Genre'
        return [
          { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
          { id: 'playNext', label: 'Play Next', icon: ListStart },
          { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
          { id: 'goToGenre', label: `Go to ${genreName}`, icon: Guitar },
          { id: 'sync', label: 'Sync', icon: RefreshCw },
          { id: 'openIn', label: 'Open in\u2026', icon: ExternalLink },
        ]
      }
      case 'playlist': {
        const hasItems = item.ChildCount !== undefined ? item.ChildCount > 0 : true
        return [
          ...(hasItems ? [
            { id: 'play', label: 'Play', icon: Play },
            { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
            { id: 'playNext', label: 'Play Next', icon: ListStart },
            { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
          ] : []),
          { id: 'renamePlaylist', label: 'Edit Playlist', icon: Pencil },
          { id: 'sync', label: 'Sync', icon: RefreshCw },
          { id: 'openInJellyfin', label: 'Open in Jellyfin', icon: JellyfinIcon as unknown as LucideIcon },
          { id: 'deletePlaylist', label: 'Delete Playlist', icon: Trash2 },
        ]
      }
      default:
        return []
    }
  }

  const actions = getActions()
  const itemName = item.Name || 'Unknown'

  const platformPicker = (
    <PlatformPicker
      isOpen={platformPickerOpen}
      onClose={() => { setPlatformPickerOpen(false); setOdesliData(null); setPlatformPickerJellyfinId(null) }}
      odesliData={odesliData}
      loading={odesliLoading}
      title={odesliTitle}
      mode={mode}
      position={position}
      jellyfinItemId={platformPickerJellyfinId}
    />
  )

  // Floating menu for desktop right-clicks
  if (mode === 'desktop' && isOpen) {
    // Calculate position to keep menu within viewport
    const menuWidth = 240 // Estimated width
    const menuHeight = Math.min(400, actions.length * 44 + 8) // Estimated height based on actions

    let menuX = position?.x || 100
    let menuY = position?.y || 100

    // Adjust horizontal position if menu would go off-screen
    if (menuX + menuWidth > window.innerWidth) {
      menuX = window.innerWidth - menuWidth - 10
    }

    // Adjust vertical position if menu would go off-screen
    if (menuY + menuHeight > window.innerHeight) {
      menuY = window.innerHeight - menuHeight - 10
    }

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
          style={{ zIndex: zIndex - 1 }}
        />

        {/* Floating Context Menu */}
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[200px]"
          style={{
            left: menuX,
            top: menuY,
            zIndex
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Actions */}
          <div className="space-y-0">
            {actions.map((action) => {
              const Icon = action.icon
              const isActionLoading = loading && loadingAction === action.id

              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  <Icon className="w-4 h-4 text-white flex-shrink-0" />
                  <span className="flex-1 text-sm text-white">
                    {action.label}
                  </span>
                  {isActionLoading && (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
        {platformPicker}
        {playlistModals}
      </>
    )
  }

  // Mobile mode - use existing BottomSheet
  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose} zIndex={zIndex}>
        <div className="pb-6">
          <div className="mb-4 ml-4">
            <div className="text-lg font-semibold text-white break-words">{itemName}</div>
          </div>

          <div className="space-y-1">
            {actions.map((action) => {
              const Icon = action.icon
              const isActionLoading = loading && loadingAction === action.id

              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id)}
                  disabled={loading}
                  className="w-full flex items-center gap-4 pl-4 pr-4 py-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon className="w-5 h-5 text-white" />
                  <span className="flex-1 text-left text-white font-medium">
                    {action.label}
                  </span>
                  {isActionLoading && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </BottomSheet>
      {platformPicker}
      {playlistModals}
    </>
  )
}
