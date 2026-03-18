import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useVinylAnimation } from '../../hooks/useVinylAnimation'
import Spinner from '../shared/Spinner'
import VinylArtwork from '../shared/VinylArtwork'
import { ArrowLeft, Play, Pause, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { logger } from '../../utils/logger'
import { formatDuration } from '../../utils/formatting'

interface AlbumTrackItemProps {
  track: BaseItemDto
  trackNumber: number | null
  tracks: BaseItemDto[]
  albumArtist: string | null
  onClick: (track: BaseItemDto, tracks: BaseItemDto[]) => void
  onContextMenu: (track: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
  trackNumberWidth: string
}

function AlbumTrackItem({ track, trackNumber, tracks, albumArtist, onClick, onContextMenu, contextMenuItemId, trackNumberWidth }: AlbumTrackItemProps) {
  const isThisItemMenuOpen = contextMenuItemId === track.Id
  const currentTrack = useCurrentTrack()
  const navigate = useNavigate()
  const artistClickedRef = useRef(false)

  const { handleContextMenu, longPressHandlers, shouldSuppressClick } = useContextMenu({
    item: track,
    onContextMenu,
  })

  return (
    <button
      onClick={() => {
        if (shouldSuppressClick() || artistClickedRef.current) {
          artistClickedRef.current = false
          return
        }
        onClick(track, tracks)
      }}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
      className={`w-full flex items-baseline hover:bg-white/10 transition-colors group py-3 pl-4 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <span className={`text-sm text-left flex-shrink-0 mr-4 ${currentTrack?.Id === track.Id
        ? 'text-[var(--accent-color)]'
        : 'text-gray-500'
        }`} style={{ width: trackNumberWidth }}>{trackNumber && trackNumber > 0 ? trackNumber : '-'}</span>
      <div className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate transition-colors ${currentTrack?.Id === track.Id
          ? 'text-[var(--accent-color)]'
          : 'text-white group-hover:text-[var(--accent-color)]'
          }`}>
          {track.Name}
        </div>
        {track.ArtistItems?.[0] && track.ArtistItems[0].Name !== albumArtist && (
          <div className="text-xs text-gray-400 truncate">
            <span
              className="clickable-text"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                artistClickedRef.current = true
                if (track.ArtistItems![0].Id) {
                  navigate(`/artist/${track.ArtistItems![0].Id}`)
                }
                setTimeout(() => { artistClickedRef.current = false }, 300)
              }}
            >
              {track.ArtistItems[0].Name}
            </span>
          </div>
        )}
      </div>
      {track.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right mr-4">
          {formatDuration(track.RunTimeTicks)}
        </div>
      )}
    </button>
  )
}

