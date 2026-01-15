import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { logger } from './utils/logger'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// Service Worker update checking for cache busting
const checkForAppUpdates = async () => {
  // Only run in production (not in development)
  if (import.meta.env.DEV) return;

  try {
    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.getRegistration();

    if (registration) {
      // Check if there's a waiting service worker (new version available)
      if (registration.waiting) {
        logger.log('New app version available, activating...');
        // Activate the new service worker immediately
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Listen for future updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              logger.log('New app version installed and ready');
              // Optionally reload the page or show a notification
              // For now, we'll let the service worker handle activation automatically
            }
          });
        }
      });
    }
  } catch (error) {
    logger.log('Update check failed:', error);
  }
};

// Initialize update checking
if ('serviceWorker' in navigator) {
  checkForAppUpdates();
}

