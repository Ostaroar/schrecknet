# VTES Domain Primer (for agents)

Vampire: The Eternal Struggle (VTES) is a multiplayer CCG. This primer covers exactly
what you need to implement the app correctly — consult KRCG rulings for edge cases.

## Deck structure
- A deck has a **crypt** (vampires; minimum 12 cards) and a **library**
  (60–90 cards in standard constructed).
- **Crypt cards** have: clan, capacity (1–11, blood the vampire can hold), disciplines
  (each at inferior or SUPERIOR level), sect (Camarilla, Sabbat, Anarch, Laibon,
  Independent, Imbued have "creeds"), optional title (grants votes), group (1–7),
  and possibly an *Advanced* version (Advancement).
- **Group rule**: a crypt may only mix vampires from two *consecutive* groups
  (e.g. 5+6). This is a core legality check.
- **Library cards** have one or more types: Master, Action, Action Modifier, Ally,
  Combat, Equipment, Event, Political Action, Power, Reaction, Retainer, Conviction.
  Many require a discipline, clan, sect, title, or minimum capacity to play; some cost
  blood or pool. "Burn Option" cards may be discarded for a redraw.
- **Banned** cards exist (tracked per date). VTES at large has several formats
  (standard, V5, 2-Players, custom limited) — **this site hosts only V5**: the
  VEKN-defined pool of Fifth Edition-era products (core box, clan expansions like
  the Sabbat box, New Blood / precon lines). Practical consequences: mostly
  groups 6–7 crypt (plus V5 reprints), a reduced clan/sect/title roster, and far
  fewer sets — always derive option lists from the pool, don't enumerate the
  full VTES universe. Custom limited formats remain possible *within* the pool.

## Common jargon (used in filters/tags)
- **Bleed** — attacking a rival's pool; **bounce** — redirecting a bleed;
  **stealth/intercept** — action evasion/blocking; **rush** — forcing combat;
  **MMPA** — multi-master pool acceleration archetype; **swarm** — many small vampires;
  **star vampire** — deck built around one key vampire.
- **Precon** — preconstructed starter deck (a printing source, like a set).
- **Seating** — VTES tables seat 4–5 players; seating order matters (predator/prey).
  Gameplay/tournament seating utilities are outside SchreckNet's scope.
- **Proxy** — print-at-home stand-in card, permitted in most casual/tournament play
  since 2023 (hence the proxy PDF feature).

## Data quirks to respect
- Card names can contain punctuation/diacritics (`Théo Bell`, `"Concordance"`);
  searches must match ASCII-folded names and known aliases (`aka`).
- Crypt cards can have multiple printings with different art; Advanced vampires are
  separate cards sharing a name (disambiguated by `(ADV)` and group).
- Discipline levels matter: filters distinguish inferior (`aus`) vs superior (`AUS`).
- Set filters have temporal modes (or-newer/or-older/…) keyed on set release dates.
