import { useState, useEffect } from 'react'
import { Plus, Music } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useToastStore } from '../../stores/toastStore'
import type { BaseItemDto } from '../../api/types'
import ResponsiveModal from '../shared/ResponsiveModal'
import Image from '../shared/Image'

interface PlaylistPickerProps {
  isOpen: boolean
  onClose: () => void
  itemIds: string[]
}

export default function PlaylistPicker({ isOpen, onClose, itemIds }: PlaylistPickerProps) {
  const [playlists, setPlaylists] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setShowCreateInput(false)
      setNewPlaylistName('')
      setActionLoading(null)
      loadPlaylists()
    }
  }, [isOpen])

  const loadPlaylists = async () => {
    setLoading(true)
    try {
      const result = await jellyfinClient.getPlaylists({
        sortBy: ['SortName'],
        sortOrder: 'Ascending',
        limit: 100,
      })
      setPlaylists(result.Items)
    } catch {
      useToastStore.getState().addToast('Failed to load playlists', 'error', 3000)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToPlaylist = async (playlist: BaseItemDto) => {
    setActionLoading(playlist.Id)
    try {
      await jellyfinClient.addItemsToPlaylist(playlist.Id, itemIds)
      useToastStore.getState().addToast(`Added to ${playlist.Name}`, 'success', 2000)
      window.dispatchEvent(new CustomEvent('playlistUpdated'))
      onClose()
    } catch {
      useToastStore.getState().addToast('Failed to add to playlist', 'error', 3000)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim()
    if (!name) return
    setActionLoading('create')
    try {
      await jellyfinClient.createPlaylist(name, itemIds)
      const itemLabel = itemIds.length === 1 ? '1 song' : `${itemIds.length} songs`
      useToastStore.getState().addToast(`Created "${name}" with ${itemLabel}`, 'success', 2000)
      window.dispatchEvent(new CustomEvent('playlistUpdated'))
      onClose()
    } catch {
      useToastStore.getState().addToast('Failed to create playlist', 'error', 3000)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose}>
      <div className="pb-6">
        <div className="mb-4 px-4">
          <div className="text-lg font-semibold text-white">Add to Playlist</div>
        </div>

        {/* Create New Playlist */}
        <div>
          <button
            onClick={() => setShowCreateInput(!showCreateInput)}
            disabled={actionLoading !== null}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-sm bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-medium">Create New Playlist</span>
          </button>

          {showCreateInput && (
            <div className="px-4 pb-2 flex gap-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePlaylist() }}
                className="flex-1 bg-zinc-800 text-white rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--accent-color)] text-sm"
                placeholder="Playlist name"
                autoFocus
                disabled={actionLoading === 'create'}
              />
              <button
                onClick={handleCreatePlaylist}
                disabled={actionLoading === 'create' || !newPlaylistName.trim()}
                className="px-4 py-2.5 bg-[var(--accent-color)] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm flex-shrink-0"
              >
                {actionLoading === 'create' ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Create'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Playlist List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            {playlists.map((playlist) => (
              <button
                key={playlist.Id}
                onClick={() => handleAddToPlaylist(playlist)}
                disabled={actionLoading !== null}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-800">
                  <Image
                    src={jellyfinClient.getAlbumArtUrl(playlist.Id, 80)}
                    alt={playlist.Name}
                    className="w-full h-full object-cover"
                    showOutline={true}
                    rounded="rounded-sm"
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-white truncate">{playlist.Name}</div>
                  {playlist.ChildCount !== undefined && (
                    <div className="text-xs text-gray-400">{playlist.ChildCount} tracks</div>
                  )}
                </div>
                {actionLoading === playlist.Id && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </button>
            ))}
            {playlists.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Music className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No playlists yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  )
}
