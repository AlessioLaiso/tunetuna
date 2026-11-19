import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../../stores/playerStore'

// Matches the --header-offset transition and status-bar keyframes in index.css
const EXIT_DURATION_MS = 300

interface StatusBarProps {
  message: string
  backgroundColor?: string
  action?: {
    label: string
    onClick: () => void
  }
  topOffset?: number
  /** When false the bar slides out, then unmounts. */
  visible?: boolean
}

export default function StatusBar({ visible = true, ...props }: StatusBarProps) {
  const isQueueSidebarOpen = usePlayerStore(s => s.isQueueSidebarOpen)
  const [isMounted, setIsMounted] = useState(visible)
  // Keep showing the last content while sliding out
  const lastProps = useRef(props)
  if (visible) lastProps.current = props

  useEffect(() => {
    if (visible) {
      setIsMounted(true)
      return
    }
    const timeout = setTimeout(() => setIsMounted(false), EXIT_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [visible])

  if (!visible && !isMounted) return null

  const { message, backgroundColor = 'bg-zinc-800', action, topOffset = 0 } = lastProps.current

  return (
    <div
      className={`fixed left-0 right-0 z-[10002] ${backgroundColor} transition-[background-color,top] duration-300 ${visible ? 'status-bar-enter' : 'status-bar-exit pointer-events-none'} ${isQueueSidebarOpen ? 'sidebar-open-padding' : ''}`}
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
            className="text-white text-sm font-medium hover:text-white/80 transition-colors ml-8"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
