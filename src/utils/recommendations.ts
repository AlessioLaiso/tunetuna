import type { BaseItemDto } from '../api/types'
import { jellyfinClient } from '../api/jellyfin'

interface RecommendationOptions {
  currentTrack: BaseItemDto
  queue: BaseItemDto[]
  recentQueue: BaseItemDto[]
  lastPlayedTrack?: BaseItemDto | null
}

export async function getRecommendedSongs({
  currentTrack,
  queue,
  recentQueue,
  lastPlayedTrack,
}: RecommendationOptions): Promise<BaseItemDto[]> {
  const isDev = (import.meta as any)?.env?.DEV ?? false
  if (!currentTrack) {
    if (isDev) {
      console.log('[Recommendations] No current track')
    }
    return []
  }

  try {
    const genres = currentTrack.Genres || []
  const year = currentTrack.ProductionYear || currentTrack.PremiereDate
    ? new Date(currentTrack.PremiereDate || '').getFullYear()
    : null

  if (isDev) {
    console.log('[Recommendations] ===== GENRE MATCHING DEBUG =====')
    console.log('[Recommendations] Current track:', {
      name: currentTrack.Name,
      id: currentTrack.Id,
      genres: genres,
      genresCount: genres.length,
      year,
      albumArtist: currentTrack.AlbumArtist,
      artistItems: currentTrack.ArtistItems,
    })
  }
  
  if (genres.length === 0 && isDev) {
    console.error('[Recommendations] Current track has no genres; falling back to non-genre strategies.')
  }

  // Get genre IDs first (separate real IDs from synthetic ones)
  const genreIds: string[] = []
  const syntheticGenreNames: string[] = []
  if (genres.length > 0) {
    try {
      const allGenres = await jellyfinClient.getGenres()
      if (isDev) {
        console.log(`[Recommendations] Found ${allGenres.length} total genres in library`)
        console.log('[Recommendations] Looking for genres:', genres.slice(0, 3))
      }
      
      for (const genreName of genres.slice(0, 3)) {
        const genre = allGenres.find(g => 
          g.Name?.toLowerCase() === genreName.toLowerCase()
        )
        if (isDev) {
          console.log('[Recommendations] Genre match candidate:', {
            requested: genreName,
            found: !!genre,
            id: genre?.Id,
            name: genre?.Name,
            isSynthetic: genre?.Id?.startsWith('synthetic-'),
          })
        }
        if (genre?.Id) {
          if (genre.Id.startsWith('synthetic-')) {
            // Synthetic genre - can't query by ID, will filter by name
            syntheticGenreNames.push(genreName)
            if (isDev) {
              console.log(`[Recommendations] Genre "${genreName}" is synthetic, will filter by name`)
            }
          } else {
            // Real genre ID from API
            genreIds.push(genre.Id)
            if (isDev) {
              console.log(`[Recommendations] Genre "${genreName}" has real ID: ${genre.Id}`)
            }
          }
        } else {
          // Genre not found at all - treat as synthetic
          syntheticGenreNames.push(genreName)
          if (isDev) {
            console.warn(
              `[Recommendations] Genre "${genreName}" not found in library genres, treating as synthetic`,
            )
          }
        }
      }
      
      if (isDev) {
        console.log('[Recommendations] Genre matching results:', {
          realGenreIds: genreIds,
          syntheticGenreNames,
          totalGenres: genres.length,
        })
      }
    } catch (error) {
      if (isDev) {
        console.error('[Recommendations] Failed to get genre IDs:', error)
      }
    }
  } else if (isDev) {
    console.warn('[Recommendations] No genres to match - will use fallback strategies')
  }

  // If no real genre IDs found (only synthetic or none), handle differently
  if (genreIds.length === 0 && syntheticGenreNames.length > 0) {
    // We have genre names but no API genre IDs - query all songs and filter by genre name
    if (isDev) {
      console.log('[Recommendations] Using genre name filtering (synthetic genres)')
    }
    
    try {
      let yearMatchedSongs: BaseItemDto[] = []
      const yearMatchedIds = new Set<string>()
      const MIN_SONGS_NEEDED = 20
      
      // Get songs with year filter if available - progressive expansion
      if (year && !isNaN(year)) {
        const yearRanges = [
          { range: 3, years: [year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3] },
          { range: 5, years: [year - 5, year - 4, year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3, year + 4, year + 5] },
          { range: 7, years: [year - 7, year - 6, year - 5, year - 4, year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3, year + 4, year + 5, year + 6, year + 7] },
          { range: 10, years: [year - 10, year - 9, year - 8, year - 7, year - 6, year - 5, year - 4, year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3, year + 4, year + 5, year + 6, year + 7, year + 8, year + 9, year + 10] },
        ]
        
        // Try each year range progressively, only expanding if we don't have enough
        for (const { range, years } of yearRanges) {
          if (yearMatchedSongs.length >= MIN_SONGS_NEEDED && range > 3) {
            if (isDev) {
              console.log(
                `[Recommendations] Already have ${yearMatchedSongs.length} year-matched songs, skipping year range ±${range}`,
              )
            }
            break
          }
          
          const result = await jellyfinClient.getSongs({ years, limit: 300 })
          const songs = result.Items || []
          
          // Filter by genre and add new matches
          const matches = songs.filter(song => 
            song.Genres?.some(g => syntheticGenreNames.some(cg => cg.toLowerCase() === g.toLowerCase())) &&
            !yearMatchedIds.has(song.Id)
          )
          
          matches.forEach(song => {
            yearMatchedSongs.push(song)
            yearMatchedIds.add(song.Id)
          })
          if (isDev) {
            console.log(
              `[Recommendations] Year range ±${range} returned ${matches.length} genre-matched songs (total: ${yearMatchedSongs.length})`,
            )
          }
          
          if (yearMatchedSongs.length >= MIN_SONGS_NEEDED) {
            if (isDev) {
              console.log(
                `[Recommendations] Have enough year-matched songs (${yearMatchedSongs.length}), stopping expansion`,
              )
            }
            break
          }
        }
      }
      
      // Only get songs without year filter if we still don't have enough
      let combined: BaseItemDto[] = []
      if (year && !isNaN(year) && yearMatchedSongs.length < MIN_SONGS_NEEDED) {
        if (isDev) {
          console.log(
            `[Recommendations] Only have ${yearMatchedSongs.length} year-matched songs, getting additional without year filter`,
          )
        }
        const result = await jellyfinClient.getSongs({ limit: 500 })
        const allGenreSongs = (result.Items || []).filter(song => 
          song.Genres?.some(g => syntheticGenreNames.some(cg => cg.toLowerCase() === g.toLowerCase())) &&
          !yearMatchedIds.has(song.Id)
        )
        combined = [...yearMatchedSongs, ...allGenreSongs]
        if (isDev) {
          console.log(
            `[Recommendations] Combined: ${combined.length} total (${yearMatchedSongs.length} with year match, ${allGenreSongs.length} without)`,
          )
        }
      } else if (year && !isNaN(year)) {
        // We have enough year-matched songs
        combined = yearMatchedSongs
        if (isDev) {
          console.log(`[Recommendations] Using only year-matched songs: ${combined.length} songs`)
        }
      } else {
        // No year available, get all genre-matched songs
        const result = await jellyfinClient.getSongs({ limit: 500 })
        combined = (result.Items || []).filter(song =>
          song.Genres?.some(g => syntheticGenreNames.some(cg => cg.toLowerCase() === g.toLowerCase()))
        )
        if (isDev) {
          console.log(
            `[Recommendations] No year filter (no year data) returned ${combined.length} genre-matched songs`,
          )
        }
      }
      
      
      // Deduplicate and filter recent
      const unique = Array.from(new Map(combined.map(song => [song.Id, song])).values())
      const recentIds = new Set([
        currentTrack.Id,
        ...queue.map(s => s.Id),
        ...recentQueue.map(s => s.Id),
      ])
      const filtered = unique.filter(song => !recentIds.has(song.Id))
      
      // Prioritize by year if year is available
      let prioritized = filtered
      if (year && !isNaN(year)) {
        prioritized = filtered.sort((a, b) => {
          const aYear = a.ProductionYear || (a.PremiereDate ? new Date(a.PremiereDate).getFullYear() : null)
          const bYear = b.ProductionYear || (b.PremiereDate ? new Date(b.PremiereDate).getFullYear() : null)
          if (aYear && !bYear) return -1
          if (!aYear && bYear) return 1
          if (!aYear && !bYear) return 0
          if (!aYear || !bYear) return 0 // Type guard
          return Math.abs(aYear - year) - Math.abs(bYear - year)
        })
      }
      
      if (prioritized.length > 0 && isDev) {
        console.log(`[Recommendations] Found ${prioritized.length} songs by genre name filtering`)
        return prioritized.slice(0, 10)
      }
    } catch (error) {
      console.error('[Recommendations] Genre name filtering failed:', error)
    }
  }
  
  // If no genres found at all, use fallback strategies
  // BUT: Only use fallback if we truly have NO genre information
  // If we have genre names but they're synthetic, we should have handled that above
    if (genreIds.length === 0 && syntheticGenreNames.length === 0) {
    if (isDev) {
      console.error('[Recommendations] No genre IDs or names found. Using fallback strategies.')
      console.log(
        '[Recommendations] No genre IDs found, using fallback strategies (these will not filter by genre).',
      )
    }
    
    // Fallback: Try to get recommendations by artist, album, or year
    // BUT: Try to filter by genre name if we have it, even if it's not in the library
    const fallbackSongs: BaseItemDto[] = []
    const artistId = currentTrack.AlbumArtist || currentTrack.ArtistItems?.[0]?.Id
    const albumId = currentTrack.AlbumId
    
    try {
      // Strategy 1: Same artist, but try to filter by genre if we have genre names
      // NOTE: Only use this if we truly have no genre info, otherwise it's too narrow
      if (artistId && genres.length === 0) {
        const result = await jellyfinClient.getSongs({
          artistIds: [artistId],
          limit: 50, // Get fewer - we want variety, not just same artist
        })
        let artistSongs = (result.Items || []).filter(song => song.Id !== currentTrack.Id)
        
        // Shuffle to avoid always getting the same songs
        const shuffled = [...artistSongs].sort(() => Math.random() - 0.5)
        fallbackSongs.push(...shuffled.slice(0, 20)) // Limit to 20 to allow other strategies
        if (isDev) {
          console.log(
            `[Recommendations] Fallback: Found ${artistSongs.length} songs by same artist (limited to 20, shuffled)`,
          )
        }
      } else if (artistId && genres.length > 0) {
        // If we have genre names but no genre IDs, try to get songs by genre name from any artist
        if (isDev) {
          console.log(
            '[Recommendations] Fallback: Skipping same-artist strategy since we have genre names to match',
          )
        }
      }
      
      // Strategy 2: Same album
      if (albumId && fallbackSongs.length < 10) {
        const result = await jellyfinClient.getSongs({
          albumIds: [albumId],
          limit: 50,
        })
        const albumSongs = (result.Items || []).filter(song => song.Id !== currentTrack.Id)
        fallbackSongs.push(...albumSongs)
        if (isDev) {
          console.log(
            `[Recommendations] Fallback: Found ${albumSongs.length} songs from same album`,
          )
        }
      }
      
      // Strategy 3: Similar year (if year available), but try to filter by genre
      if (year && !isNaN(year) && fallbackSongs.length < 10) {
        const yearRanges = [
          { range: 3, years: [year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3] },
          { range: 5, years: [year - 5, year - 4, year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3, year + 4, year + 5] },
        ]
        
        for (const { range, years } of yearRanges) {
          const result = await jellyfinClient.getSongs({
            years,
            limit: 200, // Get more to filter from
          })
          let yearSongs = (result.Items || []).filter(song => song.Id !== currentTrack.Id)
          
          // If we have genre names, try to filter by them
          if (genres.length > 0) {
            const genreFiltered = yearSongs.filter(song =>
              song.Genres?.some(g => genres.some(cg => cg.toLowerCase() === g.toLowerCase()))
            )
            if (genreFiltered.length > 0 && isDev) {
              console.log(
                `[Recommendations] Fallback: Found ${genreFiltered.length} songs from ±${range} years AND matching genre`,
              )
              yearSongs = genreFiltered
            }
          }
          
          fallbackSongs.push(...yearSongs)
          if (isDev) {
            console.log(
              `[Recommendations] Fallback: Found ${yearSongs.length} songs from ±${range} years`,
            )
          }
          if (fallbackSongs.length >= 20) break
        }
      }
      
      // Deduplicate and filter
      const uniqueFallback = Array.from(
        new Map(fallbackSongs.map(song => [song.Id, song])).values()
      )
      
      const recentIds = new Set([
        currentTrack.Id,
        ...queue.map(s => s.Id),
        ...recentQueue.map(s => s.Id),
      ])
      
      const filtered = uniqueFallback.filter(song => !recentIds.has(song.Id))
      
      // Final check: if we have genre names, ensure returned songs match
      if (genres.length > 0 && filtered.length > 0) {
        const genreMatchedFallback = filtered.filter(song =>
          song.Genres?.some(g => genres.some(cg => cg.toLowerCase() === g.toLowerCase()))
        )
        if (genreMatchedFallback.length > 0) {
          if (isDev) {
            console.log(
              `[Recommendations] Fallback: Filtered to ${genreMatchedFallback.length} songs that match genre`,
            )
          }
          // Shuffle before returning
          const shuffled = [...genreMatchedFallback].sort(() => Math.random() - 0.5)
          const result = shuffled.slice(0, 10)
          console.log(`[Recommendations] Fallback: Returning ${result.length} genre-matched recommendations`)
          return result
        } else {
          if (isDev) {
            console.error(
              `[Recommendations] CRITICAL: Fallback found ${filtered.length} songs but NONE match genre ${genres.join(', ')}!`,
            )
            console.error(
              '[Recommendations] First 5 fallback songs and their genres:',
              filtered.slice(0, 5).map(s => ({ name: s.Name, genres: s.Genres })),
            )
          }
          // Don't return non-matching songs if we have genre info
          return []
        }
      }
      
      if (filtered.length > 0 && isDev) {
        console.warn(
          `[Recommendations] Fallback: Returning ${Math.min(
            filtered.length,
            10,
          )} recommendations WITHOUT genre filtering (no genre info available)`,
        )
        // Get a larger pool for better randomization, then pick 10 random songs
        const poolSize = Math.min(filtered.length, 100) // Use up to 100 songs for randomization
        const pool = filtered.slice(0, poolSize)
        
        // Fisher-Yates shuffle for proper randomization
        const shuffled = [...pool]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        
        return shuffled.slice(0, 10)
      }
      
      // If fallback strategies didn't find enough songs, get recently added songs from library
      if (filtered.length === 0) {
        console.log('[Recommendations] Fallback: No songs found from fallback strategies, getting recently added songs from library')
        try {
          // Get recently added songs (sorted by DateCreated descending)
          const result = await jellyfinClient.getSongs({
            limit: 100,
            sortBy: ['DateCreated'],
            sortOrder: 'Descending',
          })
          const songs = (result.Items || []).filter(song => song.Id !== currentTrack.Id)
          
          // Filter out recent songs
          const recentIds = new Set([
            currentTrack.Id,
            ...queue.map(s => s.Id),
            ...recentQueue.map(s => s.Id),
          ])
          const filteredRandom = songs.filter(song => !recentIds.has(song.Id))
          
          if (filteredRandom.length > 0) {
            // Fisher-Yates shuffle for proper randomization
            const shuffled = [...filteredRandom]
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
            }
            
            const result = shuffled.slice(0, 10)
            if (isDev) {
              console.log(
                `[Recommendations] Fallback: Returning ${result.length} random songs from recently added`,
              )
            }
            return result
          }
        } catch (error) {
          if (isDev) {
            console.error('[Recommendations] Failed to get recently added songs:', error)
          }
        }
      }
    } catch (error) {
      if (isDev) {
        console.error('[Recommendations] Fallback strategies failed:', error)
      }
    }
    
    if (isDev) {
      console.warn('[Recommendations] All fallback strategies failed, returning empty')
    }
    return []
  }

  if (isDev) {
    console.log('[Recommendations] Found genre IDs:', genreIds)
  }

  // Get songs from same genre using genre IDs, optionally filtered by year
  const genreSongs: BaseItemDto[] = []
  if (genreIds.length > 0) {
    try {
      for (const genreId of genreIds) {
        let genreMatches: BaseItemDto[] = []
        
        if (year && !isNaN(year)) {
          // Progressive year range expansion - start with ±3 years, expand only if needed
          const yearRanges = [
            { range: 3, years: [year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3] },
            { range: 5, years: [year - 5, year - 4, year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3, year + 4, year + 5] },
            { range: 7, years: [year - 7, year - 6, year - 5, year - 4, year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3, year + 4, year + 5, year + 6, year + 7] },
            { range: 10, years: [year - 10, year - 9, year - 8, year - 7, year - 6, year - 5, year - 4, year - 3, year - 2, year - 1, year, year + 1, year + 2, year + 3, year + 4, year + 5, year + 6, year + 7, year + 8, year + 9, year + 10] },
          ]
          
          const yearMatchedSongs: BaseItemDto[] = []
          const yearMatchedIds = new Set<string>()
          const MIN_SONGS_NEEDED = 20 // Minimum songs we want before expanding range
          
          // Try each year range progressively, only expanding if we don't have enough
          for (const { range, years } of yearRanges) {
            // If we already have enough songs from previous ranges, skip this range
            if (yearMatchedSongs.length >= MIN_SONGS_NEEDED && range > 3) {
              if (isDev) {
                console.log(
                  `[Recommendations] Already have ${yearMatchedSongs.length} songs, skipping year range ±${range}`,
                )
              }
              break
            }
            
            const options = {
              genreIds: [genreId],
              years,
              limit: 200,
            }
            
            const result = await jellyfinClient.getSongs(options)
            const songs = result.Items || []
            
            // Filter to ensure genre matches exactly
            const matches = songs.filter(song => 
              song.Genres?.some(g => genres.some(cg => cg.toLowerCase() === g.toLowerCase()))
            )
            
            // Add new matches (avoid duplicates)
            matches.forEach(song => {
              if (!yearMatchedIds.has(song.Id)) {
                yearMatchedSongs.push(song)
                yearMatchedIds.add(song.Id)
              }
            })
            if (isDev) {
              console.log(
                `[Recommendations] Year range ±${range} returned ${matches.length} genre-matched songs (total accumulated: ${yearMatchedSongs.length})`,
              )
            }
            
            // If we have enough songs, stop expanding
            if (yearMatchedSongs.length >= MIN_SONGS_NEEDED) {
              if (isDev) {
                console.log(
                  `[Recommendations] Have enough songs (${yearMatchedSongs.length}), stopping year range expansion`,
                )
              }
              break
            }
          }
          
          // Only get songs without year filter if we still don't have enough
          if (yearMatchedSongs.length < MIN_SONGS_NEEDED) {
            if (isDev) {
              console.log(
                `[Recommendations] Only have ${yearMatchedSongs.length} year-matched songs, getting additional genre-matched songs without year filter`,
              )
            }
            const options = {
              genreIds: [genreId],
              limit: 500, // Get more songs
            }
            const result = await jellyfinClient.getSongs(options)
            const songs = result.Items || []
            const additionalMatches = songs.filter(song => 
              song.Genres?.some(g => genres.some(cg => cg.toLowerCase() === g.toLowerCase())) &&
              !yearMatchedIds.has(song.Id) // Exclude already found songs
            )
            
            // Combine: year-matched first, then others
            genreMatches = [...yearMatchedSongs, ...additionalMatches]
            if (isDev) {
              console.log(
                `[Recommendations] Combined: ${genreMatches.length} total genre-matched songs (${yearMatchedSongs.length} with year match, ${additionalMatches.length} without year match)`,
              )
            }
          } else {
            // We have enough year-matched songs, use only those
            genreMatches = yearMatchedSongs
            if (isDev) {
              console.log(
                `[Recommendations] Using only year-matched songs: ${genreMatches.length} songs (all within year ranges)`,
              )
            }
          }
        } else {
          // No year available, just get genre matches
          const options = {
            genreIds: [genreId],
            limit: 100,
          }
          const result = await jellyfinClient.getSongs(options)
          const songs = result.Items || []
          genreMatches = songs.filter(song =>
            song.Genres?.some(g => genres.some(cg => cg.toLowerCase() === g.toLowerCase()))
          )
          if (isDev) {
            console.log(
              `[Recommendations] No year filter (no year data) returned ${genreMatches.length} genre-matched songs`,
            )
          }
        }
        
        genreSongs.push(...genreMatches)
      }
    } catch (error) {
      if (isDev) {
        console.error('[Recommendations] Failed to get genre songs:', error)
      }
    }
  }

  if (isDev) {
    console.log(`[Recommendations] Found ${genreSongs.length} genre-matched songs`)
    // Debug: Check what genres the returned songs actually have
    if (genreSongs.length > 0) {
      const returnedGenres = new Set<string>()
      genreSongs.slice(0, 10).forEach(song => {
        song.Genres?.forEach(g => returnedGenres.add(g.toLowerCase()))
      })
      console.log('[Recommendations] Genres of first 10 returned songs:', Array.from(returnedGenres))
      console.log('[Recommendations] Expected genres:', genres.map(g => g.toLowerCase()))
      
      // Check if any returned songs match the expected genres
      const matchingSongs = genreSongs.filter(song =>
        song.Genres?.some(sg => genres.some(cg => cg.toLowerCase() === sg.toLowerCase())),
      )
      console.log(
        `[Recommendations] Songs that actually match current track genres: ${matchingSongs.length} out of ${genreSongs.length}`,
      )
      
      if (matchingSongs.length === 0 && genreSongs.length > 0) {
        console.warn('[Recommendations] Returned songs do not match current track genres.')
        console.warn(
          '[Recommendations] First 5 returned songs and their genres:',
          genreSongs.slice(0, 5).map(s => ({ name: s.Name, genres: s.Genres })),
        )
      }
    }
    
    if (genreSongs.length === 0) {
      console.warn(
        '[Recommendations] No genre-matched songs found. Check if songs in library have matching genres.',
      )
    }
  }

  // Deduplicate
  const allCandidates = genreSongs
  const uniqueCandidates = Array.from(new Map(allCandidates.map(song => [song.Id, song])).values())
  if (isDev) {
    console.log(`[Recommendations] After deduplication: ${uniqueCandidates.length} unique candidates`)
  }

  // Filter out current track, last played track, songs already in queue or recent queue
  // Also filter out any songs that were previously recommended (marked with _isRecommended)
  const recommendedSongIds = new Set(
    queue.filter((s: any) => s._isRecommended).map((s: any) => s.Id),
  )
  const recentIds = new Set([
    currentTrack.Id,
    ...(lastPlayedTrack ? [lastPlayedTrack.Id] : []),
    ...queue.map(s => s.Id),
    ...recentQueue.map(s => s.Id),
    ...recommendedSongIds, // Also exclude previously recommended songs
  ])
  if (isDev) {
    console.log(
      `[Recommendations] Filtering out ${recentIds.size} recent songs (current + lastPlayed + queue + recentQueue + previouslyRecommended)`,
    )
  }

  // Ensure all IDs are strings for consistent comparison
  const recentIdsStr = new Set(Array.from(recentIds).map(id => String(id)))
  const filtered = uniqueCandidates.filter(song => {
    const songIdStr = String(song.Id)
    const shouldFilter = recentIdsStr.has(songIdStr)
    return !shouldFilter
  })
  const filteredOut = uniqueCandidates.length - filtered.length
  if (isDev) {
    console.log(
      `[Recommendations] After filtering recent songs: ${filtered.length} candidates (filtered out ${filteredOut})`,
    )
    if (filtered.length === 0 && uniqueCandidates.length > 0) {
      console.warn('[Recommendations] All candidates were filtered out as recent songs!')
    }
  }

  // Only return songs that match the genre - no non-genre matches
  const genreMatched = filtered.filter(song =>
    song.Genres?.some(sg => genres.some(cg => cg.toLowerCase() === sg.toLowerCase())),
  )
  if (isDev) {
    console.log(`[Recommendations] Genre-matched songs: ${genreMatched.length}`)
  }

  // Prioritize artists already in queue (only from user-added songs, not recommended ones)
  const userAddedQueue = queue.filter((s: any) => !s._isRecommended)
  if (isDev) {
    console.log(
      `[Recommendations] User-added queue songs: ${userAddedQueue.length} (total queue: ${queue.length})`,
    )
  }
  
  const queueArtistIds = new Set(
    userAddedQueue.map(s => s.AlbumArtist || s.ArtistItems?.[0]?.Id).filter(Boolean),
  )
  if (isDev) {
    console.log(`[Recommendations] Queue artist IDs: ${queueArtistIds.size} unique artists`)
  }

  // Extract grouping tags from user-added queue songs
  const queueGroupings = new Set(
    userAddedQueue.map(s => s.Grouping).filter((g): g is string => Boolean(g)),
  )
  if (isDev) {
    console.log(
      `[Recommendations] Queue groupings: ${queueGroupings.size} unique groupings`,
      queueGroupings.size > 0 ? Array.from(queueGroupings) : 'none',
    )
  }

  const prioritizeByArtist = (songs: BaseItemDto[]) => {
    return songs.sort((a, b) => {
      const aArtistId = a.AlbumArtist || a.ArtistItems?.[0]?.Id
      const bArtistId = b.AlbumArtist || b.ArtistItems?.[0]?.Id
      
      const aInQueue = aArtistId && queueArtistIds.has(aArtistId)
      const bInQueue = bArtistId && queueArtistIds.has(bArtistId)
      
      if (aInQueue && !bInQueue) return -1
      if (!aInQueue && bInQueue) return 1
      return 0
    })
  }

  const prioritizeByGrouping = (songs: BaseItemDto[]) => {
    return songs.sort((a, b) => {
      const aGrouping = a.Grouping
      const bGrouping = b.Grouping
      
      const aMatches = aGrouping && queueGroupings.has(aGrouping)
      const bMatches = bGrouping && queueGroupings.has(bGrouping)
      
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })
  }

  const prioritizeByYear = (songs: BaseItemDto[]) => {
    if (!year || isNaN(year)) return songs
    
    return songs.sort((a, b) => {
      const aYear = a.ProductionYear || (a.PremiereDate ? new Date(a.PremiereDate).getFullYear() : null)
      const bYear = b.ProductionYear || (b.PremiereDate ? new Date(b.PremiereDate).getFullYear() : null)
      
      // Prioritize songs with year data
      if (aYear && !bYear) return -1
      if (!aYear && bYear) return 1
      if (!aYear && !bYear) return 0
      
      // Calculate year difference from target year
      if (!aYear || !bYear) return 0 // Type guard
      const aDiff = Math.abs(aYear - year)
      const bDiff = Math.abs(bYear - year)
      
      // Strongly favor songs within ±3 years
      const aInRange = aDiff <= 3
      const bInRange = bDiff <= 3
      if (aInRange && !bInRange) return -1
      if (!aInRange && bInRange) return 1
      
      // If both in range or both out of range, prefer closer to target year
      return aDiff - bDiff
    })
  }

  // Apply prioritization: first by artist, then by grouping, then by year
  const prioritizedByArtist = prioritizeByArtist(genreMatched)
  const prioritizedByGrouping = prioritizeByGrouping(prioritizedByArtist)
  const prioritized = prioritizeByYear(prioritizedByGrouping)
  if (isDev) {
    console.log(`[Recommendations] After prioritization: ${prioritized.length} songs`)
  }
  
  // Add randomization within priority groups to avoid always recommending the same song
  // Group songs by their priority score (artist match, grouping match, year proximity)
  const priorityGroups = new Map<string, BaseItemDto[]>()
  prioritized.forEach(song => {
    const artistMatch = (() => {
      const songArtistId = song.AlbumArtist || song.ArtistItems?.[0]?.Id
      return songArtistId && queueArtistIds.has(songArtistId) ? 'artist' : 'no-artist'
    })()
    const groupingMatch = song.Grouping && queueGroupings.has(song.Grouping) ? 'grouping' : 'no-grouping'
    const yearScore = (() => {
      if (!year || isNaN(year)) return 'no-year'
      const songYear = song.ProductionYear || (song.PremiereDate ? new Date(song.PremiereDate).getFullYear() : null)
      if (!songYear) return 'no-year'
      const diff = Math.abs(songYear - year)
      if (diff <= 3) return 'year-close' // ±3 years as requested
      if (diff <= 5) return 'year-medium'
      return 'year-far'
    })()
    const key = `${artistMatch}-${groupingMatch}-${yearScore}`
    if (!priorityGroups.has(key)) {
      priorityGroups.set(key, [])
    }
    priorityGroups.get(key)!.push(song)
  })
  
  // Fisher-Yates shuffle function for proper randomization
  // Use multiple passes and add timestamp-based variation for true randomness
  const shuffleArray = <T,>(array: T[]): T[] => {
    if (array.length <= 1) return [...array]
    
    const shuffled = [...array]
    // Multiple shuffle passes for better randomization
    const passes = 3
    for (let pass = 0; pass < passes; pass++) {
      // Add timestamp-based seed variation
      const seed = Date.now() + pass * 1000 + Math.random() * 1000
      for (let i = shuffled.length - 1; i > 0; i--) {
        // Use seed to ensure different results each time
        const random = (Math.sin(seed + i) * 10000) % 1
        const swapIndex = Math.floor(Math.abs(random) * (i + 1))
        // Swap elements
        const temp = shuffled[i]
        shuffled[i] = shuffled[swapIndex]
        shuffled[swapIndex] = temp
      }
    }
    
    // Final pass with Math.random() for additional randomness
    for (let i = shuffled.length - 1; i > 0; i--) {
      const swapIndex = Math.floor(Math.random() * (i + 1))
      // Swap elements
      const temp = shuffled[i]
      shuffled[i] = shuffled[swapIndex]
      shuffled[swapIndex] = temp
    }
    
    if (isDev) {
      if (array.length > 0 && typeof (array[0] as any)?.Name !== 'undefined') {
        const beforeNames = array.slice(0, 5).map((s: any) => s?.Name).join(', ')
        const afterNames = shuffled.slice(0, 5).map((s: any) => s?.Name).join(', ')
        console.log(
          `[Recommendations] Shuffled ${array.length} items. First 5 before: [${beforeNames}], after: [${afterNames}]`,
        )
      } else {
        console.log(`[Recommendations] Shuffled array of ${array.length} items`)
      }
    }
    return shuffled
  }

  // Shuffle within each priority group, then combine
  // Sort priority groups by actual priority (not alphabetically)
  const getPriorityScore = (key: string): number => {
    const parts = key.split('-')
    const artistMatch = parts[0] === 'artist' ? 100 : 0
    const groupingMatch = parts[1] === 'grouping' ? 50 : 0
    const yearScore = parts[2] === 'year-close' ? 30 : 
                     parts[2] === 'year-medium' ? 20 : 
                     parts[2] === 'year-far' ? 10 : 0
    return artistMatch + groupingMatch + yearScore
  }
  
  const shuffledPrioritized: BaseItemDto[] = []
  const sortedKeys = Array.from(priorityGroups.keys()).sort((a, b) => {
    // Sort by priority score (higher first), then alphabetically for same score
    const scoreA = getPriorityScore(a)
    const scoreB = getPriorityScore(b)
    if (scoreA !== scoreB) return scoreB - scoreA // Higher score first
    return a.localeCompare(b) // Alphabetical for same score
  })
  // Don't shuffle priority groups - maintain priority order but shuffle within groups
  if (isDev) {
    console.log(
      '[Recommendations] Priority groups:',
      Array.from(priorityGroups.entries()).map(([k, v]) => ({
        key: k,
        count: v.length,
        priority: getPriorityScore(k),
        firstSong: v[0]?.Name,
      })),
    )
    console.log(
      `[Recommendations] Priority group order (sorted by priority): ${sortedKeys.join(', ')}`,
    )
  }
  for (const key of sortedKeys) {
    const group = priorityGroups.get(key)!
    if (isDev) {
      console.log(
        `[Recommendations] Processing priority group "${key}" with ${group.length} songs. First 3:`,
        group.slice(0, 3).map(s => s.Name),
      )
    }
    // Shuffle the group using Fisher-Yates
    const shuffled = shuffleArray(group)
    if (isDev) {
      console.log('[Recommendations] After shuffle, first 3:', shuffled.slice(0, 3).map(s => s.Name))
    }
    shuffledPrioritized.push(...shuffled)
  }
  if (isDev) {
    console.log(
      `[Recommendations] After randomization within groups: ${shuffledPrioritized.length} songs. First 5:`,
      shuffledPrioritized.slice(0, 5).map(s => s.Name),
    )
  }
  
  // CRITICAL: Shuffle the ENTIRE prioritized list, not just within groups
  // This ensures true randomization even if all songs are in one priority group
  const fullyShuffled = shuffleArray(shuffledPrioritized)
  if (isDev) {
    console.log(
      `[Recommendations] After FULL shuffle of all songs: ${fullyShuffled.length} songs. First 5:`,
      fullyShuffled.slice(0, 5).map(s => s.Name),
    )
  }

  // Avoid playing same artist consecutively
  const lastArtistId = currentTrack.AlbumArtist || currentTrack.ArtistItems?.[0]?.Id
  if (isDev) {
    console.log(`[Recommendations] Current track artist ID: ${lastArtistId || 'none'}`)
  }
  
  let final = fullyShuffled.filter((song, index) => {
    const songArtistId = song.AlbumArtist || song.ArtistItems?.[0]?.Id
    // Allow same artist if it's the only option or if we've skipped a few
    if (index > 2) return true
    return songArtistId !== lastArtistId
  })
  const sameArtistFiltered = shuffledPrioritized.length - final.length
  if (isDev) {
    console.log(
      `[Recommendations] After filtering same artist: ${final.length} songs (filtered out ${sameArtistFiltered} same-artist songs)`,
    )
  }
  
  // Safeguard: If we filtered out all songs, relax the same-artist filter
  if (final.length === 0 && shuffledPrioritized.length > 0) {
    if (isDev) {
      console.warn(
        '[Recommendations] All songs filtered out due to same artist filter. Relaxing filter...',
      )
    }
    // Allow same artist songs if that's all we have
    final = shuffledPrioritized
    console.log(`[Recommendations] Relaxed filter: now ${final.length} songs`)
  }

  // If we filtered out too many, add some back to ensure we have enough recommendations
  if (final.length < 5 && shuffledPrioritized.length > final.length) {
    const sameArtistSongs = shuffledPrioritized.filter(song => {
      const songArtistId = song.AlbumArtist || song.ArtistItems?.[0]?.Id
      return songArtistId === lastArtistId
    })
    const needed = Math.min(5 - final.length, sameArtistSongs.length)
    if (needed > 0) {
      const additional = sameArtistSongs.slice(0, needed)
      final.push(...additional)
      console.log(`[Recommendations] Added back ${additional.length} same-artist songs to reach minimum`)
    }
  }
  
  // Final safeguard: if we still have no results but had candidates, return what we have
  if (final.length === 0 && fullyShuffled.length > 0) {
    if (isDev) {
      console.warn(
        '[Recommendations] Still no results after safeguards, returning fully shuffled list',
      )
    }
    final = fullyShuffled.slice(0, 10)
  }

  // Final safety check: remove current track if it somehow made it through
  const safeResult = final.filter(song => song.Id !== currentTrack.Id)
  if (isDev && safeResult.length !== final.length) {
    console.warn(
      `[Recommendations] Current track ${currentTrack.Name} (${currentTrack.Id}) was in recommendations and has been removed.`,
    )
  }
  
  // Shuffle the entire list for final randomization
  let finalShuffled = shuffleArray(safeResult)
  finalShuffled = shuffleArray(finalShuffled)
  
  // Take first 10 from the shuffled list
  const result = finalShuffled.slice(0, 10)
  if (isDev) {
    console.log(`[Recommendations] Final result: ${result.length} recommendations`)
  }
  
  return result
  } catch (error) {
    if (isDev) {
      console.error('[Recommendations] Error in getRecommendedSongs:', error)
    }
    // Return empty array on error to prevent breaking the app
    // But log it so we know what went wrong
    return []
  }
}

