import { useSleepTimerStore } from '../../stores/sleepTimerStore'
import StatusBar from './StatusBar'

function formatRemaining(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.ceil(seconds / 60)
    return `${mins} min`
  }
  return `${seconds}s`
}

interface SleepTimerBarProps {
  topOffset?: number
}

export default function SleepTimerBar({ topOffset = 0 }: SleepTimerBarProps) {
  const mode = useSleepTimerStore(s => s.mode)
  const remainingSeconds = useSleepTimerStore(s => s.remainingSeconds)
  const cancel = useSleepTimerStore(s => s.cancel)

  if (mode === 'off') return null

  const message = mode === 'end-of-track'
    ? 'Pausing at end of track'
    : remainingSeconds !== null
      ? `Pausing in ${formatRemaining(remainingSeconds)}`
      : 'Pausing soon'

  return (
    <StatusBar
      message={message}
      action={{ label: 'Cancel', onClick: cancel }}
      topOffset={topOffset}
    />
  )
}
