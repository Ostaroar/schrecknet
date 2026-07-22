# Game-loop visualizer — development plan (for codex)

Concrete, staged plan to build the Phase 5 game-loop visualizer. Read
[`../gameloop-visualizer.md`](../gameloop-visualizer.md) first for the *why* and the
recorded decisions; this doc is the *how*. Follow the repo's established discipline:
vertical slices, verify-live before "done", no new runtime dependency without an ADR,
domain logic in shared Rust, docs updated in the same change.

## North star (already decided)

- **One source of truth, two outputs.** The owner's DOT is the authored origin; derive a
  structured `gameloop.json` from it. Render that JSON into the human teaching views, and
  keep the same definition usable as the seed of an executable/engine spec later. Never
  hand-maintain two representations.
- **Readability is the pass/fail gate.** Decomposed drill-down, never one flat render.
  If a person can't follow a view, it isn't done.
- Combat: simplified learner loop by default, full 7-step behind a Basic/Advanced toggle.
- Card-DB integration is committed but staged *after* the first readable explainer.

## The data contract (`gameloop.json`)

Define this once and treat it as the stable interface between the distiller (M1) and
every view (M2+). Proposed schema — adjust field names if you like, but keep the shape:

```jsonc
{
  "version": "1",
  "source": "docs/gameloop/vtes-v5-gameloop.dot",
  "meta": { "title": "VTES v5 — full game loop", "players": 5 },

  // clusters in the DOT → composite states / regions
  "regions": [
    { "id": "TURN", "label": "Turn structure", "orthogonal": false },
    { "id": "IMPULSE", "label": "Shared impulse window", "orthogonal": false }
    // HAND_RULE / DRAW_REPLACE are always-active → orthogonal: true
  ],

  "states": [
    {
      "id": "PH_UNLOCK",
      "label": "Unlock Phase",
      "detail": "Unlock all your cards; resolve unlock-phase effects; handle contests…",
      "kind": "state",        // state | decision | window | note | composite
      "level": "basic",       // basic | advanced  (advanced = labeled "(Adv)" in the DOT)
      "parent": "TURN",       // region id, or null for top level
      "hooks": ["HK_UNLOCK"]  // timing hooks anchored here (drives card-DB integration)
    }
  ],

  "transitions": [
    {
      "from": "PH_UNLOCK", "to": "PH_MASTER",
      "label": null,
      "guard": null,          // e.g. "if contest exists"
      "kind": "flow",         // flow | conditional | annotation | bridge
      "level": "basic"
    }
  ],

  // card-timing → window mapping: the seed for "when can I play this?"
  "hooks": [
    { "id": "HK_REACT", "window": "REACTION_WINDOW",
      "cardTypes": ["Reaction"], "anchor": "ACTION_DECLARE" }
  ]
}
```

Map DOT features to the schema: `subgraph cluster_*` → `regions`; `shape=diamond` →
`kind:"decision"`; `shape=oval` (impulse open/close) → `kind:"window"`; `shape=note` →
`kind:"note"`; edge `style=dashed` → `kind:"conditional"` (usually with a `guard` from
the edge label); `style=dotted` → `kind:"annotation"` or `"bridge"` (the `HK_* → window`
edges); `(Adv)` anywhere in a label → `level:"advanced"`. Expand chained edges
(`A -> B -> C`) into individual transitions.

## Milestones (vertical slices)

### M1 — Source of truth + schema  ☑ complete
- **Preferred:** a small build-time distiller that parses `vtes-v5-gameloop.dot` and
  emits `gameloop.json` (so the DOT stays the authored source). A hand-rolled parser for
  *this* constrained DOT subset is enough; a DOT-parsing crate would be a new dep → ADR.
  Put the distiller where it fits the pipeline (a `schrecknet-data` subcommand, or a tiny
  node build step — your call).
- **Acceptable fallback:** one faithful transcription of the DOT into `gameloop.json`,
  which then becomes the maintained source of truth (DOT kept as provenance only). Choose
  this if the parser's cost clearly outweighs the benefit — but say so in the commit.
- Add a TypeScript type for the schema (and a Rust type if the distiller is Rust).
- **Golden test** (this is the correctness anchor): assert the JSON contains the 5 turn
  phases *in order*, combat's 7 steps, and the impulse window with its **three** context
  pass-orders (A combat/directed-at-one, B directed-at-a-set, C undirected: prey →
  predator → clockwise). Spot-check a handful of transitions round-trip from the DOT.
- **DoD:** workspace build green, golden test passes, `gameloop.json` generated/committed,
  schema documented.

Implemented by `data/src/gameloop.rs` and the `schrecknet-data gameloop` subcommand.
The dependency-free constrained DOT parser keeps the owner's DOT canonical; CI compares
the committed JSON structurally with a fresh distillation. Three machine-readable
`impulse_*` attributes were added to the order nodes, and validation repaired the
source's previously undefined `ACTION_BLOCKED_PATH` endpoint.

### M2 — Turn-stepper view (the readable 90%)  ☑ complete
- New route `#/rules` (add to `frontend/src/lib/route.ts` + a nav entry). Render the 5
  phases from `gameloop.json` as a horizontal stepper; clicking a phase reveals its
  `detail` and an entry point into its sub-loop.
- **Zero new deps** — inline SVG + CSS + React, same spirit as the hand-rolled hash
  router. Bundle `gameloop.json` as a static asset (it's small; no need for
  `cards.sqlite`). Works offline via the existing PWA shell.
