import { useEffect, useState } from 'react'
import { getCard, type CardDetail } from '../lib/cardDetail'
import { navigate } from '../lib/route'

function DisciplineBadge({ code, superior }: { code: string; superior: boolean }) {
  return (
    <span
      className={
        'inline-grid h-[19px] min-w-[30px] place-items-center rounded px-1 font-mono text-[10px] font-bold uppercase tracking-wide ' +
        (superior ? 'bg-gold text-[#241a06]' : 'border border-line text-ink-muted')
      }
    >
      {code}
    </span>
  )
}

export default function CardPage({ id }: { id: number }) {
  const [card, setCard] = useState<CardDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    setStatus('loading')
    getCard(id)
      .then((c) => {
        setCard(c)
        setStatus(c ? 'ready' : 'missing')
      })
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
  }, [id])

  if (status === 'loading') return <p className="text-sm text-ink-dim">Loading…</p>
  if (status === 'error')
    return <p className="text-sm text-blood-hi">Couldn't load card: {error}</p>
  if (status === 'missing' || !card)
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-ink-muted">No card with id {id} in the V5 pool.</p>
        <button onClick={() => navigate({ page: 'crypt' })} className="justify-self-start text-blood-hi underline">
          Back to search
        </button>
      </div>
    )

  return (
    <article className="grid max-w-2xl gap-5">
      <button
        onClick={() => navigate({ page: card.kind === 'crypt' ? 'crypt' : 'library' })}
        className="justify-self-start text-xs text-ink-dim hover:text-ink-muted"
      >
        ← back to {card.kind} search
      </button>

      <header className="grid gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl">{card.name}</h1>
          {card.capacity !== null && (
            <span className="grid size-8 place-items-center rounded-full bg-blood/20 font-mono text-base font-semibold text-blood-hi">
              {card.capacity}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
          {card.kind === 'crypt' ? (
            <>
              <span>{card.clan}</span>
              {card.group !== null && <span>· Group {card.group}</span>}
              {card.title && <span>· {card.title}</span>}
            </>
          ) : (
            <>
              <span>{card.types?.join(' / ')}</span>
              {card.clan && <span>· requires {card.clan}</span>}
              {card.blood_cost && <span>· {card.blood_cost} blood</span>}
              {card.pool_cost && <span>· {card.pool_cost} pool</span>}
            </>
          )}
        </div>
        {card.disciplines.length > 0 && (
          <div className="flex gap-1.5">
            {card.disciplines.map((d) => (
              <DisciplineBadge key={d.code} {...d} />
            ))}
          </div>
        )}
      </header>

      {card.card_text && (
        <p className="rounded-xl border border-line bg-surface p-5 leading-relaxed text-ink">
          {card.card_text}
        </p>
      )}

      <section className="grid gap-1 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">Printings</h2>
        <ul className="text-ink-muted">
          {card.printings.map((p, i) => (
            <li key={i}>
              {p.set}
              {p.precon ? ` — ${p.precon}` : ''}
              {p.rarity ? ` (${p.rarity})` : ''}
            </li>
          ))}
        </ul>
        {card.artists.length > 0 && (
          <p className="text-xs text-ink-dim">
            Artist{card.artists.length > 1 ? 's' : ''}: {card.artists.join(', ')}
          </p>
        )}
      </section>

      {card.rulings.length > 0 && (
        <section className="grid gap-2 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Rulings</h2>
          <ul className="grid gap-2 text-ink-muted">
            {card.rulings.map((r, i) => (
              <li key={i}>{r.text}</li>
            ))}
          </ul>
        </section>
      )}

      {card.translations.length > 0 && (
        <section className="grid gap-2 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Translations</h2>
          {card.translations.map((t) => (
            <div key={t.lang} className="rounded-lg border border-line-soft bg-surface p-3">
              <p className="text-xs font-semibold uppercase text-gold">{t.lang}</p>
              {t.name && <p className="text-ink">{t.name}</p>}
              {t.card_text && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.card_text}</p>}
            </div>
          ))}
        </section>
      )}
    </article>
  )
}
