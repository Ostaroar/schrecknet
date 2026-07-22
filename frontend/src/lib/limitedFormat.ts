// Custom "limited format" (vdb parity — see smeea/vdb's LimitedStore.js /
// components/limited/*): a user-defined subset of the V5 pool, described by
// allowed sets plus explicit per-card allow/ban overrides. This is a
// presentational filter the user builds, not a V5 domain rule like the
// group/size legality in core/src/legality.rs, so it deliberately stays out
// of core/ — nothing here is shared with the server. Persisted to
// localStorage (single active format, matching vdb's single-format-at-a-time
// model — no account, no server needed) and importable/exportable as JSON.

import { useState } from 'react'
import { query as cardsQuery } from './db'

const STORAGE_KEY = 'schrecknet.limited-format'

export interface LimitedFormat {
  sets: string[]
  allowedCrypt: number[]
  allowedLibrary: number[]
  bannedCrypt: number[]
  bannedLibrary: number[]
}

export const emptyLimitedFormat: LimitedFormat = {
  sets: [],
  allowedCrypt: [],
  allowedLibrary: [],
  bannedCrypt: [],
  bannedLibrary: [],
}

/** A format with nothing configured has no effect — everything stays V5-legal-only. */
export function isFormatActive(format: LimitedFormat): boolean {
  return (
    format.sets.length > 0 ||
    format.allowedCrypt.length > 0 ||
    format.allowedLibrary.length > 0 ||
    format.bannedCrypt.length > 0 ||
    format.bannedLibrary.length > 0
  )
}

function loadLimitedFormat(): LimitedFormat {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyLimitedFormat
    return { ...emptyLimitedFormat, ...(JSON.parse(raw) as Partial<LimitedFormat>) }
  } catch {
    return emptyLimitedFormat
  }
}

function saveLimitedFormat(format: LimitedFormat): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(format))
  } catch {
    // Private browsing or storage policy can disable localStorage — the
    // in-memory choice still works for the current session.
  }
}

export function useLimitedFormat(): [LimitedFormat, (next: LimitedFormat) => void] {
  const [format, setFormatState] = useState<LimitedFormat>(loadLimitedFormat)
  const setFormat = (next: LimitedFormat) => {
    setFormatState(next)
    saveLimitedFormat(next)
  }
  return [format, setFormat]
}

/** Banned wins over allowed, allowed wins over set membership (ported from vdb's LimitedStore.js). */
export function isCardLegalInFormat(
  cardId: number,
  cardSets: string[],
  kind: 'crypt' | 'library',
  format: LimitedFormat,
): boolean {
  const banned = kind === 'crypt' ? format.bannedCrypt : format.bannedLibrary
  if (banned.includes(cardId)) return false
  const allowed = kind === 'crypt' ? format.allowedCrypt : format.allowedLibrary
  if (allowed.includes(cardId)) return true
  if (format.sets.length === 0) return false
  return cardSets.some((set) => format.sets.includes(set))
}

/** Batch lookup of every set a card has been printed in. */
export async function getCardSetsMap(cardIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>()
  if (cardIds.length === 0) return map
  const placeholders = cardIds.map((_, i) => `?${i + 1}`).join(',')
  const rows = await cardsQuery<{ card_id: number; name: string }>(
    `SELECT p.card_id, s.name FROM printings p JOIN sets s ON s.id = p.set_id WHERE p.card_id IN (${placeholders})`,
    cardIds,
  )
  for (const row of rows) {
    const list = map.get(row.card_id) ?? []
    list.push(row.name)
    map.set(row.card_id, list)
  }
  return map
}

export async function getCardNamesMap(cardIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (cardIds.length === 0) return map
  const placeholders = cardIds.map((_, i) => `?${i + 1}`).join(',')
  const rows = await cardsQuery<{ id: number; name: string }>(
    `SELECT id, name FROM cards WHERE id IN (${placeholders})`,
    cardIds,
  )
  for (const row of rows) map.set(row.id, row.name)
  return map
}

export function exportLimitedFormatText(format: LimitedFormat): string {
  return JSON.stringify(format, null, 2)
}

export function importLimitedFormatText(text: string): LimitedFormat {
  const parsed = JSON.parse(text) as Partial<LimitedFormat>
  return { ...emptyLimitedFormat, ...parsed }
}
