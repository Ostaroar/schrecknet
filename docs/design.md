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
| `ink-dim` | `#928188` | labels, placeholders (4.5:1+ on every surface, axe-validated 2026-07-24) |
| `blood` | `#B32E40` | primary actions, active state |
| `blood-data` | `#D76772` | chart marks + small text (4.5:1+ incl. `bg-blood/20` badges, axe-validated 2026-07-24 — the original `#D04B58` was only validated to ≥3:1, which undershot AA once it got used for small text like badge numerals) |
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
- **Card-text symbols**: KRCG/VDB bracket tokens use the actual VTES discipline
  and card-type glyphs, colorized with muted ink / superior gold / blood crimson.
  Each symbol retains a full accessible label,
  translated rules text keeps its original line breaks, and an unknown token is
  shown verbatim so a future data update cannot silently remove rules text. The
  same local glyph registry is reused for structured discipline filters/badges,
  library type summaries, card headers, precon lists, and deck statistics.
- **Capacity**: number in a blood-tinted circle.
- **Active filters**: echoed as removable chips above results.
- **Semantic mode**: an explicit gold `◇ Semantic` toggle beside the text modes;
  never silently reinterpret exact-search input. First use states the local download
  size and English-only scope, progress/error/removal live in one full-width status
  strip, and result rows label cosine values as `similarity` rather than probability.
- **Charts**: single crimson hue, direct value labels, no legends; tooltips on hover.
  Semantic green/amber only for status, never as series colors.
- **⌘K palette**: global quick card search (replaces vdb's lightning search).
- **Search result actions**: a compact image-preview control and quantity-aware
  add button sit outside the row's detail target. The active local deck is a
  sticky right rail on wide screens and an order-first collapsible panel on
  narrow screens; card quantities remain in OPFS.

## Keyboard map

Every keybinding that actually exists in the codebase, as of this writing
(Phase 4 non-functional-parity item; docs/feature-parity.md's "keyboard-first"
line pointed at this gap — audited by grepping `frontend/src` for `onKeyDown`/
`onKeyUp`/`.key ===` rather than assumed, so this table stays honest as the app
grows). Ordinary text-input editing (typing into a search box, arrow-key
cursor movement, copy/paste) isn't listed — only bindings the app itself
attaches meaning to.

| Shortcut | Scope | Effect |
| --- | --- | --- |
| `⌘K` / `Ctrl K` | Global | Opens the command palette (quick card search) |
| `Esc` | Command palette, while open | Closes the palette |
| `↓` / `↑` | Command palette, while open | Moves the highlighted result |
| `Enter` | Command palette, while open | Opens the highlighted card |
| `Esc` | A card image preview, while open | Closes the preview |
| `Enter` | "New deck" name field | Creates the deck |
| `Enter` | Deck tag input | Adds the tag |
| `Enter` | Game-group write-passphrase field | Attempts to unlock editing |

The `⌘K` palette is the one global, discoverable shortcut and the closest
analogue to vdb's lightning search; the `Enter`-submits-a-field bindings are
ordinary form convenience rather than shortcuts a user needs to learn. There is
currently no shortcut to jump focus into the Crypt/Library search box (e.g. a
`/`-to-focus binding) — worth adding if that's ever felt as a gap in practice.

## Screens covered by R1 mockups

01 Crypt search · 02 Deck builder (+ draw simulator, stats rail) · 03 Mobile/PWA.
Library search, Inventory, Diff, Review, Precons, and Account reuse the
same shell, atoms and tokens.
