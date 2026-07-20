import { parseCardText, type CardTextSegment } from '../lib/cardText'
import { VtesSymbol } from './VtesSymbol'

function CardTextSymbol({ segment }: { segment: Exclude<CardTextSegment, { kind: 'text' }> }) {
  const appearance =
    segment.kind === 'card-type'
      ? 'size-[1.35em]'
      : segment.superior
        ? 'size-[1.38em]'
        : 'size-[1.15em]'

  return (
    <VtesSymbol
      segment={segment}
      cardTextToken={segment.token}
      className={`mx-[0.08em] translate-y-[0.18em] ${appearance} drop-shadow-[0_0_1px_rgba(236,228,230,0.3)]`}
    />
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
