import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  zIndex?: number
}

export default function BottomSheet({ isOpen, onClose, children, zIndex = 110 }: BottomSheetProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Ensure isVisible is false initially for animation
      setIsVisible(false)
      // Start rendering
      setShouldRender(true)
      // Trigger animation on next frame to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })
      // Prevent body scroll when bottom sheet is open
      document.body.style.overflow = 'hidden'
    } else {
      // Start exit animation
      setIsVisible(false)
      // Remove from DOM after animation completes
      const timer = setTimeout(() => {
        setShouldRender(false)
        document.body.style.overflow = ''
      }, 300) // Match transition duration
      return () => {
        clearTimeout(timer)
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  if (!shouldRender) return null

  const content = (
    <div className="fixed inset-0" style={{ zIndex }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      
      {/* Bottom Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl shadow-2xl transform transition-transform duration-300 ease-out ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Content */}
        <div className="pb-safe pt-4">
          <div className="max-w-[768px] mx-auto w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  // Render to document.body using portal to escape any stacking contexts
  return createPortal(content, document.body)
}




