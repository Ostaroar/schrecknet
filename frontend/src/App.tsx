import { lazy, Suspense, useEffect, useState } from 'react'
import BrandMark from './components/BrandMark'
import KofiButton from './components/KofiButton'
import CommandPalette from './components/CommandPalette'
import BackupReminder from './components/BackupReminder'
import { cardDbVersion, getCardsMeta, type CardMeta } from './lib/db'
import { languageLabel, useCardLanguage } from './lib/cardLanguage'
import { getUiStrings, loadUiLanguage, UI_LANGUAGES } from './lib/i18n'
import { useRoute, navigate } from './lib/route'
import { useDocumentHead } from './lib/documentHead'
import { routeDocumentHead } from './lib/seo'

// Route-gated views are code-split (docs/roadmap.md Phase 4 performance budget):
// visiting one route shouldn't download every other route's JS up front.
const CryptSearch = lazy(() => import('./components/CryptSearch'))
const LibrarySearch = lazy(() => import('./components/LibrarySearch'))
const CardPage = lazy(() => import('./components/CardPage'))
const DeckList = lazy(() => import('./components/DeckList'))
const DeckEditor = lazy(() => import('./components/DeckEditor'))
const DeckReview = lazy(() => import('./components/DeckReview'))
const InventoryPage = lazy(() => import('./components/InventoryPage'))
const ProxySheet = lazy(() => import('./components/ProxySheet'))
const SharedDeckPreview = lazy(() => import('./components/SharedDeckPreview'))
const DeckDiff = lazy(() => import('./components/DeckDiff'))
const PreconBrowser = lazy(() => import('./components/PreconBrowser'))
const RulesPage = lazy(() => import('./components/RulesPage'))
const ChangelogPage = lazy(() => import('./components/ChangelogPage'))
const LimitedFormatPage = lazy(() => import('./components/LimitedFormatPage'))
const TablePage = lazy(() => import('./components/TablePage'))
const LegalPage = lazy(() => import('./components/LegalPage'))
const SettingsPage = lazy(() => import('./components/SettingsPage'))
const AboutPage = lazy(() => import('./components/InfoPages').then((m) => ({ default: m.AboutPage })))
const HelpPage = lazy(() => import('./components/InfoPages').then((m) => ({ default: m.HelpPage })))

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
        <button
          onClick={() => navigate({ page: 'crypt' })}
          className="group flex items-center gap-3 text-left"
          aria-label="SchreckNet"
        >
          <span className="grid size-10 place-items-center rounded-xl border border-line bg-gradient-to-br from-raised to-ground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <BrandMark className="h-6 w-7 drop-shadow-[0_0_5px_rgba(208,75,88,0.35)] transition group-hover:drop-shadow-[0_0_9px_rgba(208,75,88,0.6)]" />
          </span>
          <span className="grid gap-0.5 leading-none">
            <span className="font-display text-xl uppercase tracking-[0.12em] text-ink">
              Schreck<span className="text-blood-hi">Net</span>
            </span>
            <span className="hidden text-[9px] uppercase tracking-[0.24em] text-ink-dim sm:block">
              {ui.header.tagline}
            </span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5" role="group" aria-label={ui.header.cardTextLabel}>
            {UI_LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                // Load the pack before switching, so the UI never flashes
                // English on the way to the chosen language. `loadUiLanguage`
                // resolves immediately for an already-loaded pack (and for en),
                // and never rejects.
                onClick={() => void loadUiLanguage(option).then(() => setLanguage(option))}
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
        <Suspense fallback={<p className="py-16 text-center text-sm text-ink-muted">{ui.header.routeLoading}</p>}>
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
          <>
            <BackupReminder ui={ui.settings} />
            <InventoryPage />
          </>
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
        ) : route.page === 'legal' ? (
          <LegalPage />
        ) : route.page === 'settings' ? (
          <SettingsPage ui={ui.settings} cardVersion={cardDbVersion()} />
        ) : route.page === 'decks' ? (
          <>
            <BackupReminder ui={ui.settings} />
            <DeckList />
          </>
        ) : route.page === 'library' ? (
          <LibrarySearch />
        ) : (
          <CryptSearch />
        )}
        </Suspense>
      </main>

      <CommandPalette />
      <KofiButton label={ui.footer.support} />

      <footer className="grid justify-items-center gap-2 py-6 text-center text-xs text-ink-dim">
        <a
          href="https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/dark-pack-logo.png" alt="Dark Pack" className="h-10 w-10" />
        </a>
        <span>{ui.footer.copyright}</span>
        <span>{ui.footer.disclaimer}</span>
        <span className="flex justify-center gap-3">
          <button onClick={() => navigate({ page: 'help' })} className="hover:text-ink-muted">{ui.footer.help}</button>
          <button onClick={() => navigate({ page: 'about' })} className="hover:text-ink-muted">{ui.footer.about}</button>
          <button onClick={() => navigate({ page: 'legal' })} className="hover:text-ink-muted">{ui.footer.legal}</button>
          <button onClick={() => navigate({ page: 'settings' })} className="hover:text-ink-muted">{ui.footer.settings}</button>
          <a href="https://ko-fi.com/jannikostertag" target="_blank" rel="noopener noreferrer" className="hover:text-ink-muted">{ui.footer.support}</a>
        </span>
      </footer>
    </div>
  )
}
