import type { UiStrings } from '../lib/i18n'

export default function ChangelogPage({ ui }: { ui: UiStrings['changelog'] }) {
  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">{ui.eyebrow}</span>
        <h1 className="font-display text-3xl text-ink">{ui.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{ui.lead}</p>
      </header>

      <ol className="relative grid gap-4 before:absolute before:bottom-5 before:left-[5.5rem] before:top-5 before:w-px before:bg-line-soft sm:before:left-[7.5rem]">
        {ui.entries.map((entry, index) => (
          <li key={`${entry.date}-${entry.title}`} className="relative grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.75rem_minmax(0,1fr)] sm:gap-5">
            <time dateTime={entry.date} className="pt-5 font-mono text-[10px] text-ink-dim sm:text-xs">
              {entry.date}
            </time>
            <article className="relative grid gap-2 rounded-xl border border-line bg-surface p-4 before:absolute before:-left-[0.55rem] before:top-6 before:size-2 before:rounded-full before:bg-blood-hi sm:p-5">
              {index === 0 && <span className="absolute right-3 top-3 size-2 animate-pulse rounded-full bg-gold" aria-hidden="true" />}
              <h2 className="pr-5 font-display text-lg text-ink">{entry.title}</h2>
              <p className="text-sm leading-relaxed text-ink-muted">{entry.summary}</p>
              <ul className="grid gap-1 text-xs leading-relaxed text-ink-dim">
                {entry.items.map((item) => <li key={item}>— {item}</li>)}
              </ul>
            </article>
          </li>
        ))}
      </ol>
    </div>
  )
}
