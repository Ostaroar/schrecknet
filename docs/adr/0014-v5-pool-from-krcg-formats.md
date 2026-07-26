# ADR 0014 — V5 pool: curated sets + KRCG `formats` exceptions, with a drift guard

## Status

Accepted. Supersedes the "check the product list, not the date" guidance in
[ADR 0012](0012-v5-set-verification-against-official-product-list.md), which
was necessary but insufficient — it told a human what to check without making
the pipeline fail when nobody did.

## Context

`V5_SET_NAMES` had drifted three times in a fortnight, in both directions:

| # | Incident | Direction |
|---|---|---|
| 1 | `Sabbat Preconstructed` (2019) treated as V5 | 59 classic cards leaked in |
| 2 | `Fall of London` / `Shadows of Berlin` never added | real V5 cards missing |
| 3 | `First Blood` + `Twenty-Fifth Anniversary` (both 2019) treated as V5 | 74 classic cards leaked in |

Incident 3 was reported by the project owner from the live site:
`/cards/201213` — Rutor (G5), a Tremere vampire printed in Keepers of
Tradition (2008) and reprinted into the 2019 *First Blood* starter. It entered
the pool solely via `First Blood`.

The common cause is that **release date does not imply V5**. Black Chantry
ships V5 and Standard Constructed products in the same years, and the
distinction is not derivable from the card data. This was tested, not assumed:

- KRCG's card export has **no** format field. The union of all top-level keys
  across all 4149 cards contains nothing format-related, and `legality` is
  just the earliest printing date (it equals that date for 4149/4149 cards),
  so it has zero discriminative power.
- A "mostly reprints ⇒ not V5" heuristic is **wrong**: `First Blood` is 0%
  new cards, but so is `Shadows of Berlin`, which *is* V5. `New Blood` is only
  8% new.
- A "has `precon`, lacks `rarity`" heuristic is **wrong**: it also matches
  `Sabbat Preconstructed`, `Keepers of Tradition Reprint` and `Print on
  Demand`, and it *misses* five listed V5 sets that carry neither key.

So no local rule can decide set membership. It has to come from Black
Chantry's product list, and the pipeline has to notice when that list moves.

Two authoritative sources were checked entry by entry (2026-07-24):

1. **Black Chantry's official format post** — "28 products … i.e. non-Legacy
   products", enumerated as 14 Fifth Edition precons + 11 New Blood packs + 3
   other releases (Fall of London, Shadows of Berlin, 30th Anniversary), plus
   19 individually named promo cards. Neither `First Blood` nor
   `Twenty-Fifth Anniversary` appears; Black Chantry's own site files both
   under `/products/legacy/`.
2. **vdb.im's `frontend/src/assets/data/limitedV5.json`** — our feature-parity
   target (CLAUDE.md). Shape `{sets, allowed:{crypt,library}, banned:…}`; its
   13 set codes exclude `FB`, `25th` and `SP`, and it carries a per-card
   `allowed` list. vdb's `V5H`/`V5L`/`NB3C` are finer-grained than KRCG: those
   decks are *precons inside* KRCG's `Fifth Edition` / `New Blood III`, so
   they need no extra entry here.

Both agree, including that Rutor is not V5.

The second discovery is what makes a real fix possible. KRCG publishes an
undocumented API-v5-schema export at **`https://static.krcg.org/data/v5/vtes.json`**
(found via vdb's own `misc/cards-update/download_resources.sh`, which pulls
its sibling `twda.json`). Each card carries a `formats` array, and exactly 19
of 4149 cards have `formats == ["V5"]` — precisely Black Chantry's 19 named
promos. That is a machine-readable statement of the card-level exceptions.

It is *only* that, though: the sibling `expansions.json` lists all 51
expansions with keys `id/code/name/company/release_date/bundles` and **no**
format flag. There is no machine-readable source for the set list anywhere —
not KRCG, and not vdb (whose file is hand-maintained; its git log is a series
of manual corrections such as "add NB3C to V5 format").

## Decision

Split the pool rule along the line where trustworthy data actually exists.

**1. Card-level exceptions: fetched, never hardcoded.**
`krcg::fetch_v5_exception_ids` reads `formats == ["V5"]` from the v5 export
(24 h disk cache, same as the other feeds). This is the part that grows
*silently* — a new promo pack legalises more cards without any new set
appearing, which is how 16 legal promos (Victoria Ash, Karl Schrekt, Fiorenza
Savona, …) were missing from the site. Now they arrive automatically.

An empty result **fails the build**: if the field is renamed or the format
string changes, that must not silently drop every promo.

