// Crypt search adapter. Filter/query planning lives in shared Rust and reaches
// this browser adapter through WASM; this module executes the plan and maps rows.

import { query } from './db'
import type { DisciplineRequirement } from './disciplineFilter'
import { defaultSetAge, defaultSetPrint, type SetAgeMode, type SetPrintMode } from './setFilter'
import type { RequirementLogic } from './requirementFilter'
import { listCardTraits } from './cardTraits'
import {
  listSearchPrecons,
  type PreconOption,
  type PreconSelection,
} from './preconFilter'
import { orderCryptCards, planCryptSearch } from './core'

/** Scope of the text filter: card name, card text, or either. */
export type TextMode = 'any' | 'name' | 'text'
export type CryptSort =
  | 'capacity_desc'
  | 'capacity_asc'
  | 'clan'
  | 'group'
  | 'name'
  | 'sect'

export interface CryptFilters {
  text: string
  textMode: TextMode
  textRegex: boolean
  clan: string | null
  title: string | null
  sects: string[]
  sectLogic: RequirementLogic
  votes: number | null
  traits: string[]
  group: number | null
  groups: number[]
  capacityMin: number | null
  capacityMax: number | null
  disciplines: string[]
  disciplinesSuperior: boolean
  disciplineRequirements: DisciplineRequirement[]
  disciplineOr: DisciplineRequirement[][]
  set: string | null
  setAge: SetAgeMode
  setPrint: SetPrintMode
  precon: string | null
  precons: PreconSelection[]
  preconPrint: SetPrintMode
  artist: string | null
  sort: CryptSort
}

export const emptyCryptFilters: CryptFilters = {
  text: '',
  textMode: 'any',
  textRegex: false,
  clan: null,
  title: null,
  sects: [],
  sectLogic: 'all',
  votes: null,
  traits: [],
  group: null,
  groups: [],
  capacityMin: null,
  capacityMax: null,
  disciplines: [],
  disciplinesSuperior: false,
  disciplineRequirements: [],
  disciplineOr: [],
  set: null,
  setAge: defaultSetAge,
  setPrint: defaultSetPrint,
  precon: null,
  precons: [],
  preconPrint: defaultSetPrint,
  artist: null,
  sort: 'capacity_desc',
}

export interface Discipline {
  code: string
  superior: boolean
}

export interface CryptCard {
  id: number
  name: string
  clan: string
  capacity: number
  grp: number
  title: string | null
  sect: string | null
  path: string | null
  votes: number
  image_url: string | null
  disciplines: Discipline[]
}

interface CryptRow {
  id: number
  name: string
  clan: string
  capacity: number
  grp: number
  title: string | null
  sect: string | null
  path: string | null
  votes: number
  image_url: string | null
  name_ascii: string
  disc: string | null
}

function parseDisciplines(disc: string | null): Discipline[] {
  if (!disc) return []
  return disc
    .split(',')
    .filter(Boolean)
    .map((entry) => {
      const [code, superior] = entry.split(':')
      return { code, superior: superior === '1' }
    })
    .sort((a, b) => Number(b.superior) - Number(a.superior))
}

export async function searchCrypt(filters: CryptFilters): Promise<CryptCard[]> {
  return searchCryptInner(filters, true)
}

/** Applies every structured crypt filter without the 200-row UI cap. */
export async function filterCrypt(filters: CryptFilters): Promise<CryptCard[]> {
  return searchCryptInner(filters, false)
}

async function searchCryptInner(filters: CryptFilters, limited: boolean): Promise<CryptCard[]> {
  const { sql, params } = await planCryptSearch({
    text: filters.text,
    text_mode: filters.textMode,
    text_regex: filters.textRegex,
    clan: filters.clan,
    title: filters.title,
    sects: filters.sects,
    sect_logic: filters.sectLogic,
    votes: filters.votes,
    traits: filters.traits,
    group: filters.group,
    groups: filters.groups,
    capacity_min: filters.capacityMin,
    capacity_max: filters.capacityMax,
    disciplines: filters.disciplines,
    disciplines_superior: filters.disciplinesSuperior,
    discipline_requirements: filters.disciplineRequirements,
    discipline_or: filters.disciplineOr,
    set: filters.set,
    set_age: filters.setAge,
    set_print: filters.setPrint,
    precon: filters.precon,
    precons: filters.precons,
    precon_print: filters.preconPrint,
    artist: filters.artist,
  })

  const rows = await query<CryptRow>(sql, params)
  const cards = rows.map(({ name_ascii: _sortName, disc, ...row }) => ({
    ...row,
    disciplines: parseDisciplines(disc),
  }))
  const sortNames = new Map(rows.map((row) => [row.id, row.name_ascii]))
  const ordered = await orderCryptCards(cards, filters.sort, sortNames)
  return limited ? ordered.slice(0, 200) : ordered
}

export async function listClans(): Promise<string[]> {
  const rows = await query<{ clan: string }>(
    `SELECT DISTINCT clan FROM cards WHERE kind = 'crypt' AND clan != '' ORDER BY clan`,
  )
  return rows.map((r) => r.clan)
}

export async function listTitles(): Promise<string[]> {
  const rows = await query<{ title: string }>(
    `SELECT DISTINCT title FROM cards WHERE kind = 'crypt' AND title IS NOT NULL ORDER BY title`,
  )
  return rows.map((r) => r.title)
}

export async function listCryptSects(): Promise<string[]> {
  const rows = await query<{ sect: string }>(
    `SELECT DISTINCT sect FROM cards
     WHERE kind = 'crypt' AND sect IS NOT NULL AND sect != '' ORDER BY sect`,
  )
  return rows.map((r) => r.sect)
}

export async function listCryptTraits(): Promise<string[]> {
  return listCardTraits('crypt')
}

export async function listGroups(): Promise<number[]> {
  const rows = await query<{ grp: number }>(
    `SELECT DISTINCT grp FROM cards WHERE kind = 'crypt' ORDER BY grp`,
  )
  return rows.map((r) => r.grp)
}

export async function listCryptDisciplines(): Promise<string[]> {
  const rows = await query<{ discipline: string }>(
    `SELECT DISTINCT cd.discipline FROM card_disciplines cd
     JOIN cards c ON c.id = cd.card_id WHERE c.kind = 'crypt' ORDER BY cd.discipline`,
  )
  return rows.map((r) => r.discipline)
}

export async function listSets(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT DISTINCT name FROM sets ORDER BY release_date, name`,
  )
  return rows.map((r) => r.name)
}

export async function listPrecons(): Promise<PreconOption[]> {
  return listSearchPrecons()
}

export async function listArtists(): Promise<string[]> {
  const rows = await query<{ name: string }>(`SELECT DISTINCT name FROM artists ORDER BY name`)
  return rows.map((r) => r.name)
}
