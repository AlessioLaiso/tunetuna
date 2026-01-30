import { useNavigate } from 'react-router-dom'
import type { BaseItemDto } from '../../api/types'
import {
  Music2, MicVocal, Piano, Laugh, Bird, Turntable, Flame,
  KeyboardMusic, Leaf, Church, CandyCane, Sparkles, Mic,
  MessageCircle, CupSoda, Disc3, Pyramid, Zap, Heart,
  BoomBox, Sun, Guitar, Drum, Popcorn, AudioWaveform, MoonStar,
  PartyPopper,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const genreIconMap: Record<string, LucideIcon> = {
  'a cappella': MicVocal,
  'blues': MoonStar,
  'classical': Piano,
  'jazz': AudioWaveform,
  'fusion': AudioWaveform,
  'jazz & fusion': AudioWaveform,
  'comedy': Laugh,
  'country': Bird,
  'dance': Turntable,
  'dance & electronic': Turntable,
  'disco': Turntable,
  'reggaeton': Flame,
  'dancehall & reggaeton': Flame,
  'latin': Flame,
  'electronic': KeyboardMusic,
  'electronic (instrumental)': KeyboardMusic,
  'folk': Leaf,
  'gospel': Church,
  'christian': Church,
  'holiday': CandyCane,
  'christmas': CandyCane,
  'k-pop': Sparkles,
  'mpb': Mic,
  'música popular brasileira': Mic,
  'singer-songwriter': Mic,
  'podcast': MessageCircle,
  'news': MessageCircle,
  'pop': CupSoda,
  'power pop': Disc3,
  'progressive rock': Pyramid,
  'progressive': Pyramid,
  'punk': Zap,
  'r&b': Heart,
  'soul': Heart,
  'r&b/soul': Heart,
  'romantic': Heart,
  'rap': BoomBox,
  'hip-hop': BoomBox,
  'hip hop': BoomBox,
  'rap & hip-hop': BoomBox,
  'reggae': Sun,
  'ska': Sun,
  'reggae & ska': Sun,
  'rock': Guitar,
  'hard rock': Guitar,
  'metal': Guitar,
  'samba': Drum,
  'bossa nova': Drum,
  'bossanova': Drum,
  'samba & bossa nova': Drum,
  'soundtrack': Popcorn,
  'forro': PartyPopper,
  'forró': PartyPopper,
  'brega': PartyPopper,
  'brega & norte-nordeste': PartyPopper,
}

function getGenreIcon(genreName: string): LucideIcon {
  const lower = genreName.toLowerCase()
  return genreIconMap[lower] || Music2
}

interface GenreItemProps {
  genre: BaseItemDto
  isCard?: boolean
}

export default function GenreItem({ genre, isCard = false }: GenreItemProps) {
  const navigate = useNavigate()
  const Icon = getGenreIcon(genre.Name || '')

  if (isCard) {
    return (
      <button
        onClick={() => navigate(`/genre/${genre.Id}`)}
        className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50 hover:bg-zinc-800 transition-colors relative overflow-hidden group text-left"
      >
        <div className="flex items-start justify-between">
          <div className="text-base font-medium text-white group-hover:text-[var(--accent-color)] transition-colors">
            {genre.Name}
          </div>
          <Icon className="w-12 h-12 text-zinc-600 group-hover:text-[var(--accent-color)] transition-colors flex-shrink-0 ml-2" />
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={() => navigate(`/genre/${genre.Id}`)}
      className="w-full flex items-center gap-3 h-12 pl-4 pr-4 hover:bg-zinc-900 transition-colors group"
    >
      <Icon className="w-5 h-5 text-gray-400 group-hover:text-[var(--accent-color)] transition-colors" />
      <div className="text-base font-medium text-white group-hover:text-[var(--accent-color)] transition-colors">
        {genre.Name}
      </div>
    </button>
  )
}

