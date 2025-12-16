import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, ListStart, ListEnd, Shuffle, RefreshCw, ArrowRight, User, Guitar, Disc } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useSyncStore } from '../../stores/syncStore'
import { useMusicStore } from '../../stores/musicStore'
import type { BaseItemDto, LightweightSong } from '../../api/types'

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
}


export default function ContextMenu({ item, itemType, isOpen, onClose, zIndex, onNavigate, mode = 'mobile', position }: ContextMenuProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const { playTrack, playAlbum, addToQueue, playNext, shuffleArtist, toggleShuffle } = usePlayerStore()
  const { startSync, completeSync } = useSyncStore()
  const { genres } = useMusicStore()

  if (!item || !itemType) {
    return null
  }

  // Helper to get genre ID from genre name
  const getGenreId = (genreName: string | undefined): string | null => {
    if (!genreName) return null
    const genre = genres.find(g => g.Name?.toLowerCase() === genreName.toLowerCase())
    return genre?.Id || null
  }

  const handleAction = async (action: string) => {
    if (!item) return
    
    // Handle navigation actions (don't need loading state)
    if (action.startsWith('goTo')) {
      onClose()
      // Allow parent to react to navigation (e.g. close modals in queue view)
      if (onNavigate) {
        onNavigate()
      }
      if (action === 'goToArtist') {
        const artistId = item.ArtistItems?.[0]?.Id || (item.AlbumArtists?.[0]?.Id)
        if (artistId) {
          navigate(`/artist/${artistId}`)
        }
      } else if (action === 'goToAlbum') {
        if (item.AlbumId) {
          navigate(`/album/${item.AlbumId}`)
        }
      } else if (action === 'goToGenre') {
        const genreName = item.Genres?.[0]
        if (genreName) {
          const genreId = getGenreId(genreName)
          if (genreId) {
            navigate(`/genre/${genreId}`)
          } else {
            // If genre not found in cache, fetch genres and try again
            const allGenres = await jellyfinClient.getGenres()
            const genre = allGenres.find(g => g.Name?.toLowerCase() === genreName.toLowerCase())
            if (genre?.Id) {
              navigate(`/genre/${genre.Id}`)
            }
          }
        }
      }
      return
    }
    
    setLoading(true)
    setLoadingAction(action)

    try {
      switch (itemType) {
        case 'album': {
          if (action === 'play') {
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
            // Disable shuffle if it's currently enabled
            const { shuffle } = usePlayerStore.getState()
            if (shuffle) {
              toggleShuffle()
            }
            playAlbum(tracks)
          } else if (action === 'shuffle') {
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
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
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
            playNext(tracks)
          } else if (action === 'addToQueue') {
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
            addToQueue(tracks)
          } else if (action === 'sync') {
            // Sync this album by preloading its tracks
            startSync('context-menu', `Syncing ${item.Name}...`)
            try {
              await jellyfinClient.getAlbumTracks(item.Id)
              completeSync(true, `${item.Name} synced`)
            } catch (error) {
              completeSync(false, `Failed to sync ${item.Name}`)
            }
          }
          break
        }
        case 'song': {
          if (action === 'play') {
            playTrack(item)
          } else if (action === 'playNext') {
            playNext([item])
          } else if (action === 'addToQueue') {
            addToQueue([item])
          } else if (action === 'sync') {
            // Sync this song by fetching its details
            startSync('context-menu', `Syncing ${item.Name}...`)
            try {
              await jellyfinClient.getSongById(item.Id)
              completeSync(true, `${item.Name} synced`)
            } catch (error) {
              completeSync(false, `Failed to sync ${item.Name}`)
            }
          }
          break
        }
        case 'artist': {
          if (action === 'shuffle') {
            const { songs } = await jellyfinClient.getArtistItems(item.Id)
            shuffleArtist(songs)
          } else if (action === 'playNext') {
            const { songs } = await jellyfinClient.getArtistItems(item.Id)
            playNext(songs)
          } else if (action === 'addToQueue') {
            const { songs } = await jellyfinClient.getArtistItems(item.Id)
            addToQueue(songs)
          } else if (action === 'sync') {
            // Sync this artist by preloading their items
            startSync('context-menu', `Syncing ${item.Name}...`)
            try {
              await jellyfinClient.getArtistItems(item.Id)
              completeSync(true, `${item.Name} synced`)
            } catch (error) {
              completeSync(false, `Failed to sync ${item.Name}`)
            }
          }
          break
        }
        case 'playlist': {
          if (action === 'play') {
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
            // Disable shuffle if it's currently enabled
            const { shuffle } = usePlayerStore.getState()
            if (shuffle) {
              toggleShuffle()
            }
            playAlbum(tracks)
          } else if (action === 'shuffle') {
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
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
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
            playNext(tracks)
          } else if (action === 'addToQueue') {
            const tracks = await jellyfinClient.getAlbumTracks(item.Id)
            addToQueue(tracks)
          }
          break
        }
      }
      onClose()
    } catch (error) {
      console.error('Context menu action failed:', error)
    } finally {
      setLoading(false)
      setLoadingAction(null)
    }
  }

  const getActions = () => {
    switch (itemType) {
      case 'album': {
        const artistName = item.ArtistItems?.[0]?.Name || item.AlbumArtists?.[0]?.Name || 'Artist'
        const genreName = item.Genres?.[0] || 'Genre'
        return [
          { id: 'play', label: 'Play', icon: Play },
          { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
          { id: 'playNext', label: 'Play Next', icon: ListStart },
          { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
          { id: 'goToArtist', label: `Go to ${artistName}`, icon: User },
          { id: 'goToGenre', label: `Go to ${genreName}`, icon: Guitar },
          { id: 'sync', label: 'Sync', icon: RefreshCw },
        ]
      }
      case 'song': {
        const artistName = item.ArtistItems?.[0]?.Name || item.AlbumArtist || 'Artist'
        const albumName = item.Album || 'Album'
        const genreName = item.Genres?.[0] || 'Genre'
        return [
          { id: 'play', label: 'Play', icon: Play },
          { id: 'playNext', label: 'Play Next', icon: ListStart },
          { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
          { id: 'goToArtist', label: `Go to ${artistName}`, icon: User },
          { id: 'goToAlbum', label: `Go to ${albumName}`, icon: Disc },
          { id: 'goToGenre', label: `Go to ${genreName}`, icon: Guitar },
          { id: 'sync', label: 'Sync', icon: RefreshCw },
        ]
      }
      case 'artist':
        return [
          { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
          { id: 'playNext', label: 'Play Next', icon: ListStart },
          { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
          { id: 'sync', label: 'Sync', icon: RefreshCw },
        ]
      case 'playlist':
        return [
          { id: 'play', label: 'Play', icon: Play },
          { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
          { id: 'playNext', label: 'Play Next', icon: ListStart },
          { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
        ]
      default:
        return []
    }
  }

  const actions = getActions()
  const itemName = item.Name || 'Unknown'

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
      </>
    )
  }

  // Mobile mode - use existing BottomSheet
  return (
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
  )
}


