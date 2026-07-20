# VTES v5 Game-Loop Visualizer — vision & design options

**Status:** M1 source/schema and M2 turn-stepper complete (2026-07-20); drill-down,
impulse, and card-window milestones remain.
Additive feature, beyond vdb parity — the same "additive, not vdb parity" class as
offline semantic search.

**Source assets** (committed): [`docs/gameloop/`](gameloop/) — the owner's authored DOT
FSM (canonical) plus its SVG/PDF renders. **Implementation plan for codex:**
[`docs/gameloop/DEV-PLAN.md`](gameloop/DEV-PLAN.md).

## Decision (2026-07-20)

The product owner asked for two things: their existing game-loop work should **continue
in a readable way**, and it should be **useful in both ways** — as a human teaching aid
*and* as the seed of a formal/executable rules spec. Direction:

1. **Both goals, one source of truth.** Model the loop **once** as structured data — a
   statechart JSON distilled from the existing DOT FSM — and render it into the human
   teaching views while keeping the same definition usable as the engine-spec seed.
   Never hand-maintain two representations. The DOT is the *origin*, preserved and
   credited; it is not thrown away, it is promoted to a maintained, machine-readable
   form.
2. **Readability is the primary success criterion.** Every design choice is judged
   first on "can a person actually follow this?" — hence decomposition + drill-down
   over one flat render (see below). If a view isn't readable, it isn't done.
3. **Resolved sub-calls** (owner delegated these): combat ships a **simplified learner
   loop** in v1 with the full 7-step detail behind the Basic/Advanced toggle; the
   **card-DB integration is a committed goal** (it's the differentiator and the reason
   to build this *inside* SchreckNet) but staged *after* the v1 explainer, not
   v1-blocking; the executable-statechart path stays optional and gets its own ADR when
   picked up.

The rest of this doc is the supporting design rationale.

## Why this fits SchreckNet

SchreckNet is a card **research + deck building** tool. A rules-level, card-agnostic
map of how a V5 game actually *plays* — turn structure, the priority/impulse system,
combat rounds, block resolution, referendums — is the natural companion to
`docs/domain-vtes.md` (the text rules primer). It answers the questions a deck builder
and a learning player keep hitting: *when* can this reaction fire? *who* gets to block?
what actually happens when a bleed is blocked? It stays firmly card-agnostic at the
rules layer, so it's reference tooling, not a play server — consistent with the
tournament/community-data scope exclusion.

## The source artifact (what already exists)

A Graphviz DOT finite-state machine of the **full** v5 game loop
([`docs/gameloop/vtes-v5-gameloop.dot`](gameloop/vtes-v5-gameloop.dot), ~510 lines). It is genuinely thorough —
it models, in nested `subgraph cluster_*` blocks:

- **Meta loop** (session, VP scoring, oust/withdraw)
- **Turn structure** — 5 phases: Unlock → Master → Minion → Influence → Discard
- **Sub-loops** — influence transfers, discard DPA, contest (unique cards/titles)
- **Minion / action loop** — declare → "as announced" window → block eligibility →
  block attempt → success/blocked → branch to bleed / hunt / referendum / combat
- **Combat FSM** — the 7-step round (before-range → determine range → before-strikes →
  strike → damage → press → end-of-round), maneuver/press cycles, premature-end rules
- **Block Attempt FSM** — stealth vs intercept, block resolution, the
  end-early / no-combat / torpor-special exceptions
- **Referendum FSM**, **Torpor/Diablerie/Blood Hunt**
- **Card Play micro-FSM** (declare → as-played → resolve → replace)
- **Shared Impulse Window** — the crux: a single play/pass loop with **three
  context-specific pass orders** (A: combat / directed-at-one; B: directed-at-a-set;
  C: undirected — prey, then predator, then clockwise)
- **Card timing hooks** (`HK_*`) bridging card timing to FSM windows, plus a
  build-time card-dataset integration path

That last part is the tell: the artifact is quietly two things at once —
**(a) a human teaching aid** and **(b) a formal rules-engine spec** (the hooks +
parameterized impulse window are scaffolding toward an executable engine). Those two
goals want *different* visualizations, which is the root of the "is there a better way?"
instinct.

## The core problem with the current rendering

One flat FSM at this scale renders as a hairball. The specific culprit: every subsystem
dashes into the *single shared* `IMPULSE_WINDOW` node, so a static layout draws ~15
long crossing edges converging on one hub. `rankdir=LR` then can't find a clean order.
It's not a Graphviz-tuning problem so much as a **formalism** problem: this domain is a
**Harel statechart** (nested composite states + always-on orthogonal regions), not a
flat state machine.

## Recommended direction: interactive, decomposed, drill-down

Rather than one mega-diagram, model it as a **hierarchical statechart with progressive
disclosure**, rendered web-native (SchreckNet is already a React/Vite app, so the
diagram can be interactive instead of a static export). Keep the full FSM as the
underlying *source of truth*; render it into several focused, linked views:

1. **Turn stepper (the 90% view).** The 5 phases as a simple horizontal timeline /
   ring. This alone is what most learners need. Each phase is a clickable composite
   state that expands into its sub-loop. Breadcrumb back up.

