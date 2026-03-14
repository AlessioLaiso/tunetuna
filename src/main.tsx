import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { logger } from './utils/logger'
import { useToastStore } from './stores/toastStore'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

const DISMISSED_SW_KEY = 'dismissed-sw-version'

function promptForUpdate(waitingWorker: ServiceWorker) {
  const swUrl = waitingWorker.scriptURL
  if (localStorage.getItem(DISMISSED_SW_KEY) === swUrl) return

  useToastStore.getState().addToast(
    'New version available',
    'info',
    0, // persistent — no auto-dismiss
    {
      label: 'Update',
      onClick: () => {
        localStorage.removeItem(DISMISSED_SW_KEY)
        waitingWorker.postMessage({ type: 'SKIP_WAITING' })
        window.location.reload()
      },
    }
  )

  // If user dismisses via X, remember this SW version
  const unsubscribe = useToastStore.subscribe((state, prevState) => {
    if (state.toasts.length < prevState.toasts.length) {
      const dismissed = prevState.toasts.find(
        (t) => t.message === 'New version available' && !state.toasts.includes(t)
      )
      if (dismissed) {
        localStorage.setItem(DISMISSED_SW_KEY, swUrl)
        unsubscribe()
      }
    }
  })
}

// Service Worker update checking
const checkForAppUpdates = async () => {
  if (import.meta.env.DEV) return

  try {
    const registration = await navigator.serviceWorker.getRegistration()

    if (registration) {
      if (registration.waiting) {
        promptForUpdate(registration.waiting)
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              logger.log('New app version installed and ready')
              promptForUpdate(newWorker)
            }
          })
        }
      })
    }
  } catch (error) {
    logger.log('Update check failed:', error)
  }
}

if ('serviceWorker' in navigator) {
  checkForAppUpdates()
}

