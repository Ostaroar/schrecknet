import { useEffect, useState } from 'react'
import CryptSearch from './components/CryptSearch'
import LibrarySearch from './components/LibrarySearch'
import CardPage from './components/CardPage'
import DeckList from './components/DeckList'
import DeckEditor from './components/DeckEditor'
import DeckReview from './components/DeckReview'
import InventoryPage from './components/InventoryPage'
import ProxySheet from './components/ProxySheet'
import SharedDeckPreview from './components/SharedDeckPreview'
import DeckDiff from './components/DeckDiff'
import PreconBrowser from './components/PreconBrowser'
import RulesPage from './components/RulesPage'
import CommandPalette from './components/CommandPalette'
import ChangelogPage from './components/ChangelogPage'
import LimitedFormatPage from './components/LimitedFormatPage'
import TablePage from './components/TablePage'
import { AboutPage, HelpPage } from './components/InfoPages'
import { getCardsMeta, type CardMeta } from './lib/db'
import { languageLabel, useCardLanguage } from './lib/cardLanguage'
import { getUiStrings, UI_LANGUAGES } from './lib/i18n'
import { useRoute, navigate } from './lib/route'
import { useDocumentHead } from './lib/documentHead'
import { routeDocumentHead } from './lib/seo'

const TABS = ['crypt', 'library', 'decks', 'inventory', 'limited', 'table', 'precons', 'rules', 'changelog', 'help', 'about'] as const
const LANGUAGE_FLAGS: Record<string, string> = { en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪' }

export default function App() {
  const [meta, setMeta] = useState<CardMeta | null>(null)
  const route = useRoute()
  const { language, setLanguage } = useCardLanguage()
  const ui = getUiStrings(language)
  useDocumentHead(routeDocumentHead(route))

  useEffect(() => {
    getCardsMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  const wide =
    route.page === 'crypt' ||
    route.page === 'library' ||
    route.page === 'deck' ||
    route.page === 'decks' ||
    route.page === 'proxy' ||
    route.page === 'review' ||
    route.page === 'share' ||
    route.page === 'diff' ||
    route.page === 'precons' ||
    route.page === 'inventory' ||
    route.page === 'limited' ||
    route.page === 'table' ||
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
          <div className="flex items-center gap-0.5" role="group" aria-label={ui.header.cardTextLabel}>
            {UI_LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLanguage(option)}
                aria-pressed={language === option}
                aria-label={languageLabel(option)}
                title={languageLabel(option)}
                className={
                  'grid size-7 place-items-center rounded-lg text-base leading-none transition ' +
                  (language === option ? 'bg-raised ring-1 ring-blood-hi' : 'opacity-60 hover:opacity-100')
                }
              >
                {LANGUAGE_FLAGS[option] ?? option.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="hidden rounded-full border border-line px-3 py-0.5 text-xs text-ink-muted sm:inline">
          {meta ? ui.header.cardCounts(meta.crypt, meta.library) : ui.header.v5Only}
          </span>
        </div>
      </header>

      {route.page !== 'card' &&
        route.page !== 'deck' &&
        route.page !== 'proxy' &&
        route.page !== 'review' &&
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
                      : t === 'limited'
                        ? ui.nav.limited
                        : t === 'table'
                          ? ui.nav.table
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
        ) : route.page === 'review' ? (
          <DeckReview id={route.deckId} />
        ) : route.page === 'share' ? (
          <SharedDeckPreview token={route.token} />
        ) : route.page === 'diff' ? (
          <DeckDiff />
        ) : route.page === 'precons' ? (
          <PreconBrowser />
        ) : route.page === 'inventory' ? (
          <InventoryPage />
        ) : route.page === 'limited' ? (
          <LimitedFormatPage />
        ) : route.page === 'table' ? (
          <TablePage />
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
          <a href="https://ko-fi.com/jannikostertag" target="_blank" rel="noopener noreferrer" className="hover:text-ink-muted">{ui.footer.support}</a>
        </span>
      </footer>
    </div>
  )
}
