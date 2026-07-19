import { useEffect, useMemo, useState } from 'react'
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
import { drawHand, CRYPT_HAND_SIZE, LIBRARY_HAND_SIZE } from '../lib/drawHand'
import { searchCrypt, emptyCryptFilters } from '../lib/cryptSearch'
import { searchLibrary, emptyLibraryFilters } from '../lib/librarySearch'
import { navigate } from '../lib/route'

function StatsDistribution({ label, entries }: { label: string; entries: { label: string; count: number }[] }) {
  if (entries.length === 0) return null
  return (
    <div className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wide text-ink-dim">{label}</span>
      <span className="flex flex-wrap gap-1">
        {entries.map((entry) => (
          <span key={entry.label} className="rounded-full border border-line-soft bg-raised px-2 py-0.5 text-[10px] text-ink-muted">
            {entry.label} <span className="font-mono text-ink">{entry.count}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

function QtyStepper({ qty, onChange }: { qty: number; onChange: (next: number) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(qty - 1)}
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        −
      </button>
      <span className="w-4 text-center font-mono text-xs text-ink">{qty}</span>
      <button
        onClick={() => onChange(qty + 1)}
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        +
      </button>
    </span>
  )
}

function ImportExportPanel({ deckId, onImported }: { deckId: number; onImported: () => void }) {
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

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">Text import / export</h2>
        <button
          onClick={doExport}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          Export .txt
        </button>
        <button
          onClick={doCopy}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? "Couldn't copy" : 'Copy text'}
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          {open ? 'Hide import' : 'Import text…'}
        </button>
      </div>
      {open && (
        <div className="grid gap-2">
          <textarea
            className="h-32 w-full rounded-lg border border-line bg-ground p-2 font-mono text-xs text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
            placeholder={'Paste a deck list, e.g.\n4x Deflection\n1x Aaradhya, The Callous Tyrant'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            onClick={doImport}
            disabled={!text.trim() || importing}
            className="justify-self-start rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import into this deck'}
          </button>
          {result && (
            <p className="text-xs text-ink-dim">
              Added {result.added} card{result.added === 1 ? '' : 's'}.
              {result.unresolved.length > 0 && <> Couldn't match: {result.unresolved.join(', ')}.</>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function AddCardBox({
  kind,
  onAdd,
}: {
  kind: 'crypt' | 'library'
  onAdd: (cardId: number) => void
}) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<{ id: number; name: string; sub: string }[]>([])

  useEffect(() => {
    if (!text.trim()) {
      setResults([])
      return
    }
    if (kind === 'crypt') {
      searchCrypt({ ...emptyCryptFilters, text }).then((rows) =>
        setResults(rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name, sub: `${r.clan} · cap ${r.capacity}` }))),
      )
    } else {
      searchLibrary({ ...emptyLibraryFilters, text }).then((rows) =>
        setResults(rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name, sub: r.types.join(' / ') }))),
      )
    }
  }, [text, kind])

  return (
    <div className="grid gap-2">
      <input
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
        placeholder={`Add ${kind} card by name…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {results.length > 0 && (
        <div className="grid gap-1 rounded-lg border border-line-soft bg-ground p-1.5">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onAdd(r.id)
                setText('')
                setResults([])
              }}
              className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-raised"
            >
              <span className="flex-1 truncate text-ink">{r.name}</span>
              <span className="shrink-0 text-ink-dim">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TestHandPanel({ cryptCards, libraryCards }: { cryptCards: DeckCardDetail[]; libraryCards: DeckCardDetail[] }) {
  const [cryptHand, setCryptHand] = useState<DeckCardDetail[] | null>(null)
  const [libraryHand, setLibraryHand] = useState<DeckCardDetail[] | null>(null)

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">Test hand</h2>
        <button
          onClick={() => setCryptHand(drawHand(cryptCards, CRYPT_HAND_SIZE))}
          disabled={cryptCards.length === 0}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
        >
          Draw crypt ({CRYPT_HAND_SIZE})
        </button>
        <button
          onClick={() => setLibraryHand(drawHand(libraryCards, LIBRARY_HAND_SIZE))}
          disabled={libraryCards.length === 0}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
        >
          Draw library ({LIBRARY_HAND_SIZE})
        </button>
      </div>
      {(cryptHand || libraryHand) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cryptHand && (
            <ul className="grid gap-1 text-xs text-ink-muted">
              {cryptHand.map((c, i) => (
                <li key={i}>
                  {c.name} <span className="text-ink-dim">· cap {c.capacity}</span>
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

function TagChips({ deckId }: { deckId: number }) {
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  const refresh = () => listTags(deckId).then(setTags)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

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
            aria-label={`Remove tag ${t}`}
            className="text-ink-dim hover:text-blood-hi"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="w-24 rounded-full border border-line-soft bg-transparent px-2 py-0.5 text-[11px] text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
        placeholder="Add tag…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button
        onClick={submit}
        disabled={!draft.trim()}
        className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-dim hover:text-ink disabled:opacity-40"
      >
        Add
      </button>
    </div>
  )
}

function CardRow({ card, onQty }: { card: DeckCardDetail; onQty: (qty: number) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
      <button
        onClick={() => navigate({ page: 'card', id: card.id })}
        className="flex-1 truncate text-left hover:text-blood-hi"
      >
        {card.name}
      </button>
      <span className="text-xs text-ink-dim">
        {card.kind === 'crypt' ? `${card.clan} · cap ${card.capacity}` : ''}
      </span>
      <QtyStepper qty={card.qty} onChange={onQty} />
    </div>
  )
}

type CryptSort = 'capacity' | 'clan' | 'group' | 'name' | 'quantity'

const LIBRARY_TYPE_ORDER = [
  'Master',
  'Action',
  'Action/Combat',
  'Political Action',
  'Ally',
  'Equipment',
  'Retainer',
  'Action Modifier',
  'Action Modifier/Combat',
  'Action Modifier/Reaction',
  'Reaction',
  'Combat',
]

function compareCryptCards(a: DeckCardDetail, b: DeckCardDetail, sort: CryptSort): number {
  const byName = () => a.name.localeCompare(b.name)
  const byCapacity = () => (b.capacity ?? -1) - (a.capacity ?? -1)
  switch (sort) {
    case 'clan':
      return (a.clan ?? '').localeCompare(b.clan ?? '') || byCapacity() || byName()
    case 'group':
      return (a.group ?? Number.MAX_SAFE_INTEGER) - (b.group ?? Number.MAX_SAFE_INTEGER) || byCapacity() || byName()
    case 'name':
      return byName()
    case 'quantity':
      return b.qty - a.qty || byCapacity() || byName()
    case 'capacity':
      return byCapacity() || byName()
  }
}

function LibraryCardGroups({ cards, onQty }: { cards: DeckCardDetail[]; onQty: (cardId: number, qty: number) => void }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, DeckCardDetail[]>()
    for (const card of cards) {
      const type = card.types.length > 0 ? card.types.join('/') : 'Other'
      grouped.set(type, [...(grouped.get(type) ?? []), card])
    }
    return [...grouped.entries()].sort(([typeA], [typeB]) => {
      const indexA = LIBRARY_TYPE_ORDER.indexOf(typeA)
      const indexB = LIBRARY_TYPE_ORDER.indexOf(typeB)
      if (indexA === -1 && indexB === -1) return typeA.localeCompare(typeB)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  }, [cards])

  return (
    <div className="grid gap-2">
      {groups.map(([type, typeCards]) => (
        <div key={type} className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line-soft bg-raised px-3 py-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">{type}</h3>
            <span className="font-mono text-[10px] text-ink-dim">
              {typeCards.reduce((sum, card) => sum + card.qty, 0)}
            </span>
          </div>
          <div className="divide-y divide-line-soft">
            {typeCards.map((card) => (
              <CardRow key={card.id} card={card} onQty={(qty) => onQty(card.id, qty)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DeckEditor({ id }: { id: number }) {
  const [deck, setDeck] = useState<DeckSummary | null>(null)
  const [cards, setCards] = useState<DeckCardDetail[]>([])
  const [stats, setStats] = useState<DeckStats | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [error, setError] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [authorDraft, setAuthorDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [cryptSort, setCryptSort] = useState<CryptSort>('capacity')

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
      setStats(await computeDeckStats(c))
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
  const sortedCryptCards = useMemo(
    () => [...cryptCards].sort((a, b) => compareCryptCards(a, b, cryptSort)),
    [cryptCards, cryptSort],
  )

  if (status === 'loading') return <p className="text-sm text-ink-dim">Loading deck…</p>
  if (status === 'error') return <p className="text-sm text-blood-hi">Couldn't load deck: {error}</p>
  if (status === 'missing' || !deck)
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-ink-muted">No deck with id {id}.</p>
        <button onClick={() => navigate({ page: 'decks' })} className="justify-self-start text-blood-hi underline">
          Back to decks
        </button>
      </div>
    )

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ page: 'decks' })} className="text-xs text-ink-dim hover:text-ink-muted">
          ← decks
        </button>
        <input
          className="flex-1 rounded-lg border border-transparent bg-transparent px-1 font-display text-2xl text-ink hover:border-line-soft focus:border-blood focus:outline-none"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && nameDraft !== deck.name && renameDeck(id, nameDraft.trim()).then(refresh)}
        />
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
          {shareStatus === 'copied' ? 'Link copied!' : shareStatus === 'error' ? "Couldn't copy" : 'Share'}
        </button>
        <button
          onClick={async () => navigate({ page: 'deck', id: await cloneDeck(id) })}
          className="text-xs text-ink-dim hover:text-ink-muted"
        >
          Clone
        </button>
        <button
          onClick={async () => {
            if (confirm(`Delete "${deck.name}"? This can't be undone.`)) {
              await deleteDeck(id)
              navigate({ page: 'decks' })
            }
          }}
          className="text-xs text-ink-dim hover:text-blood-hi"
        >
          Delete deck
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(12rem,0.35fr)_1fr]">
        <input
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder="Author"
          value={authorDraft}
          onChange={(event) => setAuthorDraft(event.target.value)}
          onBlur={saveMetadata}
        />
        <textarea
          className="min-h-10 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder="Deck description, strategy, or notes…"
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          onBlur={saveMetadata}
        />
      </div>

      <TagChips deckId={id} />

      {stats && (
        <div className="grid gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-ink-muted">
              <span className="font-mono text-ink">{stats.cryptCount}</span> crypt ·{' '}
              <span className="font-mono text-ink">{stats.libraryCount}</span> library
            </span>
            {stats.capacity && (
              <span className="text-ink-muted">
                capacity <span className="font-mono text-ink">{stats.capacity.min}</span>–
                <span className="font-mono text-ink">{stats.capacity.max}</span> · avg{' '}
                <span className="font-mono text-ink">{stats.capacity.average.toFixed(2)}</span>
              </span>
            )}
            {stats.violations.length === 0 ? (
              <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold">V5 Legal</span>
            ) : (
              <ul className="grid gap-0.5 text-blood-hi">
                {stats.violations.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <StatsDistribution label="Library types" entries={stats.types} />
            <StatsDistribution label="Disciplines" entries={stats.disciplines} />
            <StatsDistribution label="Blood cost curve" entries={stats.bloodCosts} />
            <StatsDistribution label="Pool cost curve" entries={stats.poolCosts} />
          </div>
        </div>
      )}

      <TestHandPanel cryptCards={cryptCards} libraryCards={libraryCards} />
      <ImportExportPanel deckId={id} onImported={refresh} />

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Crypt</h2>
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-dim">
              Sort
              <select
                value={cryptSort}
                onChange={(event) => setCryptSort(event.target.value as CryptSort)}
                className="rounded border border-line bg-surface px-1.5 py-1 text-xs normal-case tracking-normal text-ink-muted"
              >
                <option value="capacity">Capacity</option>
                <option value="clan">Clan</option>
                <option value="group">Group</option>
                <option value="name">Name</option>
                <option value="quantity">Quantity</option>
              </select>
            </label>
          </div>
          <AddCardBox kind="crypt" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {cryptCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">No crypt cards yet.</p>}
            {sortedCryptCards.map((c) => (
              <CardRow key={c.id} card={c} onQty={(qty) => changeQty(c.id, qty)} />
            ))}
          </div>
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Library</h2>
          <AddCardBox kind="library" onAdd={addCard} />
          {libraryCards.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-3 py-4 text-center text-xs text-ink-dim">
              No library cards yet.
            </p>
          ) : (
            <LibraryCardGroups cards={libraryCards} onQty={changeQty} />
          )}
        </section>
      </div>
    </div>
  )
}
