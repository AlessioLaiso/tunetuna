import { jellyfinClient } from '../api/jellyfin'
import type { BaseItemDto, LightweightSong } from '../api/types'
import { normalizeForSearch, extractGroupingFromTags } from './formatting'

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
  filters?: SearchFilterOptions,
  cachedSongs?: LightweightSong[]
): Promise<UnifiedSearchResults> {
  const normalizedQuery = normalizeForSearch(searchQuery)
  const queryWords = normalizedQuery.toLowerCase().trim().split(/\s+/).filter(Boolean)

  // For multi-word queries, search each word individually and merge results.
  // The server only does substring matching on each entity's own name, so
  // "lady born" won't return "Lady Gaga" or "Born This Way". By searching
  // each word separately we get all candidates, then filter client-side.
  const isMultiWord = queryWords.length > 1

  let songsSource: BaseItemDto[] = []
  let albumsSource: BaseItemDto[] = []
  let artistsSource: BaseItemDto[] = []
  let playlistsSource: BaseItemDto[] = []

  if (isMultiWord) {
    const searches = await Promise.all(
      queryWords.map(word => jellyfinClient.search(word, limit, filters))
    )
    const seenSongs = new Set<string>()
    const seenAlbums = new Set<string>()
    const seenArtists = new Set<string>()
    const seenPlaylists = new Set<string>()

    for (const results of searches) {
      for (const s of results.Songs?.Items || []) {
        if (!seenSongs.has(s.Id)) { seenSongs.add(s.Id); songsSource.push(s) }
      }
      for (const a of results.Albums?.Items || []) {
        if (!seenAlbums.has(a.Id)) { seenAlbums.add(a.Id); albumsSource.push(a) }
      }
      for (const a of results.Artists?.Items || []) {
        if (!seenArtists.has(a.Id)) { seenArtists.add(a.Id); artistsSource.push(a) }
      }
      for (const p of results.Playlists?.Items || []) {
        if (!seenPlaylists.has(p.Id)) { seenPlaylists.add(p.Id); playlistsSource.push(p) }
      }
    }
  } else {
    const results = await jellyfinClient.search(searchQuery, limit, filters)
    songsSource = results.Songs?.Items || []
    albumsSource = results.Albums?.Items || []
    artistsSource = results.Artists?.Items || []
    playlistsSource = results.Playlists?.Items || []
  }

  // Helper: collect searchable text for a song (title + artists + genres, NOT album name)
  const getSongSearchText = (song: { Name?: string; AlbumArtist?: string; AlbumArtists?: { Name?: string }[]; ArtistItems?: { Name?: string }[]; Genres?: string[] }): string => {
    const parts: string[] = []
    if (song.Name) parts.push(normalizeForSearch(song.Name))
    if (song.AlbumArtist) parts.push(normalizeForSearch(song.AlbumArtist))
    if (song.AlbumArtists?.length) {
      song.AlbumArtists.forEach(a => { if (a.Name) parts.push(normalizeForSearch(a.Name)) })
    }
    if (song.ArtistItems?.length) {
      song.ArtistItems.forEach(a => { if (a.Name) parts.push(normalizeForSearch(a.Name)) })
    }
    if (song.Genres?.length) {
      song.Genres.forEach(g => parts.push(normalizeForSearch(g)))
    }
    return parts.join(' ').toLowerCase()
  }

  // Helper: check if all query words appear somewhere in the combined text
  const matchesAllWords = (searchText: string): boolean => {
    return queryWords.every(word => searchText.includes(word))
  }

  // Songs: match all query words across title, artist, album, or genre fields
  const filteredSongs = songsSource.filter((song) => {
    return matchesAllWords(getSongSearchText(song))
  })

  // Supplement with cached songs that match the query but weren't returned
  // by the server (Jellyfin only matches song titles for Audio items)
  if (cachedSongs && cachedSongs.length > 0) {
    const serverSongIds = new Set(filteredSongs.map(s => s.Id))

    for (const song of cachedSongs) {
      if (serverSongIds.has(song.Id)) continue

      if (matchesAllWords(getSongSearchText(song))) {
        filteredSongs.push({
          Id: song.Id,
          Name: song.Name,
          AlbumArtist: song.AlbumArtist,
          ArtistItems: song.ArtistItems,
          Album: song.Album,
          AlbumId: song.AlbumId,
          IndexNumber: song.IndexNumber,
          ProductionYear: song.ProductionYear,
          RunTimeTicks: song.RunTimeTicks,
          Genres: song.Genres,
          Grouping: song.Grouping,
          Type: 'Audio',
        } as BaseItemDto)
        serverSongIds.add(song.Id)
      }
    }
  }

  // Artists: match all query words in artist name
  const filteredArtists = artistsSource.filter((artist) => {
    const artistName = normalizeForSearch(artist.Name || '').toLowerCase()
    return queryWords.every(word => artistName.includes(word))
  })

  // Albums: match all query words across album name + album artist
  const filteredAlbums = albumsSource.filter((album) => {
    const searchText = [
      normalizeForSearch(album.Name || ''),
      normalizeForSearch(album.AlbumArtist || album.ArtistItems?.[0]?.Name || ''),
    ].join(' ').toLowerCase()
    return queryWords.every(word => searchText.includes(word))
  })

  // Playlists: match all query words in playlist name
  const filteredPlaylists = playlistsSource.filter((playlist) => {
    const playlistName = normalizeForSearch(playlist.Name || '').toLowerCase()
    return queryWords.every(word => playlistName.includes(word))
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
    Grouping: extractGroupingFromTags(song.Tags)
  }))

  return {
    artists: artistsResult.Items || [],
    albums: albumsResult.Items || [],
    playlists: playlistsResult.Items || [],
    songs: songsWithGrouping,
  }
}


