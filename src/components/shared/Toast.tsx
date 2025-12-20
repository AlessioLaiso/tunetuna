import { memo } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertCircle, Info } from 'lucide-react'
import { useToastStore, Toast as ToastType } from '../../stores/toastStore'

const ToastItem = memo(function ToastItem({ toast }: { toast: ToastType }) {
  const { removeToast } = useToastStore()

  const icons = {
    success: <Check className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" />,
  }

  // Use zinc-900 to match playerbar style, with red for errors
  const colors = {
    success: 'bg-zinc-900 border border-zinc-700',
    error: 'bg-red-900/90 border border-red-700',
    info: 'bg-zinc-900 border border-zinc-700',
  }

  return (
    <div
      className={`${colors[toast.type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[200px] max-w-[320px] animate-slide-up`}
      role="alert"
    >
      <span className="flex-shrink-0">{icons[toast.type]}</span>
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 p-1 hover:bg-white/20 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
})

export default function ToastContainer() {
  const { toasts } = useToastStore()

  // Always render the portal to avoid conditional rendering issues
  return createPortal(
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-2 items-center pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>,
    document.body
  )
}
