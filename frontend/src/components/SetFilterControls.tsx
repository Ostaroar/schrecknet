import {
  defaultSetAge,
  defaultSetPrint,
  type SetAgeMode,
  type SetPrintMode,
} from '../lib/setFilter'

interface SetFilterControlsProps {
  value: string | null
  age: SetAgeMode
  printing: SetPrintMode
  sets: string[]
  disabled: boolean
  onValueChange: (value: string | null) => void
  onAgeChange: (value: SetAgeMode) => void
  onPrintingChange: (value: SetPrintMode) => void
}

const AGE_TITLES: Record<SetAgeMode, string> = {
  exact: 'Printed in the selected set',
  or_newer: 'Printed in the selected set or any newer V5 set',
  or_older: 'Printed in the selected set or any older V5 set',
  not_newer: 'Not printed in a newer V5 set',
  not_older: 'Not printed in an older V5 set',
}

const PRINT_TITLES: Record<SetPrintMode, string> = {
  any: 'Any matching V5 printing',
  only: 'Printed in only one V5 set',
  first: 'The selected set is the first V5 printing',
  reprint: 'The selected set is a later V5 reprint',
}

export default function SetFilterControls({
  value,
  age,
  printing,
  sets,
  disabled,
  onValueChange,
  onAgeChange,
  onPrintingChange,
}: SetFilterControlsProps) {
  const changeSet = (next: string) => {
    onValueChange(next || null)
    if (!next) {
      onAgeChange(defaultSetAge)
      onPrintingChange(defaultSetPrint)
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      <select
        aria-label="Set"
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        value={value ?? ''}
        onChange={(event) => changeSet(event.target.value)}
        disabled={disabled}
      >
        <option value="">Any set</option>
        {sets.map((set) => (
          <option key={set} value={set}>
            {set}
          </option>
        ))}
      </select>
      {value && (
        <>
          <select
            aria-label="Set age relation"
            title={AGE_TITLES[age]}
            className="rounded-lg border border-line bg-surface px-2 py-2 text-xs text-ink"
            value={age}
            onChange={(event) => onAgeChange(event.target.value as SetAgeMode)}
          >
            <option value="exact">In set</option>
            <option value="or_newer">Or newer</option>
            <option value="or_older">Or older</option>
            <option value="not_newer">Not newer</option>
            <option value="not_older">Not older</option>
          </select>
          <select
            aria-label="Set printing relation"
            title={PRINT_TITLES[printing]}
            className="rounded-lg border border-line bg-surface px-2 py-2 text-xs text-ink"
            value={printing}
            onChange={(event) => onPrintingChange(event.target.value as SetPrintMode)}
          >
            <option value="any">Any printing</option>
            <option value="only">Only in</option>
            <option value="first">First print</option>
            <option value="reprint">Reprint</option>
          </select>
        </>
      )}
    </div>
  )
}
