function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <div className="grid gap-2 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  )
}

const linkClass = 'text-blood-hi underline decoration-blood/40 underline-offset-2 hover:text-ink'

export function AboutPage() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">About SchreckNet</span>
        <h1 className="font-display text-3xl text-ink">The V5 card library and deck workbench.</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
          SchreckNet is a ground-up, offline-first rebuild of VDB focused exclusively on VTES Fifth Edition card
          research and deck building. Tournament archives, community rankings, and playtest-program features are
          intentionally outside its scope.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoSection title="Built to travel">
          <p>Card search and local decks keep working after the app and V5 database have been cached.</p>
          <p>Your anonymous decks live in a separate writable SQLite database in this browser.</p>
        </InfoSection>
        <InfoSection title="One rules engine">
          <p>Rust domain logic runs natively on the server and as WebAssembly in the browser.</p>
          <p>SQLite is the storage layer on both sides; MCP and REST share the same card services.</p>
        </InfoSection>
      </div>

      <InfoSection title="Credits">
        <p>
          SchreckNet builds on{' '}
          <a className={linkClass} href="https://github.com/smeea/vdb" target="_blank" rel="noreferrer">
            VDB
          </a>{' '}
          and card data and rulings from{' '}
          <a className={linkClass} href="https://krcg.org" target="_blank" rel="noreferrer">
            KRCG
          </a>
          . The source code is available under the MIT license.
        </p>
        <p>
          Portions of the materials are the copyrights and trademarks of Paradox Interactive AB and are used with
          permission under the Dark Pack agreement. All rights reserved.
        </p>
      </InfoSection>
    </div>
  )
}

export function HelpPage() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">Help</span>
        <h1 className="font-display text-3xl text-ink">Search fast. Build locally. Keep control.</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoSection title="Find cards">
          <p>Use Crypt or Library search for detailed V5-only filters. Select a result to open its full card page.</p>
          <p>
            Press <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-ink">⌘K</kbd> on
            macOS or <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-ink">Ctrl+K</kbd>{' '}
            elsewhere to search every card by name.
          </p>
        </InfoSection>
        <InfoSection title="Build decks">
          <p>Create a local deck, add cards by name, and adjust quantities with the compact steppers.</p>
          <p>Import or export text lists, share a deck URL, draw test hands, compare decks, and review V5 legality.</p>
        </InfoSection>
        <InfoSection title="Offline data">
          <p>The first visit downloads the V5 card database. Later searches and deck edits use browser-local SQLite.</p>
          <p>Clearing this site's browser storage also removes anonymous local decks, so export important lists.</p>
        </InfoSection>
        <InfoSection title="Machine API">
          <p>
            MCP Streamable HTTP is served at <code className="font-mono text-ink">/mcp</code>; local clients can use{' '}
            <code className="font-mono text-ink">schrecknet-server --mcp-stdio</code>.
          </p>
          <p>Mirrored card REST endpoints live under <code className="font-mono text-ink">/api/v1</code>.</p>
        </InfoSection>
      </div>
    </div>
  )
}
