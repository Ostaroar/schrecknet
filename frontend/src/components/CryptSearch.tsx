import { useEffect, useMemo, useState } from 'react'
import {
  searchCrypt,
  listClans,
  listGroups,
  listCryptDisciplines,
  listCryptSects,
  listCryptTraits,
  listTitles,
  listSets,
  listPrecons,
  emptyCryptFilters,
  type CryptCard,
  type TextMode,
} from '../lib/cryptSearch'
import CardDetailPanel from './CardDetailPanel'
import SemanticModeControl from './SemanticModeControl'
import SetFilterControls from './SetFilterControls'
import TraitFilterControls from './TraitFilterControls'
import {
  defaultSetAge,
  defaultSetPrint,
  type SetAgeMode,
  type SetPrintMode,
} from '../lib/setFilter'
import {
  removeSemanticModel,
  searchSemanticCrypt,
  type SemanticProgress,
  type SemanticResult,
} from '../lib/semanticSearch'
import type { DisciplineRequirement } from '../lib/disciplineFilter'
import type { RequirementLogic } from '../lib/requirementFilter'

function DisciplineBadge({ code, superior }: { code: string; superior: boolean }) {
  return (
    <span
      className={
        'inline-grid h-[17px] min-w-[26px] place-items-center rounded px-[3px] font-mono text-[9.5px] font-bold uppercase tracking-wide ' +
        (superior ? 'bg-gold text-[#241a06]' : 'border border-line text-ink-muted')
      }
    >
      {code}
    </span>
  )
}

/** Per-discipline filter state, cycling off → required (any level) → superior. */
type DisciplineMode = 'off' | 'any' | 'superior'
type OrDisciplineGroup = Array<DisciplineRequirement | null>

