import type { SemanticProgress } from '../lib/semanticSearch'

interface Props {
  enabled: boolean
  progress: SemanticProgress
  onToggle: () => void
  onRetry: () => void
  onRemove: () => void
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export default function SemanticModeControl({
  enabled,
  progress,
  onToggle,
  onRetry,
  onRemove,
}: Props) {
  return (
    <>
      <button
        onClick={onToggle}
        title="Find cards by English concept using the local offline model"
        aria-pressed={enabled}
        className={
          'rounded-lg border px-2.5 py-2 text-xs font-medium ' +
          (enabled
            ? 'border-gold bg-gold text-[#241a06]'
            : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
        }
      >
        ◇ Semantic
      </button>

      {enabled && (
        <div className="basis-full rounded-lg border border-gold/35 bg-gold/5 px-3 py-2.5 text-xs text-ink-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              {progress.phase === 'idle' &&
                'Describe an English card concept. First use downloads about 46 MB (model + runtime); queries stay on this device.'}
              {progress.phase === 'loading' && 'Preparing the local semantic model…'}
              {progress.phase === 'downloading' && (
                <>
                  Downloading local model
                  {typeof progress.percent === 'number' ? ` · ${Math.round(progress.percent)}%` : ''}
                  {typeof progress.loaded === 'number' && typeof progress.total === 'number'
                    ? ` · ${megabytes(progress.loaded)} / ${megabytes(progress.total)}`
                    : ''}
                </>
              )}
              {progress.phase === 'ready' &&
                'Local semantic model ready. Results are cosine-ranked; the score is similarity, not a probability.'}
              {progress.phase === 'error' && `Semantic model unavailable: ${progress.error ?? 'unknown error'}`}
            </p>
            <span className="flex gap-3">
              {progress.phase === 'error' && (
                <button onClick={onRetry} className="text-blood-hi underline hover:text-ink">
                  Retry
                </button>
              )}
              {progress.phase === 'ready' && (
                <button onClick={onRemove} className="text-ink-dim underline hover:text-ink">
                  Remove local model
                </button>
              )}
            </span>
          </div>
          {progress.phase === 'downloading' && typeof progress.percent === 'number' && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-gold transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
