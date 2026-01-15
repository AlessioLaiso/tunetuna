import React, { Component, ErrorInfo, ReactNode } from 'react'
import { logger } from '../utils/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  showCopied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    showCopied: false,
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Always log errors even in production for debugging
    logger.error('Uncaught error:', error, errorInfo)
  }

  private handleCopyError = async () => {
    const errorDetails = `Error: ${this.state.error?.message}\n\nStack: ${this.state.error?.stack || 'N/A'}`
    try {
      await navigator.clipboard.writeText(errorDetails)
      this.setState({ showCopied: true })
      setTimeout(() => this.setState({ showCopied: false }), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      logger.log('Error details:', errorDetails)
    }
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleClearAndReload = () => {
    localStorage.clear()
    // Also clear IndexedDB
    indexedDB.deleteDatabase('tunetuna-storage')
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-4 text-sm">
              The app encountered an unexpected error. You can try reloading, or clear data if the issue persists.
            </p>
            <div className="bg-zinc-900 rounded-lg p-3 mb-4 text-left">
              <p className="text-red-400 text-sm font-mono break-all">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleReload}
                className="w-full bg-[var(--accent-color)] hover:brightness-90 text-white font-semibold py-3 px-4 rounded-lg transition-all"
              >
                Reload App
              </button>
              <button
                onClick={this.handleClearAndReload}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Clear Data & Reload
              </button>
              <button
                onClick={this.handleCopyError}
                className="w-full text-gray-400 hover:text-white py-2 px-4 text-sm transition-colors"
              >
                {this.state.showCopied ? '✓ Copied to clipboard' : 'Copy error details'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}


