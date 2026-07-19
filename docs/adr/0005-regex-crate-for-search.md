# ADR 0005 — the `regex` crate for card-search regex mode

**Status:** accepted · 2026-07-19

## Context
docs/feature-parity.md's card search checklist has always included a regex search
mode (parity with vdb.im's crypt/library filters). Every other search filter shipped
so far avoided new dependencies by finding a dependency-free path — SQLite `LIKE` for
substrings, a hand-rolled ~40-line base64url encoder for deck-share tokens, the
browser's native `window.print()` for proxy sheets. Regex matching doesn't have an
equivalent shortcut: a real regex engine (character classes, alternation, anchors,
quantifiers, backtracking or NFA simulation) is a substantial, correctness-sensitive
algorithm that has no business being hand-rolled for a search filter. AGENTS.md
requires an ADR for a new runtime dependency; this is that ADR.

## Decision
- Add the `regex` crate (rust-lang team, linear-time NFA-based, no catastrophic
  backtracking, `no_std`-friendly) as a `server`-only dependency — regex *matching* is
  generic text processing, not VTES domain logic, so it does not belong in `core/`
  (AGENTS.md hard rule #1 is about deck/card domain rules specifically).
- Server: a rusqlite scalar function `regexp_match(pattern, text)` registered via
  `Connection::create_scalar_function`, compiling the pattern once per query
  (not per row) and reusing it across all rows via a cached-compile guard.
- Browser: **no new dependency** — `@sqlite.org/sqlite-wasm` supports registering
  custom scalar functions from JS, and JS's native `RegExp` is a full regex engine
  already present in every browser. The browser and server therefore use two
  *different* regex engines (Rust `regex` vs. ECMAScript `RegExp`) — both are
  standard PCRE-like engines and agree on the common subset of syntax this feature
  exposes (literal chars, `.`, `*`, `+`, `?`, `{m,n}`, `[...]`, `(...)`, `|`, anchors),
  which is what the UI documents as supported. This is the same category of
  accepted divergence as SQLite's `LIKE` already being implemented separately by
  sql.js/sqlite-wasm and rusqlite's SQLite build — two SQLite engines, not one.
- Invalid regex patterns are handled the same way on both ends: caught and reported
  back to the caller as a normal search error (empty result + message), never a
  panic/500.

## Alternatives considered
- **Hand-rolled regex engine**: appropriate for the base64 encoder (a fixed,
  well-understood ~40-line algorithm); a general regex engine is a different order
  of complexity and risk — reimplementing one badly is a correctness and security
  liability (unbounded backtracking = trivial DoS via a crafted pattern), and
  `regex` specifically is designed to avoid exactly that failure mode.
- **Substring-only, no regex mode**: leaves a documented feature-parity gap
  indefinitely; the underlying need (e.g. "starts with", alternation across card
  names) is real and vdb.im supports it.
- **Sharing one regex engine via WASM in the server too**: would mean compiling the
  same wasm-based engine natively, adding complexity for no real benefit over using
  each platform's idiomatic regex engine directly.

## Consequences
- One new server dependency (`regex`), zero new frontend dependencies.
- Search UI gains a "Regex" toggle next to the existing All/Name/Text mode control,
  orthogonal to it (regex applies to whichever field(s) the mode already selects).
- A close (but not 100%) syntax match between the two engines; documented in the UI
  as "standard regex syntax" rather than promising exact PCRE/RE2 parity.
