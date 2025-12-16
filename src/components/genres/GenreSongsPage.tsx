import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Disc } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import SongItem from '../songs/SongItem'
import Image from '../shared/Image'
import { ArrowLeft, Shuffle, Pause } from 'lucide-react'
import Spinner from '../shared/Spinner'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto, LightweightSong } from '../../api/types'

interface GenreAlbumItemProps {
  album: BaseItemDto
  year: number | null
  onNavigate: (id: string) => void
  onContextMenu: (album: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
}

function GenreAlbumItem({ album, year, onNavigate, onContextMenu }: GenreAlbumItemProps) {
  const [imageError, setImageError] = useState(false)
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(album, 'mobile')
    },
    onClick: () => onNavigate(album.Id),
  })
  
  return (
    <button
      onClick={() => onNavigate(album.Id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(album, 'desktop', { x: e.clientX, y: e.clientY })
      }}
      {...longPressHandlers}
      className="text-left group"
    >
      <div className="aspect-square rounded overflow-hidden mb-2 bg-zinc-900 flex items-center justify-center">
        {imageError ? (
          <Disc className="w-12 h-12 text-gray-500" />
        ) : (
          <Image
            src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
            alt={album.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <div className="text-sm font-medium text-white truncate">{album.Name}</div>
      {year && (
        <div className="text-xs text-gray-400 truncate">{year}</div>
      )}
    </button>
  )
}

export default function GenreSongsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playAlbum, toggleShuffle, currentTrack, isPlaying, pause } = usePlayerStore()
  const { genres, genreSongs, setGenreSongs } = useMusicStore()
  const [genre, setGenre] = useState<BaseItemDto | null>(null)
  const [songs, setSongs] = useState<LightweightSong[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | null>(null)

  useEffect(() => {
    if (!id) return

    const loadGenreSongs = async () => {
      // Check cache first
      const cachedSongs = genreSongs[id]

      if (cachedSongs && cachedSongs.length > 0) {
        // Use cached genres from store if available, otherwise fetch
        let genresList = genres
        if (genresList.length === 0) {
          genresList = await jellyfinClient.getGenres()
        }
        
        const foundGenre = genresList.find(g => g.Id === id)
        if (foundGenre) {
          setGenre(foundGenre)
        }
        setSongs(cachedSongs)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Use cached genres from store if available, otherwise fetch
        let genresList = genres
        if (genresList.length === 0) {
          genresList = await jellyfinClient.getGenres()
        }
        
        const foundGenre = genresList.find(g => g.Id === id)
        if (!foundGenre) {
          setLoading(false)
          return
        }
        setGenre(foundGenre)
        
        const genreName = foundGenre.Name
        if (!genreName) {
          setLoading(false)
          return
        }
        
        // Load songs for this genre using the helper function
        const filtered = await jellyfinClient.getGenreSongs(id, genreName)
        
        // Cache the songs
        setGenreSongs(id, filtered)
        setSongs(filtered)
      } catch (error) {
        console.error('Failed to load genre songs:', error)
      } finally {
        setLoading(false)
      }
    }

    loadGenreSongs()
  }, [id, genres, genreSongs, setGenreSongs])

  const handleShufflePlay = () => {
    if (songs.length > 0) {
      const shuffled = [...songs].sort(() => Math.random() - 0.5)
      const { shuffle } = usePlayerStore.getState()
      if (!shuffle) {
        toggleShuffle()
      }
      playAlbum(shuffled)
    }
  }

  // Extract unique albums from songs and sort by date (newest to oldest)
  const albums = useMemo(() => {
    const albumMap = new Map<string, BaseItemDto>()
    songs.forEach(song => {
      if (song.AlbumId && song.Album) {
        if (!albumMap.has(song.AlbumId)) {
          albumMap.set(song.AlbumId, {
            Id: song.AlbumId,
            Name: song.Album,
            AlbumArtist: song.AlbumArtist,
            ArtistItems: song.ArtistItems,
            ProductionYear: song.ProductionYear,
            PremiereDate: song.PremiereDate,
          } as BaseItemDto)
        }
      }
    })
    return Array.from(albumMap.values()).sort((a, b) => {
      const yearA = a.ProductionYear || (a.PremiereDate ? new Date(a.PremiereDate).getFullYear() : 0)
      const yearB = b.ProductionYear || (b.PremiereDate ? new Date(b.PremiereDate).getFullYear() : 0)
      
      // Sort by year (newest first)
      if (yearA !== yearB) {
        return yearB - yearA
      }
      
      // If same year, sort by name
      const nameA = a.Name || ''
      const nameB = b.Name || ''
      return nameA.localeCompare(nameB)
    })
  }, [songs])

  // Group songs by artist, then album by date, then track number
  const groupedSongs = useMemo(() => {
    // Group by artist
    const artistMap = new Map<string, Map<string, BaseItemDto[]>>()
    
    songs.forEach(song => {
      const artistName = song.AlbumArtist || song.ArtistItems?.[0]?.Name || 'Unknown Artist'
      const albumId = song.AlbumId || 'no-album'
      
      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, new Map())
      }
      
      const albumMap = artistMap.get(artistName)!
      if (!albumMap.has(albumId)) {
        albumMap.set(albumId, [])
      }
      
      albumMap.get(albumId)!.push(song)
    })
    
    // Sort within each group
    const result: Array<{ artist: string; albums: Array<{ albumId: string; albumName: string; songs: BaseItemDto[] }> }> = []
    
    artistMap.forEach((albumMap, artistName) => {
      const albums: Array<{ albumId: string; albumName: string; songs: BaseItemDto[] }> = []
      
      albumMap.forEach((songs, albumId) => {
        // Sort songs by track number
        const sortedSongs = [...songs].sort((a, b) => {
          const trackA = a.IndexNumber || 0
          const trackB = b.IndexNumber || 0
          return trackA - trackB
        })
        
        const albumName = sortedSongs[0]?.Album || 'Unknown Album'
        albums.push({ albumId, albumName, songs: sortedSongs })
      })
      
      // Sort albums by date (newest first), then by name
      albums.sort((a, b) => {
        const songA = a.songs[0]
        const songB = b.songs[0]
        
        const yearA = songA?.ProductionYear || (songA?.PremiereDate ? new Date(songA.PremiereDate).getFullYear() : 0)
        const yearB = songB?.ProductionYear || (songB?.PremiereDate ? new Date(songB.PremiereDate).getFullYear() : 0)
        
        if (yearA !== yearB) {
          return yearB - yearA
        }
        
        return a.albumName.localeCompare(b.albumName)
      })
      
      result.push({ artist: artistName, albums })
    })
    
    // Sort artists alphabetically
    result.sort((a, b) => a.artist.localeCompare(b.artist))
    
    return result
  }, [songs])

  if (loading) {
    return (
      <div className="pb-20">
        <div className="fixed top-0 left-0 right-0 bg-black z-10 border-b border-zinc-800" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
          <div className="max-w-[768px] mx-auto">
            <div className="flex items-center gap-4 p-4">
              <button
                onClick={() => navigate(-1)}
                className="text-white hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold flex-1 truncate">{genre?.Name || ''}</h1>
              <div className="flex items-center">
                <Spinner />
              </div>
            </div>
          </div>
        </div>
        <div className="pt-20">
          <div className="flex items-center justify-center h-screen text-gray-400">
          </div>
        </div>
      </div>
    )
  }

  if (!genre || songs.length === 0) {
    return (
      <div className="pb-20">
        <div className="fixed top-0 left-0 right-0 bg-black z-10 border-b border-zinc-800" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
          <div className="max-w-[768px] mx-auto">
            <div className="flex items-center gap-4 p-4">
              <button
                onClick={() => navigate(-1)}
                className="text-white hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold flex-1 truncate">Genre</h1>
            </div>
          </div>
        </div>
        <div className="pt-20">
          <div className="flex items-center justify-center h-screen text-gray-400">
            <p>Genre not found or no songs available</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="fixed top-0 left-0 right-0 bg-black z-10 border-b border-zinc-800" style={{ top: `env(safe-area-inset-top)` }}>
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="text-white hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold flex-1 truncate">{genre.Name}</h1>
          <button
            onClick={() => {
              const isCurrentGenrePlaying = currentTrack && isPlaying && genre && 
                currentTrack.Genres?.some(g => g.toLowerCase() === genre.Name?.toLowerCase())
              if (isCurrentGenrePlaying) {
                pause()
              } else {
                handleShufflePlay()
              }
            }}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm border border-white/20 flex-shrink-0"
          >
            {currentTrack && isPlaying && genre && 
              currentTrack.Genres?.some(g => g.toLowerCase() === genre.Name?.toLowerCase()) ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Shuffle className="w-5 h-5" />
            )}
          </button>
          </div>
        </div>
      </div>

      <div style={{ paddingTop: `calc(env(safe-area-inset-top) + 5rem)` }}>
        {/* Albums section */}
        {albums.length > 0 && (
          <div className="mb-10 px-4 pt-4">
            <h2 className="text-xl font-bold text-white mb-4">Albums ({albums.length})</h2>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {albums.map((album) => {
                const year = album.ProductionYear || (album.PremiereDate ? new Date(album.PremiereDate).getFullYear() : null)
                return (
                  <GenreAlbumItem
                    key={album.Id}
                    album={album}
                    year={year}
                    onNavigate={(id) => navigate(`/album/${id}`)}
                    onContextMenu={(album, mode, position) => {
                      setContextMenuItem(album)
                      setContextMenuItemType('album')
                      setContextMenuMode(mode || 'mobile')
                      setContextMenuPosition(position || null)
                      setContextMenuOpen(true)
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Songs section */}
        {songs.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2 px-4">Songs ({songs.length})</h2>
            <div className="space-y-0">
              {groupedSongs.map(({ artist, albums }) => (
                <div key={artist}>
                  {albums.map(({ albumId, albumName, songs: albumSongs }) => (
                    <div key={albumId}>
                      {albumSongs.map((song) => (
                        <SongItem key={song.Id} song={song} />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType={contextMenuItemType}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
          setContextMenuItemType(null)
        }}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}

