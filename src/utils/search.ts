import { jellyfinClient } from '../api/jellyfin'
import type { BaseItemDto } from '../api/types'
import { normalizeForSearch } from './formatting'

export interface UnifiedSearchResults {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  playlists: BaseItemDto[]
  songs: BaseItemDto[]
}

export interface SearchFilterOptions {
  genres?: string[]
  years?: number[]
  tags?: string[]
  hasGroupingFilters?: boolean
}

/**
 * Perform a Jellyfin search and apply the common client-side matching rules
 * we currently use across pages: normalized matching on titles, artist names,
 * album names and playlist names.
 */
export async function unifiedSearch(
  searchQuery: string,
  limit: number,
  filters?: SearchFilterOptions
): Promise<UnifiedSearchResults> {
  const results = await jellyfinClient.search(searchQuery, limit, filters)

  const songsSource: BaseItemDto[] = results.Songs?.Items || []
  const albumsSource: BaseItemDto[] = results.Albums?.Items || []
  const artistsSource: BaseItemDto[] = results.Artists?.Items || []
  const playlistsSource: BaseItemDto[] = results.Playlists?.Items || []

  const normalizedQuery = normalizeForSearch(searchQuery)
  const queryLower = normalizedQuery.toLowerCase().trim()

  // Songs: match in title, any artist field, or genre
  const filteredSongs = songsSource.filter((song) => {
    const songTitle = normalizeForSearch(song.Name || '')
    if (songTitle.toLowerCase().includes(queryLower)) return true

    const artistNames: string[] = []
    if (song.AlbumArtist) artistNames.push(normalizeForSearch(song.AlbumArtist))
    if (song.AlbumArtists?.length) {
      artistNames.push(
        ...song.AlbumArtists.map((a) => normalizeForSearch(a.Name || '')).filter(Boolean)
      )
    }
    if (song.ArtistItems?.length) {
      artistNames.push(
        ...song.ArtistItems.map((a) => normalizeForSearch(a.Name || '')).filter(Boolean)
      )
    }
    if (artistNames.some((name) => name.toLowerCase().includes(queryLower))) return true

    if (
      song.Genres?.some((genre) =>
        normalizeForSearch(genre).toLowerCase().includes(queryLower)
      )
    ) {
      return true
    }

    return false
  })

  // Artists: match in normalized name
  const filteredArtists = artistsSource.filter((artist) => {
    const artistName = normalizeForSearch(artist.Name || '')
    return artistName.toLowerCase().includes(queryLower)
  })

  // Albums: match in album name or album artist
  const filteredAlbums = albumsSource.filter((album) => {
    const albumName = normalizeForSearch(album.Name || '')
    const albumArtist = normalizeForSearch(
      album.AlbumArtist || album.ArtistItems?.[0]?.Name || ''
    )
    return (
      albumName.toLowerCase().includes(queryLower) ||
      albumArtist.toLowerCase().includes(queryLower)
    )
  })

  // Playlists: match in playlist name
  const filteredPlaylists = playlistsSource.filter((playlist) => {
    const playlistName = normalizeForSearch(playlist.Name || '')
    return playlistName.toLowerCase().includes(queryLower)
  })

  return {
    artists: filteredArtists,
    albums: filteredAlbums,
    playlists: filteredPlaylists,
    songs: filteredSongs,
  }
}

/**
 * Fetch a large slice of library items for all entity types.
 * Used when filters are active but there is no search query.
 */
export async function fetchAllLibraryItems(
  limit: number,
  filters?: SearchFilterOptions
): Promise<UnifiedSearchResults> {
  const serverFilters: { genres?: string[]; years?: number[]; tags?: string[] } = {}
  if (filters?.genres?.length) serverFilters.genres = filters.genres
  if (filters?.years?.length) serverFilters.years = filters.years
  if (filters?.tags?.length) serverFilters.tags = filters.tags

  // When grouping filters are active, we need to fetch more songs since
  // other entity types won't match tag filters anyway
  const hasTagFilters = filters?.tags?.length || filters?.hasGroupingFilters

  const [artistsResult, albumsResult, playlistsResult, songsResult] = await Promise.all([
    // Skip artists/albums/playlists when tag filters are active (they don't have grouping tags)
    hasTagFilters ? Promise.resolve({ Items: [] }) : jellyfinClient.getArtists({ limit }),
    hasTagFilters ? Promise.resolve({ Items: [] }) : jellyfinClient.getAlbums({ limit, ...serverFilters }),
    hasTagFilters ? Promise.resolve({ Items: [] }) : jellyfinClient.getPlaylists({ limit }),
    jellyfinClient.getSongs({ limit: hasTagFilters ? 5000 : limit, ...serverFilters }),
  ])

  // Parse Tags to Grouping for songs (so client-side grouping filters work)
  const songsWithGrouping = (songsResult.Items || []).map(song => ({
    ...song,
    Grouping: (song.Tags || [])
      .filter(tag => tag.startsWith('grouping:'))
      .map(tag => tag.replace('grouping:', ''))
  }))

  return {
    artists: artistsResult.Items || [],
    albums: albumsResult.Items || [],
    playlists: playlistsResult.Items || [],
    songs: songsWithGrouping,
  }
}


