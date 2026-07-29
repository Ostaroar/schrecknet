// get_card — mirrors server/src/card_detail.rs exactly (same joins, same
// crypt/library field gating) so all three surfaces (MCP, REST, browser)
// return the identical shape for the same id.

import { query } from './db'

export interface Discipline {
  code: string
  superior: boolean
}

export interface Printing {
  set: string
  precon: string | null
  rarity: string | null
  first_print: boolean
  /** KRCG-hosted scan for this specific (card, set) printing; null when KRCG has no scan on file. */
  scan_url: string | null
}

export interface Ruling {
  text: string
  refs: RulingRef[]
}

export interface RulingRef {
  label: string
  text?: string
  url?: string
}

export interface Translation {
  lang: string
  name: string | null
  card_text: string | null
}

export interface CardDetail {
  id: number
  kind: 'crypt' | 'library'
  name: string
  card_text: string | null
  image_url: string | null
  clan: string | null
  capacity: number | null
  group: number | null
  title: string | null
  path: string | null
  types: string[] | null
  blood_cost: string | null
  pool_cost: string | null
  disciplines: Discipline[]
  printings: Printing[]
  artists: string[]
  rulings: Ruling[]
  translations: Translation[]
}

export interface LocalizedCardText {
  language: string
  name: string
  card_text: string | null
  isFallback: boolean
}

/** Selects translated card copy while keeping canonical English as fallback. */
export function localizeCardText(card: CardDetail, requestedLanguage: string): LocalizedCardText {
  const requested = requestedLanguage.toLowerCase()
  if (requested === 'en') {
    return { language: 'en', name: card.name, card_text: card.card_text, isFallback: false }
  }

  const translation = card.translations.find((candidate) => candidate.lang.toLowerCase() === requested)
  if (!translation) {
    return { language: 'en', name: card.name, card_text: card.card_text, isFallback: true }
  }

  return {
    language: translation.lang.toLowerCase(),
    name: translation.name || card.name,
    card_text: translation.card_text || card.card_text,
    isFallback: false,
  }
}

export async function getCard(id: number): Promise<CardDetail | null> {
  const [base] = await query<{
    kind: string
    name: string
    card_text: string | null
    clan: string | null
    capacity: number | null
    grp: number | null
    title: string | null
    types: string | null
    blood_cost: string | null
    pool_cost: string | null
    image_url: string | null
    path: string | null
  }>(
    `SELECT kind, name, card_text, clan, capacity, grp, title, types, blood_cost, pool_cost, image_url, path
     FROM cards WHERE id = ?1`,
    [id],
  )
  if (!base) return null

  const isCrypt = base.kind === 'crypt'
  const [disciplines, printings, artists, rulings, translations] = await Promise.all([
    query<{ discipline: string; superior: number }>(
      `SELECT discipline, superior FROM card_disciplines WHERE card_id = ?1 ORDER BY superior DESC, discipline`,
      [id],
    ),
    query<{
      set_name: string
      precon: string | null
      rarity: string | null
      first_print: number
      scan_url: string | null
    }>(
      `SELECT s.name AS set_name, p.precon, p.rarity, p.first_print, p.scan_url
       FROM printings p JOIN sets s ON s.id = p.set_id
       WHERE p.card_id = ?1 ORDER BY s.release_date`,
      [id],
    ),
    query<{ name: string }>(
      `SELECT a.name FROM card_artists ca JOIN artists a ON a.id = ca.artist_id WHERE ca.card_id = ?1`,
      [id],
    ),
    query<{ text: string; refs: string }>(`SELECT text, refs FROM rulings WHERE card_id = ?1`, [id]),
    query<Translation>(`SELECT lang, name, card_text FROM translations WHERE card_id = ?1`, [id]),
  ])

  return {
    id,
    kind: isCrypt ? 'crypt' : 'library',
    name: base.name,
    card_text: base.card_text,
    image_url: base.image_url,
    clan: base.clan || null,
    capacity: isCrypt ? base.capacity : null,
    group: isCrypt ? base.grp : null,
    title: isCrypt ? base.title : null,
    path: base.path,
    types: isCrypt || !base.types ? null : (JSON.parse(base.types) as string[]),
    blood_cost: isCrypt ? null : base.blood_cost,
    pool_cost: isCrypt ? null : base.pool_cost,
    disciplines: disciplines.map((d) => ({ code: d.discipline, superior: d.superior === 1 })),
    printings: printings.map((p) => ({
      set: p.set_name,
      precon: p.precon,
      rarity: p.rarity,
      first_print: p.first_print === 1,
      scan_url: p.scan_url,
    })),
    artists: artists.map((a) => a.name),
    rulings: rulings.map((r) => ({ text: r.text, refs: JSON.parse(r.refs) as RulingRef[] })),
    translations,
  }
}
