import { parseCardText, type CardTextSegment } from '../lib/cardText'

function symbolLabel(segment: Exclude<CardTextSegment, { kind: 'text' }>): string {
  if (segment.kind === 'card-type') return `${segment.label} symbol`
  return `${segment.superior ? 'Superior ' : ''}${segment.label} symbol`
}

function CardTextSymbol({ segment }: { segment: Exclude<CardTextSegment, { kind: 'text' }> }) {
  const label = symbolLabel(segment)
  const source =
    segment.kind === 'card-type'
      ? `/images/types/${segment.asset}.svg`
      : `/images/disciplines/${segment.asset}${segment.superior ? 'sup' : ''}.svg`
  const appearance =
    segment.kind === 'card-type'
      ? 'size-[1.35em]'
      : segment.superior
        ? 'size-[1.38em]'
        : 'size-[1.15em]'

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-card-text-symbol={segment.token}
      data-symbol-kind={segment.kind}
      data-symbol-src={source}
      className={`mx-[0.08em] inline-flex translate-y-[0.18em] ${appearance}`}
    >
      <img
        aria-hidden="true"
        src={source}
        alt=""
        className="size-full object-contain drop-shadow-[0_0_1px_rgba(236,228,230,0.3)]"
      />
    </span>
  )
}

export default function CardText({ text, className = '' }: { text: string; className?: string }) {
  const segments = parseCardText(text)
  return (
    <span className={`whitespace-pre-line ${className}`}>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <CardTextSymbol key={index} segment={segment} />
        ),
      )}
    </span>
  )
}
