import type { BaseItemDto } from '../api/types'

export interface ArtistAlbumSplit {
  ownAlbums: BaseItemDto[]
  appearsOnAlbums: BaseItemDto[]
}

/**
 * Splits the albums returned by an ArtistIds query into releases led by the
 * artist and releases they only appear on.
 *
 * Jellyfin's ArtistIds filter also matches track artists, so a song where the
 * artist is only credited as a track artist pulls in the other artist's album
 * too. `albumArtistAlbumIds` (from an AlbumArtistIds query) is the
 * authoritative list of releases led by the artist.
 *
 * Servers that do not support the AlbumArtistIds filter echo the whole library
 * back; that is detected by the set being larger than the artist's own
 * discography and falls back to each album's own AlbumArtists field.
 */
export function splitArtistAlbums(
  contributingAlbums: BaseItemDto[],
  albumArtistAlbumIds: Set<string> | null,
  artistId: string
): ArtistAlbumSplit {
  const ledIds = albumArtistAlbumIds && albumArtistAlbumIds.size <= contributingAlbums.length
    ? albumArtistAlbumIds
    : null

  const ownAlbums: BaseItemDto[] = []
  const appearsOnAlbums: BaseItemDto[] = []
  const seenAlbumIds = new Set<string>()

  for (const album of contributingAlbums) {
    if (seenAlbumIds.has(album.Id)) continue
    seenAlbumIds.add(album.Id)

    const isLedAlbum = ledIds
      ? ledIds.has(album.Id)
      : album.AlbumArtists?.some(a => a.Id === artistId) || !album.AlbumArtists?.length

    if (isLedAlbum) {
      ownAlbums.push(album)
    } else {
      appearsOnAlbums.push(album)
    }
  }

  return { ownAlbums, appearsOnAlbums }
}
