import { useEffect, useState } from 'react'
import { getCard, localizeCardText, type CardDetail } from '../lib/cardDetail'
import { languageLabel, useCardLanguage } from '../lib/cardLanguage'
import RulingRefs from './RulingRefs'
import { linkProps } from '../lib/route'
import CardText from './CardText'
import { useUiStrings } from '../lib/i18n'

export default function CardDetailPanel({ id }: { id: number }) {
  const strings = useUiStrings()
  const ui = strings.cardDetail
  const [card, setCard] = useState<CardDetail | null>(null)
  const [error, setError] = useState('')
  const { language } = useCardLanguage()

  useEffect(() => {
    setCard(null)
    getCard(id)
      .then(setCard)
      .catch((e: Error) => setError(e.message))
  }, [id])

  if (error) return <p className="px-4 py-3 text-sm text-blood-hi">{ui.loadError(error)}</p>
  if (!card) return <p className="px-4 py-3 text-sm text-ink-dim">{ui.loading}</p>
  const localized = localizeCardText(card, language)

  return (
    <div className="grid gap-3 border-t border-line-soft bg-ground px-4 py-4 text-sm">
      {localized.card_text && (
        <p className="leading-relaxed text-ink-muted">
          <CardText text={localized.card_text} />
        </p>
      )}
      {language !== 'en' && (
        <p className="text-xs text-ink-dim">
          {localized.isFallback
            ? ui.noTranslation(languageLabel(language))
            : ui.cardTextLanguage(languageLabel(localized.language))}
        </p>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-dim">
        {card.printings.length > 0 && (
          <span>
            {ui.printingsInline}{' '}
            <span className="text-ink-muted">
              {card.printings.map((p) => p.set + (p.precon ? ` (${p.precon})` : '')).join(', ')}
            </span>
          </span>
        )}
        {card.artists.length > 0 && (
          <span>{ui.artistsLabel(card.artists.length, card.artists.join(', '))}</span>
        )}
      </div>

      {card.rulings.length > 0 && (
        <div className="grid gap-1">
          <span className="text-xs uppercase tracking-wide text-ink-dim">{strings.badges.rulingsHeading}</span>
          <ul className="grid gap-1 text-xs text-ink-muted">
            {card.rulings.map((r, i) => (
              <li key={i}>
                <span>{r.text}</span>
                <RulingRefs refs={r.refs} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.translations.length > 0 && (
        <span className="text-xs text-ink-dim">
          {ui.availableCardText(
            ['en', ...card.translations.map((translation) => translation.lang)].map(languageLabel).join(', '),
          )}
        </span>
      )}

      <a {...linkProps({ page: 'card', id: card.id })} className="justify-self-start text-xs text-blood-hi hover:underline">
        {ui.fullPageLink}
      </a>
    </div>
  )
}
