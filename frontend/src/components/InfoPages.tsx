import type { UiStrings } from '../lib/i18n'

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <div className="grid gap-2 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  )
}

const linkClass = 'text-blood-hi underline decoration-blood/40 underline-offset-2 hover:text-ink'

export function AboutPage({ ui }: { ui: UiStrings['about'] }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">{ui.eyebrow}</span>
        <h1 className="font-display text-3xl text-ink">{ui.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{ui.lead}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoSection title={ui.travelTitle}>
          <p>{ui.travel1}</p>
          <p>{ui.travel2}</p>
        </InfoSection>
        <InfoSection title={ui.engineTitle}>
          <p>{ui.engine1}</p>
          <p>{ui.engine2}</p>
        </InfoSection>
      </div>

      <InfoSection title={ui.creditsTitle}>
        <p>
          {ui.creditsBuildsOn}{' '}
          <a className={linkClass} href="https://github.com/smeea/vdb" target="_blank" rel="noreferrer">
            VDB
          </a>{' '}
          {ui.creditsAnd}{' '}
          <a className={linkClass} href="https://krcg.org" target="_blank" rel="noreferrer">
            KRCG
          </a>
          {ui.creditsCardData}
        </p>
        <p>{ui.creditsRights}</p>
      </InfoSection>
    </div>
  )
}

export function HelpPage({ ui }: { ui: UiStrings['help'] }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">{ui.eyebrow}</span>
        <h1 className="font-display text-3xl text-ink">{ui.title}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoSection title={ui.findCardsTitle}>
          <p>{ui.findCards1}</p>
          <p>
            <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-ink">⌘K</kbd> /{' '}
            <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-ink">Ctrl+K</kbd> —{' '}
            {ui.findCards2}
          </p>
        </InfoSection>
        <InfoSection title={ui.buildDecksTitle}>
          <p>{ui.buildDecks1}</p>
          <p>{ui.buildDecks2}</p>
        </InfoSection>
        <InfoSection title={ui.offlineTitle}>
          <p>{ui.offline1}</p>
          <p>{ui.offline2}</p>
        </InfoSection>
        <InfoSection title={ui.apiTitle}>
          <p>{ui.api1}</p>
          <p>{ui.api2}</p>
        </InfoSection>
      </div>
    </div>
  )
}
