import { useEffect, useState } from 'react'
import {
  getInventoryCardDetails,
  setInventoryQty,
  adjustInventoryQtyForCards,
  exportInventoryText,
  importInventoryText,
  computeGlobalMissing,
  exportGlobalMissingText,
  type InventoryCardDetail,
  type InventoryImportResult,
  type MissingCard,
} from '../lib/inventoryStore'
import { listPrecons, type PreconSummary } from '../lib/precons'
import { searchCrypt, emptyCryptFilters } from '../lib/cryptSearch'
import { searchLibrary, emptyLibraryFilters } from '../lib/librarySearch'
import { navigate } from '../lib/route'
import AddCardBox from './AddCardBox'

function QtyStepper({ qty, onChange }: { qty: number; onChange: (next: number) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(qty - 1)}
        aria-label="Decrease quantity"
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        −
      </button>
      <span className="w-4 text-center font-mono text-xs text-ink">{qty}</span>
      <button
        onClick={() => onChange(qty + 1)}
        aria-label="Increase quantity"
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        +
      </button>
    </span>
  )
}

function CardRow({ card, onQty }: { card: InventoryCardDetail; onQty: (qty: number) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
      <button
        onClick={() => navigate({ page: 'card', id: card.id })}
        className="flex-1 truncate text-left hover:text-blood-hi"
      >
        {card.name}
      </button>
      <span className="text-xs text-ink-dim">
        {card.kind === 'crypt' ? `${card.clan} · cap ${card.capacity}` : card.types.join(' / ')}
      </span>
      <QtyStepper qty={card.qty} onChange={onQty} />
      <button
        onClick={() => onQty(0)}
        aria-label={`Remove ${card.name} from inventory`}
        className="text-ink-dim hover:text-blood-hi"
      >
        ×
      </button>
    </div>
  )
}

