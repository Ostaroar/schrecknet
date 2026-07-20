# Game-loop source assets

The product owner's original VTES v5 game-loop model — a rules-level, card-agnostic
finite-state machine of the full turn / combat / priority flow. This is the **origin
artifact** for the Phase 5 game-loop visualizer.

| File | What it is | Role |
| --- | --- | --- |
| `vtes-v5-gameloop.dot` | Graphviz FSM source (distilled from the owner's `…_v2_14` build) | **Canonical authored source** — the thing the JSON is derived from |
| `vtes-v5-gameloop.svg` | Full Graphviz render | Reference only (the "hairball" that motivates a better visualization) |
| `vtes-v5-gameloop.pdf` | Same render, print form | Reference / archival |

`cargo run -p schrecknet-data -- gameloop` parses the constrained DOT grammar and
regenerates [`../../frontend/public/gameloop.json`](../../frontend/public/gameloop.json).
The DOT remains canonical; a Rust golden test fails if the committed JSON drifts.
The stable output contract is documented in [`schema.md`](schema.md).

The three `IMP_ORDER_*` nodes carry `impulse_*` Graphviz attributes. They do not
change the archival render; they make context and seat-order roles explicit for the
future interactive widget. The distiller also validates that every transition endpoint
is defined, which caught and repaired the original missing `ACTION_BLOCKED_PATH` node.

- **Design + decisions:** [`../gameloop-visualizer.md`](../gameloop-visualizer.md)
- **Implementation plan for codex:** [`DEV-PLAN.md`](DEV-PLAN.md)

These are the owner's own original work (not copyrighted card art), so they're committed
directly rather than hotlinked — the Dark Pack "URLs only" rule applies to card scans,
not to hand-authored diagrams.
