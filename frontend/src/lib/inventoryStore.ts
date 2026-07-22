// Local (anonymous) card-collection storage — CRUD over userDb.ts's
// `inventory` table. Usage/missing math against decks lives in the shared
// Rust core (core/src/inventory.rs, wired through core.ts) and is consumed
// by later milestones (deck editor cross-referencing, missing-cards view);
// this module is deliberately storage-only. See docs/inventory-plan.md.

import { query as userQuery, run as userRun } from './userDb'

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

export async function getInventoryQty(cardId: number): Promise<number> {
  const rows = await userQuery<{ qty: number }>('SELECT qty FROM inventory WHERE card_id = ?1', [cardId])
  return rows[0]?.qty ?? 0
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
