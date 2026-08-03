import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CardLanguageProvider, initialLanguage } from './lib/cardLanguage'
import { initializeCore } from './lib/core'
import { loadUiLanguage } from './lib/i18n'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')
const rootElement: HTMLElement = root

function renderApp() {
  createRoot(rootElement).render(
    <StrictMode>
      <CardLanguageProvider>
        <App />
      </CardLanguageProvider>
    </StrictMode>,
  )
}

// The UI-strings pack for the persisted language is fetched alongside the core
// so the first paint is already in the right language. `loadUiLanguage` never
// rejects (a failed pack just leaves English in place), so it cannot turn a
// language-chunk hiccup into the core-load error path below.
void Promise.all([initializeCore(), loadUiLanguage(initialLanguage())])
  .then(renderApp)
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    rootElement.textContent = `Couldn't load the shared Rust core: ${message}`
  })

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