- **Readability gate + verify live:** open it in the browser and confirm someone who has
  never seen the FSM can follow a full turn. Screenshot it.
- **DoD:** build green, live-verified, offline-safe, nav entry present.

Implemented at `#/rules`: the five phases and their order are derived from the M1
statechart rather than duplicated in React. Phase selection reveals the authored detail
and immediate sub-loop entry states; the static JSON is explicitly precached by the PWA
service worker. Readability and offline behavior were verified in the built app.

### M3 — Drill-down sub-views + Basic/Advanced toggle  ☑ complete
- Action-resolution **decision tree** (declare → announce → block eligibility →
  blocked/success → bleed | hunt | referendum | combat).
- **Combat** as its own round loop: simplified (round → strike → damage → press → repeat)
  by default; full 7-step / additional-strike / press detail revealed by the
  **Basic ↔ Advanced/Judge** toggle (drive it off each node's `level`).
- Block-resolution detail (stealth vs intercept + the end-early / no-combat / torpor
  exceptions) and the referendum sub-view. Breadcrumb navigation between levels.
- **DoD:** each sub-view live-verified for readability; toggle hides/show `advanced` nodes.

Implemented as source-driven flow cards with breadcrumb navigation for action, block,
combat, and referendum resolution. Basic combat compresses advanced-only DOT nodes into
the canonical round → strike → damage → press → repeat path; Advanced/Judge reveals all
28 combat nodes, including the complete seven-step timing and additional-strike loops.
The DOT distiller now accepts explicit `level=basic|advanced` node metadata so complexity
remains authored in the canonical graph rather than hardcoded in React. Live checks cover
all four views, the complexity switch, mobile containment, and offline reload.

### M4 — Impulse / priority interactive widget  ☑ complete
- A 5-seat table with predator/prey marked; pick a context (combat / directed-at-one /
  directed-at-set / undirected) and animate the pass order around the table, snapping
  impulse back to the acting Methuselah on any play. Source the orderings from the M1
  JSON, not re-encoded by hand.
- **DoD:** all three context orderings match the DOT/rules; live-verified.

Shipped as `ImpulseOrderWidget.tsx` behind an "Impulse & priority order" entry point on
`#/rules`. `computeImpulseSeatOrder` in `lib/gameLoop.ts` walks each `impulseOrders` entry's
`afterActing` tokens generically (`defender`, `targeted_clockwise`, `prey`, `predator`,
`clockwise_others`); only the demo seat assignment for illustrative "who is targeted" is
fixed, the pass-order logic itself comes straight from the JSON. Step/Previous/Next and an
auto-play toggle; live-verified for combat and directed-at-a-set contexts.

### M5 — Card-DB integration (the differentiator)  ☑ complete
- Map hooks → card types (from `gameloop.json.hooks`), then answer **"when can I play
  this?"**: on a card page highlight its legal window(s) on the turn/combat timeline;
  from an open deck, show which cards can fire at each step.
- **Domain-logic placement:** the window ↔ card-type/timing rules are card semantics — if
  any server surface exposes them, put the rules in shared Rust (`core/`) and mirror
  across MCP + REST per the both-or-neither rule (a `card_windows(card_id)` capability is
  the natural shape). If it stays purely presentational in the browser, frontend-only is
  fine — make the call explicitly and note it.
- **DoD:** verified against real cards (e.g. a Reaction card lights up the reaction
  windows; a Combat card lights up combat steps); parity across surfaces if server-exposed.

Shipped as `CardTimingWindows.tsx` on the library card page (`CardPage.tsx`), backed by
`lib/cardTiming.ts`. **Domain-logic placement call:** kept frontend-only and
presentational — `gameloop.json`'s `hook.cardTypes` isn't populated by the M1 distiller
yet (all empty arrays in the current DOT), so the card-type → hook mapping is a small
hand-distilled table in `cardTiming.ts`, not a server capability; nothing to mirror
through MCP/REST since no server surface exposes it. Revisit as a shared-core capability
if the distiller starts populating `hook.cardTypes` from the DOT, or if deck-level
"which cards can fire now" (the still-open per-deck view) needs it server-side. Deck-aware
drill-down (scanning an open deck's cards) is not yet built — only the single-card view.
Live-verified: Bait and Switch (Reaction) → reaction window only; Aid from Bats (Combat) →
all four combat-round windows.

### M6 — (Optional) executable statechart  ← needs its own ADR
- If the engine-spec ambition is picked up: model the loop as an executable statechart
  (e.g. XState) that is simultaneously the diagram data, the trainer's step engine, and a
  rules-consistency test target. New runtime dependency ⇒ write `docs/adr/0007-*.md`
  first (weigh it like ADR 0005/0006 did).

## Guardrails (don't skip)

- **Offline-first:** `gameloop.json` bundles with the app; no server round-trip to view
  the diagram.
- **No new runtime dep without an ADR** (React Flow, XState, a DOT-parser crate — each
  gated). The M1 distiller can be build-time only, which doesn't ship to users.
- **Readability is the gate**, re-checked live at M2/M3/M4.
- **Keep the DOT as provenance** — the owner's authored work stays in the repo regardless
  of which M1 path you take.
- Update `docs/roadmap.md` Phase 5 checkboxes and `docs/gameloop-visualizer.md` as each
  milestone lands.

## Suggested first commit

Just M1's schema + distiller (or transcription) + `gameloop.json` + the golden test.
Small, self-contained, and it unblocks every view that follows.
