import { usePlayerStore } from '../../stores/playerStore'

interface StatusBarProps {
  message: string
  backgroundColor?: string
  action?: {
    label: string
    onClick: () => void
  }
  topOffset?: number
}

export default function StatusBar({ message, backgroundColor = 'bg-zinc-800', action, topOffset = 0 }: StatusBarProps) {
  const isQueueSidebarOpen = usePlayerStore(s => s.isQueueSidebarOpen)

  return (
    <div
      className={`fixed left-0 right-0 z-[10002] ${backgroundColor} transition-colors duration-300 ${isQueueSidebarOpen ? 'sidebar-open-padding' : ''}`}
      style={{
        height: '28px',
        top: `${topOffset}px`,
        paddingLeft: '16px',
        paddingRight: '12px',
        scrollbarGutter: 'stable'
      }}
    >
      <div className="h-full flex items-center">
        <span className="text-white text-sm font-medium truncate tabular-nums">
          {message}
        </span>
        {action && (
          <button
            onClick={action.onClick}
            className="text-white text-sm font-medium hover:text-zinc-300 transition-colors ml-8"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
