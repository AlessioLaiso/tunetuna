import { useEffect, useMemo, useState } from 'react'
import { useStatsStore, type PlayEvent } from '../stores/statsStore'
import { useMusicStore } from '../stores/musicStore'
import { getFeaturedArtistData } from '../stores/musicStore'
import { normalizeName } from '../utils/featuredArtists'
import {
  getRollingSixMonthRange,
  formatRangeSubtitle,
  computeArtistTopSongs,
  countPlayedSongsForArtist,
  type ArtistTopSong,
} from '../utils/statsComputer'

export interface ArtistTopSongsResult {
  /** Up to 5 top songs by streams in the last 6 months */
  topSongs: ArtistTopSong[]
  /** Distinct songs by this artist played in the last 6 months (gating metric) */
  playedSongCount: number
  /** Whether the last-6-month events are still being fetched */
  loading: boolean
  /** The date range subtitle (e.g. "Jun 2025 - Jun 2026") */
  subtitle: string
}

/**
 * Loads this artist's top 5 most-streamed songs over the last 6 months
 * (rolling window ending at the current month, inclusive), plus the count of
 * distinct songs played in that window — used to decide whether the
 * "Top songs" section on the artist detail page should be shown at all.
 *
 * Artist matching is "any credited artist" + title-featured inclusive: it
 * considers every Jellyfin artist ID sharing this artist's normalized name
 * (handles duplicate artist entries via the featured-artists alias map) AND
 * songs whose title names the artist via a `(feat. X)` / `(with X)` clause
 * (the "Appears On" songs, which may not carry the artist's ID on the play
 * event).
 */
export function useArtistTopSongs(
  artistId: string | undefined,
  artistName: string | null | undefined,
): ArtistTopSongsResult {
  const { fetchEvents, pendingEvents, metadataVersion } = useStatsStore()
  const storeSongs = useMusicStore(state => state.songs)

  const [events, setEvents] = useState<PlayEvent[]>([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => getRollingSixMonthRange(), [])
  const fromTs = range.fromDate.getTime()
  const toTs = range.toDate.getTime()

  const aliasIds = useMemo(() => {
    if (!artistId) return []
    const ids = new Set<string>([artistId])
    // Merge in duplicate artist entries that share the same normalized name
    if (artistName) {
      const featuredData = getFeaturedArtistData(storeSongs)
      const normalized = normalizeName(artistName)
      const aliases = featuredData.artistIdsByName.get(normalized)
      if (aliases) {
        for (const id of aliases) ids.add(id)
      }
    }
    return [...ids]
  }, [artistId, artistName, storeSongs])

  // Song lookup keyed by ID, used to resolve row metadata (primary artist,
  // album, year) so rows render the same secondary line as the main Songs section.
  const songLookup = useMemo(() => {
    const map = new Map<string, {
      Name: string
      AlbumArtist?: string
      ArtistItems?: Array<{ Id?: string, Name?: string }>
      Album?: string
      AlbumId?: string
      ProductionYear?: number
      PremiereDate?: string
    }>()
    for (const s of storeSongs) {
      map.set(s.Id, {
        Name: s.Name,
        AlbumArtist: s.AlbumArtist,
        ArtistItems: s.ArtistItems,
        Album: s.Album,
        AlbumId: s.AlbumId,
        ProductionYear: s.ProductionYear,
        PremiereDate: s.PremiereDate,
      })
    }
    return map
  }, [storeSongs])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      try {
        const data = await fetchEvents(fromTs, toTs)
        if (mounted) setEvents(data)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    return () => {
      mounted = false
    }
    // Re-run if the 6-month window is refetched due to new pending events or
    // a metadata version bump (e.g. names/genres updated by library sync).
  }, [fromTs, toTs, fetchEvents, pendingEvents.length, metadataVersion])

  const { topSongs, playedSongCount } = useMemo(() => {
    if (loading || events.length === 0 || (aliasIds.length === 0 && !artistName)) {
      return { topSongs: [], playedSongCount: 0 }
    }
    return {
      topSongs: computeArtistTopSongs(events, aliasIds, artistName, songLookup, 5),
      playedSongCount: countPlayedSongsForArtist(events, aliasIds, artistName),
    }
  }, [events, aliasIds, artistName, songLookup, loading])

  const subtitle = useMemo(
    () => formatRangeSubtitle(range.fromMonth, range.toMonth),
    [range.fromMonth, range.toMonth],
  )

  return { topSongs, playedSongCount, loading, subtitle }
}