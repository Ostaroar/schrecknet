import { useEffect, useState } from 'react'
import {
  getInventoryCardDetails,
  setInventoryQty,
  exportInventoryText,
  importInventoryText,
  type InventoryCardDetail,
  type InventoryImportResult,
} from '../lib/inventoryStore'
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
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">Text import / export</h2>
        <button onClick={doExport} className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink">
          Export .txt
        </button>
        <label className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink">
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
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink">
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

export default function InventoryPage() {
  const [cards, setCards] = useState<InventoryCardDetail[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  const refresh = async () => {
    try {
      setCards(await getInventoryCardDetails())
      setStatus('ready')
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
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink">Inventory</h1>
        <span className="text-xs text-ink-dim">
          {cryptCount} crypt · {libraryCount} library
        </span>
      </div>

      <ImportExportPanel onImported={refresh} />

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
