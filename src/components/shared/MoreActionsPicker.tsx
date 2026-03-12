import type { LucideIcon } from 'lucide-react'
import ResponsiveModal from './ResponsiveModal'

export interface MoreAction {
  id: string
  label: string
  icon: LucideIcon
}

interface MoreActionsPickerProps {
  isOpen: boolean
  onClose: () => void
  actions: MoreAction[]
  loading?: boolean
  loadingAction?: string | null
  onAction: (actionId: string) => void
  mode?: 'mobile' | 'desktop'
  position?: { x: number; y: number }
  zIndex?: number
}

export default function MoreActionsPicker({
  isOpen,
  onClose,
  actions,
  loading = false,
  loadingAction = null,
  onAction,
  mode = 'mobile',
  position,
  zIndex = 99999,
}: MoreActionsPickerProps) {
  if (!isOpen) return null

  // Desktop mode - floating menu
  if (mode === 'desktop') {
    const menuWidth = 240
    const menuHeight = Math.min(400, actions.length * 44 + 8)

    let menuX = position?.x || 100
    let menuY = position?.y || 100

    if (menuX + menuWidth > window.innerWidth) {
      menuX = window.innerWidth - menuWidth - 10
    }
    if (menuY + menuHeight > window.innerHeight) {
      menuY = window.innerHeight - menuHeight - 10
    }

    return (
      <>
        <div
          className="fixed inset-0"
          onClick={onClose}
          style={{ zIndex: zIndex - 1 }}
        />
        <div
          className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[200px]"
          style={{
            left: menuX,
            top: menuY,
            zIndex,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-0">
            {actions.map((action) => {
              const Icon = action.icon
              const isActionLoading = loading && loadingAction === action.id

              return (
                <button
                  key={action.id}
                  onClick={() => onAction(action.id)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  <Icon className="w-4 h-4 text-white flex-shrink-0" />
                  <span className="flex-1 text-sm text-white">{action.label}</span>
                  {isActionLoading && (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // Mobile mode - bottom sheet
  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} zIndex={zIndex}>
      <div className="pb-6">
        <div className="space-y-1">
          {actions.map((action) => {
            const Icon = action.icon
            const isActionLoading = loading && loadingAction === action.id

            return (
              <button
                key={action.id}
                onClick={() => onAction(action.id)}
                disabled={loading}
                className="w-full flex items-center gap-4 pl-4 pr-4 py-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon className="w-5 h-5 text-white" />
                <span className="flex-1 text-left text-white font-medium">{action.label}</span>
                {isActionLoading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </ResponsiveModal>
  )
}
