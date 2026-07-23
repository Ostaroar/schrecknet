import { useEffect, useState } from 'react'
import {
  useLimitedFormat,
  isFormatActive,
  getCardNamesMap,
  exportLimitedFormatText,
  importLimitedFormatText,
  emptyLimitedFormat,
  type LimitedFormat,
} from '../lib/limitedFormat'
import { listSets } from '../lib/cryptSearch'
import { useUiStrings } from '../lib/i18n'
import AddCardBox from './AddCardBox'

function CardListEditor({
  title,
  ids,
  names,
  onRemove,
  onAdd,
  kind,
  none,
  removeAria,
}: {
  title: string
  ids: number[]
  names: Map<number, string>
  onRemove: (id: number) => void
  onAdd: (id: number) => void
  kind: 'crypt' | 'library'
  none: string
  removeAria: (name: string) => string
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-xs uppercase tracking-wide text-ink-dim">{title}</h3>
      <AddCardBox kind={kind} onAdd={onAdd} />
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-ink-muted"
          >
            {names.get(id) ?? `#${id}`}
            <button onClick={() => onRemove(id)} aria-label={removeAria(names.get(id) ?? String(id))} className="text-ink-dim hover:text-blood-hi">
              ×
            </button>
          </span>
        ))}
        {ids.length === 0 && <span className="text-xs text-ink-dim">{none}</span>}
      </div>
    </div>
  )
}

export default function LimitedFormatPage() {
  const ui = useUiStrings().limitedFormat
  const [format, setFormat] = useLimitedFormat()
  const [sets, setSets] = useState<string[]>([])
  const [names, setNames] = useState<Map<number, string>>(new Map())
  const [importText, setImportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    listSets().then(setSets)
  }, [])

  useEffect(() => {
    const allIds = [...format.allowedCrypt, ...format.allowedLibrary, ...format.bannedCrypt, ...format.bannedLibrary]
    getCardNamesMap(allIds).then(setNames)
  }, [format])

  const toggleSet = (set: string) => {
    setFormat({
      ...format,
      sets: format.sets.includes(set) ? format.sets.filter((s) => s !== set) : [...format.sets, set],
    })
  }

  const addTo = (key: keyof LimitedFormat) => (id: number) => {
    const list = format[key] as number[]
    if (list.includes(id)) return
    setFormat({ ...format, [key]: [...list, id] })
  }

  const removeFrom = (key: keyof LimitedFormat) => (id: number) => {
    setFormat({ ...format, [key]: (format[key] as number[]).filter((v) => v !== id) })
  }

  const doExport = () => {
    const blob = new Blob([exportLimitedFormatText(format)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'limited-format.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = () => {
    try {
      setFormat(importLimitedFormatText(importText))
      setImportText('')
      setImportOpen(false)
      setImportError('')
    } catch {
      setImportError(ui.importError)
    }
  }

  const loadFile = async (file: File) => {
    setImportText(await file.text())
    setImportOpen(true)
    setImportError('')
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-2xl text-ink">{ui.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          {isFormatActive(format) ? ui.introActive : ui.introInactive}
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.importExportTitle}</h2>
          <button onClick={doExport} className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink">
            {ui.exportTxt}
          </button>
          <label className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink">
            {ui.loadTxt}
            <input
              type="file"
              accept=".txt,.json,text/plain"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) loadFile(file)
                event.target.value = ''
              }}
            />
          </label>
          <button onClick={() => setImportOpen((o) => !o)} className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink">
            {importOpen ? ui.hideImport : ui.importText}
          </button>
          <button
            onClick={() => setFormat(emptyLimitedFormat)}
            className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-blood-hi"
          >
            {ui.resetFormat}
          </button>
        </div>
        {importOpen && (
          <div className="grid gap-2">
            <textarea
              className="h-32 w-full rounded-lg border border-line bg-ground p-2 font-mono text-xs text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
              placeholder={ui.importPlaceholder}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button
              onClick={doImport}
              disabled={!importText.trim()}
              className="justify-self-start rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
            >
              {ui.loadFormat}
            </button>
            {importError && <p className="text-xs text-blood-hi">{importError}</p>}
          </div>
        )}
      </div>

      <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.allowedSets}</h2>
        <div className="flex flex-wrap gap-1.5">
          {sets.map((set) => (
            <button
              key={set}
              type="button"
              aria-pressed={format.sets.includes(set)}
              onClick={() => toggleSet(set)}
              className={
                'rounded-full border px-2.5 py-1 text-xs ' +
                (format.sets.includes(set)
                  ? 'border-blood bg-blood text-white'
                  : 'border-line bg-ground text-ink-dim hover:text-ink-muted')
              }
            >
              {set}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <CardListEditor title={ui.allowedCrypt} ids={format.allowedCrypt} names={names} kind="crypt" none={ui.none} removeAria={ui.removeAria} onAdd={addTo('allowedCrypt')} onRemove={removeFrom('allowedCrypt')} />
        <CardListEditor title={ui.allowedLibrary} ids={format.allowedLibrary} names={names} kind="library" none={ui.none} removeAria={ui.removeAria} onAdd={addTo('allowedLibrary')} onRemove={removeFrom('allowedLibrary')} />
        <CardListEditor title={ui.bannedCrypt} ids={format.bannedCrypt} names={names} kind="crypt" none={ui.none} removeAria={ui.removeAria} onAdd={addTo('bannedCrypt')} onRemove={removeFrom('bannedCrypt')} />
        <CardListEditor title={ui.bannedLibrary} ids={format.bannedLibrary} names={names} kind="library" none={ui.none} removeAria={ui.removeAria} onAdd={addTo('bannedLibrary')} onRemove={removeFrom('bannedLibrary')} />
      </div>
    </div>
  )
}
