import { useNavigate } from 'react-router-dom'
import { ListMusic } from 'lucide-react'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'

interface PlaylistItemProps {
  playlist: BaseItemDto
}

export default function PlaylistItem({ playlist }: PlaylistItemProps) {
  const navigate = useNavigate()

  const { handleContextMenu, longPressHandlers, shouldSuppressClick, menuState } = useContextMenu({
    item: playlist,
  })

  return (
    <>
      <button
        onClick={(e) => {
          if (shouldSuppressClick()) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          navigate(`/playlist/${playlist.Id}`)
        }}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
        className="text-left group"
      >
        <div className="aspect-square rounded overflow-hidden bg-zinc-900 relative flex items-center justify-center">
          <Image
            src={jellyfinClient.getAlbumArtUrl(playlist.Id, 474)}
            alt={playlist.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded"
            fallbackIcon={ListMusic}
          />
        </div>
        <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{playlist.Name}</div>
        <div className="text-xs text-gray-400 truncate">
          {playlist.ChildCount ? `${playlist.ChildCount} songs` : 'Playlist'}
        </div>
      </button>
      <ContextMenu
        item={playlist}
        itemType="playlist"
        isOpen={menuState.isOpen}
        onClose={menuState.close}
        mode={menuState.mode}
        position={menuState.position || undefined}
      />
    </>
  )
}
