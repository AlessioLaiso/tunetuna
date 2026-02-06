import { useMemo, useState, useEffect } from 'react'
import { useMusicStore } from '../stores/musicStore'
import type { LightweightSong } from '../api/types'

// Hook to subscribe to hydration state - handles race condition where
// hydration may complete before subscription is set up
function useHasHydrated() {
  const [hydrated, setHydrated] = useState(() => useMusicStore.persist.hasHydrated())

  useEffect(() => {
    // Check again in case hydration completed before effect ran
    if (useMusicStore.persist.hasHydrated()) {
      setHydrated(true)
      return
    }

    const unsub = useMusicStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })

    return unsub
  }, [])

  return hydrated
}

// Normalize string for matching (lowercase, remove special characters)
function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Clean song/album name by removing common suffixes
function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(feat\..*?\)/gi, '')
    .replace(/\s*\[feat\..*?\]/gi, '')
    .replace(/\s*ft\..*$/gi, '')
    .replace(/\s*\(with.*?\)/gi, '')
    .replace(/\s*\[with.*?\]/gi, '')
    .replace(/\s*\(explicit\)/gi, '')
    .replace(/\s*\[explicit\]/gi, '')
    .replace(/\s*\(deluxe.*?\)/gi, '')
    .replace(/\s*\[deluxe.*?\]/gi, '')
    .replace(/\s*-\s*single$/gi, '')
    .replace(/\s*-\s*ep$/gi, '')
    .trim()
}

// Clean artist name by getting the main/first artist
function cleanArtistName(artist: string): string {
  return artist
    .split(/[,&]/)[0]
    .replace(/\s*feat\..*$/gi, '')
    .replace(/\s*ft\..*$/gi, '')
    .replace(/\s*with\s+.*$/gi, '')
    .trim()
}

export interface AlbumMatch {
  albumId: string
  albumName: string
}

/**
 * Hook that provides efficient O(1) artist lookup + small set search
 * for matching feed items against library songs/albums.
 * Uses both songs and genreSongs as sources for reliability.
 */
export function useLibraryLookup() {
  const songs = useMusicStore((state) => state.songs)
  const genreSongs = useMusicStore((state) => state.genreSongs)
  const hasHydrated = useHasHydrated()

  // Build artist-indexed lookup: Map<normalizedArtist, songs[]>
  // Uses songs if available, falls back to flattened genreSongs
  const artistIndex = useMemo(() => {
    if (!hasHydrated) return new Map<string, LightweightSong[]>()

    // Use songs if available, otherwise flatten genreSongs (deduplicated)
    let allSongs = songs
    if (allSongs.length === 0 && genreSongs) {
      const seen = new Set<string>()
      allSongs = Object.values(genreSongs).flat().filter(song => {
        if (seen.has(song.Id)) return false
        seen.add(song.Id)
        return true
      })
    }

    const map = new Map<string, LightweightSong[]>()
    for (const song of allSongs) {
      const artist = normalizeForMatch(
        cleanArtistName(song.AlbumArtist || song.ArtistItems?.[0]?.Name || '')
      )
      if (!artist) continue
      if (!map.has(artist)) map.set(artist, [])
      map.get(artist)!.push(song)
    }
    return map
  }, [songs, genreSongs, hasHydrated])

  // Find matching artist key (fuzzy match)
  const findArtistSongs = (artistName: string): LightweightSong[] | null => {
    const normalized = normalizeForMatch(cleanArtistName(artistName))
    if (!normalized) return null

    // Try exact match first
    if (artistIndex.has(normalized)) {
      return artistIndex.get(normalized)!
    }

    // Fuzzy match
    for (const [key, artistSongs] of artistIndex) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return artistSongs
      }
    }
    return null
  }

  // Find a matching song
  const findSong = (songName: string, artistName: string): LightweightSong | null => {
    const artistSongs = findArtistSongs(artistName)
    if (!artistSongs) return null

    const normalizedTitle = normalizeForMatch(cleanTitle(songName))
    if (!normalizedTitle) return null

    for (const song of artistSongs) {
      const libTitle = normalizeForMatch(cleanTitle(song.Name || ''))
      if (
        libTitle === normalizedTitle ||
        libTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(libTitle)
      ) {
        return song
      }
    }
    return null
  }

  // Find a matching album
  const findAlbum = (albumName: string, artistName: string): AlbumMatch | null => {
    const artistSongs = findArtistSongs(artistName)
    if (!artistSongs) return null

    const normalizedAlbum = normalizeForMatch(cleanTitle(albumName))
    if (!normalizedAlbum) return null

    for (const song of artistSongs) {
      if (!song.AlbumId || !song.Album) continue
      const libAlbum = normalizeForMatch(cleanTitle(song.Album))
      if (
        libAlbum === normalizedAlbum ||
        libAlbum.includes(normalizedAlbum) ||
        normalizedAlbum.includes(libAlbum)
      ) {
        return { albumId: song.AlbumId, albumName: song.Album }
      }
    }
    return null
  }

  // Find artist image URL from library
  const findArtistImageUrl = (artistName: string): string | null => {
    const artistSongs = findArtistSongs(artistName)
    if (!artistSongs || artistSongs.length === 0) return null
    const artistId = artistSongs[0]?.ArtistItems?.[0]?.Id
    return artistId || null
  }

  return { findSong, findAlbum, findArtistImageUrl, artistIndex }
}
