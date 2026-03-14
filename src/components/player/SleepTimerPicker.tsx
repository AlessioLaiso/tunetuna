import ResponsiveModal from '../shared/ResponsiveModal'
import { useSleepTimerStore } from '../../stores/sleepTimerStore'

interface SleepTimerPickerProps {
  isOpen: boolean
  onClose: () => void
}

const options: { label: string; value: number | 'end-of-track' | 'off' }[] = [
  { label: 'Off', value: 'off' },
  { label: 'End of current song', value: 'end-of-track' },
{ label: 'In 10 minutes', value: 10 },
  { label: 'In 20 minutes', value: 20 },
  { label: 'In 30 minutes', value: 30 },
  { label: 'In 45 minutes', value: 45 },
  { label: 'In 1 hour', value: 60 },
]

export default function SleepTimerPicker({ isOpen, onClose }: SleepTimerPickerProps) {
  const mode = useSleepTimerStore(s => s.mode)
  const start = useSleepTimerStore(s => s.start)
  const cancel = useSleepTimerStore(s => s.cancel)

  const handleSelect = (value: number | 'end-of-track' | 'off') => {
    if (value === 'off') {
      cancel()
    } else if (value === 'end-of-track') {
      start('end-of-track')
    } else {
      start(value)
    }
    onClose()
  }

  const isActive = (value: number | 'end-of-track' | 'off') => {
    if (value === 'off') return mode === 'off'
    if (value === 'end-of-track') return mode === 'end-of-track'
    return false // timed mode doesn't highlight a specific option since time is counting down
  }

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose}>
      <div className="px-6 pb-6">
        <h3 className="text-white text-lg font-semibold mb-4">Pause Playback</h3>
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <button
              key={String(option.value)}
              onClick={() => handleSelect(option.value)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors text-sm ${
                isActive(option.value)
                  ? 'bg-white/10 text-[var(--accent-color)]'
                  : 'text-white hover:bg-zinc-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </ResponsiveModal>
  )
}
