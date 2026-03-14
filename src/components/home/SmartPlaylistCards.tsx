import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMusicStore, getGroupingCategories } from '../../stores/musicStore'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import type { LightweightSong } from '../../api/types'
import {
  getAvailableSmartPlaylists,
  getAvailableThrowbackYears,
  getAvailableDecades,
  getDecadeSongs,
  getAvailableLanguages,
  getLanguageSongs,
} from '../../utils/smartPlaylists'

// ============================================================================
// Card item types
// ============================================================================

interface CardItem {
  id: string
  name: string
  description: string
  route: string
  albumId: string | null
}

// ============================================================================
// Album art picking (reuse mood pattern — daily seed rotation)
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

function pickAlbumForCard(
  cardId: string,
  songs: LightweightSong[],
  usedAlbumIds: Set<string>
): string | null {
  const songsWithAlbum = songs.filter(s => s.AlbumId)
  if (songsWithAlbum.length === 0) return null

  let candidates = songsWithAlbum.filter(s => !usedAlbumIds.has(s.AlbumId!))
  if (candidates.length === 0) candidates = songsWithAlbum

  const seed = getDailySeed(cardId)
  const index = Math.abs(seed) % candidates.length
  return candidates[index].AlbumId!
}

/**
 * Compute per-sub-item album IDs (mirroring picker page logic),
 * then pick one of those for the home card.
 */
function pickAlbumFromSubItems(
  cardId: string,
  subItems: { key: string; songs: LightweightSong[] }[],
): string | null {
  const subItemUsed = new Set<string>()
  const subItemAlbumIds: string[] = []
  for (const item of subItems) {
    const albumId = pickAlbumForCard(item.key, item.songs, subItemUsed)
    if (albumId) {
      subItemUsed.add(albumId)
      subItemAlbumIds.push(albumId)
    }
  }
  if (subItemAlbumIds.length === 0) return null
  const seed = getDailySeed(cardId)
  return subItemAlbumIds[Math.abs(seed) % subItemAlbumIds.length]
}

// ============================================================================
// Component
// ============================================================================

