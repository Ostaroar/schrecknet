// Local (anonymous) card-collection storage — CRUD over userDb.ts's
// `inventory` table. Usage/missing math against decks lives in the shared
// Rust core (core/src/inventory.rs, wired through core.ts) and is consumed
// by later milestones (deck editor cross-referencing, missing-cards view);
// this module is deliberately storage-only. See docs/inventory-plan.md.

import { query as cardsQuery } from './db'
import { query as userQuery, run as userRun } from './userDb'
import { parseDeckText, formatDeckText, computeMissingQty } from './core'

export interface InventoryEntry {
  cardId: number
  qty: number
}

export async function listInventory(): Promise<InventoryEntry[]> {
  const rows = await userQuery<{ card_id: number; qty: number }>(
    'SELECT card_id, qty FROM inventory ORDER BY card_id ASC',
  )
  return rows.map((r) => ({ cardId: r.card_id, qty: r.qty }))
}

export interface InventoryCardDetail {
  id: number
  qty: number
  kind: 'crypt' | 'library'
  name: string
  clan: string | null
  capacity: number | null
  types: string[]
}

/** Owned cards joined with live cards.sqlite data — never denormalized into user.sqlite. */
export async function getInventoryCardDetails(): Promise<InventoryCardDetail[]> {
  const rows = await listInventory()
  if (rows.length === 0) return []
  const qtyById = new Map(rows.map((r) => [r.cardId, r.qty]))
  const placeholders = rows.map((_, i) => `?${i + 1}`).join(',')
  const cards = await cardsQuery<{
    id: number
    kind: string
    name: string
    clan: string
    capacity: number | null
    types: string | null
  }>(
    `SELECT id, kind, name, clan, capacity, types FROM cards WHERE id IN (${placeholders})`,
    rows.map((r) => r.cardId),
  )
  return cards
    .map((c) => ({
      id: c.id,
      qty: qtyById.get(c.id) ?? 0,
      kind: c.kind as 'crypt' | 'library',
      name: c.name,
      clan: c.clan || null,
      capacity: c.capacity,
      types: c.types ? (JSON.parse(c.types) as string[]) : [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getInventoryQty(cardId: number): Promise<number> {
  const rows = await userQuery<{ qty: number }>('SELECT qty FROM inventory WHERE card_id = ?1', [cardId])
  return rows[0]?.qty ?? 0
}

/** Batch lookup of owned quantities, defaulting missing ids to 0. */
export async function getInventoryQtyMap(cardIds: number[]): Promise<Map<number, number>> {
  if (cardIds.length === 0) return new Map()
  const placeholders = cardIds.map((_, i) => `?${i + 1}`).join(',')
  const rows = await userQuery<{ card_id: number; qty: number }>(
    `SELECT card_id, qty FROM inventory WHERE card_id IN (${placeholders})`,
    cardIds,
  )
  const map = new Map(cardIds.map((id) => [id, 0]))
  for (const row of rows) map.set(row.card_id, row.qty)
  return map
}

/** Sets a card's owned quantity; a qty of 0 or less removes the row entirely. */
export async function setInventoryQty(cardId: number, qty: number): Promise<void> {
  if (qty <= 0) {
    await userRun('DELETE FROM inventory WHERE card_id = ?1', [cardId])
    return
  }
  await userRun(
    'INSERT INTO inventory (card_id, qty) VALUES (?1, ?2) ON CONFLICT(card_id) DO UPDATE SET qty = ?2',
    [cardId, qty],
  )
}

export async function adjustInventoryQty(cardId: number, delta: number): Promise<number> {
  const current = await getInventoryQty(cardId)
  const next = Math.max(0, current + delta)
  await setInventoryQty(cardId, next)
  return next
}

/**
 * Adjusts several cards' owned quantity by the same delta — used for
 * add/remove-a-precon, since precon quantities aren't tracked by the data
 * pipeline (KRCG's export records which printings existed, not each deck's
 * exact copy counts; see lib/precons.ts). One copy per distinct card is the
 * only quantity this can know, so `delta` is expected to be ±1.
 */
export async function adjustInventoryQtyForCards(cardIds: number[], delta: number): Promise<void> {
  for (const cardId of cardIds) {
    await adjustInventoryQty(cardId, delta)
  }
}

export type InventoryMode = 'excluded' | 'fixed' | 'flexible'

export async function getDeckInventoryMode(deckId: number): Promise<InventoryMode> {
  const rows = await userQuery<{ inventory_mode: InventoryMode }>(
    'SELECT inventory_mode FROM decks WHERE id = ?1',
    [deckId],
  )
  return rows[0]?.inventory_mode ?? 'excluded'
}

/** Sets a deck's default inventory mode. Clears per-card overrides, mirroring vdb's reset-on-toggle behavior. */
export async function setDeckInventoryMode(deckId: number, mode: InventoryMode): Promise<void> {
  await userRun('UPDATE decks SET inventory_mode = ?1 WHERE id = ?2', [mode, deckId])
  await userRun('DELETE FROM deck_card_inventory_overrides WHERE deck_id = ?1', [deckId])
}

export async function listDeckCardOverrides(deckId: number): Promise<Map<number, 'fixed' | 'flexible'>> {
  const rows = await userQuery<{ card_id: number; mode: 'fixed' | 'flexible' }>(
    'SELECT card_id, mode FROM deck_card_inventory_overrides WHERE deck_id = ?1',
    [deckId],
  )
  return new Map(rows.map((r) => [r.card_id, r.mode]))
}

/** Overrides a single card's claim mode against its deck's default. Pass `null` to clear the override. */
export async function setDeckCardOverride(
  deckId: number,
  cardId: number,
  mode: 'fixed' | 'flexible' | null,
): Promise<void> {
  if (mode === null) {
    await userRun('DELETE FROM deck_card_inventory_overrides WHERE deck_id = ?1 AND card_id = ?2', [deckId, cardId])
    return
  }
  await userRun(
    'INSERT INTO deck_card_inventory_overrides (deck_id, card_id, mode) VALUES (?1, ?2, ?3) ' +
      'ON CONFLICT(deck_id, card_id) DO UPDATE SET mode = ?3',
    [deckId, cardId, mode],
  )
}

interface CardClaim {
  qty: number
  mode: 'fixed' | 'flexible'
}

/**
 * Every non-excluded deck's claim on the given cards, across the whole
 * collection (not just one deck) — a card's missing count depends on every
 * deck that uses it, not only the one currently open. Per-card override
 * (`deck_card_inventory_overrides`) wins over the deck's own default mode.
 */
async function getClaimsForCards(cardIds: number[]): Promise<Map<number, CardClaim[]>> {
  const map = new Map<number, CardClaim[]>()
  if (cardIds.length === 0) return map
  const placeholders = cardIds.map((_, i) => `?${i + 1}`).join(',')
  const rows = await userQuery<{ card_id: number; qty: number; effective_mode: 'fixed' | 'flexible' }>(
    `SELECT dc.card_id, dc.qty, COALESCE(o.mode, d.inventory_mode) AS effective_mode
     FROM deck_cards dc
     JOIN decks d ON d.id = dc.deck_id
     LEFT JOIN deck_card_inventory_overrides o ON o.deck_id = dc.deck_id AND o.card_id = dc.card_id
     WHERE dc.card_id IN (${placeholders}) AND d.inventory_mode != 'excluded'`,
    cardIds,
  )
  for (const row of rows) {
    const claims = map.get(row.card_id) ?? []
    claims.push({ qty: row.qty, mode: row.effective_mode })
    map.set(row.card_id, claims)
  }
  return map
}

export interface CardMissing {
  cardId: number
  missing: number
}

/**
 * Missing-copy count for every card in one deck, using the shared Rust
 * usage math (core/src/inventory.rs) over claims from ALL non-excluded
 * decks — not just this one — since fixed/flexible claims are pooled
 * collection-wide. Matches vdb's own algorithm (docs/inventory-plan.md § 1a).
 */
export async function computeDeckMissing(cardIds: number[]): Promise<Map<number, number>> {
  const [claimsByCard, ownedByCard] = await Promise.all([
    getClaimsForCards(cardIds),
    getInventoryQtyMap(cardIds),
  ])
  const result = new Map<number, number>()
  for (const cardId of cardIds) {
    const claims = claimsByCard.get(cardId) ?? []
    const fixedQtys = claims.filter((c) => c.mode === 'fixed').map((c) => c.qty)
    const flexibleQtys = claims.filter((c) => c.mode === 'flexible').map((c) => c.qty)
    const owned = ownedByCard.get(cardId) ?? 0
    result.set(cardId, await computeMissingQty(fixedQtys, flexibleQtys, owned))
  }
  return result
}

/** Formats the inventory as a plain-text (Lackey/JOL-style) card list for export. */
export async function exportInventoryText(): Promise<string> {
  const cards = await getInventoryCardDetails()
  const crypt = cards.filter((c) => c.kind === 'crypt').map((c) => ({ name: c.name, qty: c.qty }))
  const library = cards.filter((c) => c.kind === 'library').map((c) => ({ name: c.name, qty: c.qty }))
  return formatDeckText(crypt, library)
}

async function resolveByName(name: string): Promise<{ id: number; name: string } | null> {
  const rows = await cardsQuery<{ id: number; name: string }>(
    `SELECT id, name FROM cards WHERE name = ?1 COLLATE NOCASE OR name_ascii = ?1 COLLATE NOCASE LIMIT 1`,
    [name],
  )
  return rows[0] ?? null
}

export interface InventoryImportResult {
  added: number
  unresolved: string[]
}

/**
 * Parses a plain-text card list, resolves each name against cards.sqlite
 * (case-insensitive, ASCII-folded), and adds the quantities to the existing
 * inventory. Names that don't resolve to a known V5-pool card are reported,
 * not silently dropped.
 */
export async function importInventoryText(text: string): Promise<InventoryImportResult> {
  const lines = await parseDeckText(text)
  const unresolved: string[] = []
  let added = 0
  for (const line of lines) {
    const match = await resolveByName(line.name)
    if (!match) {
      unresolved.push(line.name)
      continue
    }
    await adjustInventoryQty(match.id, line.qty)
    added++
  }
  return { added, unresolved }
}
