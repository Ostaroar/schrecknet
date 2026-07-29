import { useEffect, useState } from 'react'
import {
  getInventoryCardDetails,
  setInventoryQty,
  adjustInventoryQtyByMap,
  exportInventoryText,
  importInventoryText,
  computeGlobalMissing,
  exportGlobalMissingText,
  type InventoryCardDetail,
  type InventoryImportResult,
  type MissingCard,
} from '../lib/inventoryStore'
import {
  listPrecons,
  getPreconCardCounts,
  adjustOwnedPreconQty,
  getOwnedPreconQty,
  type PreconSummary,
} from '../lib/precons'
import { navigate } from '../lib/route'
import { useUiStrings, type UiStrings } from '../lib/i18n'
import AddCardBox from './AddCardBox'
import { CardTypeSummary, ClanSymbol } from './VtesSymbol'

function QtyStepper({ qty, onChange }: { qty: number; onChange: (next: number) => void }) {
  const ui = useUiStrings().inventory
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

function CardRow({
  card,
  onQty,
  ui,
}: {
  card: InventoryCardDetail
  onQty: (qty: number) => void
  ui: UiStrings['inventory']
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
      <button
        onClick={() => navigate({ page: 'card', id: card.id })}
        className="flex-1 truncate text-left hover:text-blood-hi"
      >
        {card.name}
      </button>
      {card.kind === 'crypt' ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted">
          {card.clan && <ClanSymbol clan={card.clan} className="size-4" />}
          {card.clan} · cap {card.capacity}
        </span>
      ) : (
        <CardTypeSummary
          types={card.types}
          className="max-w-48 shrink-0 text-xs text-ink-muted"
        />
      )}
      <QtyStepper qty={card.qty} onChange={onQty} />
      <button
        onClick={() => onQty(0)}
        aria-label={ui.removeAria(card.name)}
        className="text-ink-dim hover:text-blood-hi"
      >
        ×
      </button>
    </div>
  )
}

function ImportExportPanel({ onImported, ui }: { onImported: () => void; ui: UiStrings['inventory'] }) {
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
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.importExportTitle}</h2>
        <button onClick={doExport} className="min-h-10 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink sm:min-h-0">
          {ui.exportTxt}
        </button>
        <label className="flex min-h-10 cursor-pointer items-center rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink sm:min-h-0">
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
        <button onClick={() => setOpen((o) => !o)} className="min-h-10 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink sm:min-h-0">
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
            {importing ? ui.importing : ui.addToInventory}
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

function AddPreconPanel({ onChanged, ui }: { onChanged: () => void; ui: UiStrings['inventory'] }) {
  const [precons, setPrecons] = useState<PreconSummary[]>([])
  const [selected, setSelected] = useState('')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState<'add' | 'remove' | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    listPrecons().then(setPrecons)
  }, [])

  const selectedPrecon = precons.find((p) => `${p.set}:${p.precon}` === selected) ?? null

  const apply = async (mode: 'add' | 'remove') => {
    if (!selectedPrecon) return
    const requested = Math.max(1, Math.floor(qty) || 1)
    const owned = await getOwnedPreconQty(selectedPrecon.set, selectedPrecon.precon)
    const amount = mode === 'add' ? requested : Math.min(requested, owned)
    if (amount === 0) {
      setStatus(ui.noOwnedPrecons)
      return
    }
    setBusy(mode)
    const counts = await getPreconCardCounts(selectedPrecon.set, selectedPrecon.precon)
    const sign = mode === 'add' ? 1 : -1
    const deltas = new Map([...counts].map(([cardId, copies]) => [cardId, sign * amount * copies]))
    await adjustInventoryQtyByMap(deltas)
    await adjustOwnedPreconQty(selectedPrecon.set, selectedPrecon.precon, sign * amount)
    setStatus(
      mode === 'add' ? ui.addedCopies(amount, counts.size) : ui.removedCopies(amount, counts.size),
    )
    setBusy(null)
    onChanged()
  }

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.addRemovePreconTitle}</h2>
      <p className="text-xs text-ink-dim">{ui.preconNote}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <select
          aria-label={ui.addRemovePreconTitle}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="min-h-10 w-full min-w-0 max-w-full rounded-lg border border-line bg-ground px-3 py-1.5 text-sm text-ink outline-none focus:border-blood-hi sm:min-h-0 sm:flex-1"
        >
          <option value="">{ui.choosePrecon}</option>
          {precons.map((p) => (
            <option key={`${p.set}:${p.precon}`} value={`${p.set}:${p.precon}`}>
              {p.set} — {p.precon} ({p.card_count} cards)
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-dim">
          {ui.preconQuantityLabel}
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(event) => setQty(Number(event.target.value))}
            className="min-h-10 w-16 rounded-lg border border-line bg-ground px-2 py-1.5 text-sm text-ink outline-none focus:border-blood-hi sm:min-h-0"
          />
        </label>
        <button
          onClick={() => apply('add')}
          disabled={!selectedPrecon || busy !== null}
          className="min-h-10 rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50 sm:min-h-0"
        >
          {busy === 'add' ? ui.adding : ui.addToInventory}
        </button>
        <button
          onClick={() => apply('remove')}
          disabled={!selectedPrecon || busy !== null}
          className="min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50 sm:min-h-0"
        >
          {busy === 'remove' ? ui.removing : ui.removeFromInventory}
        </button>
      </div>
      {status && <p className="text-xs text-ink-dim">{status}</p>}
    </div>
  )
}

function MissingCardsPanel({ refreshKey, ui }: { refreshKey: number; ui: UiStrings['inventory'] }) {
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
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.missingCardsTitle(total, cards.length)}</h2>
        <button
          onClick={doExport}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          {ui.exportWantList}
        </button>
      </div>
      <p className="text-xs text-ink-dim">{ui.missingNote}</p>
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
  const ui = useUiStrings().inventory
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

  if (status === 'loading') return <p className="text-sm text-ink-dim">{ui.loading}</p>
  if (status === 'error') return <p className="text-sm text-blood-hi">{ui.loadError}: {error}</p>

  const cryptCards = cards.filter((c) => c.kind === 'crypt')
  const libraryCards = cards.filter((c) => c.kind === 'library')
  const cryptCount = cryptCards.reduce((sum, c) => sum + c.qty, 0)
  const libraryCount = libraryCards.reduce((sum, c) => sum + c.qty, 0)

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink">{ui.title}</h1>
        <span className="text-xs text-ink-dim">{ui.counts(cryptCount, libraryCount)}</span>
      </div>

      <ImportExportPanel onImported={refresh} ui={ui} />
      <AddPreconPanel onChanged={refresh} ui={ui} />
      <MissingCardsPanel refreshKey={refreshKey} ui={ui} />

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.crypt}</h2>
          <AddCardBox kind="crypt" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {cryptCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">{ui.noCryptOwned}</p>}
            {cryptCards.map((c) => (
              <CardRow key={c.id} card={c} onQty={(qty) => changeQty(c.id, qty)} ui={ui} />
            ))}
          </div>
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.library}</h2>
          <AddCardBox kind="library" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {libraryCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">{ui.noLibraryOwned}</p>}
            {libraryCards.map((c) => (
              <CardRow key={c.id} card={c} onQty={(qty) => changeQty(c.id, qty)} ui={ui} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
