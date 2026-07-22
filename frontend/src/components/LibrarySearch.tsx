import { useEffect, useMemo, useState } from 'react'
import {
  searchLibrary,
  listLibraryTypes,
  listLibraryClans,
  listLibraryDisciplines,
  listLibrarySectRequirements,
  listLibraryTitleRequirements,
  listLibraryTraits,
  listSets,
  listPrecons,
  emptyLibraryFilters,
  type LibraryCard,
  type LibrarySort,
  type TextMode,
  type CostMode,
  type CapacityRequirementMode,
} from '../lib/librarySearch'
import CardDetailPanel from './CardDetailPanel'
import CardImagePreview from './CardImagePreview'
import SemanticModeControl from './SemanticModeControl'
import SetFilterControls from './SetFilterControls'
import TraitFilterControls from './TraitFilterControls'
import SearchDeckPanel, { AddToDeckButton } from './SearchDeckPanel'
import PreconFilterControls from './PreconFilterControls'
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
import type { LibraryDisciplineLogic } from '../lib/disciplineFilter'
import type { RequirementLogic } from '../lib/requirementFilter'
import { orderLibraryCards } from '../lib/core'
import { useSearchDeck } from '../lib/useSearchDeck'
import { useInventoryOwnedMap } from '../lib/useInventoryOwnedMap'
import type { PreconOption, PreconSelection } from '../lib/preconFilter'
import { CardTypeSummary, DisciplineBadge, DisciplineSymbol } from './VtesSymbol'
import OwnedBadge from './OwnedBadge'

type DisciplineMode = 'off' | 'selected'

