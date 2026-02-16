import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ResponsiveModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  zIndex?: number
}

export default function ResponsiveModal({ isOpen, onClose, children, zIndex = 110 }: ResponsiveModalProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(false)
      setShouldRender(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })
      document.body.style.overflow = 'hidden'
    } else {
      setIsVisible(false)
      const timer = setTimeout(() => {
        setShouldRender(false)
        document.body.style.overflow = ''
      }, 300)
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

      {/* Mobile: Bottom Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl shadow-2xl transform transition-transform duration-300 ease-out md:hidden ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-safe pt-4">
          <div className="max-w-[768px] mx-auto w-full">
            {children}
          </div>
        </div>
      </div>

      {/* Desktop: Centered Modal */}
      <div
        className={`hidden md:flex absolute inset-0 items-center justify-center p-4 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      >
        <div
          className={`bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700/50 w-full max-w-[480px] max-h-[80vh] overflow-y-auto transform transition-transform duration-300 ease-out ${
            isVisible ? 'scale-100' : 'scale-95'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pt-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
