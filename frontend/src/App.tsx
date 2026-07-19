import { useEffect, useState } from 'react'
import CryptSearch from './components/CryptSearch'
import LibrarySearch from './components/LibrarySearch'
import CardPage from './components/CardPage'
import DeckList from './components/DeckList'
import DeckEditor from './components/DeckEditor'
import ProxySheet from './components/ProxySheet'
import SharedDeckPreview from './components/SharedDeckPreview'
import DeckDiff from './components/DeckDiff'
import PreconBrowser from './components/PreconBrowser'
import CommandPalette from './components/CommandPalette'
import { AboutPage, HelpPage } from './components/InfoPages'
import { getCardsMeta, type CardMeta } from './lib/db'
import { languageLabel, useCardLanguage } from './lib/cardLanguage'
import { useHashRoute, navigate } from './lib/route'

const TABS = ['crypt', 'library', 'decks', 'precons', 'help', 'about'] as const

export default function App() {
  const [meta, setMeta] = useState<CardMeta | null>(null)
  const route = useHashRoute()
  const { language, setLanguage } = useCardLanguage()
  const availableLanguages = meta?.languages?.length ? meta.languages : ['en']

  useEffect(() => {
    getCardsMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  useEffect(() => {
    if (meta && !availableLanguages.includes(language)) setLanguage('en')
  }, [availableLanguages, language, meta, setLanguage])

  const wide =
    route.page === 'deck' ||
    route.page === 'decks' ||
    route.page === 'proxy' ||
    route.page === 'share' ||
    route.page === 'diff' ||
    route.page === 'precons'

  return (
    <div className={'mx-auto flex min-h-screen flex-col px-6 ' + (wide ? 'max-w-5xl' : 'max-w-3xl')}>
      <header className="flex items-center gap-3 py-6">
        <span className="grid size-8 place-items-center rounded-lg bg-blood font-display text-lg font-bold text-white">
          S
        </span>
        <span className="font-display text-xl tracking-wide">SchreckNet</span>
        <kbd className="hidden rounded-md border border-line px-2 py-0.5 font-mono text-[10px] text-ink-dim sm:block">
          ⌘K
        </kbd>
        <div className="ml-auto flex items-center gap-2">
          {availableLanguages.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-ink-dim">
              <span className="hidden sm:inline">Card text</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                aria-label="Card text language"
                className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-blood-hi"
              >
                {availableLanguages.map((option) => (
                  <option key={option} value={option}>
                    {languageLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="hidden rounded-full border border-line px-3 py-0.5 text-xs text-ink-muted sm:inline">
          {meta ? `${meta.crypt} crypt · ${meta.library} library` : 'V5 only'}
          </span>
        </div>
      </header>

      {route.page !== 'card' &&
        route.page !== 'deck' &&
        route.page !== 'proxy' &&
        route.page !== 'share' &&
        route.page !== 'diff' && (
        <nav className="mb-4 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => navigate({ page: t })}
              className={
                'rounded-lg px-3 py-1.5 font-display text-sm capitalize ' +
                (route.page === t ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink')
              }
            >
              {t === 'crypt' || t === 'library' ? `${t} search` : t}
            </button>
          ))}
        </nav>
      )}

      <main className="flex-1 pb-10">
        {route.page === 'card' ? (
          <CardPage id={route.id} />
        ) : route.page === 'deck' ? (
          <DeckEditor id={route.id} />
        ) : route.page === 'proxy' ? (
          <ProxySheet deckId={route.deckId} />
        ) : route.page === 'share' ? (
          <SharedDeckPreview token={route.token} />
        ) : route.page === 'diff' ? (
          <DeckDiff />
        ) : route.page === 'precons' ? (
          <PreconBrowser />
        ) : route.page === 'help' ? (
          <HelpPage />
        ) : route.page === 'about' ? (
          <AboutPage />
        ) : route.page === 'decks' ? (
          <DeckList />
        ) : route.page === 'library' ? (
          <LibrarySearch />
        ) : (
          <CryptSearch />
        )}
      </main>

      <CommandPalette />

      <footer className="grid gap-2 py-6 text-center text-xs text-ink-dim">
        <span>
          Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with
          permission under the Dark Pack agreement. All rights reserved.
        </span>
        <span className="flex justify-center gap-3">
          <button onClick={() => navigate({ page: 'help' })} className="hover:text-ink-muted">Help</button>
          <button onClick={() => navigate({ page: 'about' })} className="hover:text-ink-muted">About</button>
        </span>
      </footer>
    </div>
  )
}
