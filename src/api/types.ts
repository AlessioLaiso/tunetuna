export interface JellyfinAuthResponse {
  User: {
    Id: string
    Name: string
  }
  AccessToken: string
  ServerId: string
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
  MediaType?: string
  Type?: string
  UserData?: {
    Played?: boolean
    PlaybackPositionTicks?: number
    PlayCount?: number
    LastPlayedDate?: string
  }
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
}

export type SortOrder = 'RecentlyAdded' | 'Alphabetical' | 'Newest'

export interface GetItemsOptions {
  sortBy?: string[]
  sortOrder?: 'Ascending' | 'Descending'
  limit?: number
  startIndex?: number
  includeItemTypes?: string[]
  recursive?: boolean
  parentId?: string
  searchTerm?: string
  genreIds?: string[]
  artistIds?: string[]
  albumIds?: string[]
  years?: number[]
  minDateLastSaved?: Date
}




