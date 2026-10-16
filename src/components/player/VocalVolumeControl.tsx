import { useEffect } from 'react'
import { MicAudioLines } from 'lucide-react'
import VolumeControl from '../layout/VolumeControl'
import { useVocalRemoverStore } from '../../audio/vocalSeparation/vocalRemover'

// Vocal level slider shown alongside lyrics. Unmounting (leaving lyrics) restores full vocals.
export default function VocalVolumeControl() {
  const level = useVocalRemoverStore((state) => state.level)
  const status = useVocalRemoverStore((state) => state.status)
  const progress = useVocalRemoverStore((state) => state.progress)
  const setLevel = useVocalRemoverStore((state) => state.setLevel)

  useEffect(() => () => useVocalRemoverStore.getState().reset(), [])

  const percent = Math.round(progress * 100)
  const statusText = level >= 1
    ? null
    : status === 'downloading-model'
      ? `Downloading model ${percent}%`
      : status === 'preparing'
        ? 'Removing vocals…'
        : status === 'error'
          ? 'Vocal removal failed'
          : null

  return (
    <div className="relative">
      <VolumeControl
        variant="horizontal"
        value={level}
        onChange={setLevel}
        icon={MicAudioLines}
        label="Vocals volume"
      />
      {statusText && (
        <div className="absolute left-2 top-full whitespace-nowrap text-xs text-white/50 tabular-nums">
          {statusText}
        </div>
      )}
    </div>
  )
}