export default function SmartPlaylistCards() {
  const songs = useMusicStore(s => s.songs)
  const { statsTrackingEnabled, showMoodCards } = useSettingsStore()
  const fetchEvents = useStatsStore(s => s.fetchEvents)
  const oldestEventTs = useStatsStore(s => s.oldestEventTs)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const [events, setEvents] = useState<PlayEvent[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)

  // Fetch all events once for smart playlist calculations
  useEffect(() => {
    if (!statsTrackingEnabled) {
      setEventsLoaded(true)
      return
    }
    const load = async () => {
      const from = oldestEventTs || 0
      const to = Date.now()
      const result = await fetchEvents(from, to)
      setEvents(result)
      setEventsLoaded(true)
    }
    load()
  }, [statsTrackingEnabled, fetchEvents, oldestEventTs])

  // Check for mood category
  const hasMoods = useMemo(() => {
    const categories = getGroupingCategories(songs)
    return categories.some(c => c.key === 'mood' && c.values.length > 0)
  }, [songs])

  // Build available cards
  const cards: CardItem[] = useMemo(() => {
    if (songs.length === 0) return []

    const items: CardItem[] = []
    const usedAlbumIds = new Set<string>()

    // 1. Moods (links to mood picker page)
    if (hasMoods) {
      const categories = getGroupingCategories(songs)
      const moodCategory = categories.find(c => c.key === 'mood')
      const moodSubItems = (moodCategory?.values || []).map(value => ({
        key: `mood-${value}`,
        songs: songs.filter(s => s.Grouping?.some(g => g.toLowerCase() === `mood_${value.toLowerCase()}`)),
      }))
      const moodAlbumId = pickAlbumFromSubItems('moods', moodSubItems)
      if (moodAlbumId) usedAlbumIds.add(moodAlbumId)
      items.push({
        id: 'moods',
        name: 'Mood Mixes',
        description: 'Browse by mood',
        route: '/smart/picker/moods',
        albumId: moodAlbumId,
      })
    }

    // 2. Decade Mixes (always available if decades exist)
    const decades = getAvailableDecades(songs)
    if (decades.length > 0) {
      const decadeSubItems = decades.map(decade => ({
        key: `decade-${decade}`,
        songs: getDecadeSongs(decade, songs),
      }))
      const decadeAlbumId = pickAlbumFromSubItems('decades', decadeSubItems)
      if (decadeAlbumId) usedAlbumIds.add(decadeAlbumId)
      items.push({
        id: 'decades',
        name: 'Decade Mixes',
        description: 'Browse by decade',
        route: '/smart/picker/decades',
        albumId: decadeAlbumId,
      })
    }

    // 3. Language Mixes (available if language tags exist)
    const languages = getAvailableLanguages(songs)
    if (languages.length > 0) {
      const langSubItems = languages.map(lang => ({
        key: `language-${lang}`,
        songs: getLanguageSongs(lang, songs),
      }))
      const langAlbumId = pickAlbumFromSubItems('languages', langSubItems)
      if (langAlbumId) usedAlbumIds.add(langAlbumId)
      items.push({
        id: 'languages',
        name: 'Language Mixes',
        description: 'Browse by language',
        route: '/smart/picker/languages',
        albumId: langAlbumId,
      })
    }

    // 4. Smart playlists (conditional on stats + min songs)
    if (eventsLoaded) {
      const available = getAvailableSmartPlaylists(songs, events, statsTrackingEnabled)
      for (const sp of available) {
        const spSongs = sp.getSongs(songs, events)
        const albumId = pickAlbumForCard(sp.id, spSongs, usedAlbumIds)
        if (albumId) usedAlbumIds.add(albumId)
        items.push({
          id: sp.id,
          name: sp.name,
          description: sp.description,
          route: `/smart/${sp.id}`,
          albumId,
        })
      }
    }

    // 4. Year Throwback (only if stats enabled and years available)
    if (eventsLoaded && statsTrackingEnabled) {
      const years = getAvailableThrowbackYears(events)
      if (years.length > 0) {
        const yearAlbumId = pickAlbumForCard('year-throwback', songs, usedAlbumIds)
        if (yearAlbumId) usedAlbumIds.add(yearAlbumId)
        items.push({
          id: 'year-throwback',
          name: 'Year Throwback',
          description: 'Your top songs by year',
          route: '/smart/picker/year-throwback',
          albumId: yearAlbumId,
        })
      }
    }

    return items
  }, [songs, events, eventsLoaded, statsTrackingEnabled, hasMoods])

  // The showMoodCards setting controls the entire mix cards section
  if (!showMoodCards) return null
  if (cards.length === 0) return null

  // Group cards into pages of 6 (2 rows × 3 columns) for mobile
  const cardsPerPage = 6
  const pages: CardItem[][] = []
  for (let i = 0; i < cards.length; i += cardsPerPage) {
    pages.push(cards.slice(i, i + cardsPerPage))
  }

  return (
    <div className="px-4 mb-12">
      {/* Mobile / small screens: horizontal paged carousel */}
      <div className="md:hidden">
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="flex gap-2">
            {pages.map((pageCards, pageIndex) => {
              const rowsNeeded = Math.ceil(pageCards.length / 3)
              return (
                <div
                  key={pageIndex}
                  className="snap-start flex-shrink-0"
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  <div
                    className="grid grid-cols-3 gap-2"
                    style={{ gridTemplateRows: `repeat(${rowsNeeded}, minmax(0, 1fr))` }}
                  >
                    {pageCards.map((card) => (
                      <SmartCardItem key={card.id} card={card} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Medium screens (768-1680px): 4 columns, wrapping grid */}
      <div className="hidden md:block min-[1680px]:hidden">
        <div className="grid grid-cols-4 gap-2">
          {cards.map((card) => (
            <SmartCardItem key={card.id} card={card} />
          ))}
        </div>
      </div>

      {/* Large screens (>=1680px): 5 columns, wrapping grid */}
      <div className="hidden min-[1680px]:block">
        <div className="grid grid-cols-5 gap-2">
          {cards.map((card) => (
            <SmartCardItem key={card.id} card={card} />
          ))}
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// Card Item
// ============================================================================

function SmartCardItem({ card }: { card: CardItem }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(card.route)}
      className="bg-zinc-800/50 rounded border border-zinc-700/50 hover:bg-zinc-800 transition-colors group text-left flex items-center w-full h-11 overflow-hidden"
    >
      {card.albumId && (
        <div className="h-full flex-shrink-0 hidden md:block">
          <Image
            src={jellyfinClient.getAlbumArtUrl(card.albumId, 56)}
            alt=""
            className="w-full h-full object-cover"
            showOutline={false}
            rounded=""
          />
        </div>
      )}
      <div className="text-sm font-medium text-white group-hover:text-[var(--accent-color)] transition-colors truncate py-2 pl-3 pr-3">
        {card.name}
      </div>
    </button>
  )
}
