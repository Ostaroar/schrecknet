import { useEffect, useMemo, useState } from 'react'
import { useUiStrings } from '../lib/i18n'
import {
  getDeck,
  getDeckCardDetails,
  setCardQty,
  renameDeck,
  updateDeckMetadata,
  deleteDeck,
  cloneDeck,
  buildShareUrl,
  exportDeckText,
  importDeckText,
  computeDeckStats,
  listTags,
  addTag,
  removeTag,
  type DeckSummary,
  type DeckCardDetail,
  type DeckStats,
  type ImportResult,
} from '../lib/deckStore'
import {
  setDeckInventoryMode,
  listDeckCardOverrides,
  setDeckCardOverride,
  computeDeckMissing,
  type InventoryMode,
} from '../lib/inventoryStore'
import { drawHand } from '../lib/drawHand'
import { navigate } from '../lib/route'
import { CardTypeSymbol, DisciplineSymbol } from './VtesSymbol'
import AddCardBox from './AddCardBox'
import { organizeDeckCards, type DeckCryptSort } from '../lib/core'
import { useLimitedFormat, isFormatActive, isCardLegalInFormat, getCardSetsMap } from '../lib/limitedFormat'
import { detectArchetypes, type ArchetypeMatch } from '../lib/archetypeTags'

