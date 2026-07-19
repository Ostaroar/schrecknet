import { useEffect, useMemo, useState } from 'react'
import {
  searchLibrary,
  listLibraryTypes,
  listLibraryClans,
  listLibraryDisciplines,
  listSets,
  listPrecons,
  emptyLibraryFilters,
  type LibraryCard,
  type TextMode,
  type CostMode,
} from '../lib/librarySearch'
import CardDetailPanel from './CardDetailPanel'
import SemanticModeControl from './SemanticModeControl'
import SetFilterControls from './SetFilterControls'
import {
  defaultSetAge,
  defaultSetPrint,
  type SetAgeMode,
  type SetPrintMode,
} from '../lib/setFilter'
import {
  removeSemanticModel,
  searchSemanticLibrary,
  type SemanticProgress,
  type SemanticResult,
} from '../lib/semanticSearch'

/** Per-discipline filter state, cycling off → required (any level) → superior. */
type DisciplineMode = 'off' | 'any' | 'superior'

function CostPill({ blood, pool }: { blood: string | null; pool: string | null }) {
  if (!blood && !pool) return null
  return (
    <span className="flex gap-1 font-mono text-[11px]">
      {blood && <span className="text-blood-hi">{blood}B</span>}
      {pool && <span className="text-gold">{pool}P</span>}
    </span>
  )
}