This arm is not a convenience. Those cards' only printings are in classic sets
like Jyhad and Camarilla Edition, so **no set-based rule can ever express
them**. `2021 Promo Pack 3` shows why the inverse is also true: 10 of its 11
cards are V5-legal, but the pack is not a V5 product, and whitelisting it
would assert something false about the product while silently admitting
whatever a future reprint adds to that set.

**2. Set membership: curated, with every entry justified.**
`V5_SET_NAMES` drops to the 10 KRCG names that cover Black Chantry's 28
products, each carrying a comment tying it to the official list.

**3. A drift guard that fails loudly** — the actual anti-recurrence measure.
`KNOWN_NON_V5_SETS` records every other KRCG set name as explicitly *not* V5,
so "never considered" and "considered and rejected" become different states.
The test `every_krcg_set_is_classified` runs against the live KRCG feed and
fails when any published set appears in neither list. When Black Chantry ships
a product, CI stops and a human must check it against the official list.

This guard proved itself immediately: it failed on first run against
`2021 Promo Pack 3`, a set nobody had ever classified.

## Consequences

- Pool **807 → 749**: −74 classic cards that leaked in via `First Blood` (46)
  and `Twenty-Fifth Anniversary` (28); +16 officially legal promo cards that
  were wrongly excluded. `data_version` → 13.
- `Twenty-Fifth Anniversary` was the pool's only source of group-2/group-3
  vampires and `First Blood` of group-4; the pool is now group 5–7, matching
  the V5 card line. This is a real, intended narrowing — decks built on the
  site that used those cards were never V5-legal.
- `V5 Polish Edition promo` is no longer a set entry. Its single card
  (Bolesław Gutowski, 201528) stays in the pool via the exception list, which
  is *why* it is legal — a named Promo Pack 4 card, not a V5 product.
- Cards with no V5 printing keep their real (non-V5) printings in `printings`
  /`sets`, rather than being filtered to nothing and losing all provenance.
- New dependency on an **undocumented** KRCG path. Mitigated by the
  fail-on-empty check, the 24 h cache, and the fact that vdb depends on the
  same directory. If it disappears the build fails loudly; the fallback is to
  pin the 19 ids until it returns.
- Known divergence from vdb, monitored rather than hidden: vdb's `allowed`
  additionally lists Ambush, Antediluvian Awakening, Bum's Rush and Tribute
  to the Master, and omits Depravity (already covered by the `Sabbat V5` set).
  We follow KRCG's `formats`, which matches Black Chantry's named 19 exactly.
  **Still unresolved:** Black Chantry names only promos "not yet printed in
  other products", so cards like Bum's Rush are excluded from that list while
  arguably being in Promo Pack 4 — and the basis for vdb's other three could
  not be traced to any Black Chantry post. Worth settling before anyone builds
  a deck around a card we wrongly exclude.

## Follow-up: trusting KRCG's `formats` was not enough (2026-07-26)

A user reported `/cards/201352` — **Tegyrius, Vizier (G2)**, a group-2 vampire
from Final Nights (2001) — live on a V5-only site. KRCG's `formats` field marks
that printing V5-legal. It cannot be: it predates the V5 line by two decades and
is in no promo pack. Black Chantry's promo is the **group-6** printing of the
same name (id 201654, "2023 War of the Ages Promo" + Promo Pack 4), which KRCG
leaves unmarked. vdb's `limitedV5.json` has it right, which is what confirms
this is a KRCG bug rather than a disagreement about the format.

So the decision above — "the exception list is fetched, not curated" — was right
about *where* the data should come from and wrong to treat a single upstream
source as authoritative. Two additions:

1. `v5pool::KRCG_FORMAT_CORRECTIONS`, an explicitly evidence-backed map of known
   upstream errors (currently one entry). Applying it is idempotent, so it keeps
   working unchanged once KRCG fixes the feed.
2. A build-time guard: **every V5 promo vampire is group 5 or later**, so a
   crypt card with `formats: ["V5"]` and a lower group fails the build with the
   card named. That is a structural property of the V5 card line, not a
   heuristic about reprints — and it would have caught this before it shipped.

The lesson generalises past this one card: fetched data removes the "someone
forgot to update the list" failure mode but not the "upstream is wrong" one, and
a V5-only site needs a sanity check that a classic-era vampire can never pass.
- The adversarial-verification and design phases of the audit workflow did not
  run (session quota). The set verdicts rest on two independent authoritative
  sources read directly plus the structural analysis above, all of which agree;
  the promo-list nuances above are the parts a future reader should re-check
  first.
