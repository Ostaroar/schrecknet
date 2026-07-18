import { useEffect, useMemo, useState } from 'react'
import { searchLibrary, listLibraryTypes, listLibraryClans, type LibraryCard } from '../lib/librarySearch'
import CardDetailPanel from './CardDetailPanel'

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
  const [cardType, setCardType] = useState<string | null>(null)
  const [clan, setClan] = useState<string | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [clans, setClans] = useState<string[]>([])
  const [results, setResults] = useState<LibraryCard[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([listLibraryTypes(), listLibraryClans()])
      .then(([t, c]) => {
        setTypes(t)
        setClans(c)
        setStatus('ready')
      })
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
  }, [])

  const filters = useMemo(() => ({ text, cardType, clan }), [text, cardType, clan])

  useEffect(() => {
    if (status !== 'ready') return
    searchLibrary(filters)
      .then(setResults)
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
  }, [filters, status])

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
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-ink-dim">Loading card database…</p>
      ) : (
        <>
          <p className="text-xs text-ink-dim">{results.length} library cards</p>
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {results.map((c) => (
              <div key={c.id}>
                <button
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised"
                >
                  <span className="truncate">{c.name}</span>
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
              <p className="px-4 py-6 text-center text-sm text-ink-dim">No cards match those filters.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
