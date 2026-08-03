// Keeps a search page's filters across navigation, so opening a card and
// pressing Back returns to the search you actually had — not a blank form.
//
// The filters live in React state, and `useRoute` unmounts the search page when
// you navigate to a card, so without this every filter is simply gone on the
// way back. Restoring them is the whole point.
//
// Stored in `history.state` rather than sessionStorage because the browser
// keeps one state object PER HISTORY ENTRY. That gets the semantics right for
// free: going back restores what that entry had, and going forward again
// restores the later one. A single shared sessionStorage slot would hand every
// entry the most recent snapshot, which is wrong the moment there is more than
// one search in the history.
//
// Not the query string: these forms carry ~24 fields each (multi-select sects,
// traits, groups, precon selections, per-discipline modes, OR-discipline
// groups), and URL-encoding all of them is a much larger change with real
// consequences for the prerendered/SEO surface. Shareable search URLs would be
// a reasonable follow-up, but they are a different feature from "don't lose my
// filters", which is what this fixes.
//
// Everything here degrades to a no-op rather than throwing: a restore failure
// must never be worse than the blank form it replaces.

/** Namespaced so several pages can keep independent snapshots. */
const STATE_KEY = 'schrecknetSearch'

type Snapshot = Record<string, unknown>

/**
 * A reload deliberately starts a fresh search.
 *
 * `history.state` survives F5 — the entry is the same one — so without this a
 * reload would silently restore every filter. That removes the one obvious way
 * to get back to a clean form (there is no global "reset all filters" control),
 * and turns a mis-typed regex or a forgotten trait filter into something the
 * user has to hunt down by hand. Back/forward still restore, which is the case
 * this module exists for.
 *
 * Evaluated once per page load, at module init: an in-app back/forward does not
 * re-run this, so only a genuine reload clears.
 */
function clearOnReload(): void {
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (entry?.type !== 'reload') return
    const state = window.history.state
    if (!state || typeof state !== 'object' || !(STATE_KEY in state)) return
    const { [STATE_KEY]: _dropped, ...rest } = state as Record<string, unknown>
    window.history.replaceState(rest, '', window.location.href)
  } catch {
    // Non-fatal: worst case a reload restores filters.
  }
}

clearOnReload()

function currentBag(): Record<string, Snapshot> {
  const state = window.history.state
  if (!state || typeof state !== 'object') return {}
  const bag = (state as Record<string, unknown>)[STATE_KEY]
  return bag && typeof bag === 'object' ? (bag as Record<string, Snapshot>) : {}
}

/**
 * The snapshot this history entry carries for `key`, if any.
 *
 * Deliberately untyped at the boundary: `history.state` survives reloads and
 * can outlive a deploy, so a snapshot may have been written by an older build
 * with a different shape. Callers read it field by field with their own
 * defaults, which makes a stale or partial snapshot degrade to "some filters
 * restored" instead of a crash.
 */
export function readSearchSnapshot(key: string): Snapshot | null {
  try {
    const snapshot = currentBag()[key]
    return snapshot && typeof snapshot === 'object' ? snapshot : null
  } catch {
    return null
  }
}

/**
 * Records the current filters on this history entry, without adding a new one.
 *
 * `replaceState` (not `pushState`): typing in the search box must not produce a
 * history entry per keystroke. The entry itself was already created by whatever
 * navigation brought us here.
 */
export function writeSearchSnapshot(key: string, snapshot: Snapshot): void {
  try {
    const state = window.history.state
    const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : {}
    window.history.replaceState(
      { ...base, [STATE_KEY]: { ...currentBag(), [key]: snapshot } },
      '',
      window.location.href,
    )
  } catch {
    // Private-mode/quota/serialisation limits: losing the snapshot is a
    // cosmetic regression, never a reason to break the search page.
  }
}

/**
 * Reads one field out of a snapshot, falling back to `fallback` unless the
 * stored value passes `isValid`.
 *
 * The guard matters because snapshots are cross-build persistent data: a filter
 * whose representation changed (or was removed) must not be able to poison the
 * form. Use it as the lazy initialiser of the corresponding `useState`.
 */
export function restore<T>(
  snapshot: Snapshot | null,
  field: string,
  fallback: T,
  isValid: (value: unknown) => boolean,
): T {
  if (!snapshot) return fallback
  const value = snapshot[field]
  if (value === undefined) return fallback
  return isValid(value) ? (value as T) : fallback
}

/** Common shape guards, so callers don't hand-roll them per field. */
export const isStr = (v: unknown): boolean => typeof v === 'string'
export const isStrOrNull = (v: unknown): boolean => v === null || typeof v === 'string'
export const isNumOrNull = (v: unknown): boolean => v === null || typeof v === 'number'
export const isBool = (v: unknown): boolean => typeof v === 'boolean'
export const isStrArray = (v: unknown): boolean => Array.isArray(v) && v.every(isStr)
export const isNumArray = (v: unknown): boolean =>
  Array.isArray(v) && v.every((x) => typeof x === 'number')
export const isArray = (v: unknown): boolean => Array.isArray(v)
export const isObject = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
/** For union-typed string settings (sort modes, logic toggles, ...). */
export const isOneOf =
  (...allowed: readonly string[]) =>
  (v: unknown): boolean =>
    typeof v === 'string' && allowed.includes(v)