function ImportExportPanel({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState<InventoryImportResult | null>(null)
  const [importing, setImporting] = useState(false)

  const doExport = async () => {
    const content = await exportInventoryText()
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'inventory.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async () => {
    setImporting(true)
    const res = await importInventoryText(text)
    setResult(res)
    setImporting(false)
    setText('')
    onImported()
  }

  const loadFile = async (file: File) => {
    setText(await file.text())
    setResult(null)
    setOpen(true)
  }

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">Text import / export</h2>
        <button onClick={doExport} className="min-h-10 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink sm:min-h-0">
          Export .txt
        </button>
        <label className="flex min-h-10 cursor-pointer items-center rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink sm:min-h-0">
          Load .txt
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
        <button onClick={() => setOpen((o) => !o)} className="min-h-10 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink sm:min-h-0">
          {open ? 'Hide import' : 'Import text…'}
        </button>
      </div>
      {open && (
        <div className="grid gap-2">
          <textarea
            className="h-32 w-full rounded-lg border border-line bg-ground p-2 font-mono text-xs text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
            placeholder={'Paste a card list, e.g.\n4x Deflection\n1x Aaradhya, The Callous Tyrant'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            onClick={doImport}
            disabled={!text.trim() || importing}
            className="justify-self-start rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Add to inventory'}
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

function AddPreconPanel({ onChanged }: { onChanged: () => void }) {
  const [precons, setPrecons] = useState<PreconSummary[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState<'add' | 'remove' | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    listPrecons().then(setPrecons)
  }, [])

  const selectedPrecon = precons.find((p) => `${p.set}:${p.precon}` === selected) ?? null

  const preconCardIds = async (): Promise<number[]> => {
    if (!selectedPrecon) return []
    const { set, precon } = selectedPrecon
    const [crypt, library] = await Promise.all([
      searchCrypt({ ...emptyCryptFilters, precons: [{ set, precon }] }),
      searchLibrary({ ...emptyLibraryFilters, precons: [{ set, precon }] }),
    ])
    return [...crypt.map((c) => c.id), ...library.map((c) => c.id)]
  }

  const apply = async (mode: 'add' | 'remove') => {
    if (!selectedPrecon) return
    setBusy(mode)
    const cardIds = await preconCardIds()
    await adjustInventoryQtyForCards(cardIds, mode === 'add' ? 1 : -1)
    setStatus(
      mode === 'add'
        ? `Added 1 copy each of ${cardIds.length} cards.`
        : `Removed 1 copy each of ${cardIds.length} cards.`,
    )
    setBusy(null)
    onChanged()
  }

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-xs uppercase tracking-wide text-ink-dim">Add / remove a precon</h2>
      <p className="text-xs text-ink-dim">
        Card quantities per precon aren't tracked by the data source, so this adds or removes one
        copy of each distinct card in the deck's known pool, not a full ready-to-play count.
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="min-h-10 w-full min-w-0 max-w-full rounded-lg border border-line bg-ground px-3 py-1.5 text-sm text-ink outline-none focus:border-blood-hi sm:min-h-0 sm:flex-1"
        >
          <option value="">Choose a precon…</option>
          {precons.map((p) => (
            <option key={`${p.set}:${p.precon}`} value={`${p.set}:${p.precon}`}>
              {p.set} — {p.precon} ({p.card_count} cards)
            </option>
          ))}
        </select>
        <button
          onClick={() => apply('add')}
          disabled={!selectedPrecon || busy !== null}
          className="min-h-10 rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50 sm:min-h-0"
        >
          {busy === 'add' ? 'Adding…' : 'Add to inventory'}
        </button>
        <button
          onClick={() => apply('remove')}
          disabled={!selectedPrecon || busy !== null}
          className="min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50 sm:min-h-0"
        >
          {busy === 'remove' ? 'Removing…' : 'Remove from inventory'}
        </button>
      </div>
      {status && <p className="text-xs text-ink-dim">{status}</p>}
    </div>
  )
}

function MissingCardsPanel({ refreshKey }: { refreshKey: number }) {
  const [cards, setCards] = useState<MissingCard[] | null>(null)

  useEffect(() => {
    computeGlobalMissing().then(setCards)
  }, [refreshKey])

  const doExport = async () => {
    const content = await exportGlobalMissingText()
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'want-list.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (cards === null) return null
  if (cards.length === 0) return null

  const total = cards.reduce((sum, c) => sum + c.missing, 0)

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">
          Missing cards — {total} copies across {cards.length} card{cards.length === 1 ? '' : 's'}
        </h2>
        <button
          onClick={doExport}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          Export want-list .txt
        </button>
      </div>
      <p className="text-xs text-ink-dim">
        What every inventory-tracked deck still needs, combined — decks marked "Not in inventory" aren't
        counted.
      </p>
      <ul className="grid gap-1 divide-y divide-line-soft rounded-lg border border-line bg-ground text-sm">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-1.5">
            <button
              onClick={() => navigate({ page: 'card', id: c.id })}
              className="flex-1 truncate text-left hover:text-blood-hi"
            >
              {c.name}
            </button>
            <span className="font-mono text-xs font-semibold text-blood-hi">{c.missing}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function InventoryPage() {
  const [cards, setCards] = useState<InventoryCardDetail[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = async () => {
    try {
      setCards(await getInventoryCardDetails())
      setStatus('ready')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const addCard = async (cardId: number) => {
    const existing = cards.find((c) => c.id === cardId)
    await setInventoryQty(cardId, (existing?.qty ?? 0) + 1)
    refresh()
  }

  const changeQty = async (cardId: number, qty: number) => {
    await setInventoryQty(cardId, qty)
    refresh()
  }

  if (status === 'loading') return <p className="text-sm text-ink-dim">Loading inventory…</p>
  if (status === 'error') return <p className="text-sm text-blood-hi">Couldn't load inventory: {error}</p>

  const cryptCards = cards.filter((c) => c.kind === 'crypt')
  const libraryCards = cards.filter((c) => c.kind === 'library')
  const cryptCount = cryptCards.reduce((sum, c) => sum + c.qty, 0)
  const libraryCount = libraryCards.reduce((sum, c) => sum + c.qty, 0)

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink">Inventory</h1>
        <span className="text-xs text-ink-dim">
          {cryptCount} crypt · {libraryCount} library
        </span>
      </div>

      <ImportExportPanel onImported={refresh} />
      <AddPreconPanel onChanged={refresh} />
      <MissingCardsPanel refreshKey={refreshKey} />

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Crypt</h2>
          <AddCardBox kind="crypt" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {cryptCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">No crypt cards owned yet.</p>}
            {cryptCards.map((c) => (
              <CardRow key={c.id} card={c} onQty={(qty) => changeQty(c.id, qty)} />
            ))}
          </div>
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Library</h2>
          <AddCardBox kind="library" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {libraryCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">No library cards owned yet.</p>}
            {libraryCards.map((c) => (
              <CardRow key={c.id} card={c} onQty={(qty) => changeQty(c.id, qty)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