2. **Action-resolution drill-down.** declare → announce window → block eligibility →
   block attempt → blocked/success → (bleed | hunt | referendum | combat). This is the
   decision-heavy core; it's already full of diamonds in the DOT, so it renders well as
   a **decision tree**.

3. **Combat as its own 7-step round loop.** Combat is the most-asked-about subsystem
   and is a self-contained cycle (press → next round). Giving it a dedicated loop
   diagram — not buried in the global graph — is high value on its own.

4. **Impulse / priority widget (the standout explainer).** The single hardest concept
   in VTES, and the crux of the FSM. Make it *interactive* instead of a state node:
   a 5-seat table with predator/prey marked; pick a context (combat / directed-at-one /
   directed-at-set / undirected) and watch the pass order animate around the table,
   snapping impulse back to the acting Methuselah whenever someone plays. This teaches
   in seconds what the text rules take paragraphs to convey, and ties directly to the
   predator/prey glossary in `domain-vtes.md`.

5. **Block-resolution detail** — the stealth/intercept compare plus the three
   exception paths (end-early → no lock/combat; torpor-special → optional diablerie;
   blocked-no-combat). A small focused sub-diagram; these edge cases are exactly what
   people get wrong.

Progressive-complexity toggles map cleanly onto the source, which already tags advanced
content `(Adv)`: a **Basic** vs **Advanced/Judge** switch that hides the hook system,
combat internals, and contest/torpor exceptions for new players.

## The differentiator: fuse the diagram with the card database

This is where SchreckNet can do something no other VTES tool does. The artifact already
defines `HK_*` hooks mapping **card timing → FSM windows**. SchreckNet already has the
full V5 card DB with card *types* (Action, Action Modifier, Reaction, Combat, Master,
Political Action, Reaction, Retainer, …). Join them:

- At each impulse/timing window, show **which card types can legally be played here** —
  and, when a deck is open, **which of *your* cards** could fire at that step.
- From a deck (or a single card's detail page), answer *"when can I play this?"* by
  highlighting its window(s) on the turn/combat timeline.

That turns a rules diagram into a **deck-aware rules trainer**, a natural extension of
"card research + deck building" and a genuine reason to build the visualizer *inside*
SchreckNet rather than ship the static PDF.

## Optional: executable spec (pillar b)

If the goal also includes the engine-spec ambition, the honest formalism is a
**statechart** (nested + orthogonal regions: the hand-size / draw-replace rules are
always-active orthogonal regions; the impulse window is a reusable sub-statechart
parameterized by context). A statechart library (e.g. XState) could make the spec
**executable and testable** and drive the interactive UI from a single source of truth —
one definition that is simultaneously the diagram, the trainer's step engine, and a
rules-consistency test target. That is a larger commitment and a new dependency; it
would want its own ADR.

## If the Graphviz/PDF export stays (static path)

For archival/print, don't fight the hairball — decompose the render:

- **One page per subsystem** (turn, action, combat, block, impulse, referendum) instead
  of one mega-render.
- **Stop sharing a single `IMPULSE_WINDOW` node** — inline/duplicate it per use-site so
  each subsystem carries its own copy; this removes the ~15 crossing dashed edges that
  cause most of the mess.
- `constraint=false` on the hook→window bridge edges, `rank=same` groupings, and
  `unflatten` / `ratio=compress` to tame aspect ratio.

But for a stateful, cyclic, priority-driven domain like this, **interactive beats
static** — panning a zoomable graph with collapsible groups (or the decomposed views
above) is fundamentally more usable than any single image.

## Dependencies & offline (respect the project's rules)

- **Zero-dep MVP** is viable: hand-authored inline SVG + CSS/JS for pan/zoom and
  drill-down, no library — same spirit as the hand-rolled hash router and base64
  encoder. Bundles fine offline via the existing PWA shell.
- **Richer interactivity** (React Flow / XY Flow for pan/zoom/minimap/collapsible
  groups, or XState for an executable spec) each introduces a runtime dependency and so
  needs an ADR first, per AGENTS.md rule 7.
- The diagram data (states, transitions, window→card-type mapping) is static and
  build-time — it can live alongside the card data, no server needed.

## Suggested phasing

1. **MVP — static-but-interactive explainer.** Turn stepper + drill-down into
   action/combat/impulse/block, zero new deps, Basic/Advanced toggle. Route it at
   e.g. `#/rules` or `#/gameloop`. Source the diagram from a hand-curated JSON derived
   from the DOT (don't hand-maintain two representations).
2. **Impulse/priority interactive widget** — the highest-teaching-value piece.
3. **Card-DB integration** — window → card-type mapping, then deck-aware "when can I
   play this?".
4. **(Optional, own ADR) executable statechart** — if the engine-spec ambition is in
   scope.

## Resolved (see Decision, top of doc)

- **Teaching aid or engine spec?** → *Both*, via one source-of-truth statechart JSON
  distilled from the DOT. The MVP ships the teaching aid; the same definition seeds the
  optional executable spec later.
- **Combat depth in v1?** → *Simplified learner loop* (round → strike → damage → press →
  repeat) by default, with the full 7-step / additional-strike / press detail behind the
  Basic ↔ Advanced/Judge toggle.
- **Card-DB integration — must-have or nice-to-have?** → *Committed goal*, staged after
  the v1 explainer. It's the reason to build this inside SchreckNet rather than ship the
  static PDF, but it does not block the first readable explainer.
