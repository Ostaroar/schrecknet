import { useEffect, useMemo, useState } from 'react'
import {
  searchCrypt,
  listClans,
  listGroups,
  listCryptDisciplines,
  emptyCryptFilters,
  type CryptCard,
} from '../lib/cryptSearch'
import CardDetailPanel from './CardDetailPanel'

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

export default function CryptSearch() {
  const [text, setText] = useState('')
  const [clan, setClan] = useState<string | null>(null)
  const [group, setGroup] = useState<number | null>(null)
  const [capacityMin, setCapacityMin] = useState<number | null>(null)
  const [capacityMax, setCapacityMax] = useState<number | null>(null)
  const [discModes, setDiscModes] = useState<Record<string, DisciplineMode>>({})
  const [clans, setClans] = useState<string[]>([])
  const [groups, setGroups] = useState<number[]>([])
  const [allDisciplines, setAllDisciplines] = useState<string[]>([])
  const [results, setResults] = useState<CryptCard[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([listClans(), listGroups(), listCryptDisciplines()])
      .then(([c, g, d]) => {
        setClans(c)
        setGroups(g)
        setAllDisciplines(d)
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
      clan,
      group,
      capacityMin,
      capacityMax,
      disciplines: active.map(([code]) => code),
      // vdb lets you mix levels per discipline; MVP applies "superior" to the
      // whole selection when any badge is in superior mode (feature-parity ✎).
      disciplinesSuperior: active.some(([, m]) => m === 'superior'),
    }
  }, [text, clan, group, capacityMin, capacityMax, discModes])

  useEffect(() => {
    if (status !== 'ready') return
    searchCrypt(filters)
      .then(setResults)
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
  }, [filters, status])

  const cycle = (code: string) => {
    setDiscModes((m) => {
      const next: DisciplineMode =
        m[code] === 'any' ? 'superior' : m[code] === 'superior' ? 'off' : 'any'
      return { ...m, [code]: next }
    })
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
          placeholder="Name / text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={status === 'loading'}
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
          value={group ?? ''}
          onChange={(e) => setGroup(e.target.value ? Number(e.target.value) : null)}
          disabled={status === 'loading'}
        >
          <option value="">Any group</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              Group {g}
            </option>
          ))}
        </select>
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
          <p className="text-xs text-ink-dim">{results.length} crypt cards</p>
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {results.map((c) => (
              <div key={c.id}>
                <button
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  className="grid w-full grid-cols-[26px_1fr_auto_auto] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised"
                >
                  <span className="grid size-[22px] place-items-center rounded-full bg-blood/20 font-mono text-[11.5px] font-semibold text-blood-hi">
                    {c.capacity}
                  </span>
                  <span className="truncate">{c.name}</span>
                  <span className="flex gap-1">
                    {c.disciplines.map((d) => (
                      <DisciplineBadge key={d.code} {...d} />
                    ))}
                  </span>
                  <span className="text-right text-xs uppercase tracking-wide text-ink-muted">
                    {c.clan} · G{c.grp}
                  </span>
                </button>
                {expanded === c.id && <CardDetailPanel id={c.id} />}
              </div>
            ))}
            {results.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-dim">No cards match those filters.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
