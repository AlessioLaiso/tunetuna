import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import BottomSheet from '../shared/BottomSheet'
import type { BaseItemDto } from '../../api/types'

interface FilterBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  filterType: 'genre' | 'year'
  // For year
  availableYears?: number[]
  yearRange?: { min: number | null; max: number | null }
  onApplyYear?: (range: { min: number | null; max: number | null }) => void
  // For genre - need genre objects
  genres?: BaseItemDto[]
  selectedValues?: string[]
  onApply?: (selected: string[]) => void
}

export default function FilterBottomSheet({
  isOpen,
  onClose,
  filterType,
  availableYears = [],
  yearRange = { min: null, max: null },
  onApplyYear,
  genres = [],
  selectedValues = [],
  onApply,
}: FilterBottomSheetProps) {
  const [localYearRange, setLocalYearRange] = useState<{ min: number | null; max: number | null }>(yearRange)
  const [localSelectedGenres, setLocalSelectedGenres] = useState<string[]>(selectedValues)
  const minYearRef = useRef<HTMLDivElement>(null)
  const maxYearRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalYearRange(yearRange)
  }, [yearRange])

  useEffect(() => {
    setLocalSelectedGenres(selectedValues)
  }, [selectedValues])

  const handleToggle = (genreName: string) => {
    setLocalSelectedGenres(prev =>
      prev.includes(genreName)
        ? prev.filter(g => g !== genreName)
        : [...prev, genreName]
    )
  }

  const handleApply = () => {
    if (filterType === 'year' && onApplyYear) {
      onApplyYear(localYearRange)
    } else if (filterType === 'genre' && onApply) {
      onApply(localSelectedGenres)
    }
    onClose()
  }

  const handleClear = () => {
    if (filterType === 'year') {
      setLocalYearRange({ min: null, max: null })
      if (onApplyYear) {
        onApplyYear({ min: null, max: null })
      }
    } else if (filterType === 'genre') {
      setLocalSelectedGenres([])
    }
    onClose()
  }

  const minYear = availableYears.length > 0 ? availableYears[0] : 1900
  const maxYear = availableYears.length > 0 ? availableYears[availableYears.length - 1] : new Date().getFullYear()
  
  // Scroll to selected year when picker opens or selection changes
  const justOpenedRef = useRef(false)
  useEffect(() => {
    if (filterType === 'year' && isOpen && availableYears.length > 0) {
      const isInitial = justOpenedRef.current
      justOpenedRef.current = false

      const scrollToYears = () => {
        // Scroll min picker to selected year, or to first year if nothing selected
        if (minYearRef.current) {
          const minIndex = localYearRange.min !== null
            ? availableYears.indexOf(localYearRange.min)
            : 0
          if (minIndex !== -1) {
            const minElement = minYearRef.current.querySelector(`[data-year-index="${minIndex}"]`)
            if (minElement) {
              minElement.scrollIntoView({ behavior: isInitial ? 'instant' : 'smooth', block: 'center' })
            }
          }
        }

        // Scroll max picker to selected year, or to last year if nothing selected
        if (maxYearRef.current) {
          const maxIndex = localYearRange.max !== null
            ? availableYears.indexOf(localYearRange.max)
            : availableYears.length - 1
          if (maxIndex !== -1) {
            const maxElement = maxYearRef.current.querySelector(`[data-year-index="${maxIndex}"]`)
            if (maxElement) {
              maxElement.scrollIntoView({ behavior: isInitial ? 'instant' : 'smooth', block: 'center' })
            }
          }
        }
      }

      // Wait for bottom sheet animation to complete before scrolling
      setTimeout(scrollToYears, isInitial ? 350 : 50)
    }
  }, [filterType, isOpen, localYearRange.min, localYearRange.max, availableYears])

  // Track when the sheet opens
  useEffect(() => {
    if (isOpen) {
      justOpenedRef.current = true
    }
  }, [isOpen])
  
  const handleYearSelect = (type: 'min' | 'max', year: number) => {
    setLocalYearRange((prev) => {
      if (type === 'min') {
        // Ensure min doesn't exceed max
        const newMin = prev.max !== null && year > prev.max ? prev.max : year
        // Center the selected year in the picker
        setTimeout(() => {
          const index = availableYears.indexOf(newMin)
          if (index !== -1 && minYearRef.current) {
            const element = minYearRef.current.querySelector(`[data-year-index="${index}"]`)
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }
        }, 50)
        return { ...prev, min: newMin }
      } else {
        // Ensure max doesn't go below min
        const newMax = prev.min !== null && year < prev.min ? prev.min : year
        // Center the selected year in the picker
        setTimeout(() => {
          const index = availableYears.indexOf(newMax)
          if (index !== -1 && maxYearRef.current) {
            const element = maxYearRef.current.querySelector(`[data-year-index="${index}"]`)
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }
        }, 50)
        return { ...prev, max: newMax }
      }
    })
  }
  
  // Check if clear should be disabled (min at bottom, max at top, and no filter was applied previously)
  const isDefaultRange = (localYearRange.min === null || localYearRange.min === minYear) && 
                         (localYearRange.max === null || localYearRange.max === maxYear) &&
                         (yearRange.min === null && yearRange.max === null)

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} zIndex={10001}>
      <div className="pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-4">
          <div className="text-lg font-semibold text-white">
            Filter by {filterType === 'genre' ? 'Genre' : 'Year'}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 max-h-[75vh] overflow-y-auto overscroll-none touch-pan-y">
          {filterType === 'year' ? (
            <div className="space-y-6">
              {/* Two scrollable year pickers side by side */}
              <div className="flex items-center gap-4">
                {/* Min year picker */}
                <div className="flex-1 relative">
                  <div className="text-center text-sm text-gray-400 mb-2">From</div>
                  <div
                    ref={minYearRef}
                    className="h-64 overflow-y-auto scroll-smooth snap-y snap-mandatory py-[calc(50%-1.5rem)] overscroll-contain"
                  >
                    {availableYears.length > 0 ? (
                      availableYears.map((year, index) => {
                        const isSelected = localYearRange.min === year
                        const isDisabled = localYearRange.max !== null && year > localYearRange.max
                        return (
                          <button
                            key={year}
                            data-year-index={index}
                            onClick={() => handleYearSelect('min', year)}
                            disabled={isDisabled}
                            className={`w-full py-3 px-4 text-center snap-center transition-colors ${
                              isSelected
                                ? 'bg-[var(--accent-color)] text-white font-semibold rounded-lg'
                                : isDisabled
                                ? 'text-gray-500 cursor-not-allowed'
                                : 'text-white hover:bg-white/10'
                            }`}
                          >
                            {year}
                          </button>
                        )
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <div className="text-sm">No years available</div>
                      </div>
                    )}
                  </div>
                  {/* Top gradient fade - positioned below the label */}
                  <div className="absolute left-0 right-0 h-12 bg-gradient-to-b from-zinc-900 to-transparent pointer-events-none" style={{ top: '1.75rem' }} />
                  {/* Bottom gradient fade */}
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
                </div>

                {/* Max year picker */}
                <div className="flex-1 relative">
                  <div className="text-center text-sm text-gray-400 mb-2">To</div>
                  <div
                    ref={maxYearRef}
                    className="h-64 overflow-y-auto scroll-smooth snap-y snap-mandatory py-[calc(50%-1.5rem)] overscroll-contain"
                  >
                    {availableYears.length > 0 ? (
                      availableYears.map((year, index) => {
                        const isSelected = localYearRange.max === year
                        const isDisabled = localYearRange.min !== null && year < localYearRange.min
                        return (
                          <button
                            key={year}
                            data-year-index={index}
                            onClick={() => handleYearSelect('max', year)}
                            disabled={isDisabled}
                            className={`w-full py-3 px-4 text-center snap-center transition-colors ${
                              isSelected
                                ? 'bg-[var(--accent-color)] text-white font-semibold rounded-lg'
                                : isDisabled
                                ? 'text-gray-500 cursor-not-allowed'
                                : 'text-white hover:bg-white/10'
                            }`}
                          >
                            {year}
                          </button>
                        )
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <div className="text-sm">No years available</div>
                      </div>
                    )}
                  </div>
                  {/* Top gradient fade - positioned below the label */}
                  <div className="absolute left-0 right-0 h-14 bg-gradient-to-b from-zinc-900 via-zinc-900/80 to-transparent pointer-events-none" style={{ top: '1.75rem' }} />
                  {/* Bottom gradient fade */}
                  <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-zinc-900 via-zinc-900/80 to-transparent pointer-events-none" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filterType === 'genre' ? (
                genres.length > 0 ? (
                  // For genres, use genre objects - sort alphabetically
                  [...genres]
                    .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''))
                    .map((genre) => {
                      const genreName = genre.Name || ''
                      const isSelected = localSelectedGenres.includes(genreName)
                      return (
                        <button
                          key={genre.Id}
                          onClick={() => handleToggle(genreName)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-white border-white'
                                : 'border-white/40 bg-transparent'
                            }`}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-zinc-900" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                          <span className="text-white font-medium">{genreName}</span>
                        </button>
                      )
                    })
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-sm">No genres available</div>
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-sm">No genres available</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex gap-3 mt-6 px-4">
          <button
            onClick={handleClear}
            disabled={filterType === 'year' && isDefaultRange}
            className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-3 bg-white text-zinc-900 font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}




