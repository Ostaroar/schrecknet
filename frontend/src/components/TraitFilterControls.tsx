import { traitLabel } from '../lib/cardTraits'

interface TraitFilterControlsProps {
  options: string[]
  selected: string[]
  onToggle: (trait: string) => void
}

export default function TraitFilterControls({
  options,
  selected,
  onToggle,
}: TraitFilterControlsProps) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Card traits">
      <span className="mr-1 text-xs text-ink-dim">Traits</span>
      {options.map((trait) => {
        const active = selected.includes(trait)
        return (
          <button
            key={trait}
            type="button"
            aria-label={`Trait ${traitLabel(trait)}`}
            aria-pressed={active}
            onClick={() => onToggle(trait)}
            className={
              'rounded-full border px-2.5 py-1.5 text-xs ' +
              (active
                ? 'border-blood bg-blood text-white'
                : 'border-line bg-surface text-ink-dim hover:text-ink-muted')
            }
          >
            {traitLabel(trait)}
          </button>
        )
      })}
      {selected.length > 0 && (
        <span className="ml-1 text-[11px] text-ink-dim">all selected traits required</span>
      )}
    </div>
  )
}
