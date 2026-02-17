import { useState, useEffect, useRef } from 'react'
import { FileText, Loader2, X } from 'lucide-react'
import ResponsiveModal from '../shared/ResponsiveModal'
import UploadDropZone from '../shared/UploadDropZone'
import { jellyfinClient } from '../../api/jellyfin'
import { parseM3UFile, matchM3UEntries, type M3UImportResult } from '../../utils/m3uImport'
import { useToastStore } from '../../stores/toastStore'
import { logger } from '../../utils/logger'

interface PlaylistFormModalProps {
  isOpen: boolean
  onClose: () => void
  /** When set, the modal operates in edit mode for this playlist ID */
  editPlaylistId?: string | null
  /** Initial playlist name (used in edit mode) */
  initialName?: string
  /** Whether the playlist already has a primary image (edit mode) */
  hasExistingImage?: boolean
  /** Called after a successful create. Receives the new playlist ID. */
  onCreated?: (playlistId: string) => void
  /** Called after a successful edit save. */
  onSaved?: () => void
  /** Cache-bust key for existing image preview */
  imageCacheBust?: number
}

function M3uResultText({ result }: { result: M3UImportResult }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const skipped = result.notFound.length + result.skippedDuplicates.length

  const skippedNames = [...result.notFound, ...result.skippedDuplicates].map(
    r => r.entry.songTitle
      ? `${r.entry.songTitle} - ${r.entry.artistName || 'Unknown'}`
      : r.entry.fileName
  )

  if (result.matched.length === 0 && skipped === 0) {
    return <span className="text-sm text-gray-400 text-center">No songs matched</span>
  }

  return (
    <span className="text-sm text-white text-center">
      {result.matched.length > 0 && (
        <>{result.matched.length} {result.matched.length === 1 ? 'song' : 'songs'} matched</>
      )}
      {result.matched.length > 0 && skipped > 0 && '. '}
      {skipped > 0 && (
        <span
          className="relative text-zinc-400 cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={(e) => {
            e.stopPropagation()
            setShowTooltip(prev => !prev)
          }}
        >
          {result.matched.length === 0 && 'No songs matched. '}
          {skipped} skipped
          {showTooltip && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 max-h-48 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-300 text-left shadow-lg z-50">
              {skippedNames.map((name, i) => (
                <span key={i} className="block truncate py-0.5">{name}</span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

export default function PlaylistFormModal({
  isOpen,
  onClose,
  editPlaylistId,
  initialName = '',
  hasExistingImage = false,
  onCreated,
  onSaved,
  imageCacheBust = 0,
}: PlaylistFormModalProps) {
  const isEditMode = !!editPlaylistId

  const [name, setName] = useState(initialName)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [m3uFile, setM3uFile] = useState<File | null>(null)
  const [m3uImporting, setM3uImporting] = useState(false)
  const [m3uResult, setM3uResult] = useState<M3UImportResult | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset state when modal opens/closes or switches between playlists
  useEffect(() => {
    if (isOpen) {
      setName(initialName)
      setImageFile(null)
      setRemoveExistingImage(false)
      setM3uFile(null)
      setM3uResult(null)
      setM3uImporting(false)
      setSaving(false)
    }
  }, [isOpen, editPlaylistId])

  const handleClose = () => {
    onClose()
  }

  const m3uAbortRef = useRef(false)

  const handleM3uChange = async (file: File | null) => {
    // Cancel any in-progress import
    m3uAbortRef.current = true
    setM3uFile(file)
    setM3uResult(null)

    if (!file) {
      setM3uImporting(false)
      return
    }

    // Auto-populate playlist name from m3u filename if name is still empty
    if (!name.trim()) {
      const baseName = file.name.replace(/\.(m3u8?|M3U8?)$/, '')
      setName(baseName)
    }

    // Auto-start matching
    m3uAbortRef.current = false
    setM3uImporting(true)

    try {
      const fileContent = await file.text()
      const entries = parseM3UFile(fileContent)
      if (m3uAbortRef.current) return

      if (entries.length === 0) {
        useToastStore.getState().addToast('No songs found in M3U file', 'error', 3000)
        setM3uFile(null)
        setM3uImporting(false)
        return
      }

      const librarySongs = await jellyfinClient.fetchAllSongsWithPaths()
      if (m3uAbortRef.current) return

      let existingIds = new Set<string>()
      if (editPlaylistId) {
        const existingItems = await jellyfinClient.getPlaylistItems(editPlaylistId)
        if (m3uAbortRef.current) return
        existingIds = new Set(existingItems.map(item => item.Id))
      }

      const result = matchM3UEntries(entries, librarySongs, existingIds)
      if (m3uAbortRef.current) return
      setM3uResult(result)
    } catch (error) {
      if (m3uAbortRef.current) return
      logger.error('M3U import failed:', error)
      useToastStore.getState().addToast('Import failed', 'error', 3000)
      setM3uFile(null)
      setM3uResult(null)
    } finally {
      if (!m3uAbortRef.current) {
        setM3uImporting(false)
      }
    }
  }

  const handleM3uClear = () => {
    m3uAbortRef.current = true
    setM3uFile(null)
    setM3uResult(null)
    setM3uImporting(false)
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setSaving(true)

    try {
      if (isEditMode) {
        // Edit mode: update name + image
        await jellyfinClient.updatePlaylist(editPlaylistId!, trimmedName)
        if (imageFile) {
          const reader = new FileReader()
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string
              resolve(result.split(',')[1])
            }
            reader.onerror = reject
            reader.readAsDataURL(imageFile)
          })
          await jellyfinClient.uploadItemImage(editPlaylistId!, base64, imageFile.type)
        } else if (removeExistingImage) {
          await jellyfinClient.deleteItemImage(editPlaylistId!)
        }
        if (m3uResult && m3uResult.matched.length > 0) {
          const newSongIds = m3uResult.matched.map(m => m.matchedSong!.Id)
          await jellyfinClient.addItemsToPlaylist(editPlaylistId!, newSongIds)
        }
        useToastStore.getState().addToast('Playlist updated', 'success', 2000)
        window.dispatchEvent(new CustomEvent('playlistUpdated'))
        handleClose()
        onSaved?.()
      } else {
        // Create mode: create playlist, upload image, import m3u
        const result = await jellyfinClient.createPlaylist(trimmedName)

        if (imageFile) {
          try {
            const reader = new FileReader()
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const data = reader.result as string
                resolve(data.split(',')[1])
              }
              reader.onerror = reject
              reader.readAsDataURL(imageFile)
            })
            await jellyfinClient.uploadItemImage(result.Id, base64, imageFile.type)
          } catch {
            logger.error('Failed to upload playlist image')
          }
        }

        if (m3uResult && m3uResult.matched.length > 0) {
          try {
            const newSongIds = m3uResult.matched.map(m => m.matchedSong!.Id)
            await jellyfinClient.addItemsToPlaylist(result.Id, newSongIds)
            const parts: string[] = [`${m3uResult.matched.length} added`]
            if (m3uResult.notFound.length > 0) parts.push(`${m3uResult.notFound.length} not found`)
            useToastStore.getState().addToast(`Playlist created. ${parts.join(', ')}`, m3uResult.notFound.length > 0 ? 'info' : 'success', 4000)
          } catch {
            logger.error('M3U import failed during playlist creation')
            useToastStore.getState().addToast('Playlist created, but M3U import failed', 'info', 3000)
          }
        } else {
          useToastStore.getState().addToast('Playlist created', 'success', 2000)
        }

        window.dispatchEvent(new CustomEvent('playlistUpdated'))
        handleClose()
        onCreated?.(result.Id)
      }
    } catch {
      useToastStore.getState().addToast(
        isEditMode ? 'Failed to update playlist' : 'Failed to create playlist',
        'error',
        3000,
      )
    } finally {
      setSaving(false)
    }
  }

  const imagePreviewUrl = isEditMode && hasExistingImage && !removeExistingImage && editPlaylistId
    ? jellyfinClient.getImageUrl(editPlaylistId, 'Primary', 256) + (imageCacheBust ? `&cb=${imageCacheBust}` : '')
    : null

  return (
    <ResponsiveModal isOpen={isOpen} onClose={handleClose}>
      <div className="pb-6">
        <div className="mb-4 px-4">
          <div className="text-lg font-semibold text-white">
            {isEditMode ? 'Edit Playlist' : 'Create Playlist'}
          </div>
        </div>
        <div className="px-4 space-y-6">
          <div>
            <div className="text-base font-medium text-white mb-2">Playlist Name</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] placeholder:text-zinc-500"
              placeholder="Playlist name"
              autoFocus
              disabled={saving}
            />
          </div>
          <div>
            <div className="text-base font-medium text-white mb-2">Image (Optional)</div>
            <div className="w-32">
              <UploadDropZone
                label="Drop or click"
                accept="image/*"
                value={imageFile}
                onChange={(file) => {
                  setImageFile(file)
                  if (file) {
                    setRemoveExistingImage(false)
                  } else if (hasExistingImage) {
                    setRemoveExistingImage(true)
                  }
                }}
                previewUrl={imagePreviewUrl}
              />
            </div>
          </div>
          <div>
            <div className="text-base font-medium text-white mb-2">Add from M3U (Optional)</div>
            {m3uImporting ? (
              <div className="relative rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/50">
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
                  <Loader2 className="w-6 h-6 text-[var(--accent-color)] animate-spin" />
                  <span className="text-sm text-gray-400 text-center">Matching songs...</span>
                </div>
                <button
                  onClick={handleM3uClear}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : m3uResult ? (
              <div className="relative rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/50">
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
                  <FileText className="w-6 h-6 text-[var(--accent-color)]" />
                  <M3uResultText result={m3uResult} />
                </div>
                <button
                  onClick={handleM3uClear}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <UploadDropZone
                label="Drop .m3u file or click"
                accept=".m3u,.m3u8"
                value={m3uFile}
                onChange={handleM3uChange}
              />
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 py-3 bg-transparent border border-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/10 font-semibold rounded-full transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || m3uImporting || !name.trim()}
              className="flex-1 py-3 bg-[var(--accent-color)] text-white font-semibold rounded-full transition-colors disabled:opacity-50"
            >
              {saving || m3uImporting
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save' : 'Create')}
            </button>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  )
}
