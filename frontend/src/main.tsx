import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CardLanguageProvider } from './lib/cardLanguage'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

createRoot(root).render(
  <StrictMode>
    <CardLanguageProvider>
      <App />
    </CardLanguageProvider>
  </StrictMode>,
)

// Register the app-shell service worker (src/sw.ts) so the PWA loads
// offline after a first successful visit. Card data offline support is
// handled separately by the OPFS-backed dbWorker; this only covers the
// static JS/CSS/wasm/HTML shell.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { type: 'module' }).catch((error) => {
      console.error('service worker registration failed', error)
    })
  })
}

// Development must always reflect Vite's current module graph. Remove an old
// SchreckNet worker/cache left by a previous production-style localhost run.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister())),
  )
  if ('caches' in window) {
    void caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('schrecknet-shell-'))
          .map((name) => caches.delete(name)),
      ),
    )
  }
}
