import { useEffect } from 'react'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import GenreItem from './GenreItem'
import Spinner from '../shared/Spinner'

export default function GenresPage() {
  const { genres, setGenres, setLoading, loading } = useMusicStore()

  useEffect(() => {
    // Use persisted genres from store immediately if available
    if (genres.length > 0) {
      return
    }

    const loadGenres = async () => {
      setLoading('genres', true)
      try {
        // This will use cache if no new tracks, or refresh if needed
        const result = await jellyfinClient.getGenres()
        // Sort alphabetically
        const sorted = (result || []).sort((a, b) => 
          (a.Name || '').localeCompare(b.Name || '')
        )
        setGenres(sorted)
      } catch (error) {
        console.error('Failed to load genres:', error)
        setGenres([])
      } finally {
        setLoading('genres', false)
      }
    }

    loadGenres()
  }, [genres.length, setGenres, setLoading])

  return (
    <div className="pb-20">
      <div className="fixed top-0 left-0 right-0 bg-black z-10" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
        <div className="max-w-[768px] mx-auto">
          <div className="p-4">
          {/* Header with title and loading indicator */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-white">Genres</h1>
            {loading.genres && (
              <div className="w-10 h-10 flex items-center justify-center">
                <Spinner />
              </div>
            )}
            {!loading.genres && <div className="w-10 h-10" />}
          </div>
          </div>
        </div>
      </div>
      <div className="pb-4" style={{ paddingTop: `calc(env(safe-area-inset-top) + 6rem)` }}>
        {genres.length === 0 && !loading.genres && (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <p>No genres found</p>
          </div>
        )}
        {genres.length > 0 && (
          <div className="space-y-2">
            {[...genres].sort((a, b) => 
              (a.Name || '').localeCompare(b.Name || '')
            ).map((genre) => (
              <GenreItem key={genre.Id} genre={genre} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

