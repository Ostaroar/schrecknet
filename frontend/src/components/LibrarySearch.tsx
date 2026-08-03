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
import { useLimitedFormat, isFormatActive, isCardLegalInFormat, getCardSetsMap } from '../lib/limitedFormat'
import type { PreconOption, PreconSelection } from '../lib/preconFilter'
import { CardTypeSummary, CardTypeSymbol, DisciplineSymbol, PathSymbol } from './VtesSymbol'
import OwnedBadge from './OwnedBadge'
import OutOfFormatBadge from './OutOfFormatBadge'
import { useUiStrings } from '../lib/i18n'
import {
  isArray,
  isBool,
  isNumOrNull,
  isObject,
  isOneOf,
  isStr,
  isStrArray,
  isStrOrNull,
  readSearchSnapshot,
  restore,
  writeSearchSnapshot,
} from '../lib/searchState'

type DisciplineMode = 'off' | 'selected'

function requirementLabel(value: string, ui: ReturnType<typeof useUiStrings>['librarySearch']): string {
  if (value === 'titled_specific') return ui.titledSpecific
  if (value === 'titled') return ui.titledAny
  if (value === 'non-titled') return ui.nonTitled
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

interface RequirementControlsProps {
  label: string
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
  const ui = useUiStrings()
  const hasSelected = Object.values(selected).some(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-dim">{label} {ui.librarySearch.requirement}</span>
      {options.map((value) => {
        const active = selected[value] ?? false
        const optionLabel = requirementLabel(value, ui.librarySearch)
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
          {ui.librarySearch.notRequired}
        </button>
      )}
      <div className="flex overflow-hidden rounded-lg border border-line">
        {(
          [
            ['all', ui.search.all],
            ['any', ui.search.any],
            ['none', ui.search.not],
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
          {ui.search.clear}
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

/** Namespaces this page's filter snapshot on the history entry. */
const SEARCH_KEY = 'library'

export default function LibrarySearch() {
  const ui = useUiStrings()
  // Filters this history entry was last left with (see lib/searchState.ts).
  const saved = useMemo(() => readSearchSnapshot(SEARCH_KEY), [])
  const [text, setText] = useState(() => restore(saved, 'text', '', isStr))
  const [textMode, setTextMode] = useState<TextMode>(() => restore(saved, 'textMode', 'any', isOneOf('any', 'name', 'text')))
  const [textRegex, setTextRegex] = useState(() => restore(saved, 'textRegex', false, isBool))
  const [semanticMode, setSemanticMode] = useState(() => restore(saved, 'semanticMode', false, isBool))
  const [semanticProgress, setSemanticProgress] = useState<SemanticProgress>({ phase: 'idle' })
  const [semanticRetry, setSemanticRetry] = useState(0)
  const [cardType, setCardType] = useState<string | null>(() => restore(saved, 'cardType', null, isStrOrNull))
  const [clan, setClan] = useState<string | null>(() => restore(saved, 'clan', null, isStrOrNull))
  const [sectRequirements, setSectRequirements] = useState<Record<string, boolean>>(() => restore(saved, 'sectRequirements', {}, isObject))
  const [sectRequirementLogic, setSectRequirementLogic] = useState<RequirementLogic>(() => restore(saved, 'sectRequirementLogic', 'all', isOneOf('all', 'any', 'not')))
  const [includeNoSectRequirement, setIncludeNoSectRequirement] = useState(() => restore(saved, 'includeNoSectRequirement', false, isBool))
  const [titleRequirements, setTitleRequirements] = useState<Record<string, boolean>>(() => restore(saved, 'titleRequirements', {}, isObject))
  const [titleRequirementLogic, setTitleRequirementLogic] = useState<RequirementLogic>(() => restore(saved, 'titleRequirementLogic', 'all', isOneOf('all', 'any', 'not')))
  const [discModes, setDiscModes] = useState<Record<string, DisciplineMode>>(() => restore(saved, 'discModes', {}, isObject))
  const [disciplineLogic, setDisciplineLogic] = useState<LibraryDisciplineLogic>(() => restore(saved, 'disciplineLogic', 'all', isStr))
  const [includeNoDiscipline, setIncludeNoDiscipline] = useState(() => restore(saved, 'includeNoDiscipline', false, isBool))
  const [capacityRequirement, setCapacityRequirement] = useState<number | null>(() => restore(saved, 'capacityRequirement', null, isNumOrNull))
  const [capacityRequirementMode, setCapacityRequirementMode] = useState<CapacityRequirementMode>(
    () => restore(saved, 'capacityRequirementMode', 'at_most', isStr),
  )
  const [bloodCost, setBloodCost] = useState<number | null>(() => restore(saved, 'bloodCost', null, isNumOrNull))
  const [bloodCostMode, setBloodCostMode] = useState<CostMode>(() => restore(saved, 'bloodCostMode', 'at_most', isStr))
  const [poolCost, setPoolCost] = useState<number | null>(() => restore(saved, 'poolCost', null, isNumOrNull))
  const [poolCostMode, setPoolCostMode] = useState<CostMode>(() => restore(saved, 'poolCostMode', 'at_most', isStr))
  const [selectedTraits, setSelectedTraits] = useState<string[]>(() => restore(saved, 'selectedTraits', [], isStrArray))
  const [set, setSet] = useState<string | null>(() => restore(saved, 'set', null, isStrOrNull))
  const [setAge, setSetAge] = useState<SetAgeMode>(() => restore(saved, 'setAge', defaultSetAge, isStr))
  const [setPrint, setSetPrint] = useState<SetPrintMode>(() => restore(saved, 'setPrint', defaultSetPrint, isStr))
  const [selectedPrecons, setSelectedPrecons] = useState<PreconSelection[]>(() => restore(saved, 'selectedPrecons', [], isArray))
  const [preconPrint, setPreconPrint] = useState<SetPrintMode>(() => restore(saved, 'preconPrint', defaultSetPrint, isStr))
  const [artist, setArtist] = useState<string | null>(() => restore(saved, 'artist', null, isStrOrNull))
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
  const [sort, setSort] = useState<LibrarySort | 'relevance'>(() => restore(saved, 'sort', 'name', isStr))
  const [onlyOwned, setOnlyOwned] = useState(() => restore(saved, 'onlyOwned', false, isBool))
  const [onlyInFormat, setOnlyInFormat] = useState(() => restore(saved, 'onlyInFormat', false, isBool))
  const [cardSets, setCardSets] = useState<Map<number, string[]>>(new Map())
  const deck = useSearchDeck()
  const owned = useInventoryOwnedMap()
  const [limitedFormat] = useLimitedFormat()
  const limitedFormatActive = isFormatActive(limitedFormat)

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

  const ownedFilteredResults = onlyOwned ? results.filter((c) => (owned.get(c.id) ?? 0) > 0) : results
  const displayResults =
    onlyInFormat && limitedFormatActive
      ? ownedFilteredResults.filter((c) => isCardLegalInFormat(c.id, cardSets.get(c.id) ?? [], 'library', limitedFormat))
      : ownedFilteredResults

  useEffect(() => {
    if (!limitedFormatActive) return
    getCardSetsMap(results.map((c) => c.id)).then(setCardSets)
  }, [results, limitedFormatActive])

  // Keep this history entry's filter snapshot current, so opening a card and
  // pressing Back restores the search instead of a blank form. Only the
  // filters — never results, loaded option lists or transient UI state, which
  // are all re-derived on mount and would just bloat the entry.
  useEffect(() => {
    writeSearchSnapshot(SEARCH_KEY, {
      text,
      textMode,
      textRegex,
      semanticMode,
      cardType,
      clan,
      sectRequirements,
      sectRequirementLogic,
      includeNoSectRequirement,
      titleRequirements,
      titleRequirementLogic,
      discModes,
      disciplineLogic,
      includeNoDiscipline,
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
      sort,
      onlyOwned,
      onlyInFormat,
    })
  }, [
    text,
    textMode,
    textRegex,
    semanticMode,
    cardType,
    clan,
    sectRequirements,
    sectRequirementLogic,
    includeNoSectRequirement,
    titleRequirements,
    titleRequirementLogic,
    discModes,
    disciplineLogic,
    includeNoDiscipline,
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
    sort,
    onlyOwned,
    onlyInFormat,
  ])

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
        {ui.search.loadError}: {error}
      </div>
    )
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap gap-3">
        <input
          className="min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder={semanticMode ? ui.search.semanticPrompt : ui.search.nameText}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={status === 'loading'}
        />
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(
            [
              ['any', ui.search.all],
              ['name', ui.search.name],
              ['text', ui.search.text],
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
          {ui.search.onlyOwned}
        </button>
        {limitedFormatActive && (
          <button
            onClick={() => setOnlyInFormat((v) => !v)}
            aria-pressed={onlyInFormat}
            title="Show only cards legal in the active limited format"
            className={
              'rounded-lg border px-2.5 py-2 text-xs ' +
              (onlyInFormat ? 'border-gold bg-gold/10 text-gold' : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
            }
          >
            {ui.search.onlyInFormat}
          </button>
        )}
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
        <label className="relative inline-flex items-center">
          {cardType && (
            <CardTypeSymbol
              type={cardType}
              className="pointer-events-none absolute left-3 z-10 size-4"
              decorative
            />
          )}
          <select
            aria-label={ui.librarySearch.anyType}
            className={
              'rounded-lg border border-line bg-surface py-2 pr-3 text-sm text-ink ' +
              (cardType ? 'pl-9' : 'pl-3')
            }
            value={cardType ?? ''}
            onChange={(e) => setCardType(e.target.value || null)}
            disabled={status === 'loading'}
          >
            <option value="">{ui.librarySearch.anyType}</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label={ui.librarySearch.anyClanRequirement}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={clan ?? ''}
          onChange={(e) => setClan(e.target.value || null)}
          disabled={status === 'loading'}
        >
          <option value="">{ui.librarySearch.anyClanRequirement}</option>
          {clans.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-sm text-ink-dim">
          <span>{ui.librarySearch.requiresCapacity}</span>
          <select
            aria-label={ui.librarySearch.capacityRequirementComparisonAria}
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
            aria-label={ui.librarySearch.capacityRequirementAria}
            value={capacityRequirement ?? ''}
            onChange={(e) =>
              setCapacityRequirement(e.target.value ? Number(e.target.value) : null)
            }
          />
        </div>
        <div className="flex items-center gap-1 text-sm text-ink-dim">
          <span>{ui.librarySearch.blood}</span>
          <select
            aria-label={ui.librarySearch.bloodCostComparisonAria}
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
            aria-label={ui.librarySearch.bloodCostAria}
            value={bloodCost ?? ''}
            onChange={(e) => setBloodCost(e.target.value ? Number(e.target.value) : null)}
          />
          <span>{ui.librarySearch.pool}</span>
          <select
            aria-label={ui.librarySearch.poolCostComparisonAria}
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
            aria-label={ui.librarySearch.poolCostAria}
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
          placeholder={ui.search.artist}
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
                  ? 'border border-blood-hi bg-blood/20 text-ink'
                  : 'border border-line bg-surface text-ink-muted hover:border-ink-dim hover:text-ink')
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
            {ui.search.clear}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-dim">{ui.librarySearch.disciplineLogic}</span>
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(
            [
              ['all', ui.search.all],
              ['any', ui.search.any],
              ['none', ui.search.not],
              ['only', ui.search.only],
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
          {ui.librarySearch.noRequirement}
        </button>
      </div>

      <RequirementControls
        label={ui.librarySearch.sect}
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
        label={ui.librarySearch.title}
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
        <p className="text-sm text-ink-dim">{ui.search.loading}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={'text-xs ' + (searchError ? 'text-blood-hi' : 'text-ink-dim')}>
              {searchError || ui.librarySearch.results(displayResults.length, semanticMode)}
            </p>
            <label className="flex items-center gap-2 text-xs text-ink-dim">
              {ui.search.sort}
              <select
                aria-label={ui.librarySearch.sortAria}
                value={sort}
                onChange={(event) => setSort(event.target.value as LibrarySort | 'relevance')}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
              >
                {semanticMode && <option value="relevance">{ui.search.relevance}</option>}
                <option value="requirement">{ui.librarySearch.sortRequirement}</option>
                <option value="cost_desc">{ui.librarySearch.sortCostDesc}</option>
                <option value="cost_asc">{ui.librarySearch.sortCostAsc}</option>
                <option value="name">{ui.librarySearch.sortName}</option>
                <option value="type">{ui.librarySearch.sortType}</option>
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
                    className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] items-center gap-2 px-3 py-2 text-left text-sm sm:px-4"
                  >
                    <span className="grid min-w-0 gap-1" data-card-name>
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 break-words font-medium leading-tight text-ink">
                          {c.name}
                        </span>
                        {semanticMode && 'semanticScore' in c && (
                          <span className="shrink-0 font-mono text-[10px] text-gold">
                            {ui.librarySearch.similarity} {c.semanticScore.toFixed(3)}
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[10px] uppercase tracking-wide text-ink-muted">
                          <CardTypeSummary types={c.types} />
                          {c.clan ? ` · ${c.clan}` : ''}
                          {c.path ? ` · ${c.path}` : ''}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {c.disciplines.map((d) => (
                            <DisciplineSymbol key={d} code={d} className="size-4" />
                          ))}
                          <PathSymbol path={c.path} className="size-4" />
                          <CostPill blood={c.blood_cost} pool={c.pool_cost} />
                          <OwnedBadge qty={owned.get(c.id) ?? 0} />
                          {limitedFormatActive && (
                            <OutOfFormatBadge legal={isCardLegalInFormat(c.id, cardSets.get(c.id) ?? [], 'library', limitedFormat)} />
                          )}
                        </span>
                      </span>
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
                  ? ui.librarySearch.semanticEmpty
                  : ui.search.noMatches}
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
