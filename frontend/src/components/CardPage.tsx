import { useEffect, useState } from 'react'
import { getCard, localizeCardText, type CardDetail } from '../lib/cardDetail'
import { languageLabel, useCardLanguage } from '../lib/cardLanguage'
import RulingRefs from './RulingRefs'
import CardTimingWindows from './CardTimingWindows'
import InventoryOwnedControl from './InventoryOwnedControl'
import { navigate } from '../lib/route'
import CardText from './CardText'
import { CardTypeSummary, DisciplineBadge } from './VtesSymbol'

export default function CardPage({ id }: { id: number }) {
  const [card, setCard] = useState<CardDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [error, setError] = useState('')
  const { language } = useCardLanguage()

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

  const localized = localizeCardText(card, language)

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
          <h1 className="font-display text-3xl">{localized.name}</h1>
          {card.capacity !== null && (
            <span className="grid size-8 place-items-center rounded-full bg-blood/20 font-mono text-base font-semibold text-blood-hi">
              {card.capacity}
            </span>
          )}
        </div>
        {localized.name !== card.name && (
          <p className="text-xs text-ink-dim">English name: {card.name}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
          {card.kind === 'crypt' ? (
            <>
              <span>{card.clan}</span>
              {card.group !== null && <span>· Group {card.group}</span>}
              {card.title && <span>· {card.title}</span>}
            </>
          ) : (
            <>
              <CardTypeSummary types={card.types ?? []} />
              {card.clan && <span>· requires {card.clan}</span>}
              {card.blood_cost && <span>· {card.blood_cost} blood</span>}
              {card.pool_cost && <span>· {card.pool_cost} pool</span>}
            </>
          )}
        </div>
        {card.disciplines.length > 0 && (
          <div className="flex gap-1.5">
            {card.disciplines.map((d) => (
              <DisciplineBadge key={d.code} {...d} compact />
            ))}
          </div>
        )}
        <InventoryOwnedControl cardId={card.id} />
      </header>

      <div className="flex flex-wrap items-start gap-5">
        {card.image_url && (
          <img
            src={card.image_url}
            alt={localized.name}
            loading="lazy"
            className="w-full max-w-[280px] rounded-xl border border-line"
          />
        )}
        {localized.card_text && (
          <div className="min-w-[16rem] flex-1 rounded-xl border border-line bg-surface p-5">
            <p className="leading-relaxed text-ink">
              <CardText text={localized.card_text} />
            </p>
            {localized.isFallback && (
              <p className="mt-3 text-xs text-ink-dim">
                No {languageLabel(language)} translation is available for this card; showing English.
              </p>
            )}
          </div>
        )}
      </div>

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

      {card.kind === 'library' && card.types && <CardTimingWindows types={card.types} />}

      {card.rulings.length > 0 && (
        <section className="grid gap-2 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Rulings</h2>
          <ul className="grid gap-2 text-ink-muted">
            {card.rulings.map((r, i) => (
              <li key={i}>
                <span>{r.text}</span>
                <RulingRefs refs={r.refs} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.translations.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
          <span>Available card text:</span>
          <span className="text-ink-muted">
            {['en', ...card.translations.map((translation) => translation.lang)]
              .map(languageLabel)
              .join(', ')}
          </span>
        </section>
      )}
    </article>
  )
}
