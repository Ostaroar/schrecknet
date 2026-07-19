# Design System — R1

Interactive mockups: [docs/mockups/design-r1.html](mockups/design-r1.html)
(open in a browser; also published as a Claude artifact for review).

## Direction

Dark-first, keyboard-first, quiet. The app commits to a plum-black ground biased
toward the accent — never neutral grey. Blood-crimson is spent only on primary
actions, active filter state and data marks. Gold is reserved for superior
disciplines and card lore. Serifs (Palatino family) carry card names and page
titles — the old-world voice; the UI around them is system sans. A light theme
ships as re-stepped tokens; dark is the definitive reading.

## Tokens

| Token | Dark | Role |
| --- | --- | --- |
| `ground` | `#120C0F` | page background |
| `surface` | `#1A1215` | panels, rails |
| `raised` | `#241A1F` | cards, inputs, tiles |
| `line` | `#332630` / `#2C2127` | borders, dividers |
| `ink` | `#ECE4E6` | primary text |
| `ink-muted` | `#A08F95` | secondary text |
| `ink-dim` | `#6E5F65` | labels, placeholders |
| `blood` | `#B32E40` | primary actions, active state |
| `blood-data` | `#D04B58` | chart marks (≥3:1 on surfaces, validated) |
| `gold` | `#C9A15A` | superior disciplines, lore accents |
| `ok` | `#6FAE84` | legality / success |

## Type

- **Display**: Palatino / Palatino Linotype / URW Palladio / Georgia — deck names,
  card names, page titles only. Never for UI controls.
- **UI**: system sans (`system-ui`), 13–15px.
- **Data**: `ui-monospace` with `font-variant-numeric: tabular-nums` — capacities,
  counts, dates, anywhere digits align.

## Recurring grammar

- **Discipline badge**: 3-letter code; gold-filled = superior, outlined = inferior.
  Identical in search rows, deck lists, card previews, filters.
- **Capacity**: number in a blood-tinted circle.
- **Active filters**: echoed as removable chips above results.
- **Charts**: single crimson hue, direct value labels, no legends; tooltips on hover.
  Semantic green/amber only for status, never as series colors.
- **⌘K palette**: global quick card search (replaces vdb's lightning search).

## Screens covered by R1 mockups

01 Crypt search · 02 Deck builder (+ draw simulator, stats rail) · 03 Mobile/PWA.
Library search, Inventory, Diff, Review, Seating, Precons, and Account reuse the
same shell, atoms and tokens.
