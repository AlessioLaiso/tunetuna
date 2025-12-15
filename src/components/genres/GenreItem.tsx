import { useNavigate } from 'react-router-dom'
import type { BaseItemDto } from '../../api/types'

interface GenreItemProps {
  genre: BaseItemDto
}

export default function GenreItem({ genre }: GenreItemProps) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(`/genre/${genre.Id}`)}
      className="w-full flex items-center justify-between h-12 pl-4 pr-4 hover:bg-zinc-900 transition-colors group"
    >
      <div className="text-base font-medium text-white group-hover:text-[var(--accent-color)] transition-colors">
        {genre.Name}
      </div>
    </button>
  )
}

