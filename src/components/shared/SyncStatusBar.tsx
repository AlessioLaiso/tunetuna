import { useSyncStore } from '../../stores/syncStore'

export default function SyncStatusBar() {
  const { state, message, cancelSync } = useSyncStore()

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
      className={`fixed top-0 left-0 right-0 z-[10002] ${getBackgroundColor()} transition-colors duration-300`}
      style={{
        height: '28px',
        top: '0px'
      }}
    >
      <div className="max-w-[768px] mx-auto h-full flex items-center justify-between px-4">
        <span className="text-white text-sm font-medium truncate">
          {message}
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
  )
}
