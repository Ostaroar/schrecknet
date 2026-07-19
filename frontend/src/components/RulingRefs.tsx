import type { RulingRef } from '../lib/cardDetail'

export default function RulingRefs({ refs }: { refs: RulingRef[] }) {
  if (refs.length === 0) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {refs.map((ref, index) => {
        const label = ref.label || ref.text || 'Source'
        return ref.url ? (
          <a
            key={`${ref.url}-${index}`}
            href={ref.url}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-blood-hi hover:border-blood hover:underline"
          >
            {label} ↗
          </a>
        ) : (
          <span key={`${label}-${index}`} className="text-[10px] text-ink-dim">
            {label}
          </span>
        )
      })}
    </span>
  )
}
