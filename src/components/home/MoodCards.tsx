import { useMemo, useRef } from 'react'
import { useMusicStore, getGroupingCategories } from '../../stores/musicStore'
import MoodCardItem from './MoodCardItem'
import HorizontalScrollContainer from '../shared/HorizontalScrollContainer'
import type { LightweightSong } from '../../api/types'

/**
 * Simple hash function for seeded random.
 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

/**
 * Get a daily seed for a mood value.
 * Changes once per day to rotate album art.
 */
function getDailySeed(moodValue: string): number {
  const dateStr = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  return hashCode(`${dateStr}-${moodValue}`)
}

/**
 * Capitalize the first letter of a string.
 */
function capitalizeFirst(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Pick a random album ID from songs matching a mood, using a seeded random.
 * Tries to avoid using already-used album IDs if possible.
 */
function pickAlbumForMood(
  moodValue: string,
  songs: LightweightSong[],
  usedAlbumIds: Set<string>
): string | null {
  const moodSongs = songs.filter(s =>
    s.Grouping?.some(g => g.toLowerCase() === `mood_${moodValue.toLowerCase()}`)
  )

  if (moodSongs.length === 0) return null

  // Get songs with album art
  const songsWithAlbum = moodSongs.filter(s => s.AlbumId)
  if (songsWithAlbum.length === 0) return null

  // Try to avoid already used albums
  let candidates = songsWithAlbum.filter(s => !usedAlbumIds.has(s.AlbumId!))
  if (candidates.length === 0) candidates = songsWithAlbum

  // Use seeded random to pick consistently for 24h
  const seed = getDailySeed(moodValue)
  const index = Math.abs(seed) % candidates.length
  return candidates[index].AlbumId!
}

/**
 * Order mood values by recently accessed (most recent first), then alphabetically.
 */
function orderMoodsByRecency(
  moodValues: string[],
  recentlyAccessedMoods: Record<string, number>
): string[] {
  return [...moodValues].sort((a, b) => {
    const timeA = recentlyAccessedMoods[a.toLowerCase()] || 0
    const timeB = recentlyAccessedMoods[b.toLowerCase()] || 0
    if (timeA !== timeB) return timeB - timeA // Most recent first
    return a.localeCompare(b) // Alphabetical tiebreaker
  })
}

/**
 * Reorder items so that a column-flow grid displays them in row-first order.
 * CSS grid-flow-col fills columns first; this reorders so visual reading order is left-to-right, top-to-bottom.
 */
function reorderForRowFlow<T>(items: T[], rows: number): T[] {
  const cols = Math.ceil(items.length / rows)
  const result: T[] = []
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const srcIndex = row * cols + col
      if (srcIndex < items.length) {
        result.push(items[srcIndex])
      }
    }
  }
  return result
}

interface MoodWithAlbum {
  value: string
  name: string
  albumId: string | null
}

/**
 * Mood cards section for the home page.
 * Displays mood tags as cards in a responsive grid/carousel.
 * - Mobile: paginated carousel (snap scroll, no dots)
 * - Desktop: horizontal scroll with chevrons
 */
export default function MoodCards() {
  const { songs, recentlyAccessedMoods } = useMusicStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Get mood category from grouping categories
  const moodCategory = useMemo(() => {
    const categories = getGroupingCategories(songs)
    return categories.find(c => c.key === 'mood')
  }, [songs])

  // Build ordered list of moods with album art
  const moods: MoodWithAlbum[] = useMemo(() => {
    if (!moodCategory || moodCategory.values.length === 0) return []

    const orderedValues = orderMoodsByRecency(moodCategory.values, recentlyAccessedMoods)
    const usedAlbumIds = new Set<string>()

    return orderedValues.map(value => {
      const albumId = pickAlbumForMood(value.toLowerCase(), songs, usedAlbumIds)
      if (albumId) usedAlbumIds.add(albumId)
      return {
        value: value.toLowerCase(),
        name: capitalizeFirst(value),
        albumId,
      }
    })
  }, [moodCategory, songs, recentlyAccessedMoods])

  // Don't render if no moods
  if (moods.length === 0) return null

  // Group moods into pages of 6 (2 rows × 3 columns) for mobile
  const moodsPerPage = 6
  const pages: MoodWithAlbum[][] = []
  for (let i = 0; i < moods.length; i += moodsPerPage) {
    pages.push(moods.slice(i, i + moodsPerPage))
  }

  return (
    <div className="px-4 mb-4">
      {/* Mobile / small screens: horizontal paged carousel */}
      <div className="md:hidden">
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="flex" style={{ width: `${pages.length * 100}%` }}>
            {pages.map((pageMoods, pageIndex) => {
              const rowsNeeded = Math.ceil(pageMoods.length / 3)
              return (
                <div
                  key={pageIndex}
                  className="snap-start flex-shrink-0 w-full"
                  style={{ width: `${100 / pages.length}%` }}
                >
                  <div
                    className="grid grid-cols-3 gap-2"
                    style={{ gridTemplateRows: `repeat(${rowsNeeded}, minmax(0, 1fr))` }}
                  >
                    {pageMoods.map((mood) => (
                      <MoodCardItem
                        key={mood.value}
                        moodValue={mood.value}
                        moodName={mood.name}
                        albumId={mood.albumId}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Medium screens (768-1680px): 4 columns, 2 rows, horizontal scroll */}
      <div className="hidden md:block min-[1680px]:hidden">
        <HorizontalScrollContainer gap={8}>
          <div className="grid grid-rows-2 grid-flow-col gap-2" style={{ gridAutoColumns: 'calc((100% - 24px) / 4)' }}>
            {reorderForRowFlow(moods, 2).map((mood) => (
              <MoodCardItem
                key={mood.value}
                moodValue={mood.value}
                moodName={mood.name}
                albumId={mood.albumId}
              />
            ))}
          </div>
        </HorizontalScrollContainer>
      </div>

      {/* Large screens (>=1680px): 5 columns, 2 rows, horizontal scroll */}
      <div className="hidden min-[1680px]:block">
        <HorizontalScrollContainer gap={8}>
          <div className="grid grid-rows-2 grid-flow-col gap-2" style={{ gridAutoColumns: 'calc((100% - 32px) / 5)' }}>
            {reorderForRowFlow(moods, 2).map((mood) => (
              <MoodCardItem
                key={mood.value}
                moodValue={mood.value}
                moodName={mood.name}
                albumId={mood.albumId}
              />
            ))}
          </div>
        </HorizontalScrollContainer>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
