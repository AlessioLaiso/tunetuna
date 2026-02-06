import type {
  JellyfinAuthResponse,
  BaseItemDto,
  ItemsResult,
  SearchResult,
  GetItemsOptions,
  LightweightSong,
} from './types'
import { storage } from '../utils/storage'
import { generateUUID } from '../utils/uuid'
import { useMusicStore } from '../stores/musicStore'
import { normalizeQuotes } from '../utils/formatting'
import { logger } from '../utils/logger'
import {
  AUTH_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  CACHE_COOLDOWN_MS,
  API_PAGE_LIMIT,
  ARTIST_FETCH_LIMIT,
  SAFETY_FETCH_LIMIT,
  VPN_IP_REGEX,
  APP_CLIENT_NAME,
  APP_DEVICE_TYPE,
  APP_VERSION,
} from '../utils/constants'
import { clearPlaybackTrackingState } from '../stores/playerStore'

class JellyfinClient {
  private baseUrl: string = ''
  private accessToken: string = ''
  private userId: string = ''
  private genresCache: BaseItemDto[] | null = null
  private isPreloading: boolean = false
  // Request deduplication: cache in-flight requests to avoid duplicate API calls
  private pendingRequests = new Map<string, Promise<unknown>>()

  get serverBaseUrl(): string {
    return this.baseUrl
  }

  setCredentials(baseUrl: string, accessToken: string, userId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.accessToken = accessToken
    this.userId = userId
    // Clear cache when credentials change (different user/server)
    this.genresCache = null
  }

  clearGenresCache(): void {
    this.genresCache = null
  }

  private getDeviceId(): string {
    let deviceId = storage.get<string>('deviceId')
    if (!deviceId) {
      deviceId = generateUUID()
      storage.set('deviceId', deviceId)
    }
    return deviceId
  }

  private getEmbyAuthHeader(): string {
    return `MediaBrowser Client="${APP_CLIENT_NAME}", Device="${APP_DEVICE_TYPE}", DeviceId="${this.getDeviceId()}", Version="${APP_VERSION}"`
  }

  private getVpnWarning(serverUrl: string): string {
    const isVpnIp = VPN_IP_REGEX.test(serverUrl)
    if (!isVpnIp) return ''
    return '\n⚠️  VPN/Tailscale IP detected (100.x.x.x). Your phone may not be on the same VPN network.\n   Try using your local network IP instead (e.g., http://192.168.1.x:8096)\n'
  }

  private getHeaders(): HeadersInit {
    return {
      'Authorization': `MediaBrowser Token="${this.accessToken}"`,
      'Content-Type': 'application/json',
      'X-Emby-Authorization': this.getEmbyAuthHeader(),
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const method = options.method || 'GET'

    // Only deduplicate GET requests (mutations should always execute)
    const shouldDedupe = method === 'GET'
    const cacheKey = shouldDedupe ? url : ''

    // Return existing in-flight request if available
    if (shouldDedupe && this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey) as Promise<T>
    }

    const requestPromise = this.executeRequest<T>(url, options)

    if (shouldDedupe) {
      this.pendingRequests.set(cacheKey, requestPromise)
      // Clean up after request completes (success or failure)
      requestPromise.finally(() => {
        this.pendingRequests.delete(cacheKey)
      })
    }

    return requestPromise
  }

