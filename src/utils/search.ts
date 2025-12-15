import { jellyfinClient } from '../api/jellyfin'
import type { BaseItemDto } from '../api/types'
import { normalizeForSearch } from './formatting'

export interface UnifiedSearchResults {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  playlists: BaseItemDto[]
  songs: BaseItemDto[]
}

/**
 * Perform a Jellyfin search and apply the common client-side matching rules
 * we currently use across pages: normalized matching on titles, artist names,
 * album names and playlist names.
 */
export async function unifiedSearch(
  searchQuery: string,
  limit: number
): Promise<UnifiedSearchResults> {
  const results = await jellyfinClient.search(searchQuery, limit)

  // Use server results when available; otherwise fall back to a broader client-side search
  let songsSource: BaseItemDto[] = results.Songs?.Items || []
  let albumsSource: BaseItemDto[] = results.Albums?.Items || []
  let artistsSource: BaseItemDto[] = results.Artists?.Items || []
  let playlistsSource: BaseItemDto[] = results.Playlists?.Items || []

  const hasAnyServerResults =
    songsSource.length > 0 ||
    albumsSource.length > 0 ||
    artistsSource.length > 0 ||
    playlistsSource.length > 0

  if (!hasAnyServerResults && searchQuery.trim().length > 0) {
    const fallbackLibrary = await fetchAllLibraryItems(limit)
    songsSource = fallbackLibrary.songs
    albumsSource = fallbackLibrary.albums
    artistsSource = fallbackLibrary.artists
    playlistsSource = fallbackLibrary.playlists
  }

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
  limit: number
): Promise<UnifiedSearchResults> {
  const [artistsResult, albumsResult, playlistsResult, songsResult] = await Promise.all([
    jellyfinClient.getArtists({ limit }),
    jellyfinClient.getAlbums({ limit }),
    jellyfinClient.getPlaylists({ limit }),
    jellyfinClient.getSongs({ limit }),
  ])

  return {
    artists: artistsResult.Items || [],
    albums: albumsResult.Items || [],
    playlists: playlistsResult.Items || [],
    songs: songsResult.Items || [],
  }
}


