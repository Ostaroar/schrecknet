// Local (anonymous) deck storage — CRUD over userDb.ts's `decks`/`deck_cards`
// tables, joined against cards.sqlite (db.ts) for display, with legality
// computed by the actual Rust core compiled to WASM (core.ts) rather than a
// reimplementation — one rule, one place (AGENTS.md hard rule #1).

import { query as cardsQuery } from './db'
import { query as userQuery, run as userRun } from './userDb'
import { validateDeck } from './core'

export interface DeckSummary {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

const SUMMARY_COLUMNS = 'id, name, description, created_at, updated_at'

export async function listDecks(): Promise<DeckSummary[]> {
  return userQuery<DeckSummary>(`SELECT ${SUMMARY_COLUMNS} FROM decks ORDER BY updated_at DESC`)
}

export async function getDeck(id: number): Promise<DeckSummary | null> {
  const rows = await userQuery<DeckSummary>(`SELECT ${SUMMARY_COLUMNS} FROM decks WHERE id = ?1`, [id])
  return rows[0] ?? null
}

export async function createDeck(name: string): Promise<number> {
  const now = new Date().toISOString()
  const { lastInsertRowid } = await userRun(
    'INSERT INTO decks (name, description, created_at, updated_at) VALUES (?1, NULL, ?2, ?2)',
    [name, now],
  )
  return lastInsertRowid
}

export async function renameDeck(id: number, name: string): Promise<void> {
  await userRun('UPDATE decks SET name = ?1, updated_at = ?2 WHERE id = ?3', [name, new Date().toISOString(), id])
}

export async function deleteDeck(id: number): Promise<void> {
  await userRun('DELETE FROM deck_cards WHERE deck_id = ?1', [id])
  await userRun('DELETE FROM decks WHERE id = ?1', [id])
}

interface DeckCardRow {
  card_id: number
  qty: number
}

async function getDeckCardRows(deckId: number): Promise<DeckCardRow[]> {
  return userQuery<DeckCardRow>('SELECT card_id, qty FROM deck_cards WHERE deck_id = ?1', [deckId])
}

/** Sets a card's quantity in a deck; qty <= 0 removes it. */
export async function setCardQty(deckId: number, cardId: number, qty: number): Promise<void> {
  if (qty <= 0) {
    await userRun('DELETE FROM deck_cards WHERE deck_id = ?1 AND card_id = ?2', [deckId, cardId])
  } else {
    await userRun(
      `INSERT INTO deck_cards (deck_id, card_id, qty) VALUES (?1, ?2, ?3)
       ON CONFLICT(deck_id, card_id) DO UPDATE SET qty = excluded.qty`,
      [deckId, cardId, qty],
    )
  }
  await userRun('UPDATE decks SET updated_at = ?1 WHERE id = ?2', [new Date().toISOString(), deckId])
}

export interface DeckCardDetail {
  id: number
  qty: number
  kind: 'crypt' | 'library'
  name: string
  clan: string | null
  capacity: number | null
  group: number | null
}

/** Deck contents joined with live card_id data — never denormalized into user.sqlite. */
export async function getDeckCardDetails(deckId: number): Promise<DeckCardDetail[]> {
  const rows = await getDeckCardRows(deckId)
  if (rows.length === 0) return []
  const qtyById = new Map(rows.map((r) => [r.card_id, r.qty]))
  const placeholders = rows.map((_, i) => `?${i + 1}`).join(',')
  const cards = await cardsQuery<{
    id: number
    kind: string
    name: string
    clan: string
    capacity: number | null
    grp: number | null
  }>(
    `SELECT id, kind, name, clan, capacity, grp FROM cards WHERE id IN (${placeholders})`,
    rows.map((r) => r.card_id),
  )
  return cards
    .map((c) => ({
      id: c.id,
      qty: qtyById.get(c.id) ?? 0,
      kind: c.kind as 'crypt' | 'library',
      name: c.name,
      clan: c.clan || null,
      capacity: c.capacity,
      group: c.grp,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface DeckStats {
  cryptCount: number
  libraryCount: number
  violations: string[]
}

export async function computeDeckStats(cards: DeckCardDetail[]): Promise<DeckStats> {
  const cryptCards = cards.filter((c) => c.kind === 'crypt')
  const cryptCount = cryptCards.reduce((sum, c) => sum + c.qty, 0)
  const libraryCount = cards.filter((c) => c.kind === 'library').reduce((sum, c) => sum + c.qty, 0)
  const groups = [...new Set(cryptCards.map((c) => c.group ?? 0))]
  const violations = await validateDeck(groups, cryptCount, libraryCount)
  return { cryptCount, libraryCount, violations }
}