function StatsDistribution({
  label,
  entries,
  symbols,
}: {
  label: string
  entries: { label: string; count: number }[]
  symbols?: 'card-type' | 'discipline'
}) {
  if (entries.length === 0) return null
  return (
    <div className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wide text-ink-dim">{label}</span>
      <span className="flex flex-wrap gap-1">
        {entries.map((entry) => (
          <span key={entry.label} className="inline-flex items-center gap-1 rounded-full border border-line-soft bg-raised px-2 py-0.5 text-[10px] text-ink-muted">
            {symbols === 'card-type' && <CardTypeSymbol type={entry.label} className="size-3.5" decorative />}
            {symbols === 'discipline' && <DisciplineSymbol code={entry.label} className="size-3.5" decorative />}
            {entry.label} <span className="font-mono text-ink">{entry.count}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

function QtyStepper({ qty, onChange }: { qty: number; onChange: (next: number) => void }) {
  const ui = useUiStrings().deckEditor
  return (
    <span className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(qty - 1)}
        aria-label={ui.decreaseQty}
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        −
      </button>
      <span className="w-4 text-center font-mono text-xs text-ink">{qty}</span>
      <button
        onClick={() => onChange(qty + 1)}
        aria-label={ui.increaseQty}
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        +
      </button>
    </span>
  )
}

function InventoryModeSelector({ mode, onChange }: { mode: InventoryMode; onChange: (mode: InventoryMode) => void }) {
  const ui = useUiStrings().deckEditor
  const options: { value: InventoryMode; label: string; hint: string }[] = [
    { value: 'excluded', label: ui.modeExcluded, hint: ui.modeExcludedHint },
    { value: 'flexible', label: ui.modeFlexible, hint: ui.modeFlexibleHint },
    { value: 'fixed', label: ui.modeFixed, hint: ui.modeFixedHint },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
      <span className="text-ink-dim">{ui.inventoryModeLabel}</span>
      <div className="flex rounded-lg border border-line bg-ground p-0.5" role="group" aria-label={ui.inventoryModeAria}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            aria-pressed={mode === option.value}
            onClick={() => onChange(option.value)}
            className={
              'rounded-md px-2 py-1 transition ' +
              (mode === option.value ? 'bg-blood text-white' : 'text-ink-muted hover:text-ink')
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function InventoryBadge({
  deckMode,
  override,
  missing,
  onToggleOverride,
}: {
  deckMode: InventoryMode
  override: 'fixed' | 'flexible' | undefined
  missing: number
  onToggleOverride: () => void
}) {
  const ui = useUiStrings().deckEditor
  if (deckMode === 'excluded') return null
  const effective = override ?? deckMode
  return (
    <span className="flex items-center gap-1.5">
      {missing > 0 && (
        <span className="rounded-full bg-blood/20 px-1.5 py-0.5 text-[10px] font-semibold text-blood-hi">
          {ui.missingBadge(missing)}
        </span>
      )}
      <button
        type="button"
        onClick={onToggleOverride}
        title={effective === 'fixed' ? ui.fixedHint : ui.flexibleHint}
        className={
          'rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ' +
          (override ? 'border-gold/50 bg-gold/10 text-gold' : 'border-line-soft text-ink-dim hover:text-ink-muted')
        }
      >
        {effective === 'fixed' ? ui.fixedLabel : ui.flexibleLabel}
      </button>
    </span>
  )
}

function ImportExportPanel({ deckId, onImported }: { deckId: number; onImported: () => void }) {
  const ui = useUiStrings().deckEditor
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const doExport = async () => {
    const content = await exportDeckText(deckId)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deck-${deckId}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async () => {
    setImporting(true)
    const res = await importDeckText(deckId, text)
    setResult(res)
    setImporting(false)
    setText('')
    onImported()
  }

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(await exportDeckText(deckId))
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('error')
    }
  }

  const loadFile = async (file: File) => {
    setText(await file.text())
    setResult(null)
    setOpen(true)
  }

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.importExportTitle}</h2>
        <button
          onClick={doExport}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          {ui.exportTxt}
        </button>
        <button
          onClick={doCopy}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          {copyStatus === 'copied' ? ui.copied : copyStatus === 'error' ? ui.couldNotCopy : ui.copyText}
        </button>
        <label className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink">
          {ui.loadTxt}
          <input
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) loadFile(file)
              event.target.value = ''
            }}
          />
        </label>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          {open ? ui.hideImport : ui.importText}
        </button>
      </div>
      {open && (
        <div className="grid gap-2">
          <textarea
            className="h-32 w-full rounded-lg border border-line bg-ground p-2 font-mono text-xs text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
            placeholder={ui.importPlaceholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            onClick={doImport}
            disabled={!text.trim() || importing}
            className="justify-self-start rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
          >
            {importing ? ui.importing : ui.importIntoDeck}
          </button>
          {result && (
            <p className="text-xs text-ink-dim">
              {ui.addedCards(result.added)}
              {result.unresolved.length > 0 && <> {ui.couldNotMatch(result.unresolved.join(', '))}</>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function TestHandPanel({ cryptCards, libraryCards }: { cryptCards: DeckCardDetail[]; libraryCards: DeckCardDetail[] }) {
  const ui = useUiStrings().deckEditor
  const [cryptHand, setCryptHand] = useState<DeckCardDetail[] | null>(null)
  const [libraryHand, setLibraryHand] = useState<DeckCardDetail[] | null>(null)
  const [drawError, setDrawError] = useState('')

  async function draw(section: 'crypt' | 'library') {
    setDrawError('')
    try {
      const cards = section === 'crypt' ? cryptCards : libraryCards
      const hand = await drawHand(cards, section)
      if (section === 'crypt') setCryptHand(hand)
      else setLibraryHand(hand)
    } catch (error) {
      setDrawError(error instanceof Error ? error.message : ui.drawErrorFallback)
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.testHand}</h2>
        <button
          onClick={() => void draw('crypt')}
          disabled={cryptCards.length === 0}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
        >
          {ui.drawCrypt}
        </button>
        <button
          onClick={() => void draw('library')}
          disabled={libraryCards.length === 0}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
        >
          {ui.drawLibrary}
        </button>
      </div>
      {drawError && <p className="text-xs text-blood-hi">{drawError}</p>}
      {(cryptHand || libraryHand) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cryptHand && (
            <ul className="grid gap-1 text-xs text-ink-muted">
              {cryptHand.map((c, i) => (
                <li key={i}>
                  {c.name} <span className="text-ink-dim">· {ui.capAbbrev(c.capacity)}</span>
                </li>
              ))}
            </ul>
          )}
          {libraryHand && (
            <ul className="grid gap-1 text-xs text-ink-muted">
              {libraryHand.map((c, i) => (
                <li key={i}>{c.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ArchetypeScanPanel({
  deckId,
  cards,
  stats,
  existingTags,
  onTagged,
}: {
  deckId: number
  cards: DeckCardDetail[]
  stats: DeckStats
  existingTags: string[]
  onTagged: () => void
}) {
  const ui = useUiStrings().deckEditor
  const [matches, setMatches] = useState<ArchetypeMatch[]>([])

  useEffect(() => {
    let active = true
    detectArchetypes(cards, stats).then((result) => {
      if (active) setMatches(result)
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, stats])

  if (matches.length === 0) return null

  return (
    <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.archetypeScan}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {matches.map((match) => {
          const alreadyTagged = existingTags.some((t) => t.toLowerCase() === match.label.toLowerCase())
          return (
            <div
              key={match.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-line-soft bg-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-display text-sm text-gold">{match.label}</p>
                <p className="text-xs text-ink-dim">{match.blurb}</p>
              </div>
              <button
                onClick={async () => {
                  await addTag(deckId, match.label)
                  onTagged()
                }}
                disabled={alreadyTagged}
                className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-dim hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {alreadyTagged ? ui.tagged : ui.addTagButton}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TagChips({ deckId, refreshSignal }: { deckId: number; refreshSignal?: number }) {
  const ui = useUiStrings().deckEditor
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  const refresh = () => listTags(deckId).then(setTags)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, refreshSignal])

  const submit = async () => {
    if (!draft.trim()) return
    await addTag(deckId, draft)
    setDraft('')
    refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-ink-muted"
        >
          {t}
          <button
            onClick={async () => {
              await removeTag(deckId, t)
              refresh()
            }}
            aria-label={ui.removeTagAria(t)}
            className="text-ink-dim hover:text-blood-hi"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="w-24 rounded-full border border-line-soft bg-transparent px-2 py-0.5 text-[11px] text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
        placeholder={ui.addTagPlaceholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button
        onClick={submit}
        disabled={!draft.trim()}
        className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-dim hover:text-ink disabled:opacity-40"
      >
        {ui.addButton}
      </button>
    </div>
  )
}

function CardRow({
  card,
  onQty,
  deckMode,
  override,
  missing,
  onToggleOverride,
}: {
  card: DeckCardDetail
  onQty: (qty: number) => void
  deckMode: InventoryMode
  override: 'fixed' | 'flexible' | undefined
  missing: number
  onToggleOverride: () => void
}) {
  const ui = useUiStrings().deckEditor
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-1.5 text-sm">
      <button
        onClick={() => navigate({ page: 'card', id: card.id })}
        className="min-w-0 flex-1 truncate text-left hover:text-blood-hi"
      >
        {card.name}
      </button>
      <span className="hidden shrink-0 text-xs text-ink-dim sm:inline">
        {card.kind === 'crypt' ? `${card.clan} · ${ui.capAbbrev(card.capacity)}` : ''}
      </span>
      <InventoryBadge deckMode={deckMode} override={override} missing={missing} onToggleOverride={onToggleOverride} />
      <QtyStepper qty={card.qty} onChange={onQty} />
    </div>
  )
}

function LibraryCardGroups({
  groups,
  onQty,
  deckMode,
  overrides,
  missingByCard,
  onToggleOverride,
}: {
  groups: { cardType: string; cards: DeckCardDetail[]; quantity: number }[]
  onQty: (cardId: number, qty: number) => void
  deckMode: InventoryMode
  overrides: Map<number, 'fixed' | 'flexible'>
  missingByCard: Map<number, number>
  onToggleOverride: (cardId: number) => void
}) {
  return (
    <div className="grid gap-2">
      {groups.map((group) => (
        <div key={group.cardType} className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line-soft bg-raised px-3 py-1.5">
            <h3 className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
              {group.cardType.split('/').map((part) => (
                <CardTypeSymbol key={part} type={part} className="size-3.5" decorative />
              ))}
              {group.cardType}
            </h3>
            <span className="font-mono text-[10px] text-ink-dim">
              {group.quantity}
            </span>
          </div>
          <div className="divide-y divide-line-soft">
            {group.cards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onQty={(qty) => onQty(card.id, qty)}
                deckMode={deckMode}
                override={overrides.get(card.id)}
                missing={missingByCard.get(card.id) ?? 0}
                onToggleOverride={() => onToggleOverride(card.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DeckEditor({ id }: { id: number }) {
  const strings = useUiStrings()
  const ui = strings.deckEditor
  const [deck, setDeck] = useState<DeckSummary | null>(null)
  const [cards, setCards] = useState<DeckCardDetail[]>([])
  const [stats, setStats] = useState<DeckStats | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [error, setError] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [authorDraft, setAuthorDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [cryptSort, setCryptSort] = useState<DeckCryptSort>('capacity')
  const [overrides, setOverrides] = useState<Map<number, 'fixed' | 'flexible'>>(new Map())
  const [missingByCard, setMissingByCard] = useState<Map<number, number>>(new Map())
  const [missingExpanded, setMissingExpanded] = useState(false)
  const [tagsRefreshKey, setTagsRefreshKey] = useState(0)
  const [cardSets, setCardSets] = useState<Map<number, string[]>>(new Map())
  const [limitedFormat] = useLimitedFormat()

  const refresh = async () => {
    try {
      const [d, c] = await Promise.all([getDeck(id), getDeckCardDetails(id)])
      if (!d) {
        setStatus('missing')
        return
      }
      setDeck(d)
      setNameDraft(d.name)
      setAuthorDraft(d.author ?? '')
      setDescriptionDraft(d.description ?? '')
      setCards(c)
      setStats(await computeDeckStats(c, strings.gameLoopHooks))
      setOverrides(await listDeckCardOverrides(id))
      setMissingByCard(d.inventory_mode === 'excluded' ? new Map() : await computeDeckMissing(c.map((card) => card.id)))
      setCardSets(await getCardSetsMap(c.map((card) => card.id)))
      setStatus('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const addCard = async (cardId: number) => {
    const existing = cards.find((c) => c.id === cardId)
    await setCardQty(id, cardId, (existing?.qty ?? 0) + 1)
    refresh()
  }

  const changeQty = async (cardId: number, qty: number) => {
    await setCardQty(id, cardId, qty)
    refresh()
  }

  const changeInventoryMode = async (mode: InventoryMode) => {
    await setDeckInventoryMode(id, mode)
    refresh()
  }

  const toggleCardOverride = async (cardId: number) => {
    if (!deck) return
    const current = overrides.get(cardId)
    const opposite = deck.inventory_mode === 'fixed' ? 'flexible' : 'fixed'
    await setDeckCardOverride(id, cardId, current ? null : opposite)
    refresh()
  }

  const saveMetadata = async () => {
    await updateDeckMetadata(id, authorDraft, descriptionDraft)
    setDeck((current) =>
      current
        ? {
            ...current,
            author: authorDraft.trim() || null,
            description: descriptionDraft.trim() || null,
          }
        : current,
    )
  }

  const cryptCards = useMemo(() => cards.filter((c) => c.kind === 'crypt'), [cards])
  const libraryCards = useMemo(() => cards.filter((c) => c.kind === 'library'), [cards])
  const organization = useMemo(
    () => organizeDeckCards(cryptCards, libraryCards, cryptSort),
    [cryptCards, libraryCards, cryptSort],
  )
  // vdb clamps a deck's own missing total to what it itself needs per card,
  // so other decks' claims never inflate what THIS deck reports as missing
  // (docs/inventory-plan.md § 1a).
  const deckMissingTotal = useMemo(
    () => cards.reduce((sum, card) => sum + Math.min(missingByCard.get(card.id) ?? 0, card.qty), 0),
    [cards, missingByCard],
  )
  const missingCardsList = useMemo(
    () =>
      cards
        .map((card) => ({ card, missing: Math.min(missingByCard.get(card.id) ?? 0, card.qty) }))
        .filter((entry) => entry.missing > 0)
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    [cards, missingByCard],
  )
  const limitedFormatActive = isFormatActive(limitedFormat)
  const limitedViolations = useMemo(
    () =>
      limitedFormatActive
        ? cards.filter((card) => !isCardLegalInFormat(card.id, cardSets.get(card.id) ?? [], card.kind, limitedFormat))
        : [],
    [cards, cardSets, limitedFormat, limitedFormatActive],
  )

  if (status === 'loading') return <p className="text-sm text-ink-dim">{ui.loadingDeck}</p>
  if (status === 'error') return <p className="text-sm text-blood-hi">{ui.loadError(error)}</p>
  if (status === 'missing' || !deck)
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-ink-muted">{ui.noDeckWithId(id)}</p>
        <button onClick={() => navigate({ page: 'decks' })} className="justify-self-start text-blood-hi underline">
          {ui.backToDecks}
        </button>
      </div>
    )

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex">
        <button onClick={() => navigate({ page: 'decks' })} className="text-xs text-ink-dim hover:text-ink-muted">
          {ui.backArrow}
        </button>
        <input
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 font-display text-2xl text-ink hover:border-line-soft focus:border-blood focus:outline-none"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && nameDraft !== deck.name && renameDeck(id, nameDraft.trim()).then(refresh)}
        />
        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:contents">
          <button
            onClick={async () => {
              try {
                const url = await buildShareUrl(id)
                await navigator.clipboard.writeText(url)
                setShareStatus('copied')
                setTimeout(() => setShareStatus('idle'), 2000)
              } catch {
                setShareStatus('error')
              }
            }}
            className="text-xs text-ink-dim hover:text-ink-muted"
          >
            {shareStatus === 'copied' ? ui.linkCopied : shareStatus === 'error' ? ui.couldNotCopy : ui.share}
          </button>
          <button
            onClick={async () => navigate({ page: 'deck', id: await cloneDeck(id) })}
            className="text-xs text-ink-dim hover:text-ink-muted"
          >
            {ui.clone}
          </button>
          <button
            onClick={() => navigate({ page: 'review', deckId: id })}
            className="text-xs text-ink-dim hover:text-ink-muted"
          >
            {ui.review}
          </button>
          <button
            onClick={() => navigate({ page: 'proxy', deckId: id })}
            className="text-xs text-ink-dim hover:text-ink-muted"
          >
            {ui.printProxies}
          </button>
          <button
            onClick={async () => {
              if (confirm(ui.confirmDeleteDeck(deck.name))) {
                await deleteDeck(id)
                navigate({ page: 'decks' })
              }
            }}
            className="text-xs text-ink-dim hover:text-blood-hi"
          >
            {ui.deleteDeck}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(12rem,0.35fr)_1fr]">
        <input
          className="min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder={ui.authorPlaceholder}
          value={authorDraft}
          onChange={(event) => setAuthorDraft(event.target.value)}
          onBlur={saveMetadata}
        />
        <textarea
          className="min-h-10 min-w-0 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder={ui.descriptionPlaceholder}
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          onBlur={saveMetadata}
        />
      </div>

      <TagChips deckId={id} refreshSignal={tagsRefreshKey} />

      {stats && (
        <ArchetypeScanPanel
          deckId={id}
          cards={cards}
          stats={stats}
          existingTags={deck.tags}
          onTagged={() => {
            setTagsRefreshKey((k) => k + 1)
            refresh()
          }}
        />
      )}

      {stats && (
        <div className="grid gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-ink-muted">
              <span className="font-mono text-ink">{stats.cryptCount}</span> {ui.cryptWord} ·{' '}
              <span className="font-mono text-ink">{stats.libraryCount}</span> {ui.libraryWord}
            </span>
            {stats.capacity && (
              <span className="text-ink-muted">
                {ui.capacityWord} <span className="font-mono text-ink">{stats.capacity.min}</span>–
                <span className="font-mono text-ink">{stats.capacity.max}</span> · {ui.avgWord}{' '}
                <span className="font-mono text-ink">{stats.capacity.average.toFixed(2)}</span>
              </span>
            )}
            {stats.violations.length === 0 ? (
              <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold">{ui.v5Legal}</span>
            ) : (
              <ul className="grid gap-0.5 text-blood-hi">
                {stats.violations.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            )}
            {limitedFormatActive && (
              limitedViolations.length === 0 ? (
                <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold">{ui.limitedFormatLegal}</span>
              ) : (
                <span className="text-blood-hi">
                  {ui.limitedViolationsText(limitedViolations.length, limitedViolations.map((c) => c.name).join(', '))}
                </span>
              )
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <StatsDistribution label={ui.libraryTypes} entries={stats.types} symbols="card-type" />
            <StatsDistribution label={ui.disciplinesLabel} entries={stats.disciplines} symbols="discipline" />
            <StatsDistribution label={ui.bloodCostCurve} entries={stats.bloodCosts} />
            <StatsDistribution label={ui.poolCostCurve} entries={stats.poolCosts} />
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <InventoryModeSelector mode={deck.inventory_mode} onChange={changeInventoryMode} />
          {deck.inventory_mode !== 'excluded' && (
            <span className="text-xs text-ink-dim">
              {deckMissingTotal > 0 ? (
                <button
                  type="button"
                  onClick={() => setMissingExpanded((v) => !v)}
                  className="text-blood-hi underline decoration-blood/40 underline-offset-2"
                >
                  {ui.copiesMissing(deckMissingTotal)} {missingExpanded ? '▴' : '▾'}
                </button>
              ) : (
                ui.allCopiesCovered
              )}
            </span>
          )}
        </div>
        {missingExpanded && missingCardsList.length > 0 && (
          <ul className="grid gap-1 divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
            {missingCardsList.map(({ card, missing }) => (
              <li key={card.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="flex-1 truncate">{card.name}</span>
                <span className="font-mono text-xs font-semibold text-blood-hi">{missing}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TestHandPanel cryptCards={cryptCards} libraryCards={libraryCards} />
      <ImportExportPanel deckId={id} onImported={refresh} />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.cryptHeader}</h2>
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-dim">
              {ui.sortLabel}
              <select
                value={cryptSort}
                onChange={(event) => setCryptSort(event.target.value as DeckCryptSort)}
                className="rounded border border-line bg-surface px-1.5 py-1 text-xs normal-case tracking-normal text-ink-muted"
              >
                <option value="capacity">{ui.sortOptionCapacity}</option>
                <option value="clan">{ui.sortOptionClan}</option>
                <option value="group">{ui.sortOptionGroup}</option>
                <option value="name">{ui.sortOptionName}</option>
                <option value="quantity">{ui.sortOptionQuantity}</option>
              </select>
            </label>
          </div>
          <AddCardBox kind="crypt" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {cryptCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">{ui.noCryptCards}</p>}
            {organization.crypt.map((c) => (
              <CardRow
                key={c.id}
                card={c}
                onQty={(qty) => changeQty(c.id, qty)}
                deckMode={deck.inventory_mode}
                override={overrides.get(c.id)}
                missing={missingByCard.get(c.id) ?? 0}
                onToggleOverride={() => toggleCardOverride(c.id)}
              />
            ))}
          </div>
        </section>

        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.libraryHeader}</h2>
          <AddCardBox kind="library" onAdd={addCard} />
          {libraryCards.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-3 py-4 text-center text-xs text-ink-dim">
              {ui.noLibraryCards}
            </p>
          ) : (
            <LibraryCardGroups
              groups={organization.libraryGroups}
              onQty={changeQty}
              deckMode={deck.inventory_mode}
              overrides={overrides}
              missingByCard={missingByCard}
              onToggleOverride={toggleCardOverride}
            />
          )}
        </section>
      </div>
    </div>
  )
}
