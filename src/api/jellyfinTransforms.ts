import type { GetItemsOptions } from './types'

// Fields requested on every /Items query. Kept here next to buildItemsQueryString
// so the query-building logic lives in one pure, testable place.
export const ITEMS_QUERY_FIELDS =
  'PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Genres,Tags,ProductionYear,DateCreated,DateModified,DateLastSaved,AlbumArtist,ArtistItems,Album,AlbumId,ChildCount'

/**
 * Build the query string for a Jellyfin /Items request from the given options.
 *
 * Pure: `userId` is passed in explicitly (the client supplies `this.userId`) so
 * this function has no dependency on the client instance and can be unit-tested.
 */
export function buildItemsQueryString(
  options: GetItemsOptions,
  userId: string,
  cacheBust = false,
): string {
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
  if (options.tags) {
    options.tags.forEach(tag => params.append('Tags', tag))
  }
  if (options.minDateLastSaved) {
    params.append('MinDateLastSaved', options.minDateLastSaved.toISOString())
  }

  params.append('UserId', userId)
  params.append('Fields', ITEMS_QUERY_FIELDS)

  // Add cache-busting timestamp to force fresh data from server
  if (cacheBust) {
    params.append('_t', Date.now().toString())
  }

  return params.toString()
}