function requirementLabel(value: string): string {
  if (value === 'titled_specific') return 'Titled (specific)'
  if (value === 'titled') return 'Titled (any)'
  if (value === 'non-titled') return 'Non-titled'
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

interface RequirementControlsProps {
  label: 'Sect' | 'Title'
  options: string[]
  selected: Record<string, boolean>
  logic: RequirementLogic
  includeNoRequirement?: boolean
  onToggle: (value: string) => void
  onLogicChange: (logic: RequirementLogic) => void
  onNoRequirementChange?: () => void
  onClear: () => void
}

function RequirementControls({
  label,
  options,
  selected,
  logic,
  includeNoRequirement = false,
  onToggle,
  onLogicChange,
  onNoRequirementChange,
  onClear,
}: RequirementControlsProps) {
  const hasSelected = Object.values(selected).some(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-dim">{label} requirement</span>
      {options.map((value) => {
        const active = selected[value] ?? false
        const optionLabel = requirementLabel(value)
        return (
          <button
            key={value}
            type="button"
            aria-label={`${label} requirement ${optionLabel}`}
            aria-pressed={active}
            onClick={() => onToggle(value)}
            className={
              'rounded-full border px-2.5 py-1.5 ' +
              (active
                ? 'border-blood bg-blood text-white'
                : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
            }
          >
            {optionLabel}
          </button>
        )
      })}
      {onNoRequirementChange && (
        <button
          type="button"
          aria-pressed={includeNoRequirement}
          onClick={onNoRequirementChange}
          className={
            'rounded-full border px-2.5 py-1.5 ' +
            (includeNoRequirement
              ? 'border-blood bg-blood text-white'
              : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
          }
        >
          Not required
        </button>
      )}
      <div className="flex overflow-hidden rounded-lg border border-line">
        {(
          [
            ['all', 'All'],
            ['any', 'Any'],
            ['none', 'Not'],
          ] as [RequirementLogic, string][]
        ).map(([value, logicLabel]) => (
          <button
            key={value}
            type="button"
            aria-label={`${label} requirement logic ${logicLabel}`}
            aria-pressed={logic === value}
            onClick={() => onLogicChange(value)}
            className={
              'px-2.5 py-1.5 ' +
              (logic === value
                ? 'bg-blood text-white'
                : 'bg-surface text-ink-dim hover:text-ink-muted')
            }
          >
            {logicLabel}
          </button>
        ))}
      </div>
      {(hasSelected || includeNoRequirement) && (
        <button
          type="button"
          onClick={onClear}
          className="text-ink-dim underline hover:text-ink-muted"
        >
          clear
        </button>
      )}
    </div>
  )
}

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
  const [sectRequirements, setSectRequirements] = useState<Record<string, boolean>>({})
  const [sectRequirementLogic, setSectRequirementLogic] = useState<RequirementLogic>('all')
  const [includeNoSectRequirement, setIncludeNoSectRequirement] = useState(false)
  const [titleRequirements, setTitleRequirements] = useState<Record<string, boolean>>({})
  const [titleRequirementLogic, setTitleRequirementLogic] = useState<RequirementLogic>('all')
  const [discModes, setDiscModes] = useState<Record<string, DisciplineMode>>({})
  const [disciplineLogic, setDisciplineLogic] = useState<LibraryDisciplineLogic>('all')
  const [includeNoDiscipline, setIncludeNoDiscipline] = useState(false)
  const [capacityRequirement, setCapacityRequirement] = useState<number | null>(null)
  const [capacityRequirementMode, setCapacityRequirementMode] =
    useState<CapacityRequirementMode>('at_most')
  const [bloodCost, setBloodCost] = useState<number | null>(null)
  const [bloodCostMode, setBloodCostMode] = useState<CostMode>('at_most')
  const [poolCost, setPoolCost] = useState<number | null>(null)
  const [poolCostMode, setPoolCostMode] = useState<CostMode>('at_most')
  const [selectedTraits, setSelectedTraits] = useState<string[]>([])
  const [set, setSet] = useState<string | null>(null)
  const [setAge, setSetAge] = useState<SetAgeMode>(defaultSetAge)
  const [setPrint, setSetPrint] = useState<SetPrintMode>(defaultSetPrint)
  const [selectedPrecons, setSelectedPrecons] = useState<PreconSelection[]>([])
  const [preconPrint, setPreconPrint] = useState<SetPrintMode>(defaultSetPrint)
  const [artist, setArtist] = useState<string | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [clans, setClans] = useState<string[]>([])
  const [sets, setSets] = useState<string[]>([])
  const [precons, setPrecons] = useState<PreconOption[]>([])
  const [allDisciplines, setAllDisciplines] = useState<string[]>([])
  const [allSectRequirements, setAllSectRequirements] = useState<string[]>([])
  const [allTitleRequirements, setAllTitleRequirements] = useState<string[]>([])
  const [allTraits, setAllTraits] = useState<string[]>([])
  const [results, setResults] = useState<Array<LibraryCard | SemanticResult<LibraryCard>>>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  // See CryptSearch: a live invalid regex is a soft, recoverable state.
  const [searchError, setSearchError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [sort, setSort] = useState<LibrarySort | 'relevance'>('name')
  const [onlyOwned, setOnlyOwned] = useState(false)
  const deck = useSearchDeck()
  const owned = useInventoryOwnedMap()

  useEffect(() => {
    Promise.all([
      listLibraryTypes(),
      listLibraryClans(),
      listLibraryDisciplines(),
      listLibrarySectRequirements(),
      listLibraryTitleRequirements(),
      listSets(),
      listPrecons(),
      listLibraryTraits(),
    ])
      .then(([t, c, d, sr, tr, s, p, traits]) => {
        setTypes(t)
        setClans(c)
        setAllDisciplines(d)
        setAllSectRequirements(sr)
        setAllTitleRequirements(tr)
        setSets(s)
        setPrecons(p)
        setAllTraits(traits)
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
      sectRequirements: Object.entries(sectRequirements)
        .filter(([, selected]) => selected)
        .map(([value]) => value),
      sectRequirementLogic,
      includeNoSectRequirement,
      titleRequirements: Object.entries(titleRequirements)
        .filter(([, selected]) => selected)
        .map(([value]) => value),
      titleRequirementLogic,
      capacityRequirement,
      capacityRequirementMode,
      bloodCost,
      bloodCostMode,
      poolCost,
      poolCostMode,
      traits: selectedTraits,
      set,
      setAge,
      setPrint,
      precon: null,
      precons: selectedPrecons,
      preconPrint,
      artist,
      sort: sort === 'relevance' ? 'name' : sort,
      disciplines: active.map(([code]) => code),
      disciplineLogic,
      includeNoDiscipline,
    }
  }, [
    text,
    textMode,
    textRegex,
    cardType,
    clan,
    sectRequirements,
    sectRequirementLogic,
    includeNoSectRequirement,
    titleRequirements,
    titleRequirementLogic,
    capacityRequirement,
    capacityRequirementMode,
    bloodCost,
    bloodCostMode,
    poolCost,
    poolCostMode,
    selectedTraits,
    set,
    setAge,
    setPrint,
    selectedPrecons,
    preconPrint,
    artist,
    discModes,
    disciplineLogic,
    includeNoDiscipline,
    sort,
  ])

  const displayResults = onlyOwned ? results.filter((c) => (owned.get(c.id) ?? 0) > 0) : results

  const cycle = (code: string) => {
    setDiscModes((m) => {
      const next: DisciplineMode = m[code] === 'selected' ? 'off' : 'selected'
      return { ...m, [code]: next }
    })
  }

  const toggleTrait = (trait: string) => {
    setSelectedTraits((selected) =>
      selected.includes(trait)
        ? selected.filter((value) => value !== trait)
        : [...selected, trait],
    )
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
          .then((rows) => (sort === 'relevance' ? rows : orderLibraryCards(rows, sort)))
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-4">
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
        <button
          onClick={() => setOnlyOwned((v) => !v)}
          aria-pressed={onlyOwned}
          title="Show only cards you own"
          className={
            'rounded-lg border px-2.5 py-2 text-xs ' +
            (onlyOwned ? 'border-gold bg-gold/10 text-gold' : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
          }
        >
          Only owned
        </button>
        <SemanticModeControl
          enabled={semanticMode}
          progress={semanticProgress}
          onToggle={() => {
            setSemanticMode((enabled) => {
              const next = !enabled
              setSort(next ? 'relevance' : 'name')
              return next
            })
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
          <span>requires cap</span>
          <select
            aria-label="Capacity requirement comparison"
            value={capacityRequirementMode}
            onChange={(e) =>
              setCapacityRequirementMode(e.target.value as CapacityRequirementMode)
            }
            className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
          >
            <option value="at_most">≤</option>
            <option value="at_least">≥</option>
          </select>
          <input
            type="number"
            min={1}
            max={11}
            className="w-14 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
            aria-label="Capacity requirement"
            value={capacityRequirement ?? ''}
            onChange={(e) =>
              setCapacityRequirement(e.target.value ? Number(e.target.value) : null)
            }
          />
        </div>
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
        <PreconFilterControls
          options={precons}
          value={selectedPrecons}
          printing={preconPrint}
          disabled={status === 'loading'}
          onValueChange={setSelectedPrecons}
          onPrintingChange={setPreconPrint}
        />
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
              aria-pressed={mode === 'selected'}
              title={`${code}: toggle this library discipline requirement`}
              className={
                'inline-flex h-7 min-w-12 items-center justify-center gap-1 rounded px-1.5 font-mono text-[10px] font-bold uppercase tracking-wide ' +
                (mode === 'selected'
                  ? 'bg-blood text-white'
                  : 'border border-line text-ink-dim hover:text-ink-muted')
              }
            >
              <DisciplineSymbol code={code} className="size-4" decorative />
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

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-dim">Discipline logic</span>
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(
            [
              ['all', 'All'],
              ['any', 'Any'],
              ['none', 'Not'],
              ['only', 'Only'],
            ] as [LibraryDisciplineLogic, string][]
          ).map(([logic, label]) => (
            <button
              key={logic}
              type="button"
              aria-pressed={disciplineLogic === logic}
              onClick={() => setDisciplineLogic(logic)}
              className={
                'px-2.5 py-1.5 ' +
                (disciplineLogic === logic
                  ? 'bg-blood text-white'
                  : 'bg-surface text-ink-dim hover:text-ink-muted')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={includeNoDiscipline}
          onClick={() => setIncludeNoDiscipline((selected) => !selected)}
          className={
            'rounded-lg border px-2.5 py-1.5 ' +
            (includeNoDiscipline
              ? 'border-blood bg-blood text-white'
              : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
          }
        >
          No requirement
        </button>
      </div>

      <RequirementControls
        label="Sect"
        options={allSectRequirements}
        selected={sectRequirements}
        logic={sectRequirementLogic}
        includeNoRequirement={includeNoSectRequirement}
        onToggle={(value) =>
          setSectRequirements((current) => ({ ...current, [value]: !current[value] }))
        }
        onLogicChange={setSectRequirementLogic}
        onNoRequirementChange={() => setIncludeNoSectRequirement((selected) => !selected)}
        onClear={() => {
          setSectRequirements({})
          setIncludeNoSectRequirement(false)
        }}
      />

      <RequirementControls
        label="Title"
        options={allTitleRequirements}
        selected={titleRequirements}
        logic={titleRequirementLogic}
        onToggle={(value) =>
          setTitleRequirements((current) => ({ ...current, [value]: !current[value] }))
        }
        onLogicChange={setTitleRequirementLogic}
        onClear={() => setTitleRequirements({})}
      />

      <TraitFilterControls
        options={allTraits}
        selected={selectedTraits}
        onToggle={toggleTrait}
      />

      {status === 'loading' ? (
        <p className="text-sm text-ink-dim">Loading card database…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={'text-xs ' + (searchError ? 'text-blood-hi' : 'text-ink-dim')}>
              {searchError || `${displayResults.length}${semanticMode ? ' semantic' : ''} library cards`}
            </p>
            <label className="flex items-center gap-2 text-xs text-ink-dim">
              Sort
              <select
                aria-label="Sort library results"
                value={sort}
                onChange={(event) => setSort(event.target.value as LibrarySort | 'relevance')}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
              >
                {semanticMode && <option value="relevance">Relevance</option>}
                <option value="requirement">Clan / discipline</option>
                <option value="cost_desc">Cost high–low</option>
                <option value="cost_asc">Cost low–high</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
              </select>
            </label>
          </div>
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {displayResults.map((c) => (
              <div key={c.id}>
                <div className="flex items-stretch hover:bg-raised">
                  <button
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    data-card-id={c.id}
                    data-semantic-score={
                      semanticMode && 'semanticScore' in c ? c.semanticScore : undefined
                    }
                    className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] items-center gap-2 px-3 py-2 text-left text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]"
                  >
                    <span className="min-w-0 truncate">
                      {c.name}
                      {semanticMode && 'semanticScore' in c && (
                        <span className="ml-2 font-mono text-[10px] text-gold">
                          similarity {c.semanticScore.toFixed(3)}
                        </span>
                      )}
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] uppercase tracking-wide text-ink-dim sm:hidden">
                        <CardTypeSummary types={c.types} />
                        {c.clan ? ` · ${c.clan}` : ''}
                        <OwnedBadge qty={owned.get(c.id) ?? 0} />
                      </span>
                    </span>
                    <span className="hidden items-center gap-1 sm:flex">
                      {c.disciplines.map((d) => (
                        <DisciplineBadge key={d} code={d} compact />
                      ))}
                      <CostPill blood={c.blood_cost} pool={c.pool_cost} />
                      <OwnedBadge qty={owned.get(c.id) ?? 0} />
                    </span>
                    <span className="hidden items-center justify-end gap-1 text-right text-xs uppercase tracking-wide text-ink-muted lg:flex">
                      <CardTypeSummary types={c.types} />
                      {c.clan && <span>· {c.clan}</span>}
                    </span>
                  </button>
                  <CardImagePreview imageUrl={c.image_url} name={c.name} />
                  <AddToDeckButton cardId={c.id} cardName={c.name} deck={deck} className="m-1 self-center" />
                </div>
                {expanded === c.id && <CardDetailPanel id={c.id} />}
              </div>
            ))}
            {displayResults.length === 0 && (
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
      <SearchDeckPanel
        deck={deck}
        className="order-first self-start xl:sticky xl:top-4 xl:order-last"
      />
    </div>
  )
}
