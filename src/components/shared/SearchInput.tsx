import { useState, useEffect, useRef, forwardRef } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  showClearButton?: boolean
  onClear?: () => void
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 150,
  showClearButton = false,
  onClear,
}, ref) => {
  const [localValue, setLocalValue] = useState(value)
  const onChangeRef = useRef(onChange)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Callback ref to set both forwarded ref and internal ref
  const setRefs = (element: HTMLInputElement | null) => {
    inputRef.current = element
    if (typeof ref === 'function') {
      ref(element)
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLInputElement | null>).current = element
    }
  }

  // Keep the ref updated with the latest onChange callback
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const timer = setTimeout(() => {
      onChangeRef.current(localValue)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [localValue, debounceMs])

  // Only sync from parent if user isn't actively typing
  // (i.e., when parent clears the value externally)
  useEffect(() => {
    if (value === '' && localValue !== '') {
      setLocalValue(value)
    }
  }, [value])

  return (
    <div className="relative">
      <input
        ref={setRefs}
        type="text"
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
        }}
        placeholder={placeholder}
        className="w-full px-4 py-2 pl-10 pr-10 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent"
      />
      <svg
        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setLocalValue('')
          if (onClear) onClear()
          // Keep focus on the input after clearing
          setTimeout(() => {
            inputRef.current?.focus()
          }, 0)
        }}
        className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-opacity ${
          showClearButton && localValue
            ? 'text-gray-400 hover:text-white opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        aria-label="Clear search"
        type="button"
      >
        <svg
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          className="w-full h-full"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
})

SearchInput.displayName = 'SearchInput'

export default SearchInput


