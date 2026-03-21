import { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMusicStore, getGroupingCategories } from '../../stores/musicStore'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { ArrowLeft } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import {
  getAvailableDecades,
  getDecadeSongs,
  getAvailableThrowbackYears,
  getYearThrowbackSongs,
  getAvailableLanguages,
  getLanguageSongs,
} from '../../utils/smartPlaylists'
import type { LightweightSong } from '../../api/types'
import { capitalizeFirst } from '../../utils/formatting'
import { filterExcludedGenres } from '../../utils/genreFilter'

// ============================================================================
// Helpers
// ============================================================================

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash
}

function getDailySeed(key: string): number {
  const dateStr = new Date().toISOString().split('T')[0]
  return hashCode(`${dateStr}-${key}`)
}

function pickAlbum(key: string, songs: LightweightSong[], usedAlbumIds: Set<string>): string | null {
  const withAlbum = songs.filter(s => s.AlbumId)
  if (withAlbum.length === 0) return null
  let candidates = withAlbum.filter(s => !usedAlbumIds.has(s.AlbumId!))
  if (candidates.length === 0) candidates = withAlbum
  const seed = getDailySeed(key)
  return candidates[Math.abs(seed) % candidates.length].AlbumId!
}

function decadeLabel(decade: number): string {
  if (decade < 2000) return `${decade - 1900}s`
  return `${decade}s`
}

// ============================================================================
// Picker Page
// ============================================================================

interface PickerItem {
  id: string
  name: string
  route: string
  albumId: string | null
}

export default function SmartPickerPage() {
  const { pickerId } = useParams<{ pickerId: string }>()
  const navigate = useNavigate()
  const allSongs = useMusicStore(s => s.songs)
  const { statsTrackingEnabled, excludedGenres } = useSettingsStore()
  const songs = useMemo(() => filterExcludedGenres(allSongs), [allSongs, excludedGenres])
  const fetchEvents = useStatsStore(s => s.fetchEvents)
  const oldestEventTs = useStatsStore(s => s.oldestEventTs)
  const isQueueSidebarOpen = usePlayerStore(s => s.isQueueSidebarOpen)

  const [events, setEvents] = useState<PlayEvent[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)

  useEffect(() => {
    if (!statsTrackingEnabled || pickerId !== 'year-throwback') {
      setEventsLoaded(true)
      return
    }
    const load = async () => {
      const result = await fetchEvents(oldestEventTs || 0, Date.now())
      setEvents(result)
      setEventsLoaded(true)
    }
    load()
  }, [statsTrackingEnabled, fetchEvents, oldestEventTs, pickerId])

  const title = useMemo(() => {
    switch (pickerId) {
      case 'decades': return 'Decade Mixes'
      case 'year-throwback': return 'Year Throwback'
      case 'moods': return 'Mood Mixes'
      case 'languages': return 'Language Mixes'
      default: return ''
    }
  }, [pickerId])

  const items: PickerItem[] = useMemo(() => {
    if (songs.length === 0) return []
    const usedAlbumIds = new Set<string>()

    if (pickerId === 'decades') {
      const decades = getAvailableDecades(songs)
      return decades.map(decade => {
        const decadeSongs = getDecadeSongs(decade, songs)
        const albumId = pickAlbum(`decade-${decade}`, decadeSongs, usedAlbumIds)
        if (albumId) usedAlbumIds.add(albumId)
        return {
          id: `decade-${decade}`,
          name: `${decadeLabel(decade)}`,
          route: `/smart/decade-${decade}`,
          albumId,
        }
      })
    }

    if (pickerId === 'year-throwback' && eventsLoaded) {
      const years = getAvailableThrowbackYears(events)
      return years.map(year => {
        const yearSongs = getYearThrowbackSongs(year, songs, events)
        const albumId = pickAlbum(`year-${year}`, yearSongs, usedAlbumIds)
        if (albumId) usedAlbumIds.add(albumId)
        return {
          id: `year-${year}`,
          name: `${year}`,
          route: `/smart/year-throwback-${year}`,
          albumId,
        }
      })
    }

    if (pickerId === 'moods') {
      const categories = getGroupingCategories(songs)
      const moodCategory = categories.find(c => c.key === 'mood')
      if (!moodCategory) return []
      return moodCategory.values.map(value => {
        const moodSongs = songs.filter(s =>
          s.Grouping?.some(g => g.toLowerCase() === `mood_${value.toLowerCase()}`)
        )
        const albumId = pickAlbum(`mood-${value}`, moodSongs, usedAlbumIds)
        if (albumId) usedAlbumIds.add(albumId)
        return {
          id: `mood-${value}`,
          name: capitalizeFirst(value),
          route: `/mood/${encodeURIComponent(value.toLowerCase())}`,
          albumId,
        }
      })
    }

    if (pickerId === 'languages') {
      const languages = getAvailableLanguages(songs)
      return languages.map(lang => {
        const langSongs = getLanguageSongs(lang, songs)
        const albumId = pickAlbum(`language-${lang}`, langSongs, usedAlbumIds)
        if (albumId) usedAlbumIds.add(albumId)
        return {
          id: `language-${lang}`,
          name: capitalizeFirst(lang),
          route: `/smart/language-${encodeURIComponent(lang)}`,
          albumId,
        }
      })
    }

    return []
  }, [pickerId, songs, events, eventsLoaded])

  if (!eventsLoaded) {
    return (
      <div className="pb-20 flex items-center justify-center h-screen">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Fixed header */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-page mx-auto">
          <div className="flex items-center gap-4 px-4" style={{ paddingTop: '1.5rem', paddingBottom: '1rem' }}>
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      <div className="pt-11">
        <div className="mb-6 px-4 pt-4">
          <h2 className="text-4xl md:text-5xl font-bold mb-0.5 text-left break-words">{title}</h2>
        </div>

        <div className="px-4">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-5">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(item.route)}
                className="text-left group"
              >
                <div className="aspect-square rounded overflow-hidden bg-zinc-900 relative flex items-center justify-center">
                  {item.albumId ? (
                    <Image
                      src={jellyfinClient.getAlbumArtUrl(item.albumId, 474)}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      showOutline={true}
                      rounded="rounded"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-900" />
                  )}
                </div>
                <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors mt-1">
                  {item.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
