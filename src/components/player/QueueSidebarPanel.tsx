import { X } from 'lucide-react'
import QueueList from './QueueList'
import QueueMenu from './QueueMenu'

interface QueueSidebarPanelProps {
  isOpen: boolean
  onClose: () => void
  onNavigateFromContextMenu?: () => void
  contentPaddingBottom: string
}

/** Queue sidebar content styled for artwork backgrounds (player modal, and the app when it shows album art) */
export default function QueueSidebarPanel({ isOpen, onClose, onNavigateFromContextMenu, contentPaddingBottom }: QueueSidebarPanelProps) {
  return (
    <>
      <div className={`border-l border-white/20 flex-shrink-0 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/20 flex-shrink-0">
          <h2 className="text-base font-bold text-white tracking-wider">Queue</h2>
          <div className="flex items-center">
            <QueueMenu
              buttonClassName="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
            />
            <button
              onClick={onClose}
              aria-label="Close queue sidebar"
              className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 relative z-20"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto min-h-0 border-l border-white/20 queue-xl-container transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
        <QueueList
          onNavigateFromContextMenu={onNavigateFromContextMenu}
          contentPaddingBottom={contentPaddingBottom}
        />
      </div>
    </>
  )
}
