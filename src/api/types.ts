export interface JellyfinAuthResponse {
  User: {
    Id: string
    Name: string
  }
  AccessToken: string
  ServerId: string
}

export interface MediaStream {
  Codec?: string
  BitRate?: number
  BitDepth?: number
  SampleRate?: number
  Channels?: number
  ChannelLayout?: string
  Type?: string
  DisplayTitle?: string
}

export interface MediaSource {
  Container?: string
  Size?: number
  Bitrate?: number
  MediaStreams?: MediaStream[]
}

export interface BaseItemDto {
  Id: string
  Name: string
  ServerId?: string
  PremiereDate?: string
  ProductionYear?: number
  Overview?: string
  ChildCount?: number
  ImageTags?: {
    Primary?: string
    Logo?: string
    Art?: string
    Banner?: string
  }
  AlbumArtists?: BaseItemDto[]
  ArtistItems?: BaseItemDto[]
  AlbumArtist?: string
  AlbumId?: string
  Album?: string
  RunTimeTicks?: number
  IndexNumber?: number
  ParentIndexNumber?: number
  Genres?: string[]
  Tags?: string[]
  Grouping?: string[]
  MediaType?: string
  Type?: string
  Path?: string
  DateCreated?: string
  DateLastSaved?: string
  MediaSources?: MediaSource[]
  UserData?: {
    Played?: boolean
    PlaybackPositionTicks?: number
    PlayCount?: number
    LastPlayedDate?: string
  }
  PlaylistItemId?: string
}

export interface ItemsResult {
  Items: BaseItemDto[]
  TotalRecordCount: number
  StartIndex: number
}

export interface SearchResult {
  Artists?: ItemsResult
  Albums?: ItemsResult
  Playlists?: ItemsResult
  Songs?: ItemsResult
}

// Lightweight song object for efficient storage of genre song caches
export interface LightweightSong {
  Id: string
  Name: string
  AlbumArtist?: string
  ArtistItems?: BaseItemDto[]
  Album?: string
  AlbumId?: string
  IndexNumber?: number
  ProductionYear?: number
  PremiereDate?: string
  RunTimeTicks?: number
  Genres?: string[]
  Grouping?: string[]
}

// Grouping category for filter UI (derived from song grouping tags)
export interface GroupingCategory {
  name: string           // Display name: "Language", "Mood", "Instrumental"
  key: string            // Lowercase key: "language", "mood", "instrumental"
  values: string[]       // Available values: ["Eng", "Ita"] or [] for single-value tags
  isSingleValue: boolean // true for tags like "instrumental" with no prefix_value format
}

export type SortOrder = 'RecentlyAdded' | 'Alphabetical' | 'Newest'

export interface GetItemsOptions {
  sortBy?: string[]
  sortOrder?: 'Ascending' | 'Descending' | ('Ascending' | 'Descending')[]
  limit?: number
  startIndex?: number
  includeItemTypes?: string[]
  recursive?: boolean
  parentId?: string
  searchTerm?: string
  genreIds?: string[]
  genres?: string[]
  artistIds?: string[]
  albumIds?: string[]
  years?: number[]
  minDateLastSaved?: Date
  tags?: string[]
}




