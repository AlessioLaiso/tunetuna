import { useSyncStore } from '../../stores/syncStore'
import { usePlayerStore } from '../../stores/playerStore'

export default function SyncStatusBar() {
  const { state, message, progress, cancelSync } = useSyncStore()
  const { isQueueSidebarOpen } = usePlayerStore()

  if (state === 'idle') return null

  const getBackgroundColor = () => {
    switch (state) {
      case 'syncing': return 'bg-zinc-800'
      case 'success': return 'bg-green-800'
      case 'error': return 'bg-red-800'
      default: return 'bg-zinc-800'
    }
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[10002] ${getBackgroundColor()} transition-colors duration-300 lg:pl-16`}
      style={{
        height: '28px',
        top: '0px',
        paddingRight: isQueueSidebarOpen ? 'var(--sidebar-width)' : '12px',
        scrollbarGutter: 'stable'
      }}
    >
      <div className="w-full mx-auto lg:flex lg:justify-center h-full max-w-[768px]">
        <div className="w-full max-w-[768px] h-full flex items-center justify-between px-4">
        <span className="text-white text-sm font-medium truncate">
          {message}{progress !== null && <span className="tabular-nums"> ({progress}%)</span>}
        </span>
        {state === 'syncing' && (
          <button
            onClick={cancelSync}
            className="text-white text-sm font-medium hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        )}
        </div>
      </div>
    </div>
  )
}
