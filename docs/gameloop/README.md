# Game-loop source assets

The product owner's original VTES v5 game-loop model — a rules-level, card-agnostic
finite-state machine of the full turn / combat / priority flow. This is the **origin
artifact** for the Phase 5 game-loop visualizer.

| File | What it is | Role |
| --- | --- | --- |
| `vtes-v5-gameloop.dot` | Graphviz FSM source (distilled from the owner's `…_v2_14` build) | **Canonical authored source** — the thing the JSON is derived from |
| `vtes-v5-gameloop.svg` | Full Graphviz render | Reference only (the "hairball" that motivates a better visualization) |
| `vtes-v5-gameloop.pdf` | Same render, print form | Reference / archival |

- **Design + decisions:** [`../gameloop-visualizer.md`](../gameloop-visualizer.md)
- **Implementation plan for codex:** [`DEV-PLAN.md`](DEV-PLAN.md)

These are the owner's own original work (not copyrighted card art), so they're committed
directly rather than hotlinked — the Dark Pack "URLs only" rule applies to card scans,
not to hand-authored diagrams.
