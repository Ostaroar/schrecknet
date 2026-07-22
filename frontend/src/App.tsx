import { useEffect, useState } from 'react'
import CryptSearch from './components/CryptSearch'
import LibrarySearch from './components/LibrarySearch'
import CardPage from './components/CardPage'
import DeckList from './components/DeckList'
import DeckEditor from './components/DeckEditor'
import InventoryPage from './components/InventoryPage'
import ProxySheet from './components/ProxySheet'
import SharedDeckPreview from './components/SharedDeckPreview'
import DeckDiff from './components/DeckDiff'
import PreconBrowser from './components/PreconBrowser'
import RulesPage from './components/RulesPage'
import CommandPalette from './components/CommandPalette'
import ChangelogPage from './components/ChangelogPage'
import { AboutPage, HelpPage } from './components/InfoPages'
import { getCardsMeta, type CardMeta } from './lib/db'
import { languageLabel, useCardLanguage } from './lib/cardLanguage'
import { getUiStrings } from './lib/i18n'
import { useHashRoute, navigate } from './lib/route'

const TABS = ['crypt', 'library', 'decks', 'inventory', 'precons', 'rules', 'changelog', 'help', 'about'] as const

export default function App() {
  const [meta, setMeta] = useState<CardMeta | null>(null)
  const route = useHashRoute()
  const { language, setLanguage } = useCardLanguage()
  const availableLanguages = meta?.languages?.length ? meta.languages : ['en']
  const ui = getUiStrings(language)

  useEffect(() => {
    getCardsMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  useEffect(() => {
    if (meta && !availableLanguages.includes(language)) setLanguage('en')
  }, [availableLanguages, language, meta, setLanguage])

  const wide =
    route.page === 'crypt' ||
    route.page === 'library' ||
    route.page === 'deck' ||
    route.page === 'decks' ||
    route.page === 'proxy' ||
    route.page === 'share' ||
    route.page === 'diff' ||
    route.page === 'precons' ||
    route.page === 'inventory' ||
    route.page === 'rules'

  return (
    <div className={'mx-auto flex min-h-screen flex-col px-3 sm:px-6 ' + (wide ? 'max-w-5xl' : 'max-w-3xl')}>
      <header className="flex flex-wrap items-center gap-3 py-4 sm:py-6">
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
              <span className="hidden sm:inline">{ui.header.cardTextLabel}</span>
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
          {meta ? ui.header.cardCounts(meta.crypt, meta.library) : ui.header.v5Only}
          </span>
        </div>
      </header>

      {route.page !== 'card' &&
        route.page !== 'deck' &&
        route.page !== 'proxy' &&
        route.page !== 'share' &&
        route.page !== 'diff' && (
        <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {TABS.map((t) => (
            <button
              key={t}
              data-route={t}
              onClick={() => navigate({ page: t })}
              className={
                'min-h-10 shrink-0 rounded-lg px-3 py-1.5 font-display text-sm capitalize sm:min-h-0 ' +
                (route.page === t ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink')
              }
            >
              {t === 'crypt'
                ? ui.nav.cryptSearch
                : t === 'library'
                  ? ui.nav.librarySearch
                  : t === 'decks'
                    ? ui.nav.decks
                    : t === 'inventory'
                      ? ui.nav.inventory
                      : t === 'precons'
                        ? ui.nav.precons
                        : t === 'rules'
                          ? ui.nav.rules
                          : t === 'changelog'
                            ? ui.nav.changelog
                          : t === 'help'
                            ? ui.nav.help
                            : ui.nav.about}
            </button>
          ))}
        </nav>
      )}

      <main className="min-w-0 flex-1 pb-10">
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
        ) : route.page === 'inventory' ? (
          <InventoryPage />
        ) : route.page === 'rules' ? (
          <RulesPage />
        ) : route.page === 'changelog' ? (
          <ChangelogPage ui={ui.changelog} />
        ) : route.page === 'help' ? (
          <HelpPage ui={ui.help} />
        ) : route.page === 'about' ? (
          <AboutPage ui={ui.about} />
        ) : route.page === 'decks' ? (
          <DeckList />
        ) : route.page === 'library' ? (
          <LibrarySearch />
        ) : (
          <CryptSearch />
        )}
      </main>

      <CommandPalette />

      <footer className="grid justify-items-center gap-2 py-6 text-center text-xs text-ink-dim">
        <img src="/dark-pack-logo.png" alt="Dark Pack" className="h-10 w-10" />
        <span>{ui.footer.copyright}</span>
        <span>{ui.footer.disclaimer}</span>
        <span className="flex justify-center gap-3">
          <button onClick={() => navigate({ page: 'help' })} className="hover:text-ink-muted">{ui.footer.help}</button>
          <button onClick={() => navigate({ page: 'about' })} className="hover:text-ink-muted">{ui.footer.about}</button>
        </span>
      </footer>
    </div>
  )
}
