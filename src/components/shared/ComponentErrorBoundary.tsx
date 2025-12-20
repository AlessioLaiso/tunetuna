import { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
  componentName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Lightweight error boundary for individual components.
 * Unlike the full-page ErrorBoundary, this shows an inline error state
 * and allows the rest of the app to continue functioning.
 */
export default class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[${this.props.componentName || 'Component'}] Error:`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center bg-zinc-900/50 rounded-lg border border-zinc-800">
          <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-sm text-gray-300 mb-3">
            Something went wrong{this.props.componentName ? ` in ${this.props.componentName}` : ''}.
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
