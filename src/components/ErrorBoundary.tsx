import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ErrorBoundary.tsx:18',message:'ErrorBoundary caught error',data:{errorMessage:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ErrorBoundary.tsx:22',message:'componentDidCatch triggered',data:{errorMessage:error.message,errorInfo},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-gray-400 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => {
                localStorage.clear()
                window.location.reload()
              }}
              className="bg-[var(--accent-color)] hover:brightness-90 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Clear Data & Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}


