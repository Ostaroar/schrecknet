import type { PreconOption, PreconSelection } from '../lib/preconFilter'
import {
  defaultSetPrint,
  type SetPrintMode,
} from '../lib/setFilter'
import { useUiStrings } from '../lib/i18n'

interface PreconFilterControlsProps {
  options: PreconOption[]
  value: PreconSelection[]
  printing: SetPrintMode
  disabled: boolean
  onValueChange: (value: PreconSelection[]) => void
  onPrintingChange: (value: SetPrintMode) => void
}

const PRINT_TITLES: Record<SetPrintMode, string> = {
  any: 'Any printing in a selected precon',
  only: 'The card appears in only this V5 set and precon',
  first: 'The selected precon set is the first V5 printing',
  reprint: 'The selected precon set is a later V5 reprint',
}

function selectionKey(selection: PreconSelection): string {
  return `${selection.set}:${selection.precon}`
}

export default function PreconFilterControls({
  options,
  value,
  printing,
  disabled,
  onValueChange,
  onPrintingChange,
}: PreconFilterControlsProps) {
  const ui = useUiStrings().search
  const selected = new Set(value.map(selectionKey))
  const sets = [...new Set(options.map((option) => option.set))]

  const add = (next: string) => {
    const option = options.find((candidate) => candidate.value === next)
    if (!option || selected.has(option.value)) return
    onValueChange([...value, { set: option.set, precon: option.precon }])
  }

  const remove = (selection: PreconSelection) => {
    const next = value.filter((candidate) => selectionKey(candidate) !== selectionKey(selection))
    onValueChange(next)
    if (next.length === 0) onPrintingChange(defaultSetPrint)
  }

  return (
    <fieldset className="grid min-w-0 gap-1.5" aria-label={ui.preconFilters}>
      <div className="flex min-w-0 flex-wrap gap-1">
        <select
          data-filter="precon-add"
          aria-label={ui.addPrecon}
          value=""
          onChange={(event) => add(event.target.value)}
          disabled={disabled}
          className="min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="">{ui.anyPrecon}</option>
          {sets.map((set) => (
            <optgroup key={set} label={set}>
              {options
                .filter((option) => option.set === set && !selected.has(option.value))
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.precon}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {value.length > 0 && (
          <select
            data-filter="precon-printing"
            aria-label={ui.printing}
            title={PRINT_TITLES[printing]}
            value={printing}
            onChange={(event) => onPrintingChange(event.target.value as SetPrintMode)}
            className="rounded-lg border border-line bg-surface px-2 py-2 text-xs text-ink"
          >
            <option value="any">{ui.anyPrinting}</option>
            <option value="only">{ui.onlyIn}</option>
            <option value="first">{ui.firstPrint}</option>
            <option value="reprint">{ui.reprint}</option>
          </select>
        )}
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label={ui.selectedPrecons}>
          {value.map((selection) => (
            <button
              key={selectionKey(selection)}
              type="button"
              onClick={() => remove(selection)}
              aria-label={ui.removePrecon(selection.precon, selection.set)}
              title={ui.removePrecon(selection.precon, selection.set)}
              className="rounded-full border border-line bg-raised px-2.5 py-1 text-[10px] text-ink-muted hover:border-blood hover:text-ink"
            >
              {selection.precon} · {selection.set} ×
            </button>
          ))}
        </div>
      )}
    </fieldset>
  )
}