  private async executeRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...this.getHeaders(),
            ...options.headers,
          },
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          if (response.status === 401) {
            // Clear tracking state on auth failure to prevent memory leaks
            clearPlaybackTrackingState()
            throw new Error('Unauthorized - please login again')
          }
          throw new Error(`API request failed: ${response.statusText}`)
        }

        return response.json()
      } catch (error) {
        clearTimeout(timeoutId)
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on auth errors or abort
        if (lastError.message.includes('Unauthorized') || lastError.name === 'AbortError') {
          break
        }

        // Wait before retry (exponential backoff)
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
        }
      }
    }

    throw lastError || new Error('Request failed')
  }

  async authenticate(serverUrl: string, username: string, password: string): Promise<JellyfinAuthResponse> {
    const url = serverUrl.replace(/\/$/, '') + '/Users/authenticatebyname'

    // Use AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      logger.warn(`Authentication request timed out after ${AUTH_TIMEOUT_MS / 1000} seconds`)
      controller.abort()
    }, AUTH_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Emby-Authorization': this.getEmbyAuthHeader(),
        },
        body: JSON.stringify({
          Username: username,
          Pw: password,
        }),
      })
      clearTimeout(timeoutId)
    } catch (error) {
      clearTimeout(timeoutId)
      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        if (import.meta.env.DEV) {
          logger.error('[JellyfinClient] Authentication timeout:', { url, serverUrl })
        }

        const vpnNote = this.getVpnWarning(serverUrl)

        throw new Error(`Request timeout - server did not respond within ${AUTH_TIMEOUT_MS / 1000} seconds.\n\nPossible issues:\n- Server URL may be incorrect: ${url}\n- Server may be down or unreachable${vpnNote}- CORS may be blocking the request (check browser console/Network tab)\n- Network connectivity issues\n\nIf this was working earlier, check:\n- Is the Jellyfin server still running?\n- Are there any CORS errors in the browser console?\n- Try accessing ${url} directly in your browser\n- If using VPN/Tailscale IP, ensure your phone is on the same network`)
      }
      // Handle network errors (CORS, connection refused, etc.)
      if (error instanceof TypeError) {
        const errorMsg = error.message.toLowerCase()
        if (errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) {
          const vpnNote = this.getVpnWarning(serverUrl)

          throw new Error(`Network error - unable to reach server at ${url}\n\nPossible issues:\n- CORS is blocking the request (check Jellyfin server CORS settings)${vpnNote}- Server is not accessible from this network\n- Invalid server URL\n\nCheck browser console for detailed error information.`)
        }
        throw new Error(`Network error: ${error.message}`)
      }
      throw error
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || `Authentication failed (${response.status})`)
    }

    const data: JellyfinAuthResponse = await response.json()
    this.setCredentials(serverUrl, data.AccessToken, data.User.Id)
    return data
  }

  getImageUrl(
    itemId: string,
    imageType: 'Primary' | 'Logo' | 'Art' | 'Banner' | 'Backdrop' = 'Primary',
    maxWidth?: number
  ): string {
    if (!this.baseUrl || !itemId) return ''

    // Use smaller, more efficient thumbnails when a max width is provided.
    // For small UI elements (e.g. 48px avatars), using ~2x size (e.g. 96px)
    // with slightly lower quality is a good trade-off between sharpness and payload.
    const size = maxWidth ?? 300
    const isSmall = size <= 128
    const quality = isSmall ? 75 : 90

    const params: string[] = [
      `quality=${quality}`,
      `fillHeight=${size}`,
      `fillWidth=${size}`,
    ]

    if (maxWidth) {
      params.push(`maxWidth=${maxWidth}`)
    }

    return `${this.baseUrl}/Items/${itemId}/Images/${imageType}?${params.join('&')}`
  }

  getArtistImageUrl(artistId: string, maxWidth?: number): string {
    return this.getImageUrl(artistId, 'Primary', maxWidth)
  }

  getArtistBackdropUrl(artistId: string, maxWidth?: number): string {
    return this.getImageUrl(artistId, 'Backdrop', maxWidth)
  }

  getAlbumArtUrl(albumId: string, maxWidth?: number): string {
    return this.getImageUrl(albumId, 'Primary', maxWidth)
  }

  private buildQueryString(options: GetItemsOptions, cacheBust = false): string {
    const params = new URLSearchParams()
    
    if (options.sortBy) {
      options.sortBy.forEach(sort => params.append('SortBy', sort))
    }
    if (options.sortOrder) {
      if (Array.isArray(options.sortOrder)) {
        options.sortOrder.forEach(order => params.append('SortOrder', order))
      } else {
        params.append('SortOrder', options.sortOrder)
      }
    }
    if (options.limit) {
      params.append('Limit', options.limit.toString())
    }
    if (options.startIndex) {
      params.append('StartIndex', options.startIndex.toString())
    }
    if (options.includeItemTypes) {
      options.includeItemTypes.forEach(type => params.append('IncludeItemTypes', type))
    }
    if (options.recursive !== undefined) {
      params.append('Recursive', options.recursive.toString())
    }
    if (options.parentId) {
      params.append('ParentId', options.parentId)
    }
    if (options.searchTerm && options.searchTerm.trim().length > 0) {
      params.append('SearchTerm', options.searchTerm.trim())
    }
    if (options.genreIds) {
      options.genreIds.forEach(id => params.append('GenreIds', id))
    }
    if (options.genres) {
      options.genres.forEach(genre => params.append('Genres', genre))
    }
    if (options.artistIds) {
      options.artistIds.forEach(id => params.append('ArtistIds', id))
    }
    if (options.albumIds) {
      options.albumIds.forEach(id => params.append('AlbumIds', id))
    }
    if (options.years) {
      options.years.forEach(year => params.append('Years', year.toString()))
    }
    if (options.minDateLastSaved) {
      params.append('MinDateLastSaved', options.minDateLastSaved.toISOString())
    }

    params.append('UserId', this.userId)
    params.append('Fields', 'PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Genres,ProductionYear,DateCreated,DateModified,DateLastSaved,AlbumArtist,ArtistItems,Album,AlbumId')
    
    // Add cache-busting timestamp to force fresh data from server
    if (cacheBust) {
      params.append('_t', Date.now().toString())
    }
    
    return params.toString()
  }

  async getArtistById(artistId: string): Promise<BaseItemDto | null> {
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    const query = new URLSearchParams({
      UserId: this.userId,
      Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Genres,Overview',
    })
    try {
      const result = await this.request<BaseItemDto>(`/Items/${artistId}?${query}`)
      return result
    } catch (error) {
      logger.error('Failed to get artist by ID:', error)
      return null
    }
  }

  async getArtists(options: GetItemsOptions = {}): Promise<ItemsResult> {
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    const query = this.buildQueryString({
      ...options,
      includeItemTypes: ['MusicArtist'],
      recursive: true,
    })
    let result = await this.request<ItemsResult>(`/Artists?${query}`)
    
    // If /Artists returns no items, try /Items endpoint like albums do
    if ((result.Items?.length || 0) === 0 && (result.TotalRecordCount || 0) === 0) {
      result = await this.request<ItemsResult>(`/Items?${query}`)
    }
    
    return {
      Items: result.Items || [],
      TotalRecordCount: result.TotalRecordCount || 0,
      StartIndex: result.StartIndex || 0,
    }
  }

  async getAlbumById(albumId: string): Promise<BaseItemDto | null> {
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    const query = new URLSearchParams({
      UserId: this.userId,
      Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Genres,Overview',
    })
    try {
      const result = await this.request<BaseItemDto>(`/Items/${albumId}?${query}`)
      return result
    } catch (error) {
      logger.error('Failed to get album by ID:', error)
      return null
    }
  }

  async getSongById(songId: string): Promise<BaseItemDto | null> {
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    const query = new URLSearchParams({
      UserId: this.userId,
      Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Genres',
    })
    try {
      const result = await this.request<BaseItemDto>(`/Items/${songId}?${query}`)
      return result
    } catch (error) {
      logger.error('Failed to get song by ID:', error)
      return null
    }
  }

  async getAlbums(options: GetItemsOptions = {}): Promise<ItemsResult> {
    const query = this.buildQueryString({
      ...options,
      includeItemTypes: ['MusicAlbum'],
      recursive: true,
    })
    return this.request<ItemsResult>(`/Items?${query}`)
  }

  async getSongs(options: GetItemsOptions = {}, cacheBust = false): Promise<ItemsResult> {
    const query = this.buildQueryString({
      ...options,
      includeItemTypes: ['Audio'],
      recursive: true,
    }, cacheBust)
    return this.request<ItemsResult>(`/Items?${query}`)
  }

  async getGenres(forceRefresh = false): Promise<BaseItemDto[]> {
    // Return in-memory cache if available and not forcing refresh
    if (this.genresCache && !forceRefresh) {
      return this.genresCache
    }
    
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    
    // Check persistent store first
    const store = useMusicStore.getState()
    
    if (!forceRefresh && store.genres.length > 0 && store.genresLastUpdated) {
      // Check if cooldown has expired
      const now = Date.now()
      const lastChecked = store.genresLastChecked || 0
      const cooldownExpired = (now - lastChecked) >= CACHE_COOLDOWN_MS
      
      if (!cooldownExpired) {
        // Cooldown active, return cached genres
        this.genresCache = store.genres
        return store.genres
      }
      
      // Cooldown expired, check for new or modified tracks
      try {
        // Check both recently added AND recently modified songs
        const recentlyAdded = await this.getRecentlyAdded(50)
        const recentlyModified = await this.getSongs({
          limit: 50,
          sortBy: ['DateLastSaved'],
          sortOrder: 'Descending'
        })

        const items = [...(recentlyAdded.Items || []), ...(recentlyModified.Items || [])]

        // Find newest item with DateCreated OR DateLastSaved
        let newestDate = 0
        for (const item of items) {
          // Check DateCreated for new items
          if (item.DateCreated) {
            const itemDate = new Date(item.DateCreated).getTime()
            if (itemDate > newestDate) {
              newestDate = itemDate
            }
          }
          // Check DateLastSaved for modified items
          if (item.DateLastSaved) {
            const itemDate = new Date(item.DateLastSaved).getTime()
            if (itemDate > newestDate) {
              newestDate = itemDate
            }
          }
        }

        // Update last checked timestamp even if no changes
        useMusicStore.setState({ genresLastChecked: now })

        // Only refresh if we found items newer than last update
        if (newestDate <= store.genresLastUpdated) {
          // No new or modified tracks, return cached genres
          this.genresCache = store.genres
          return store.genres
        }
      } catch (error) {
        // If check fails, gracefully fall back to cached genres
        logger.warn('[getGenres] Failed to check for new/modified tracks, using cached genres:', error)
        this.genresCache = store.genres
        return store.genres
      }
    }
    
    // Need to do full refresh - extract genres from music items
    // Extract genres ONLY from actual music items (songs) - this ensures we only get
    // genres that actually exist in the music library, not movie/TV genres
    try {
      // Map: lowercase genre name -> canonical genre name (first occurrence)
      // This ensures case-insensitive deduplication
      const uniqueGenreNames = new Map<string, string>()
      
      // Get all albums in batches to extract all unique genres (much faster than songs)
      let startIndex = 0
      let hasMore = true

      while (hasMore) {
        const musicItems = await this.getAlbums({ limit: API_PAGE_LIMIT, startIndex })
        const items = musicItems.Items || []
        
        items.forEach(item => {
          if (item.Genres) {
            item.Genres.forEach(genreName => {
              const lowerName = genreName.toLowerCase()
              // Only add if we haven't seen this genre before (case-insensitive)
              // Use first occurrence as canonical name
              if (!uniqueGenreNames.has(lowerName)) {
                uniqueGenreNames.set(lowerName, genreName)
              }
            })
          }
        })
        
        hasMore = items.length === API_PAGE_LIMIT
        startIndex += API_PAGE_LIMIT

        // Safety limit to avoid infinite loops
        if (startIndex > 10000) break
      }

      // Now extract genres from songs to compare - only include genres that exist in songs
      const songGenreNames = new Set<string>()
      let startIndexSongs = 0
      let hasMoreSongs = true

      while (hasMoreSongs) {
        const songItems = await this.getSongs({ limit: API_PAGE_LIMIT, startIndex: startIndexSongs })
        const songs = songItems.Items || []

        songs.forEach(song => {
          if (song.Genres) {
            song.Genres.forEach(genreName => {
              songGenreNames.add(genreName.toLowerCase())
            })
          }
        })

        hasMoreSongs = songs.length === API_PAGE_LIMIT
        startIndexSongs += API_PAGE_LIMIT
        if (startIndexSongs > 10000) break
      }
      
      // Build genre objects with simple name-based IDs
      // Only include genres that actually exist in songs, not just albums
      // This prevents showing genres like "Alternative Rock" that exist on albums but not on any songs
      const musicGenres: BaseItemDto[] = []
      const processedLowerNames = new Set<string>()

      for (const [lowerName, canonicalName] of uniqueGenreNames) {
        // Skip if already processed (case-insensitive check)
        if (processedLowerNames.has(lowerName)) {
          continue
        }

        // Only include genres that actually exist in songs, not just albums
        if (!songGenreNames.has(lowerName)) {
          continue // Skip genres that don't exist in songs
        }

        // Create genre object with simple name-based ID
        musicGenres.push({
          Id: lowerName.replace(/\s+/g, '-'),
          Name: canonicalName,
          Type: 'Genre',
        })
        processedLowerNames.add(lowerName)
      }
      
      // Update store with new genres and timestamps
      const now = Date.now()
      useMusicStore.getState().setGenres(musicGenres)
      useMusicStore.setState({
        genresLastUpdated: now,
        genresLastChecked: now
      })

      // Cache the result
      this.genresCache = musicGenres
      return musicGenres
    } catch (error) {
      logger.error('[getGenres] Failed to build music genres:', error)
      // Return cached genres from store if available, otherwise empty array
      if (store.genres.length > 0) {
        this.genresCache = store.genres
        return store.genres
      }
      this.genresCache = []
      return []
    }
  }

  async getYears(forceRefresh = false): Promise<number[]> {
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    
    const store = useMusicStore.getState()

    if (!forceRefresh && store.years.length > 0 && store.yearsLastUpdated) {
      const now = Date.now()
      const lastChecked = store.yearsLastChecked || 0
      const cooldownExpired = (now - lastChecked) >= CACHE_COOLDOWN_MS
      
      if (!cooldownExpired) {
        return store.years
      }
      
      // Cooldown expired, check for new tracks
      try {
        const recentlyAdded = await this.getRecentlyAdded(50)
        const items = recentlyAdded.Items || []
        
        let newestDate = 0
        for (const item of items) {
          if (item.DateCreated) {
            const itemDate = new Date(item.DateCreated).getTime()
            if (itemDate > newestDate) {
              newestDate = itemDate
            }
          }
        }
        
        useMusicStore.setState({ yearsLastChecked: now })
        
        if (newestDate <= store.yearsLastUpdated) {
          return store.years
        }
      } catch (error) {
        logger.warn('[getYears] Failed to check for new tracks, using cached years:', error)
        return store.years
      }
    }
    
    // Extract unique years from songs
    try {
      const uniqueYears = new Set<number>()
      let startIndex = 0
      let hasMore = true

      while (hasMore) {
        const songItems = await this.getSongs({ limit: API_PAGE_LIMIT, startIndex })
        const songs = songItems.Items || []

        songs.forEach(song => {
          if (song.ProductionYear && song.ProductionYear > 0) {
            uniqueYears.add(song.ProductionYear)
          }
        })

        hasMore = songs.length === API_PAGE_LIMIT
        startIndex += API_PAGE_LIMIT

        if (startIndex > 10000) break
      }
      
      const years = Array.from(uniqueYears).sort((a, b) => a - b)
      
      const now = Date.now()
      useMusicStore.getState().setYears(years)
      useMusicStore.setState({
        yearsLastUpdated: now,
        yearsLastChecked: now,
      })
      
      return years
    } catch (error) {
      logger.error('[getYears] Failed to extract years:', error)
      if (store.years.length > 0) {
        return store.years
      }
      return []
    }
  }


  async getGenreSongs(_genreId: string, genreName: string): Promise<LightweightSong[]> {
    // Fetch all songs and filter client-side by genre name
    // This ensures we get fresh metadata from the server
    const allSongs = await this.fetchAllSongsLightweight()

    // Filter by exact genre name match to ensure correctness
    return allSongs.filter(song =>
      song.Genres?.some(g => g.toLowerCase() === genreName.toLowerCase())
    )
  }

  /**
   * Fetches all songs from the library and converts to lightweight format.
   * Used by full sync and getGenreSongs to avoid redundant fetches.
   */
  private async fetchAllSongsLightweight(onProgress?: (progress: number) => void): Promise<LightweightSong[]> {
    let allSongs: BaseItemDto[] = []
    let startIndex = 0
    let hasMore = true
    let totalCount: number | null = null

    while (hasMore) {
      const result = await this.getSongs({ limit: API_PAGE_LIMIT, startIndex }, true)
      const items = result.Items || []
      allSongs.push(...items)

      // Get total count from first response for progress calculation
      if (totalCount === null && result.TotalRecordCount) {
        totalCount = result.TotalRecordCount
      }

      // Report progress if callback provided and we know the total
      if (onProgress && totalCount && totalCount > 0) {
        const progress = Math.min(Math.round((allSongs.length / totalCount) * 100), 99)
        onProgress(progress)
      }

      hasMore = items.length === API_PAGE_LIMIT
      startIndex += API_PAGE_LIMIT
      // Safety limit to avoid infinite loops
      if (startIndex > SAFETY_FETCH_LIMIT) break
    }

    // Report 100% when done
    if (onProgress) {
      onProgress(100)
    }

    // Convert to lightweight objects for efficient storage
    return allSongs.map(song => ({
      Id: song.Id,
      Name: song.Name,
      AlbumArtist: song.AlbumArtist,
      ArtistItems: song.ArtistItems,
      Album: song.Album,
      AlbumId: song.AlbumId,
      IndexNumber: song.IndexNumber,
      ProductionYear: song.ProductionYear,
      PremiereDate: song.PremiereDate,
      RunTimeTicks: song.RunTimeTicks,
      Genres: song.Genres
    }))
  }

  /**
   * Builds verified genre list from songs.
   * Only includes genres that actually exist in song metadata.
   */
  private buildGenresFromSongs(songs: LightweightSong[]): BaseItemDto[] {
    // Map: lowercase genre name -> canonical genre name (first occurrence)
    const uniqueGenreNames = new Map<string, string>()

    songs.forEach(song => {
      if (song.Genres) {
        song.Genres.forEach(genreName => {
          const lowerName = genreName.toLowerCase()
          if (!uniqueGenreNames.has(lowerName)) {
            uniqueGenreNames.set(lowerName, genreName)
          }
        })
      }
    })

    // Build genre objects with simple name-based IDs
    const genres: BaseItemDto[] = []
    for (const [lowerName, canonicalName] of uniqueGenreNames) {
      genres.push({
        Id: lowerName.replace(/\s+/g, '-'),
        Name: canonicalName,
        Type: 'Genre',
      })
    }

    return genres
  }

  /**
   * Distributes songs to genre caches based on their genre metadata.
   */
  private distributeSongsToGenres(
    songs: LightweightSong[],
    genres: BaseItemDto[],
    store: ReturnType<typeof useMusicStore.getState>
  ): void {
    for (const genre of genres) {
      if (!genre.Name || !genre.Id) continue

      const genreSongs = songs.filter(song =>
        song.Genres?.some(g => g.toLowerCase() === genre.Name!.toLowerCase())
      )

      store.setGenreSongs(genre.Id, genreSongs)
    }
  }

  async syncLibrary(options: { scope: 'full' | 'incremental' } = { scope: 'incremental' }, onProgress?: (progress: number) => void): Promise<void> {
    const store = useMusicStore.getState()

    if (options.scope === 'incremental') {
      // True incremental sync - only fetch songs changed since last sync
      const lastSync = store.lastSyncCompleted

      // Always refresh genres (they might have new ones)
      const genres = await this.getGenres(false)

      // Fetch only songs modified since last sync (or recent songs if no last sync)
      let changedSongs: BaseItemDto[] = []

      if (lastSync) {
        // Get songs modified since last sync
        let startIndex = 0
        let hasMore = true

        while (hasMore) {
          const result = await this.getSongs({
            minDateLastSaved: new Date(lastSync),
            limit: API_PAGE_LIMIT,
            startIndex
          }, true) // Cache bust to ensure fresh data

          const items = result.Items || []
          changedSongs.push(...items)

          hasMore = items.length === API_PAGE_LIMIT
          startIndex += API_PAGE_LIMIT

          // Safety limit
          if (startIndex > 10000) break
        }
      } else {
        // First sync - get recent songs to start the cache
        const result = await this.getSongs({
          limit: ARTIST_FETCH_LIMIT,
          sortBy: ['DateLastSaved'],
          sortOrder: 'Descending'
        })
        changedSongs = result.Items || []
      }

      // Convert to lightweight format
      const lightweightChangedSongs: LightweightSong[] = changedSongs.map(song => ({
        Id: song.Id,
        Name: song.Name,
        AlbumArtist: song.AlbumArtist,
        ArtistItems: song.ArtistItems,
        Album: song.Album,
        AlbumId: song.AlbumId,
        IndexNumber: song.IndexNumber,
        ProductionYear: song.ProductionYear,
        PremiereDate: song.PremiereDate,
        RunTimeTicks: song.RunTimeTicks,
        Genres: song.Genres
      }))

      // Merge with existing cache (avoid duplicates)
      const existingSongs = store.songs
      const existingIds = new Set(existingSongs.map(s => s.Id))
      const newSongs = lightweightChangedSongs.filter(song => !existingIds.has(song.Id))
      const mergedSongs = [...existingSongs, ...newSongs]

      // Update the cache with error handling
      try {
        store.setSongs(mergedSongs)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          throw new Error('Storage quota exceeded. Please clear some data or use a smaller sync scope.')
        }
        throw error
      }

      // Optimize: only update genres that contain new songs
      const affectedGenres = new Set<string>()
      newSongs.forEach(song => {
        song.Genres?.forEach(genreName => {
          genres.forEach(genre => {
            if (genre.Name?.toLowerCase() === genreName.toLowerCase()) {
              affectedGenres.add(genre.Id!)
            }
          })
        })
      })

      // Update only affected genres by merging existing + new songs
      const genreUpdatePromises = Array.from(affectedGenres).map(async (genreId) => {
        const genre = genres.find(g => g.Id === genreId)
        if (!genre?.Name) return

        // Get existing genre songs and add new ones
        const existingGenreSongs = store.genreSongs[genreId] || []
        const existingIds = new Set(existingGenreSongs.map(s => s.Id))

        // Add new songs that belong to this genre
        const additionalSongs = newSongs.filter(song =>
          song.Genres?.some(g => g.toLowerCase() === genre.Name!.toLowerCase())
        )

        // Merge without duplicates
        const updatedGenreSongs = [...existingGenreSongs, ...additionalSongs]
        store.setGenreSongs(genreId, updatedGenreSongs)
      })

      await Promise.all(genreUpdatePromises)
      return
    }

    // Full sync - clear everything and rebuild
    // Optimized: fetch all songs ONCE and distribute to genres
    this.clearGenresCache()
    store.clearGenreSongs()

    logger.log('[syncLibrary] Full sync: fetching all songs...')
    const allSongs = await this.fetchAllSongsLightweight(onProgress)
    logger.log(`[syncLibrary] Fetched ${allSongs.length} songs`)

    // Build verified genre list from actual song metadata
    const genres = this.buildGenresFromSongs(allSongs)
    logger.log(`[syncLibrary] Found ${genres.length} genres in songs`)

    // Update genre cache and timestamps
    const now = Date.now()
    store.setGenres(genres)
    useMusicStore.setState({
      genresLastUpdated: now,
      genresLastChecked: now
    })
    this.genresCache = genres

    // Update main songs cache
    store.setSongs(allSongs)

    // Distribute songs to genre caches (no additional fetches!)
    this.distributeSongsToGenres(allSongs, genres, store)
    logger.log('[syncLibrary] Full sync complete')
  }

  async search(query: string, limit: number = 20, filters?: { genres?: string[]; years?: number[] }): Promise<SearchResult> {
    // Normalize quotes in the query for flexible matching
    const normalizedQuery = query ? normalizeQuotes(query.trim()) : ''
    const hasQuery = normalizedQuery.length > 0

    // Jellyfin API typically requires 3+ characters for artist search
    // For short queries, we'll fetch all artists and filter client-side
    const queryLength = normalizedQuery.length
    const shouldFetchAllArtists = hasQuery && queryLength < 3

    // Build server-side filter options
    const serverFilters: GetItemsOptions = {}
    if (filters?.genres?.length) {
      serverFilters.genres = filters.genres
    }
    if (filters?.years?.length) {
      serverFilters.years = filters.years
    }

    const searchOptions: GetItemsOptions = {
      limit,
      includeItemTypes: ['MusicAlbum', 'Playlist', 'Audio'],
      recursive: true,
      ...serverFilters,
    }

    // Always add searchTerm if there's a query (for albums, playlists, songs)
    // For artists, we handle short queries separately by fetching all and filtering client-side
    if (hasQuery) {
      searchOptions.searchTerm = normalizedQuery
      // Only include MusicArtist in server search if query is 3+ chars (API requirement)
      // For shorter queries, we'll fetch all artists separately and filter client-side
      if (queryLength >= 3) {
        searchOptions.includeItemTypes = ['MusicArtist', 'MusicAlbum', 'Playlist', 'Audio']
      }
    }

    // Use /Items? with buildQueryString to get full item data with all fields needed for filtering
    const queryString = this.buildQueryString(searchOptions)

    const allResults = await this.request<ItemsResult>(`/Items?${queryString}`)
    
    // Separate results by type
    let artists: BaseItemDto[] = []
    const albums: BaseItemDto[] = []
    const playlists: BaseItemDto[] = []
    const songs: BaseItemDto[] = []
    const songIds = new Set<string>() // Track song IDs to deduplicate
    
    allResults.Items.forEach(item => {
      if (item.Type === 'MusicArtist') {
        artists.push(item)
      } else if (item.Type === 'MusicAlbum') {
        albums.push(item)
      } else if (item.Type === 'Playlist') {
        playlists.push(item)
      } else if (item.Type === 'Audio') {
        songs.push(item)
        songIds.add(item.Id)
      }
    })

    // If query is short (< 3 chars), fetch all artists and filter client-side
    if (shouldFetchAllArtists) {
      try {
        const allArtistsResult = await this.getArtists({ limit: ARTIST_FETCH_LIMIT })
        const queryLower = normalizedQuery.toLowerCase()
        
        // Filter artists client-side with normalized matching
        artists = (allArtistsResult.Items || []).filter(artist => {
          const artistName = normalizeQuotes(artist.Name || '')
          return artistName.toLowerCase().includes(queryLower)
        })
      } catch (error) {
        logger.error('Failed to fetch all artists for short query:', error)
        // Keep the empty artists array if fetch fails
      }
    }

    // If there's a search query, also fetch songs from matching artists (batched into single call)
    if (hasQuery && artists.length > 0) {
      const queryLower = normalizedQuery.toLowerCase()

      // Filter artists that match the query (case-insensitive, with normalized quotes)
      const matchingArtists = artists.filter(artist => {
        const artistName = normalizeQuotes(artist.Name || '')
        return artistName.toLowerCase().includes(queryLower)
      })

      // Batch fetch songs from all matching artists in a single API call
      if (matchingArtists.length > 0) {
        try {
          const artistIds = matchingArtists.map(a => a.Id)
          const query = this.buildQueryString({
            artistIds,
            includeItemTypes: ['Audio'],
            recursive: true,
          })
          const artistSongsResult = await this.request<ItemsResult>(`/Items?${query}`)

          // Add songs, deduplicating by ID
          artistSongsResult.Items.forEach(song => {
            if (!songIds.has(song.Id)) {
              songs.push(song)
              songIds.add(song.Id)
            }
          })
        } catch (err) {
          logger.error('Failed to fetch songs for matching artists:', err)
        }
      }
    }

    return {
      Artists: { Items: artists, TotalRecordCount: artists.length, StartIndex: 0 },
      Albums: { Items: albums, TotalRecordCount: albums.length, StartIndex: 0 },
      Playlists: { Items: playlists, TotalRecordCount: playlists.length, StartIndex: 0 },
      Songs: { Items: songs, TotalRecordCount: songs.length, StartIndex: 0 },
    }
  }

  async getRecentlyAdded(limit: number = 20): Promise<ItemsResult> {
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    // Use /Items endpoint instead of /Items/Latest for better Limit parameter support
    const query = this.buildQueryString({
      limit,
      includeItemTypes: ['MusicAlbum'],
      recursive: true,
      sortBy: ['DateCreated'],
      sortOrder: 'Descending',
    })
    const result = await this.request<ItemsResult>(`/Items?${query}`)
    return result
  }

  async getRecentlyPlayed(limit: number = 20): Promise<ItemsResult> {
    if (!this.userId || !this.baseUrl) {
      throw new Error('Not authenticated')
    }
    const query = new URLSearchParams({
      Limit: limit.toString(),
      IncludeItemTypes: 'Audio',
      Recursive: 'true',
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      Filters: 'IsPlayed',
      UserId: this.userId,
      Fields: 'PrimaryImageAspectRatio,Genres', // Include Genres for recommendations
    })
    const result = await this.request<ItemsResult>(`/Items?${query}`)
    return result
  }

  async getAlbumTracks(albumId: string): Promise<BaseItemDto[]> {
    // Ensure we request Genres field so recommendations can work
    const query = new URLSearchParams({
      ParentId: albumId,
      IncludeItemTypes: 'Audio',
      SortBy: 'ParentIndexNumber,IndexNumber',
      SortOrder: 'Ascending',
      UserId: this.userId,
      Fields: 'PrimaryImageAspectRatio,Genres', // Include Genres for recommendations
    })
    const result = await this.request<ItemsResult>(`/Items?${query}`)
    return result.Items
  }

  async getArtistItems(artistId: string): Promise<{ albums: BaseItemDto[], songs: BaseItemDto[] }> {
    const query = new URLSearchParams({
      ArtistIds: artistId,
      IncludeItemTypes: 'MusicAlbum,Audio',
      Recursive: 'true',
      UserId: this.userId,
      Fields: 'PrimaryImageAspectRatio,Genres', // Include Genres for recommendations
    })
    const result = await this.request<ItemsResult>(`/Items?${query}`)
    
    const albums: BaseItemDto[] = []
    const songs: BaseItemDto[] = []
    
    result.Items.forEach(item => {
      if (item.Type === 'MusicAlbum') {
        albums.push(item)
      } else if (item.Type === 'Audio') {
        songs.push(item)
      }
    })

    return { albums, songs }
  }

  async getPlaylists(options: GetItemsOptions = {}): Promise<ItemsResult> {
    const query = this.buildQueryString({
      ...options,
      includeItemTypes: ['Playlist'],
      recursive: true,
    })
    return this.request<ItemsResult>(`/Items?${query}`)
  }

  async markItemAsPlayed(itemId: string): Promise<void> {
    if (!this.userId || !this.baseUrl || !itemId) {
      throw new Error('Not authenticated or invalid item ID')
    }
    try {
      await this.request(`/Users/${this.userId}/PlayedItems/${itemId}`, {
        method: 'POST',
      })
    } catch (error) {
      // Log error but don't throw - playback should continue even if reporting fails
      logger.warn('Failed to mark item as played:', error)
    }
  }

  async getLyrics(itemId: string): Promise<string | null> {
    if (!this.userId || !this.baseUrl || !itemId) {
      return null
    }
    try {
      // Try multiple endpoint formats - Jellyfin may use different paths
      const endpoints = [
        `/Items/${itemId}/Lyrics`,
        `/Items/${itemId}/RemoteLyrics`,
        `/Audio/${itemId}/Lyrics`,
      ]
      
      let lastError: string | null = null
      
      for (const endpoint of endpoints) {
        const query = new URLSearchParams({
          UserId: this.userId,
        })
        const url = `${this.baseUrl}${endpoint}?${query}`
        
        try {
          const response = await fetch(url, {
            headers: this.getHeaders(),
          })
          
          if (response.ok) {
            const data = await response.json()

            // Jellyfin lyrics API can return different formats
            interface LyricsLine {
              Text?: string
              Start?: number
            }
            if (data.Lyrics && Array.isArray(data.Lyrics) && data.Lyrics.length > 0) {
              const lyricsText = (data.Lyrics as LyricsLine[]).map((line) => line.Text || '').join('\n')
              return lyricsText
            } else if (typeof data === 'string') {
              return data
            } else if (data.Text) {
              return data.Text
            }
          } else if (response.status === 404) {
            lastError = `404 for ${endpoint}`
            continue // Try next endpoint
          } else {
            const errorText = await response.text().catch(() => '')
            lastError = `${response.status}: ${errorText}`
            continue // Try next endpoint
          }
        } catch (fetchError) {
          lastError = fetchError instanceof Error ? fetchError.message : String(fetchError)
          continue // Try next endpoint
        }
      }
      
      // All endpoints failed
      return null
    } catch (error) {
      // Return null if lyrics don't exist or there's an error
      logger.warn('[getLyrics] Failed to fetch lyrics:', error)
      return null
    }
  }
}

export const jellyfinClient = new JellyfinClient()

