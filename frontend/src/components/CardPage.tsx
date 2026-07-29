import { useEffect, useState } from 'react'
import { getCard, localizeCardText, type CardDetail } from '../lib/cardDetail'
import { languageLabel, useCardLanguage } from '../lib/cardLanguage'
import RulingRefs from './RulingRefs'
import CardTimingWindows from './CardTimingWindows'
import InventoryOwnedControl from './InventoryOwnedControl'
import { navigate } from '../lib/route'
import CardText from './CardText'
import CardImagePreview from './CardImagePreview'
import { CardTypeSummary, ClanSymbol, DisciplineBadge, PathSymbol } from './VtesSymbol'
import { useDocumentHead } from '../lib/documentHead'
import { DEFAULT_HEAD } from '../lib/seo'
import { useUiStrings } from '../lib/i18n'

function cardDescription(card: CardDetail, text: string): string {
  const kind =
    card.kind === 'crypt'
      ? `${card.clan}${card.group !== null ? ` group ${card.group}` : ''} vampire`
      : `${(card.types ?? []).join('/')} card`
  const trimmed = text.replace(/\s+/g, ' ').trim()
  const snippet = trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
  return snippet ? `${card.name} — VTES V5 ${kind}. ${snippet}` : `${card.name} — VTES V5 ${kind}.`
}

export default function CardPage({ id }: { id: number }) {
  const strings = useUiStrings()
  const ui = strings.cardDetail
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

  const localizedForHead = card ? localizeCardText(card, language) : null
  useDocumentHead(
    card && localizedForHead
      ? {
          title: `${localizedForHead.name} — SchreckNet`,
          description: cardDescription(card, localizedForHead.card_text ?? ''),
        }
      : DEFAULT_HEAD,
  )

  if (status === 'loading') return <p className="text-sm text-ink-dim">{ui.loading}</p>
  if (status === 'error')
    return <p className="text-sm text-blood-hi">{ui.loadError(error)}</p>
  if (status === 'missing' || !card)
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-ink-muted">{ui.notFound(id)}</p>
        <button onClick={() => navigate({ page: 'crypt' })} className="justify-self-start text-blood-hi underline">
          {ui.backToSearch}
        </button>
      </div>
    )

  const localized = localizedForHead ?? localizeCardText(card, language)

  return (
    <article className="grid max-w-2xl gap-5">
      <button
        onClick={() => navigate({ page: card.kind === 'crypt' ? 'crypt' : 'library' })}
        className="justify-self-start text-xs text-ink-dim hover:text-ink-muted"
      >
        {ui.backToKindSearch((card.kind === 'crypt' ? strings.sharedDeck.crypt : strings.sharedDeck.library).toLowerCase())}
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
          <p className="text-xs text-ink-dim">{ui.englishName(card.name)}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
          {card.kind === 'crypt' ? (
            <>
              <ClanSymbol clan={card.clan ?? ''} className="size-5" />
              <span>{card.clan}</span>
              {card.group !== null && <span>{ui.groupSuffix(card.group)}</span>}
              {card.title && <span>· {card.title}</span>}
              {card.path && (
                <>
                  <span>·</span>
                  <PathSymbol path={card.path} className="size-5" />
                  <span>{card.path}</span>
                </>
              )}
            </>
          ) : (
            <>
              <CardTypeSummary types={card.types ?? []} />
              {card.clan && <span>{ui.requiresClan(card.clan)}</span>}
              {card.path && (
                <>
                  <span>{ui.requires}</span>
                  <PathSymbol path={card.path} className="size-5" />
                  <span>{card.path}</span>
                </>
              )}
              {card.blood_cost && <span>{ui.bloodSuffix(card.blood_cost)}</span>}
              {card.pool_cost && <span>{ui.poolSuffix(card.pool_cost)}</span>}
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
              <p className="mt-3 text-xs text-ink-dim">{ui.noTranslation(languageLabel(language))}</p>
            )}
          </div>
        )}
      </div>

      <section className="grid gap-1 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{strings.badges.printingsHeading}</h2>
        <ul className="grid gap-1 text-ink-muted">
          {card.printings.map((p, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span>
                {p.set}
                {p.precon ? ` — ${p.precon}` : ''}
                {p.rarity ? ` (${p.rarity})` : ''}
              </span>
              {p.scan_url && <CardImagePreview imageUrl={p.scan_url} name={`${localized.name} (${p.set})`} />}
            </li>
          ))}
        </ul>
        {card.artists.length > 0 && (
          <p className="text-xs text-ink-dim">{ui.artistsLabel(card.artists.length, card.artists.join(', '))}</p>
        )}
      </section>

      {card.kind === 'library' && card.types && <CardTimingWindows types={card.types} />}

      {card.rulings.length > 0 && (
        <section className="grid gap-2 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{strings.badges.rulingsHeading}</h2>
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
          <span>
            {ui.availableCardText(
              ['en', ...card.translations.map((translation) => translation.lang)].map(languageLabel).join(', '),
            )}
          </span>
        </section>
      )}
    </article>
  )
}
