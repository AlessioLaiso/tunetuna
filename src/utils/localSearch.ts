import type { BaseItemDto, LightweightSong } from '../api/types'
import { normalizeForSearch } from './formatting'

/**
 * In-memory library search: songs from the synced cache, artists/albums/
 * playlists from the search catalog. Pure and synchronous, so results appear
 * on the keystroke instead of after a server round trip.
 *
 * Matching (unchanged from the server-backed search): every query word must
 * appear, accent- and case-insensitively, in
 * - songs: title, album artist, track artists, genres (not the album name)
 * - albums: name, album artist
 * - artists, playlists: name
 *
 * Ranking: name equals the query, then name starts with it, then a word in
 * the name starts with it, then the name contains it, then the words appear in
 * the name in any order, then matches on other fields (e.g. songs found by
 * artist). Ties keep alphabetical order.
 */

export interface LocalSearchResults {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  playlists: BaseItemDto[]
  songs: BaseItemDto[]
}

export interface LocalSearchSource {
  songs: LightweightSong[]
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  playlists: BaseItemDto[]
}

interface IndexEntry {
  item: BaseItemDto
  /** Normalized name, for ranking */
  name: string
  /** Normalized name plus the other matchable fields */
  text: string
}

function norm(text: string | undefined): string {
  return text ? normalizeForSearch(text).toLowerCase() : ''
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/**
 * Builds the entries once per array and caches them by array identity, so
 * typing doesn't re-normalize the library and every page shares one index.
 * Stores replace arrays on change, which invalidates the entry naturally.
 */
function cachedIndex<T>(
  cache: WeakMap<T[], IndexEntry[]>,
  items: T[],
  toEntry: (item: T) => IndexEntry,
): IndexEntry[] {
  let entries = cache.get(items)
  if (!entries) {
    entries = items.map(toEntry).sort((a, b) => collator.compare(a.name, b.name))
    cache.set(items, entries)
  }
  return entries
}

const songIndexCache = new WeakMap<LightweightSong[], IndexEntry[]>()
const albumIndexCache = new WeakMap<BaseItemDto[], IndexEntry[]>()
const nameIndexCache = new WeakMap<BaseItemDto[], IndexEntry[]>()

function songIndex(songs: LightweightSong[]): IndexEntry[] {
  return cachedIndex(songIndexCache, songs, (song) => {
    const name = norm(song.Name)
    const parts = [name, norm(song.AlbumArtist)]
    song.ArtistItems?.forEach(a => parts.push(norm(a.Name)))
    song.Genres?.forEach(g => parts.push(norm(g)))
    // Typed as a full item so rows, the context menu and the queue accept it
    const item = { ...song, Type: 'Audio' } as BaseItemDto
    return { item, name, text: parts.join(' ') }
  })
}

function albumIndex(albums: BaseItemDto[]): IndexEntry[] {
  return cachedIndex(albumIndexCache, albums, (album) => {
    const name = norm(album.Name)
    const artist = norm(album.AlbumArtist || album.AlbumArtists?.[0]?.Name || album.ArtistItems?.[0]?.Name)
    return { item: album, name, text: `${name} ${artist}` }
  })
}

function nameIndex(items: BaseItemDto[]): IndexEntry[] {
  return cachedIndex(nameIndexCache, items, (item) => {
    const name = norm(item.Name)
    return { item, name, text: name }
  })
}

function rank(entry: IndexEntry, phrase: string, words: string[]): number {
  const { name } = entry
  if (name === phrase) return 0
  if (name.startsWith(phrase)) return 1
  if (name.includes(` ${phrase}`)) return 2
  if (name.includes(phrase)) return 3
  if (words.every(w => name.includes(w))) return 4
  return 5
}

function match(entries: IndexEntry[], phrase: string, words: string[]): BaseItemDto[] {
  const hits: { item: BaseItemDto; rank: number; order: number }[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (words.every(w => entry.text.includes(w))) {
      hits.push({ item: entry.item, rank: rank(entry, phrase, words), order: i })
    }
  }
  // Entries are already alphabetical, so the index order breaks ties
  hits.sort((a, b) => a.rank - b.rank || a.order - b.order)
  return hits.map(h => h.item)
}

/** Splits a query into normalized words; empty when there's nothing to match. */
export function queryWords(query: string): string[] {
  return norm(query).trim().split(/\s+/).filter(Boolean)
}

/** Everything matching `query`, best matches first. */
export function searchLibrary(query: string, source: LocalSearchSource): LocalSearchResults {
  const words = queryWords(query)
  if (words.length === 0) return browseLibrary(source)
  const phrase = words.join(' ')
  return {
    artists: match(nameIndex(source.artists), phrase, words),
    albums: match(albumIndex(source.albums), phrase, words),
    playlists: match(nameIndex(source.playlists), phrase, words),
    songs: match(songIndex(source.songs), phrase, words),
  }
}

/** The whole library in alphabetical order, for filtering without a query. */
export function browseLibrary(source: LocalSearchSource): LocalSearchResults {
  const items = (entries: IndexEntry[]) => entries.map(e => e.item)
  return {
    artists: items(nameIndex(source.artists)),
    albums: items(albumIndex(source.albums)),
    playlists: items(nameIndex(source.playlists)),
    songs: items(songIndex(source.songs)),
  }
}
