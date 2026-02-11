import { useNavigate } from 'react-router-dom'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'

interface MoodCardItemProps {
  moodValue: string
  moodName: string
  albumId: string | null
}

/**
 * Individual mood card component.
 * Shorter than genre cards, shows mood name and optional album art.
 */
export default function MoodCardItem({ moodValue, moodName, albumId }: MoodCardItemProps) {
  const navigate = useNavigate()
  const { recordMoodAccess } = useMusicStore()

  const handleClick = () => {
    recordMoodAccess(moodValue)
    navigate(`/mood/${encodeURIComponent(moodValue)}`)
  }

  return (
    <button
      onClick={handleClick}
      className="bg-zinc-800/50 rounded pl-3 border border-zinc-700/50 hover:bg-zinc-800 transition-colors group text-left flex items-center justify-between w-full h-11 overflow-hidden"
    >
      <div className="text-sm font-medium text-white group-hover:text-[var(--accent-color)] transition-colors truncate py-2">
        {moodName}
      </div>
      {albumId && (
        <div className="h-full flex-shrink-0">
          <Image
            src={jellyfinClient.getAlbumArtUrl(albumId, 56)}
            alt=""
            className="w-full h-full object-cover"
            showOutline={false}
            rounded=""
          />
        </div>
      )}
    </button>
  )
}
