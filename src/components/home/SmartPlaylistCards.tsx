import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMusicStore, getGroupingCategories } from '../../stores/musicStore'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import HorizontalScrollContainer from '../shared/HorizontalScrollContainer'
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
  /** When set, this card is an artist filler — use artist image instead of album art */
  artistFiller?: { artistId: string }
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
  const cachedMixCardIds = useMusicStore(s => s.cachedMixCardIds)
  const setCachedMixCardIds = useMusicStore(s => s.setCachedMixCardIds)
  const { statsTrackingEnabled, showMoodCards } = useSettingsStore()
  const fetchEvents = useStatsStore(s => s.fetchEvents)
  const oldestEventTs = useStatsStore(s => s.oldestEventTs)
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

  // Persist card layout when fully loaded so next session can show it instantly
  const fullyLoaded = eventsLoaded && songs.length > 0
  useEffect(() => {
    if (!fullyLoaded || cards.length === 0) return
    const newCached = cards.map(c => ({ id: c.id, name: c.name, route: c.route }))
    const prev = cachedMixCardIds
    if (prev.length === newCached.length && prev.every((p, i) => p.id === newCached[i].id)) return
    setCachedMixCardIds(newCached)
  }, [fullyLoaded, cards, cachedMixCardIds, setCachedMixCardIds])

  // While events are loading, merge real cards with cached placeholders to keep layout stable.
  // Real cards (moods/decades/languages) get their album art; cached-only cards (smart playlists,
  // year throwback) appear as name-only placeholders until events resolve.
  const displayCards: CardItem[] = useMemo(() => {
    if (fullyLoaded) return cards
    if (cachedMixCardIds.length > 0 && songs.length > 0) {
      const realCardsById = new Map(cards.map(c => [c.id, c]))
      return cachedMixCardIds.map(cached => {
        const real = realCardsById.get(cached.id)
        if (real) return real
        return { ...cached, description: '', albumId: null }
      })
    }
    return cards
  }, [fullyLoaded, cards, songs.length, cachedMixCardIds])

  // Build artist filler pool: top-10 most listened (if stats) or random artists
  const artistFillers: CardItem[] = useMemo(() => {
    if (songs.length === 0) return []

    // Collect unique artists from all songs
    const artistMap = new Map<string, string>() // id -> name
    for (const song of songs) {
      for (const a of song.ArtistItems || []) {
        if (a.Id && a.Name && !artistMap.has(a.Id)) {
          artistMap.set(a.Id, a.Name)
        }
      }
    }
    if (artistMap.size === 0) return []

    let pickedIds: string[]

    if (statsTrackingEnabled && events.length > 0) {
      // Pick randomly from top 10 most listened artists, shuffled daily
      const playCounts = new Map<string, number>()
      for (const event of events) {
        for (const artistId of event.artistIds) {
          playCounts.set(artistId, (playCounts.get(artistId) || 0) + 1)
        }
      }
      const top10 = Array.from(playCounts.entries())
        .filter(([id]) => artistMap.has(id))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id)
      const seed = getDailySeed('artist-fillers')
      for (let i = top10.length - 1; i > 0; i--) {
        const j = Math.abs((seed * (i + 1)) % (i + 1))
        ;[top10[i], top10[j]] = [top10[j], top10[i]]
      }
      pickedIds = top10
    } else {
      // Random selection seeded by date for consistency within a day
      const allIds = Array.from(artistMap.keys())
      const seed = getDailySeed('artist-fillers')
      const shuffled = [...allIds]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.abs((seed * (i + 1)) % (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      pickedIds = shuffled.slice(0, 10)
    }

    return pickedIds.map(id => ({
      id: `artist-filler-${id}`,
      name: artistMap.get(id)!,
      description: '',
      route: `/artist/${id}`,
      albumId: null,
      artistFiller: { artistId: id },
    }))
  }, [songs, events, statsTrackingEnabled])

  // Pad cards with artist fillers:
  // - If cards don't fill a single row, pad to complete the row
  // - Otherwise, pad to complete the last page (visibleCols × rows)
  const filledCards = (cards: CardItem[], visibleCols: number, rows: number): CardItem[] => {
    if (artistFillers.length === 0 || cards.length === 0) return cards

    const pageSize = visibleCols * rows
    let target: number
    if (cards.length <= visibleCols) {
      // Less than or equal to one row — just fill the row
      const remainder = cards.length % visibleCols
      if (remainder === 0) return cards
      target = cards.length + (visibleCols - remainder)
    } else {
      // More than one row — fill to complete the last page
      const remainder = cards.length % pageSize
      if (remainder === 0) return cards
      target = cards.length + (pageSize - remainder)
    }

    const needed = target - cards.length
    const usedIds = new Set(cards.map(c => c.id))
    const available = artistFillers.filter(f => !usedIds.has(f.id))
    if (available.length === 0) return cards

    const fillers = available.slice(0, needed)
    return [...cards, ...fillers]
  }

  // The showMoodCards setting controls the entire mix cards section
  if (!showMoodCards) return null
  if (displayCards.length === 0) {
    if (cachedMixCardIds.length > 0 && songs.length === 0) return <SmartPlaylistCardsSkeleton count={cachedMixCardIds.length} />
    return null
  }

  return (
    <div className="px-4 mb-12">
      {/* Narrow screens (<620px): 2-col, 2-row with arrow navigation */}
      <div className="min-[620px]:hidden">
        <HorizontalScrollContainer gap={8}>
          <div className="grid grid-rows-2 grid-flow-col gap-2" style={{ gridAutoColumns: 'calc((100% - 8px) / 2)' }}>
            {reorderForRowFlow(filledCards(displayCards, 2, 2), 2, 2).map((card) => (
              <MixCardItem key={card.id} card={card} />
            ))}
          </div>
        </HorizontalScrollContainer>
      </div>

      {/* Medium screens (620px–1500px): 3-col, 2-row with arrow navigation */}
      <div className="hidden min-[620px]:block min-[1500px]:hidden">
        <HorizontalScrollContainer gap={8}>
          <div className="grid grid-rows-2 grid-flow-col gap-2" style={{ gridAutoColumns: 'calc((100% - 16px) / 3)' }}>
            {reorderForRowFlow(filledCards(displayCards, 3, 2), 2, 3).map((card) => (
              <MixCardItem key={card.id} card={card} />
            ))}
          </div>
        </HorizontalScrollContainer>
      </div>

      {/* Large screens (>=1500px): 4-col, 2-row with arrow navigation */}
      <div className="hidden min-[1500px]:block">
        <HorizontalScrollContainer gap={8}>
          <div className="grid grid-rows-2 grid-flow-col gap-2" style={{ gridAutoColumns: 'calc((100% - 24px) / 4)' }}>
            {reorderForRowFlow(filledCards(displayCards, 4, 2), 2, 4).map((card) => (
              <MixCardItem key={card.id} card={card} />
            ))}
          </div>
        </HorizontalScrollContainer>
      </div>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * CSS grid-flow-col fills columns first; this reorders so visual reading order
 * is left-to-right, top-to-bottom within each visible page of `visibleCols` columns.
 *
 * Without page-aware reordering, items 1-8 with 2 visible cols and 2 rows would
 * show [1,5,2,6] on the first page instead of [1,2,3,4].
 */
function reorderForRowFlow<T>(items: T[], rows: number, visibleCols: number): T[] {
  const pageSize = visibleCols * rows
  const result: T[] = []
  for (let pageStart = 0; pageStart < items.length; pageStart += pageSize) {
    const pageItems = items.slice(pageStart, pageStart + pageSize)
    const cols = Math.ceil(pageItems.length / rows)
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const srcIndex = row * cols + col
        if (srcIndex < pageItems.length) {
          result.push(pageItems[srcIndex])
        }
      }
    }
  }
  return result
}