export default function LibrarySearch() {
  const [text, setText] = useState('')
  const [textMode, setTextMode] = useState<TextMode>('any')
  const [textRegex, setTextRegex] = useState(false)
  const [semanticMode, setSemanticMode] = useState(false)
  const [semanticProgress, setSemanticProgress] = useState<SemanticProgress>({ phase: 'idle' })
  const [semanticRetry, setSemanticRetry] = useState(0)
  const [cardType, setCardType] = useState<string | null>(null)
  const [clan, setClan] = useState<string | null>(null)
  const [discModes, setDiscModes] = useState<Record<string, DisciplineMode>>({})
  const [bloodCost, setBloodCost] = useState<number | null>(null)
  const [bloodCostMode, setBloodCostMode] = useState<CostMode>('at_most')
  const [poolCost, setPoolCost] = useState<number | null>(null)
  const [poolCostMode, setPoolCostMode] = useState<CostMode>('at_most')
  const [set, setSet] = useState<string | null>(null)
  const [setAge, setSetAge] = useState<SetAgeMode>(defaultSetAge)
  const [setPrint, setSetPrint] = useState<SetPrintMode>(defaultSetPrint)
  const [precon, setPrecon] = useState<string | null>(null)
  const [artist, setArtist] = useState<string | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [clans, setClans] = useState<string[]>([])
  const [sets, setSets] = useState<string[]>([])
  const [precons, setPrecons] = useState<string[]>([])
  const [allDisciplines, setAllDisciplines] = useState<string[]>([])
  const [results, setResults] = useState<Array<LibraryCard | SemanticResult<LibraryCard>>>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  // See CryptSearch: a live invalid regex is a soft, recoverable state.
  const [searchError, setSearchError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([listLibraryTypes(), listLibraryClans(), listLibraryDisciplines(), listSets(), listPrecons()])
      .then(([t, c, d, s, p]) => {
        setTypes(t)
        setClans(c)
        setAllDisciplines(d)
        setSets(s)
        setPrecons(p)
        setStatus('ready')
      })
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
  }, [])

  const filters = useMemo(() => {
    const active = Object.entries(discModes).filter(([, m]) => m !== 'off')
    return {
      ...emptyLibraryFilters,
      text,
      textMode,
      textRegex,
      cardType,
      clan,
      bloodCost,
      bloodCostMode,
      poolCost,
      poolCostMode,
      set,
      setAge,
      setPrint,
      precon,
      artist,
      disciplines: active.map(([code]) => code),
      // vdb lets you mix levels per discipline; MVP applies "superior" to the
      // whole selection when any badge is in superior mode (feature-parity ✎).
      disciplinesSuperior: active.some(([, m]) => m === 'superior'),
    }
  }, [
    text,
    textMode,
    textRegex,
    cardType,
    clan,
    bloodCost,
    bloodCostMode,
    poolCost,
    poolCostMode,
    set,
    setAge,
    setPrint,
    precon,
    artist,
    discModes,
  ])

  const cycle = (code: string) => {
    setDiscModes((m) => {
      const next: DisciplineMode =
        m[code] === 'any' ? 'superior' : m[code] === 'superior' ? 'off' : 'any'
      return { ...m, [code]: next }
    })
  }

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false

    if (semanticMode) {
      if (!text.trim()) {
        setResults([])
        setSearchError('')
        setSemanticProgress({ phase: 'idle' })
        return
      }
      const timer = window.setTimeout(() => {
        searchSemanticLibrary(text, filters, (progress) => {
          if (!cancelled) setSemanticProgress(progress)
        })
          .then((rows) => {
            if (cancelled) return
            setResults(rows)
            setSearchError('')
          })
          .catch((e: Error) => {
            if (cancelled) return
            setResults([])
            setSearchError(e.message)
            setSemanticProgress({ phase: 'error', error: e.message })
          })
      }, 300)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }

    searchLibrary(filters)
      .then((rows) => {
        if (cancelled) return
        setResults(rows)
        setSearchError('')
      })
      .catch((e: Error) => {
        if (cancelled) return
        if (filters.textRegex) {
          setResults([])
          setSearchError('Invalid regex pattern — keep typing, or check the syntax.')
        } else {
          setError(e.message)
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [filters, semanticMode, semanticRetry, status, text])

  const removeModel = () => {
    removeSemanticModel()
      .then(() => {
        setResults([])
        setSemanticProgress({ phase: 'idle' })
      })
      .catch((e: Error) => setSemanticProgress({ phase: 'error', error: e.message }))
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-blood-hi">
        Couldn't load the card database: {error}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <input
          className="min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder={semanticMode ? 'Describe a card concept (English)' : 'Name / text'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={status === 'loading'}
        />
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(
            [
              ['any', 'All'],
              ['name', 'Name'],
              ['text', 'Text'],
            ] as [TextMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setTextMode(mode)}
              disabled={semanticMode}
              title={`Search in ${mode === 'any' ? 'name or text' : mode === 'name' ? 'card name only' : 'card text only'}`}
              className={
                'px-2.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 ' +
                (textMode === mode ? 'bg-blood text-white' : 'bg-surface text-ink-dim hover:text-ink-muted')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setTextRegex((r) => !r)}
          disabled={semanticMode}
          title="Treat the search text as a regex pattern (standard syntax: . * + ? {m,n} [...] (...) | ^ $), case-insensitive"
          className={
            'rounded-lg border px-2.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 ' +
            (textRegex ? 'border-blood bg-blood text-white' : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
          }
        >
          .*Regex
        </button>
        <SemanticModeControl
          enabled={semanticMode}
          progress={semanticProgress}
          onToggle={() => {
            setSemanticMode((enabled) => !enabled)
            setSemanticProgress({ phase: 'idle' })
            setSearchError('')
          }}
          onRetry={() => {
            setSemanticProgress({ phase: 'loading' })
            setSemanticRetry((value) => value + 1)
          }}
          onRemove={removeModel}
        />
        <select
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={cardType ?? ''}
          onChange={(e) => setCardType(e.target.value || null)}
          disabled={status === 'loading'}
        >
          <option value="">Any type</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={clan ?? ''}
          onChange={(e) => setClan(e.target.value || null)}
          disabled={status === 'loading'}
        >
          <option value="">Any clan requirement</option>
          {clans.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-sm text-ink-dim">
          <span>blood</span>
          <select
            aria-label="Blood cost comparison"
            value={bloodCostMode}
            onChange={(e) => setBloodCostMode(e.target.value as CostMode)}
            className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
          >
            <option value="at_most">≤</option>
            <option value="exact">=</option>
            <option value="at_least">≥</option>
          </select>
          <input
            type="number"
            min={0}
            max={9}
            className="w-14 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
            aria-label="Blood cost"
            value={bloodCost ?? ''}
            onChange={(e) => setBloodCost(e.target.value ? Number(e.target.value) : null)}
          />
          <span>pool</span>
          <select
            aria-label="Pool cost comparison"
            value={poolCostMode}
            onChange={(e) => setPoolCostMode(e.target.value as CostMode)}
            className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
          >
            <option value="at_most">≤</option>
            <option value="exact">=</option>
            <option value="at_least">≥</option>
          </select>
          <input
            type="number"
            min={0}
            max={9}
            className="w-14 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
            aria-label="Pool cost"
            value={poolCost ?? ''}
            onChange={(e) => setPoolCost(e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <SetFilterControls
          value={set}
          age={setAge}
          printing={setPrint}
          sets={sets}
          disabled={status === 'loading'}
          onValueChange={setSet}
          onAgeChange={setSetAge}
          onPrintingChange={setSetPrint}
        />
        <select
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={precon ?? ''}
          onChange={(e) => setPrecon(e.target.value || null)}
          disabled={status === 'loading'}
        >
          <option value="">Any precon</option>
          {precons.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder="Artist"
          value={artist ?? ''}
          onChange={(e) => setArtist(e.target.value || null)}
          disabled={status === 'loading'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {allDisciplines.map((code) => {
          const mode = discModes[code] ?? 'off'
          return (
            <button
              key={code}
              onClick={() => cycle(code)}
              title={`${code}: click to require, again for superior only, again to clear`}
              className={
                'inline-grid h-6 min-w-9 place-items-center rounded px-1.5 font-mono text-[10px] font-bold uppercase tracking-wide ' +
                (mode === 'superior'
                  ? 'bg-gold text-[#241a06]'
                  : mode === 'any'
                    ? 'bg-blood text-white'
                    : 'border border-line text-ink-dim hover:text-ink-muted')
              }
            >
              {code}
            </button>
          )
        })}
        {Object.values(discModes).some((m) => m !== 'off') && (
          <button
            onClick={() => setDiscModes({})}
            className="ml-1 text-xs text-ink-dim underline hover:text-ink-muted"
          >
            clear
          </button>
        )}
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-ink-dim">Loading card database…</p>
      ) : (
        <>
          <p className={'text-xs ' + (searchError ? 'text-blood-hi' : 'text-ink-dim')}>
            {searchError || `${results.length}${semanticMode ? ' semantic' : ''} library cards`}
          </p>
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {results.map((c) => (
              <div key={c.id}>
                <button
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  data-card-id={c.id}
                  data-semantic-score={
                    semanticMode && 'semanticScore' in c ? c.semanticScore : undefined
                  }
                  className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised"
                >
                  <span className="min-w-0 truncate">
                    {c.name}
                    {semanticMode && 'semanticScore' in c && (
                      <span className="ml-2 font-mono text-[10px] text-gold">
                        similarity {c.semanticScore.toFixed(3)}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-1">
                    {c.disciplines.map((d) => (
                      <span
                        key={d}
                        className="inline-grid h-[17px] min-w-[26px] place-items-center rounded border border-line px-[3px] font-mono text-[9.5px] font-bold uppercase tracking-wide text-ink-muted"
                      >
                        {d}
                      </span>
                    ))}
                    <CostPill blood={c.blood_cost} pool={c.pool_cost} />
                  </span>
                  <span className="text-right text-xs uppercase tracking-wide text-ink-muted">
                    {c.types.join(' / ')}
                    {c.clan ? ` · ${c.clan}` : ''}
                  </span>
                </button>
                {expanded === c.id && <CardDetailPanel id={c.id} />}
              </div>
            ))}
            {results.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-dim">
                {semanticMode && !text.trim()
                  ? 'Describe a concept to search the V5 library.'
                  : 'No cards match those filters.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