export default function CryptSearch() {
  const [text, setText] = useState('')
  const [textMode, setTextMode] = useState<TextMode>('any')
  const [textRegex, setTextRegex] = useState(false)
  const [semanticMode, setSemanticMode] = useState(false)
  const [semanticProgress, setSemanticProgress] = useState<SemanticProgress>({ phase: 'idle' })
  const [semanticRetry, setSemanticRetry] = useState(0)
  const [clan, setClan] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [selectedSects, setSelectedSects] = useState<string[]>([])
  const [sectLogic, setSectLogic] = useState<RequirementLogic>('all')
  const [votes, setVotes] = useState<number | null>(null)
  const [selectedTraits, setSelectedTraits] = useState<string[]>([])
  const [selectedGroups, setSelectedGroups] = useState<number[]>([])
  const [capacityMin, setCapacityMin] = useState<number | null>(null)
  const [capacityMax, setCapacityMax] = useState<number | null>(null)
  const [set, setSet] = useState<string | null>(null)
  const [setAge, setSetAge] = useState<SetAgeMode>(defaultSetAge)
  const [setPrint, setSetPrint] = useState<SetPrintMode>(defaultSetPrint)
  const [precon, setPrecon] = useState<string | null>(null)
  const [artist, setArtist] = useState<string | null>(null)
  const [discModes, setDiscModes] = useState<Record<string, DisciplineMode>>({})
  const [orDisciplineGroups, setOrDisciplineGroups] = useState<OrDisciplineGroup[]>([])
  const [clans, setClans] = useState<string[]>([])
  const [titles, setTitles] = useState<string[]>([])
  const [sects, setSects] = useState<string[]>([])
  const [groups, setGroups] = useState<number[]>([])
  const [sets, setSets] = useState<string[]>([])
  const [precons, setPrecons] = useState<string[]>([])
  const [allDisciplines, setAllDisciplines] = useState<string[]>([])
  const [allTraits, setAllTraits] = useState<string[]>([])
  const [results, setResults] = useState<Array<CryptCard | SemanticResult<CryptCard>>>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  // A live regex-mode search can fail purely because the user hasn't finished
  // typing a valid pattern — that's a soft, recoverable state (empty results
  // + a hint), not the fatal "couldn't load the DB" error path.
  const [searchError, setSearchError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      listClans(),
      listGroups(),
      listCryptDisciplines(),
      listTitles(),
      listCryptSects(),
      listSets(),
      listPrecons(),
      listCryptTraits(),
    ])
      .then(([c, g, d, t, sc, s, p, tr]) => {
        setClans(c)
        setGroups(g)
        setTitles(t)
        setSects(sc)
        setAllDisciplines(d)
        setSets(s)
        setPrecons(p)
        setAllTraits(tr)
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
      ...emptyCryptFilters,
      text,
      textMode,
      textRegex,
      clan,
      title,
      sects: selectedSects,
      sectLogic,
      votes,
      traits: selectedTraits,
      group: null,
      groups: selectedGroups,
      capacityMin,
      capacityMax,
      set,
      setAge,
      setPrint,
      precon,
      artist,
      disciplineRequirements: active.map(([code, mode]) => ({
        code,
        superior: mode === 'superior',
      })),
      disciplineOr: orDisciplineGroups
        .map((row) => row.filter((entry): entry is DisciplineRequirement => entry !== null))
        .filter((row) => row.length > 0),
    }
  }, [
    text,
    textMode,
    textRegex,
    clan,
    title,
    selectedSects,
    sectLogic,
    votes,
    selectedTraits,
    selectedGroups,
    capacityMin,
    capacityMax,
    set,
    setAge,
    setPrint,
    precon,
    artist,
    discModes,
    orDisciplineGroups,
  ])

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
        searchSemanticCrypt(text, filters, (progress) => {
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

    searchCrypt(filters)
      .then((rows) => {
        if (cancelled) return
        setResults(rows)
        setSearchError('')
      })
      .catch((e: Error) => {
        if (cancelled) return
        // In regex mode an in-progress/invalid pattern is expected; show it
        // as a soft hint. Any other failure is a real DB error.
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

  const cycle = (code: string) => {
    setDiscModes((m) => {
      const next: DisciplineMode =
        m[code] === 'any' ? 'superior' : m[code] === 'superior' ? 'off' : 'any'
      return { ...m, [code]: next }
    })
  }

  const toggleGroup = (group: number) => {
    setSelectedGroups((selected) =>
      selected.includes(group)
        ? selected.filter((value) => value !== group)
        : [...selected, group].sort((a, b) => a - b),
    )
  }

  const toggleSect = (sect: string) => {
    setSelectedSects((selected) =>
      selected.includes(sect)
        ? selected.filter((value) => value !== sect)
        : [...selected, sect].sort(),
    )
  }

  const toggleTrait = (trait: string) => {
    setSelectedTraits((selected) =>
      selected.includes(trait)
        ? selected.filter((value) => value !== trait)
        : [...selected, trait],
    )
  }

  const setOrDiscipline = (rowIndex: number, slotIndex: number, code: string) => {
    setOrDisciplineGroups((rows) =>
      rows.map((row, index) => {
        if (index !== rowIndex) return row
        const next = [...row]
        next[slotIndex] = code ? { code, superior: false } : null
        return next
      }),
    )
  }

  const toggleOrLevel = (rowIndex: number, slotIndex: number) => {
    setOrDisciplineGroups((rows) =>
      rows.map((row, index) => {
        if (index !== rowIndex || !row[slotIndex]) return row
        const next = [...row]
        next[slotIndex] = { ...row[slotIndex], superior: !row[slotIndex].superior }
        return next
      }),
    )
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
                (textMode === mode
                  ? 'bg-blood text-white'
                  : 'bg-surface text-ink-dim hover:text-ink-muted')
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
          value={clan ?? ''}
          onChange={(e) => setClan(e.target.value || null)}
          disabled={status === 'loading'}
        >
          <option value="">Any clan</option>
          {clans.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={title ?? ''}
          onChange={(e) => setTitle(e.target.value || null)}
          disabled={status === 'loading'}
        >
          <option value="">Any title</option>
          <option value="non-titled">Non-titled</option>
          {titles.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          aria-label="Votes"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={votes ?? ''}
          onChange={(e) => setVotes(e.target.value === '' ? null : Number(e.target.value))}
          disabled={status === 'loading'}
        >
          <option value="">Any votes</option>
          <option value="0">No votes</option>
          <option value="1">1+ votes</option>
          <option value="2">2+ votes</option>
          <option value="3">3+ votes</option>
          <option value="4">4+ votes</option>
        </select>
        <div
          className="flex items-center overflow-hidden rounded-lg border border-line bg-surface"
          aria-label="Crypt groups"
        >
          <span className="px-2 text-xs text-ink-dim">Group</span>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={selectedGroups.includes(g)}
              onClick={() => toggleGroup(g)}
              disabled={status === 'loading'}
              className={
                'border-l border-line px-2.5 py-2 text-xs ' +
                (selectedGroups.includes(g)
                  ? 'bg-blood text-white'
                  : 'text-ink-dim hover:text-ink-muted')
              }
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-sm text-ink-dim">
          cap
          <input
            type="number"
            min={1}
            max={11}
            className="w-14 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
            placeholder="min"
            value={capacityMin ?? ''}
            onChange={(e) => setCapacityMin(e.target.value ? Number(e.target.value) : null)}
          />
          –
          <input
            type="number"
            min={1}
            max={11}
            className="w-14 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
            placeholder="max"
            value={capacityMax ?? ''}
            onChange={(e) => setCapacityMax(e.target.value ? Number(e.target.value) : null)}
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

      <TraitFilterControls
        options={allTraits}
        selected={selectedTraits}
        onToggle={toggleTrait}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink-dim">Sect</span>
        {sects.map((sect) => (
          <button
            key={sect}
            type="button"
            aria-label={`Crypt sect ${sect}`}
            aria-pressed={selectedSects.includes(sect)}
            onClick={() => toggleSect(sect)}
            disabled={status === 'loading'}
            className={
              'rounded-full border px-2.5 py-1 text-xs ' +
              (selectedSects.includes(sect)
                ? 'border-blood bg-blood text-white'
                : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
            }
          >
            {sect}
          </button>
        ))}
        {selectedSects.length > 0 && (
          <div className="ml-1 flex overflow-hidden rounded-lg border border-line">
            {(
              [
                ['all', 'All'],
                ['any', 'Any'],
                ['none', 'Not'],
              ] as [RequirementLogic, string][]
            ).map(([logic, label]) => (
              <button
                key={logic}
                type="button"
                aria-label={`Crypt sect logic ${label}`}
                aria-pressed={sectLogic === logic}
                onClick={() => setSectLogic(logic)}
                className={
                  'px-2.5 py-1 text-xs ' +
                  (sectLogic === logic
                    ? 'bg-blood text-white'
                    : 'bg-surface text-ink-dim hover:text-ink-muted')
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
        <button
          type="button"
          onClick={() => setOrDisciplineGroups((rows) => [...rows, [null, null]])}
          className="ml-1 rounded border border-dashed border-line px-2 py-1 text-xs text-ink-dim hover:border-blood hover:text-ink-muted"
        >
          + OR discipline
        </button>
      </div>

      {orDisciplineGroups.length > 0 && (
        <div className="grid gap-2 rounded-lg border border-line-soft bg-raised/40 p-3">
          <p className="text-xs text-ink-dim">
            Match at least one discipline in each row. Rows combine with AND.
          </p>
          {orDisciplineGroups.map((row, rowIndex) => (
            <div key={rowIndex} className="flex flex-wrap items-center gap-2">
              <span className="w-12 font-mono text-[10px] uppercase tracking-wide text-blood-hi">
                OR {rowIndex + 1}
              </span>
              {row.map((entry, slotIndex) => (
                <div key={slotIndex} className="flex overflow-hidden rounded-lg border border-line">
                  <select
                    aria-label={`OR discipline ${rowIndex + 1} alternative ${slotIndex + 1}`}
                    value={entry?.code ?? ''}
                    onChange={(event) =>
                      setOrDiscipline(rowIndex, slotIndex, event.target.value)
                    }
                    className="bg-surface px-2 py-1.5 text-xs text-ink"
                  >
                    <option value="">Choose…</option>
                    {allDisciplines.map((code) => (
                      <option key={code} value={code}>
                        {code.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!entry}
                    onClick={() => toggleOrLevel(rowIndex, slotIndex)}
                    aria-label={`OR discipline ${rowIndex + 1} alternative ${slotIndex + 1} level`}
                    title="Toggle any level / superior only"
                    className={
                      'border-l border-line px-2 py-1.5 font-mono text-[10px] font-bold uppercase disabled:opacity-30 ' +
                      (entry?.superior ? 'bg-gold text-[#241a06]' : 'bg-blood text-white')
                    }
                  >
                    {entry?.superior ? 'sup' : 'any'}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setOrDisciplineGroups((rows) => rows.filter((_, index) => index !== rowIndex))
                }
                className="text-xs text-ink-dim underline hover:text-blood-hi"
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      {status === 'loading' ? (
        <p className="text-sm text-ink-dim">Loading card database…</p>
      ) : (
        <>
          <p className={'text-xs ' + (searchError ? 'text-blood-hi' : 'text-ink-dim')}>
            {searchError || `${results.length}${semanticMode ? ' semantic' : ''} crypt cards`}
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
                  className="grid w-full grid-cols-[26px_1fr_auto_auto] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised"
                >
                  <span className="grid size-[22px] place-items-center rounded-full bg-blood/20 font-mono text-[11.5px] font-semibold text-blood-hi">
                    {c.capacity}
                  </span>
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
                      <DisciplineBadge key={d.code} {...d} />
                    ))}
                  </span>
                  <span className="text-right text-xs uppercase tracking-wide text-ink-muted">
                    {c.sect ? `${c.sect} · ` : ''}
                    {c.clan} · G{c.grp}
                  </span>
                </button>
                {expanded === c.id && <CardDetailPanel id={c.id} />}
              </div>
            ))}
            {results.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-dim">
                {semanticMode && !text.trim()
                  ? 'Describe a concept to search the V5 crypt.'
                  : 'No cards match those filters.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