// ============================================================================
// Skeleton
// ============================================================================

function SkeletonCardItem() {
  return (
    <div className="bg-zinc-800/50 rounded border border-zinc-700/50 flex items-center w-full h-11 overflow-hidden">
      <div className="h-full aspect-square bg-zinc-700/50 flex-shrink-0" />
      <div className="h-3.5 bg-zinc-700/50 rounded w-2/3 ml-3" />
    </div>
  )
}

function SmartPlaylistCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="px-4 mb-12 animate-pulse">
      {/* Narrow (<620px): 2-col */}
      <div className="min-[620px]:hidden">
        <div className="grid grid-cols-2 gap-2">
          {[...Array(Math.min(count, 4))].map((_, i) => (
            <SkeletonCardItem key={i} />
          ))}
        </div>
      </div>
      {/* 620px–1680px: 3-col */}
      <div className="hidden min-[620px]:block min-[1500px]:hidden">
        <div className="grid grid-cols-3 gap-2">
          {[...Array(count)].map((_, i) => (
            <SkeletonCardItem key={i} />
          ))}
        </div>
      </div>
      {/* >=1680px: 4-col */}
      <div className="hidden min-[1500px]:block">
        <div className="grid grid-cols-4 gap-2">
          {[...Array(count)].map((_, i) => (
            <SkeletonCardItem key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Card Item
// ============================================================================

function MixCardItem({ card }: { card: CardItem }) {
  const navigate = useNavigate()

  const imageSrc = card.artistFiller
    ? jellyfinClient.getArtistImageUrl(card.artistFiller.artistId, 56)
    : card.albumId
      ? jellyfinClient.getAlbumArtUrl(card.albumId, 56)
      : null

  return (
    <button
      onClick={() => navigate(card.route)}
      className="bg-zinc-800/50 rounded border border-zinc-700/50 hover:bg-zinc-800 transition-colors group text-left flex items-center w-full h-11 overflow-hidden"
    >
      <div className="h-full aspect-square flex-shrink-0 bg-zinc-700/50">
        {imageSrc && (
          <Image
            src={imageSrc}
            alt=""
            className="w-full h-full object-cover"
            showOutline={false}
            rounded=""
          />
        )}
      </div>
      <div className="text-sm font-medium text-white group-hover:text-[var(--accent-color)] transition-colors truncate py-2 pl-3 pr-3">
        {card.name}
      </div>
    </button>
  )
}
