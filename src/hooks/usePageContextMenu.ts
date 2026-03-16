import { useState, useCallback } from 'react'
import type { BaseItemDto } from '../api/types'

export type ContextMenuItemType = 'album' | 'song' | 'artist' | 'playlist'

/**
 * Manages the page-level context menu state used by list pages (Songs, Albums, Artists).
 * Returns state + open/close handlers to wire into <ContextMenu>.
 */
export function usePageContextMenu() {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<ContextMenuItemType | null>(null)

  const openContextMenu = useCallback((
    item: BaseItemDto,
    type: ContextMenuItemType,
    mode: 'mobile' | 'desktop' = 'mobile',
    position?: { x: number, y: number },
  ) => {
    setContextMenuItem(item)
    setContextMenuItemType(type)
    setContextMenuMode(mode)
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenuOpen(false)
    setContextMenuItem(null)
    setContextMenuItemType(null)
  }, [])

  return {
    contextMenuOpen,
    contextMenuItem,
    contextMenuItemType,
    contextMenuMode,
    contextMenuPosition,
    openContextMenu,
    closeContextMenu,
  }
}
