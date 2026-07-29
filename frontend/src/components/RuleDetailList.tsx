import { useUiStrings } from '../lib/i18n'

export default function RuleDetailList({ detail }: { detail: string }) {
  const ui = useUiStrings().badges
  const lines = detail
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return <p className="text-sm text-ink-dim">{ui.noRuleDetail}</p>

  return (
    <ul className="grid gap-2 text-sm leading-relaxed text-ink-muted sm:text-base">
      {lines.map((line, index) => {
        const isBullet = line.startsWith('•')
        return (
          <li key={`${line}-${index}`} className={isBullet ? 'flex gap-3' : 'pl-7 text-ink-dim'}>
            {isBullet && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blood-hi" aria-hidden="true" />}
            <span>{isBullet ? line.slice(1).trim() : line}</span>
          </li>
        )
      })}
    </ul>
  )
}
