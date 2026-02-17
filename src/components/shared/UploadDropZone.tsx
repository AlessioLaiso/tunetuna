import { useState, useRef, useCallback } from 'react'
import { Upload, X } from 'lucide-react'

interface UploadDropZoneProps {
  label: string
  accept?: string
  value: File | null
  onChange: (file: File | null) => void
  previewUrl?: string | null
}

export default function UploadDropZone({ label, accept = 'image/*', value, onChange, previewUrl }: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCountRef = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current++
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current--
    if (dragCountRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const matchesAccept = useCallback((file: File, acceptPattern: string): boolean => {
    return acceptPattern.split(',').some(pattern => {
      const trimmed = pattern.trim()
      if (trimmed.endsWith('/*')) {
        return file.type.startsWith(trimmed.replace('/*', '/'))
      }
      if (trimmed.startsWith('.')) {
        return file.name.toLowerCase().endsWith(trimmed.toLowerCase())
      }
      return file.type === trimmed
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current = 0
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && matchesAccept(file, accept)) {
      setDismissed(false)
      onChange(file)
    }
  }, [onChange, accept, matchesAccept])

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setDismissed(false)
      onChange(file)
    }
    // Reset input so the same file can be selected again
    e.target.value = ''
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissed(true)
    onChange(null)
  }

  const isImage = value?.type?.startsWith('image/') ?? false
  const preview = (value && isImage) ? URL.createObjectURL(value) : (!dismissed ? previewUrl : null)

  return (
    <div
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative cursor-pointer rounded-lg border-2 border-dashed transition-colors ${
        isDragging
          ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
          : (preview || (value && !isImage))
            ? 'border-zinc-700 bg-zinc-800/50'
            : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />

      {preview ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-md">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      ) : value ? (
        <div className="relative flex flex-col items-center justify-center gap-2 py-8 px-4">
          <Upload className="w-6 h-6 text-[var(--accent-color)]" />
          <span className="text-sm text-white text-center truncate max-w-full px-2">{value.name}</span>
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
          <Upload className="w-6 h-6 text-gray-400" />
          <span className="text-sm text-gray-400 text-center">{label}</span>
        </div>
      )}
    </div>
  )
}
