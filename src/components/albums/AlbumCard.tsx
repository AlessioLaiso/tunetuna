import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc } from 'lucide-react'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'

interface AlbumCardProps {
  album: BaseItemDto
  onContextMenu?: (item: BaseItemDto, type: 'album', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId?: string | null
}

export default function AlbumCard({ album, onContextMenu, contextMenuItemId }: AlbumCardProps) {
  const navigate = useNavigate()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === album.Id

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'AlbumCard.tsx:render',
      message: 'AlbumCard component rendered',
      data: { albumId: album.Id, albumName: album.Name, hasOnContextMenu: !!onContextMenu, contextMenuItemId },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId: 'E'
    })
  }).catch(() => {});
  // #endregion

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if context menu was just opened
    if (contextMenuJustOpenedRef.current) {
      e.preventDefault()
      contextMenuJustOpenedRef.current = false
      return
    }
    navigate(`/album/${album.Id}`)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'AlbumCard.tsx:handleContextMenu',
        message: 'Right-click detected on album',
        data: { albumId: album.Id, albumName: album.Name, hasOnContextMenu: !!onContextMenu },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'A'
      })
    }).catch(() => {});
    // #endregion

    e.preventDefault()
    e.stopPropagation()
    // Prevent any default browser behavior
    e.nativeEvent?.preventDefault?.()
    e.nativeEvent?.stopImmediatePropagation?.()

    // Prevent navigation/click for the next 300ms
    contextMenuJustOpenedRef.current = true

    if (onContextMenu) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'AlbumCard.tsx:handleContextMenu',
          message: 'Calling parent onContextMenu',
          data: { albumId: album.Id, type: 'album' },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'A'
        })
      }).catch(() => {});
      // #endregion

      onContextMenu(album, 'album', 'desktop', { x: e.clientX, y: e.clientY })
    } else {
      // Fallback to local context menu
      setContextMenuMode('desktop')
      setContextMenuPosition({ x: e.clientX, y: e.clientY })
      setContextMenuOpen(true)
    }

    // Reset the flag after a longer delay
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      if (onContextMenu) {
        contextMenuJustOpenedRef.current = true
        onContextMenu(album, 'album', 'mobile')
      } else {
        // Fallback to local context menu
        contextMenuJustOpenedRef.current = true
        setContextMenuMode('mobile')
        setContextMenuPosition(null)
        setContextMenuOpen(true)
      }
    },
    onClick: handleClick,
  })


  return (
    <>
      <button
        onClick={(e) => {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'AlbumCard.tsx:button',
              message: 'Button click event received',
              data: { albumId: album.Id, eventType: 'click' },
              timestamp: Date.now(),
              sessionId: 'debug-session',
              hypothesisId: 'F'
            })
          }).catch(() => {});
          // #endregion

          // Prevent click if context menu is open or was just opened
          if (contextMenuOpen || contextMenuJustOpenedRef.current) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'AlbumCard.tsx:onClick',
                message: 'Click prevented by context menu flag',
                data: { contextMenuOpen, contextMenuJustOpened: contextMenuJustOpenedRef.current, albumId: album.Id },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                hypothesisId: 'C'
              })
            }).catch(() => {});
            // #endregion

            e.preventDefault()
            e.stopPropagation()
            return
          }

          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'AlbumCard.tsx:onClick',
              message: 'Click proceeding to navigation',
              data: { albumId: album.Id, albumName: album.Name },
              timestamp: Date.now(),
              sessionId: 'debug-session',
              hypothesisId: 'C'
            })
          }).catch(() => {});
          // #endregion

          handleClick(e)
        }}
        onContextMenu={(e) => {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'AlbumCard.tsx:button',
              message: 'Button contextMenu event received',
              data: { albumId: album.Id, eventType: 'contextMenu' },
              timestamp: Date.now(),
              sessionId: 'debug-session',
              hypothesisId: 'F'
            })
          }).catch(() => {});
          // #endregion

          handleContextMenu(e)
        }}
        {...longPressHandlers}
        className={`text-left group ${isThisItemMenuOpen ? 'ring-2 ring-blue-500' : ''}`}
      >
        <div className="aspect-square rounded overflow-hidden mb-2 bg-zinc-900 relative flex items-center justify-center">
          {imageError ? (
            <Disc className="w-12 h-12 text-gray-500" />
          ) : (
            <Image
              src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
              alt={album.Name}
              className="w-full h-full object-cover"
              showOutline={true}
              rounded="rounded"
              onError={() => setImageError(true)}
            />
          )}
        </div>
        <div className="text-sm font-medium text-white truncate">{album.Name}</div>
        <div className="text-xs text-gray-400 truncate">
          {album.AlbumArtist || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
        </div>
      </button>
      <ContextMenu
        item={album}
        itemType="album"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}