export default function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playAlbum, playTrack, isPlaying, play, pause } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const [album, setAlbum] = useState<BaseItemDto | null>(null)
  const [tracks, setTracks] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [hasImage, setHasImage] = useState(true)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [albumContextMenuOpen, setAlbumContextMenuOpen] = useState(false)
  const [albumContextMenuMode, setAlbumContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [albumContextMenuPosition, setAlbumContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [artistLogoUrl, setArtistLogoUrl] = useState<string | null>(null)
  const [hasArtistLogo, setHasArtistLogo] = useState(false)
  const [discImageUrl, setDiscImageUrl] = useState<string | null>(null)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  const isCurrentAlbumPlaying = currentTrack?.AlbumId === album?.Id && isPlaying

  const { showVinyl, hideAlbumArt, rotationAngle, shouldSplitRef } = useVinylAnimation({
    isPlaying: isCurrentAlbumPlaying,
    hasImage,
  })

  useEffect(() => {
    if (!id) return

    // Track if component is still mounted to prevent state updates after unmount
    let isMounted = true

    const loadAlbumData = async () => {
      setLoading(true)
      try {
        const tracksList = await jellyfinClient.getAlbumTracks(id)

        if (!isMounted) return
        setTracks(tracksList)

        // Get album info with Overview field
        const albumDetail = await jellyfinClient.getAlbumById(id)
        let currentAlbum = albumDetail
        if (!currentAlbum) {
          // Fallback to getAlbums if getAlbumById doesn't work
          const albumsResult = await jellyfinClient.getAlbums({ limit: 1 })
          const foundAlbum = albumsResult.Items.find(a => a.Id === id)
          if (foundAlbum) {
            currentAlbum = foundAlbum
          }
        }

        if (!isMounted) return

        if (!currentAlbum) {
          // Try to get from tracks
          if (tracksList.length > 0 && tracksList[0].AlbumId === id) {
            currentAlbum = {
              Id: id,
              Name: tracksList[0].Album || 'Unknown Album',
              AlbumArtist: tracksList[0].AlbumArtist,
            } as BaseItemDto
          }
        }

        if (currentAlbum) {
          setAlbum(currentAlbum)
          setHasImage(true) // Reset image state when album changes

          // Check if album has a Disc image from Jellyfin
          if (currentAlbum.ImageTags?.Disc) {
            setDiscImageUrl(jellyfinClient.getImageUrl(currentAlbum.Id, 'Disc', 600))
          } else {
            setDiscImageUrl(null)
          }
        }

        // Load artist logo if available (skip for "Various Artists" — show album art instead)
        const isVariousArtists = (currentAlbum?.AlbumArtist || '').toLowerCase() === 'various artists'
        const artistId = getArtistIdFromTracks(tracksList, currentAlbum)
        if (artistId && !isVariousArtists) {
          try {
            const artist = await jellyfinClient.getArtistById(artistId)
            if (!isMounted) return
            if (artist?.ImageTags?.Logo) {
              setArtistLogoUrl(jellyfinClient.getImageUrl(artistId, 'Logo'))
              setHasArtistLogo(true)
            } else {
              setHasArtistLogo(false)
              setArtistLogoUrl(null)
            }
          } catch (error) {
            if (!isMounted) return
            logger.warn('Failed to load artist logo:', error)
            setHasArtistLogo(false)
            setArtistLogoUrl(null)
          }
        } else {
          setHasArtistLogo(false)
          setArtistLogoUrl(null)
        }
      } catch (error) {
        if (!isMounted) return
        logger.error('Failed to load album data:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadAlbumData()

    return () => {
      isMounted = false
    }
  }, [id])

  // Handle vinyl visibility with animation delay
  const getArtistIdFromTracks = (tracksList: BaseItemDto[], currentAlbum: BaseItemDto | null): string | null => {
    // First priority: Album's AlbumArtists (most accurate for the album)
    if (currentAlbum?.AlbumArtists && currentAlbum.AlbumArtists.length > 0) {
      return currentAlbum.AlbumArtists[0].Id
    }

    // Second priority: Check if all tracks have the same artist
    if (tracksList.length > 0) {
      const firstArtistId = tracksList[0].ArtistItems?.[0]?.Id

      if (firstArtistId) {
        // Check if all tracks have the same artist
        const allSameArtist = tracksList.every(track =>
          track.ArtistItems?.[0]?.Id === firstArtistId
        )

        if (allSameArtist) {
          return firstArtistId
        }
      }
    }

    // If we have multiple artists, return null to fall back to album art
    return null
  }

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playAlbum(tracks)
    }
  }

  const getAlbumYear = (): string | null => {
    if (tracks.length > 0) {
      const firstTrack = tracks[0]
      if (firstTrack.ProductionYear && firstTrack.ProductionYear > 0) {
        return firstTrack.ProductionYear.toString()
      }
      if (firstTrack.PremiereDate) {
        const year = new Date(firstTrack.PremiereDate).getFullYear()
        if (year > 0) {
          return year.toString()
        }
      }
    }
    return null
  }

  const getArtistId = (): string | null => {
    // Prefer AlbumArtists (the actual album artist) over ArtistItems (song artist)
    if (album?.AlbumArtists && album.AlbumArtists.length > 0) {
      return album.AlbumArtists[0].Id
    }
    if (album?.ArtistItems && album.ArtistItems.length > 0) {
      return album.ArtistItems[0].Id
    }
    if (tracks.length > 0 && tracks[0].ArtistItems && tracks[0].ArtistItems.length > 0) {
      return tracks[0].ArtistItems[0].Id
    }
    return null
  }

  const getArtistName = (): string | null => {
    return album.AlbumArtist || album.ArtistItems?.[0]?.Name || null
  }

  const handleArtistClick = () => {
    const artistId = getArtistId()
    if (artistId) {
      navigate(`/artist/${artistId}`)
    }
  }


  if (loading) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen">
          <Spinner />
        </div>
      </div>
    )
  }

  if (!album || tracks.length === 0) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen text-gray-400">
          <p>Album not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20" style={{ overflowX: 'hidden', maxWidth: '100vw', width: '100%' }}>
      {/* Make status bar transparent by covering Layout's black overlay */}
      <div
        className="fixed top-0 left-0 right-0 z-[55] pointer-events-none"
        style={{
          height: `env(safe-area-inset-top)`,
          top: `var(--header-offset, 0px)`,
          background: 'transparent'
        }}
      />
      {/* Gradient overlay from status bar to header end - below header in z-index */}
      <div
        className="fixed top-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)`,
          top: `var(--header-offset, 0px)`,
          background: `linear-gradient(to bottom,
            #000000 0%,
            #000000 calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 0.5rem),
            rgba(0, 0, 0, 0.95) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 1rem),
            rgba(0, 0, 0, 0.85) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 1.5rem),
            rgba(0, 0, 0, 0.7) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 2rem),
            rgba(0, 0, 0, 0.5) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 2.5rem),
            rgba(0, 0, 0, 0.3) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3rem),
            rgba(0, 0, 0, 0.15) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3.5rem),
            rgba(0, 0, 0, 0) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)
          )`
        }}
      />
      <div
        className={`fixed top-0 left-0 right-0 z-20 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto relative">
          <div className="flex items-center justify-between gap-4 py-4 pl-3 pr-4 relative z-10">
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            {album && (
              <button
                onClick={(e) => {
                  if (window.innerWidth < 768) {
                    setAlbumContextMenuMode('mobile')
                    setAlbumContextMenuPosition(null)
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setAlbumContextMenuMode('desktop')
                    setAlbumContextMenuPosition({
                      x: rect.left + rect.width / 2,
                      y: rect.bottom + 5
                    })
                  }
                  setAlbumContextMenuOpen(true)
                }}
                className="text-white hover:text-zinc-300 transition-colors"
              >
                <MoreHorizontal className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pt-11">
        <div className="mb-6 px-4 pt-4" style={{ overflow: 'visible' }}>
          {hasImage && (
            <VinylArtwork
              coverImageSrc={jellyfinClient.getAlbumArtUrl(album.Id)}
              coverImageAlt={album.Name || ''}
              discImageUrl={discImageUrl}
              artistLogoUrl={artistLogoUrl}
              hasArtistLogo={hasArtistLogo}
              showVinyl={showVinyl}
              hideAlbumArt={hideAlbumArt}
              rotationAngle={rotationAngle}
              shouldSplitRef={shouldSplitRef}
              isPlaying={isCurrentAlbumPlaying}
              onCoverError={() => setHasImage(false)}
              onDiscImageError={() => setDiscImageUrl(null)}
              onArtistLogoError={() => { setHasArtistLogo(false); setArtistLogoUrl(null) }}
            />
          )}
          <div className="w-full">
            <h2 className="text-4xl md:text-5xl font-bold mb-0.5 text-left break-words">{album.Name}</h2>
            <div className="flex items-center justify-between gap-4 mt-2">
              <div className="text-gray-400 flex items-center gap-1.5">
                {getArtistName() && (
                  <>
                    <button
                      onClick={handleArtistClick}
                      className={`hover:text-[var(--accent-color)] transition-colors ${getArtistId() ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {getArtistName()}
                    </button>
                    {getAlbumYear() && <span>•</span>}
                  </>
                )}
                {getAlbumYear() && (
                  <button
                    onClick={() => navigate(`/albums?year=${getAlbumYear()}`)}
                    className="hover:text-[var(--accent-color)] transition-colors cursor-pointer"
                  >
                    {getAlbumYear()}
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  if (isCurrentAlbumPlaying) {
                    pause()
                  } else if (currentTrack?.AlbumId === album.Id && !isPlaying) {
                    play()
                  } else {
                    handlePlayAll()
                  }
                }}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 flex-shrink-0"
              >
                {isCurrentAlbumPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Bio section - always collapsed by default with chevron, regardless of length */}
        {album.Overview && (
          <div className="mb-6 px-4">
            <div className="text-white relative">
              {!bioExpanded && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBioExpanded(true)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed line-clamp-2">
                      {album.Overview}
                    </p>
                  </button>
                  <button
                    onClick={() => setBioExpanded(true)}
                    className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}

              {bioExpanded && (
                <div>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                    {album.Overview}
                  </p>
                  <button
                    onClick={() => setBioExpanded(false)}
                    className="mt-2 flex items-center gap-1 text-sm text-gray-400 hover:text-[var(--accent-color)] transition-colors ml-auto"
                  >
                    Show less
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <div className="space-y-0">
            {(() => {
              // Group tracks by disc number
              const tracksByDisc = new Map<number, BaseItemDto[]>()
              tracks.forEach(track => {
                const discNumber = track.ParentIndexNumber ?? 1
                if (!tracksByDisc.has(discNumber)) {
                  tracksByDisc.set(discNumber, [])
                }
                tracksByDisc.get(discNumber)!.push(track)
              })

              // Check if we have multiple discs
              const hasMultipleDiscs = tracksByDisc.size > 1

              // Sort disc numbers
              const sortedDiscNumbers = Array.from(tracksByDisc.keys()).sort((a, b) => a - b)

              return sortedDiscNumbers.map(discNumber => {
                const discTracks = tracksByDisc.get(discNumber)!
                const maxLen = Math.max(...discTracks.map(t => {
                  const num = t.IndexNumber && t.IndexNumber > 0 ? String(t.IndexNumber) : '-'
                  return num.length
                }))
                const trackNumberWidth = `${maxLen}ch`
                return (
                  <div key={discNumber}>
                    {hasMultipleDiscs && (
                      <div className={`px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider ${discNumber > 1 ? 'pt-4' : ''}`}>
                        Disc {discNumber}
                      </div>
                    )}
                    {discTracks.map(track => (
                      <AlbumTrackItem
                        key={track.Id}
                        track={track}
                        trackNumber={track.IndexNumber ?? null}
                        tracks={tracks}
                        albumArtist={getArtistName()}
                        onClick={(track) => playTrack(track, tracks)}
                        onContextMenu={(track, mode, position) => {
                          setContextMenuItem(track)
                          setContextMenuMode(mode || 'mobile')
                          setContextMenuPosition(position || null)
                          setContextMenuOpen(true)
                        }}
                        contextMenuItemId={contextMenuItem?.Id || null}
                        trackNumberWidth={trackNumberWidth}
                      />
                    ))}
                  </div>
                )
              })
            })()}
          </div>
        </div>
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
        }}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
      <ContextMenu
        item={album}
        itemType="album"
        isOpen={albumContextMenuOpen}
        onClose={() => {
          setAlbumContextMenuOpen(false)
        }}
        mode={albumContextMenuMode}
        position={albumContextMenuPosition || undefined}
      />
    </div>
  )
}
