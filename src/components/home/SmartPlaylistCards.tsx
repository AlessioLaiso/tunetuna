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
  getAvailableBpmBuckets,
  getBpmBucketSongs,
} from '../../utils/smartPlaylists'
import { filterExcludedGenres } from '../../utils/genreFilter'
import { chunkArray, seededShuffle } from '../../utils/array'

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
// Helpers
// ============================================================================

/**
 * Pad cards with artist fillers to complete the current row or last page.
 * - If cards don't fill a single row, pad to complete the row.
 * - Otherwise, pad to complete the last page (visibleCols × rows).
 */
function fillCards(cards: CardItem[], artistFillers: CardItem[], visibleCols: number, rows: number): CardItem[] {
  if (artistFillers.length === 0 || cards.length === 0) return cards

  const pageSize = visibleCols * rows
  let target: number
  if (cards.length <= visibleCols) {
    const remainder = cards.length % visibleCols
    if (remainder === 0) return cards
    target = cards.length + (visibleCols - remainder)
  } else {
    const remainder = cards.length % pageSize
    if (remainder === 0) return cards
    target = cards.length + (pageSize - remainder)
  }

  const needed = target - cards.length
  const usedIds = new Set(cards.map(c => c.id))
  const available = artistFillers.filter(f => !usedIds.has(f.id))
  if (available.length === 0) return cards

  return [...cards, ...available.slice(0, needed)]
}

// ============================================================================
// Component
// ============================================================================

export default function SmartPlaylistCards() {
  const allSongs = useMusicStore(s => s.songs)
  const cachedMixCardIds = useMusicStore(s => s.cachedMixCardIds)
  const setCachedMixCardIds = useMusicStore(s => s.setCachedMixCardIds)
  const { statsTrackingEnabled, showMoodCards, excludedGenres } = useSettingsStore()
  const songs = useMemo(() => filterExcludedGenres(allSongs), [allSongs, excludedGenres])
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

  const groupingCategories = useMemo(() => getGroupingCategories(songs), [songs])

  // Build available cards
  const cards: CardItem[] = useMemo(() => {
    if (songs.length === 0) return []

    const items: CardItem[] = []
    const usedAlbumIds = new Set<string>()

    // 1. Moods (links to mood picker page)
    const moodCategory = groupingCategories.find(c => c.key === 'mood')
    if (moodCategory && moodCategory.values.length > 0) {
      const moodSubItems = moodCategory.values.map(value => ({
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

    // 3. BPM Mixes (available if BPM tags exist)
    const bpmBuckets = getAvailableBpmBuckets(songs)
    if (bpmBuckets.length > 0) {
      const bpmSubItems = bpmBuckets.map(bucket => ({
        key: `bpm-${bucket}`,
        songs: getBpmBucketSongs(bucket, songs),
      }))
      const bpmAlbumId = pickAlbumFromSubItems('bpm', bpmSubItems)
      if (bpmAlbumId) usedAlbumIds.add(bpmAlbumId)
      items.push({
        id: 'bpm',
        name: 'BPM Mixes',
        description: 'Browse by tempo',
        route: '/smart/picker/bpm',
        albumId: bpmAlbumId,
      })
    }

    // 4. Language Mixes (available if language tags exist)
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

    // 5. Smart playlists (conditional on stats + min songs)
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

    // 6. Year Throwback (only if stats enabled and years available)
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
  }, [songs, events, eventsLoaded, statsTrackingEnabled, groupingCategories])

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

    const seed = getDailySeed('artist-fillers')
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
      pickedIds = seededShuffle(top10, seed)
    } else {
      // Random selection seeded by date for consistency within a day
      pickedIds = seededShuffle(Array.from(artistMap.keys()), seed).slice(0, 10)
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
          {chunkArray(fillCards(displayCards, artistFillers, 2, 2), 2 * 2).map((page, i) => (
            <div key={i} className="flex-shrink-0 w-full grid grid-cols-2 grid-rows-2 gap-2" style={{ scrollSnapAlign: 'start' }}>
              {page.map((card) => <MixCardItem key={card.id} card={card} />)}
            </div>
          ))}
        </HorizontalScrollContainer>
      </div>

      {/* Medium screens (620px–1500px): 3-col, 2-row with arrow navigation */}
      <div className="hidden min-[620px]:block min-[1500px]:hidden">
        <HorizontalScrollContainer gap={8}>
          {chunkArray(fillCards(displayCards, artistFillers, 3, 2), 3 * 2).map((page, i) => (
            <div key={i} className="flex-shrink-0 w-full grid grid-cols-3 grid-rows-2 gap-2" style={{ scrollSnapAlign: 'start' }}>
              {page.map((card) => <MixCardItem key={card.id} card={card} />)}
            </div>
          ))}
        </HorizontalScrollContainer>
      </div>

      {/* Large screens (>=1500px): 4-col, 2-row with arrow navigation */}
      <div className="hidden min-[1500px]:block">
        <HorizontalScrollContainer gap={8}>
          {chunkArray(fillCards(displayCards, artistFillers, 4, 2), 4 * 2).map((page, i) => (
            <div key={i} className="flex-shrink-0 w-full grid grid-cols-4 grid-rows-2 gap-2" style={{ scrollSnapAlign: 'start' }}>
              {page.map((card) => <MixCardItem key={card.id} card={card} />)}
            </div>
          ))}
        </HorizontalScrollContainer>
      </div>
    </div>
  )
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
