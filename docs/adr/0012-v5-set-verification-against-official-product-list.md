# ADR 0012 — verify new sets against Black Chantry's official product list, not release date

## Status

Accepted.

## Context

`data/src/v5pool.rs::V5_SET_NAMES` is the single hardcoded list that decides
whether a card is on SchreckNet at all. It included `"Sabbat Preconstructed"`
(2019) because that set's release date sits squarely in the V5 era. It's
actually a *Standard Constructed* product — four reprint precons of
pre-V5 crypt cards, published the same year but for the classic ruleset, not
the V5 one. That one wrong entry leaked 59 classic-only vampires (America
Johnson, Antón de Concepción, etc.) onto a site whose entire premise is "V5
only" (AGENTS.md).

The same review also found the opposite mistake: `"Fall of London"` and
`"Shadows of Berlin"` are official V5 sets that were simply never added,
so cards exclusive to them were wrongly excluded until now.

Release date is not a reliable signal for V5-line membership — Black Chantry
publishes both V5 and Standard Constructed material, sometimes in the same
year, and KRCG's `sets` field doesn't distinguish the two.

## Decision

When adding, removing, or reviewing an entry in `V5_SET_NAMES`, check it
against Black Chantry's own product list, not the set's release date:

- Primary source: Black Chantry's official V5 format post —
  <https://www.blackchantry.com/2025/09/16/introducing-the-official-vampire-the-eternal-struggle-v5-format/>
  (kept current by Black Chantry as new V5 products ship — Sabbat Fifth
  Edition precons, further New Blood packs, etc.).
- If a set isn't named there, check blackchantry.com's product announcements
  directly for whether it's marked V5 vs. Standard Constructed before adding
  it.

`data/src/v5pool.rs::v5pool::tests::live_krcg_data_excludes_known_classic_only_vampires`
now runs against the live KRCG feed (not just synthetic JSON) and asserts
specific known classic-only cards stay excluded — a regression test tied to
real data, so a future bad set addition fails CI immediately rather than
depending on someone remembering to hand-write a matching unit test.

## Consequences

- No code change beyond the fix itself and the new test; this ADR is the
  durable place the "check the product list, not the date" rule lives, since
  the mistake it prevents isn't visible from reading `v5pool.rs` alone.
- The live-data test needs network access during `cargo test` (same
  assumption `data`'s build step already makes; CI has it). It fails soft
  (prints and returns) if the fetch itself fails, so a flaky network doesn't
  block unrelated CI runs — it only asserts once data is actually available.
