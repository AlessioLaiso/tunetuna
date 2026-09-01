import { useCallback } from 'react'
import { jellyfinClient } from '../api/jellyfin'
import type { BaseItemDto, LightweightSong } from '../api/types'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'

/**
 * Plays the song at `clickedSongId` with the whole list as its queue — the
 * album-page behavior: songs before the clicked one go under "previous" in the
 * queue sidebar, the ones after it show up as "coming up".
 *
 * Songs already in the library store are reused as-is; only the rest are
 * fetched by ID, since these lists can span an artist's whole catalog or a
 * full stats ranking, and fetching every row would be hundreds of requests.
 */
export function usePlaySongWithQueue() {
  const playTrack = usePlayerStore((state) => state.playTrack)
  const storeSongs = useMusicStore((state) => state.songs)

  return useCallback(async (songIds: string[], clickedSongId: string) => {
    if (songIds.length === 0) return

    const byId = new Map<string, BaseItemDto | LightweightSong>(
      storeSongs.map(s => [s.Id, s]),
    )
    const missing = songIds.filter(id => !byId.has(id))
    const fetched = await Promise.all(missing.map(id => jellyfinClient.getSongById(id)))
    for (const song of fetched) {
      if (song) byId.set(song.Id, song)
    }

    const queue = songIds
      .map(id => byId.get(id))
      .filter((s): s is BaseItemDto | LightweightSong => s !== undefined)
    if (!queue.length) return

    const clicked = queue.find(s => s.Id === clickedSongId) || queue[0]
    playTrack(clicked, queue)
  }, [playTrack, storeSongs])
}
