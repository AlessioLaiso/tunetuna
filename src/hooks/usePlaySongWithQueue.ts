import { useCallback } from 'react'
import { jellyfinClient } from '../api/jellyfin'
import type { BaseItemDto, LightweightSong } from '../api/types'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'

type QueueItem = BaseItemDto | LightweightSong

/**
 * The one way a song row starts playback: plays `clickedSongId` with the whole
 * list as its queue. Shuffle off keeps the list order, so songs before the
 * clicked one land under "previous" and the ones after it show up as "coming
 * up". Shuffle on plays the clicked song first and everything else — the songs
 * that came before it as well as the ones after — shuffled behind it.
 *
 * Rows that already hold the song pass it directly. Lists that only track IDs
 * (stats rankings, the Top 10 chart) pass IDs instead: those are resolved from
 * the library store and only fetched by ID when missing, since these lists can
 * span an artist's whole catalog or a full stats ranking, and fetching every
 * row would be hundreds of requests.
 */
export function usePlaySongWithQueue() {
  const playTrack = usePlayerStore((state) => state.playTrack)

  // Reads the library store on click instead of subscribing to it, so song rows
  // can stay memoised on long lists.
  return useCallback(async (songs: (QueueItem | string)[], clickedSongId: string) => {
    if (songs.length === 0) return

    const songIds = songs.map(s => (typeof s === 'string' ? s : s.Id))
    const byId = new Map<string, QueueItem>(useMusicStore.getState().songs.map(s => [s.Id, s]))
    for (const s of songs) {
      if (typeof s !== 'string') byId.set(s.Id, s)
    }

    const missing = songIds.filter(id => !byId.has(id))
    const fetched = await Promise.all(missing.map(id => jellyfinClient.getSongById(id)))
    for (const song of fetched) {
      if (song) byId.set(song.Id, song)
    }

    const queue = songIds
      .map(id => byId.get(id))
      .filter((s): s is QueueItem => s !== undefined)
    if (!queue.length) return

    const clicked = queue.find(s => s.Id === clickedSongId) || queue[0]
    playTrack(clicked, queue, { shuffle: usePlayerStore.getState().shuffle })
  }, [playTrack])
}
