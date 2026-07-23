// Library search adapter. Shared Rust owns query/filter planning; this module
// executes the WASM-produced plan and maps SQLite rows for the UI.

import { query } from './db'
import type { LibraryDisciplineLogic } from './disciplineFilter'
import { defaultSetAge, defaultSetPrint, type SetAgeMode, type SetPrintMode } from './setFilter'
import type { RequirementLogic } from './requirementFilter'
import { listCardTraits } from './cardTraits'
import {
  listSearchPrecons,
  type PreconOption,
  type PreconSelection,
} from './preconFilter'
import { orderLibraryCards, planLibrarySearch } from './core'

export type TextMode = 'any' | 'name' | 'text'
export type CostMode = 'at_most' | 'exact' | 'at_least'
export type CapacityRequirementMode = 'at_most' | 'at_least'
export type LibrarySort = 'requirement' | 'cost_desc' | 'cost_asc' | 'name' | 'type'

export interface LibraryFilters {
  text: string
  textMode: TextMode
  textRegex: boolean
  cardType: string | null
  clan: string | null
  sectRequirements: string[]
  sectRequirementLogic: RequirementLogic
  includeNoSectRequirement: boolean
  titleRequirements: string[]
  titleRequirementLogic: RequirementLogic
  disciplines: string[]
  disciplinesSuperior: boolean
  disciplineLogic: LibraryDisciplineLogic
  includeNoDiscipline: boolean
  capacityRequirement: number | null
  capacityRequirementMode: CapacityRequirementMode
  bloodCost: number | null
  bloodCostMode: CostMode
  poolCost: number | null
  poolCostMode: CostMode
  traits: string[]
  set: string | null
  setAge: SetAgeMode
  setPrint: SetPrintMode
  precon: string | null
  precons: PreconSelection[]
  preconPrint: SetPrintMode
  artist: string | null
  sort: LibrarySort
}

export const emptyLibraryFilters: LibraryFilters = {
  text: '',
  textMode: 'any',
  textRegex: false,
  cardType: null,
  clan: null,
  sectRequirements: [],
  sectRequirementLogic: 'all',
  includeNoSectRequirement: false,
  titleRequirements: [],
  titleRequirementLogic: 'all',
  disciplines: [],
  disciplinesSuperior: false,
  disciplineLogic: 'all',
  includeNoDiscipline: false,
  capacityRequirement: null,
  capacityRequirementMode: 'at_most',
  bloodCost: null,
  bloodCostMode: 'at_most',
  poolCost: null,
  poolCostMode: 'at_most',
  traits: [],
  set: null,
  setAge: defaultSetAge,
  setPrint: defaultSetPrint,
  precon: null,
  precons: [],
  preconPrint: defaultSetPrint,
  artist: null,
  sort: 'name',
}

export interface LibraryCard {
  id: number
  name: string
  types: string[]
  clan: string | null
  path: string | null
  blood_cost: string | null
  pool_cost: string | null
  image_url: string | null
  disciplines: string[]
}

interface LibraryRow {
  id: number
  name: string
  types: string
  clan: string | null
  blood_cost: string | null
  pool_cost: string | null
  image_url: string | null
  name_ascii: string
  disc: string | null
  path: string | null
}

export async function searchLibrary(filters: LibraryFilters): Promise<LibraryCard[]> {
  return searchLibraryInner(filters, true)
}

/** Applies every structured library filter without the 200-row UI cap. */
export async function filterLibrary(filters: LibraryFilters): Promise<LibraryCard[]> {
  return searchLibraryInner(filters, false)
}

async function searchLibraryInner(filters: LibraryFilters, limited: boolean): Promise<LibraryCard[]> {
  const { sql, params } = await planLibrarySearch({
    text: filters.text,
    text_mode: filters.textMode,
    text_regex: filters.textRegex,
    card_type: filters.cardType,
    clan: filters.clan,
    sect_requirements: filters.sectRequirements,
    sect_requirement_logic: filters.sectRequirementLogic,
    include_no_sect_requirement: filters.includeNoSectRequirement,
    title_requirements: filters.titleRequirements,
    title_requirement_logic: filters.titleRequirementLogic,
    disciplines: filters.disciplines,
    disciplines_superior: filters.disciplinesSuperior,
    discipline_logic: filters.disciplineLogic,
    include_no_discipline: filters.includeNoDiscipline,
    capacity_requirement: filters.capacityRequirement,
    capacity_requirement_mode: filters.capacityRequirementMode,
    blood_cost: filters.bloodCost,
    blood_cost_mode: filters.bloodCostMode,
    pool_cost: filters.poolCost,
    pool_cost_mode: filters.poolCostMode,
    traits: filters.traits,
    set: filters.set,
    set_age: filters.setAge,
    set_print: filters.setPrint,
    precon: filters.precon,
    precons: filters.precons,
    precon_print: filters.preconPrint,
    artist: filters.artist,
  })

  const rows = await query<LibraryRow>(sql, params)
  const cards = rows.map(({ name_ascii: _sortName, disc, ...row }) => ({
    ...row,
    types: JSON.parse(row.types) as string[],
    clan: row.clan || null,
    disciplines: disc ? disc.split(',') : [],
  }))
  const sortNames = new Map(rows.map((row) => [row.id, row.name_ascii]))
  const ordered = await orderLibraryCards(cards, filters.sort, sortNames)
  return limited ? ordered.slice(0, 200) : ordered
}

export async function listLibraryTypes(): Promise<string[]> {
  const rows = await query<{ types: string }>(`SELECT DISTINCT types FROM cards WHERE kind = 'library'`)
  const set = new Set<string>()
  for (const row of rows) {
    for (const t of JSON.parse(row.types) as string[]) set.add(t)
  }
  return [...set].sort()
}

export async function listLibraryClans(): Promise<string[]> {
  const rows = await query<{ requirement: string }>(
    `SELECT requirement FROM (
       SELECT DISTINCT clan AS requirement
       FROM cards WHERE kind = 'library' AND clan != ''
       UNION
       SELECT DISTINCT path AS requirement
       FROM cards WHERE kind = 'library' AND path IS NOT NULL AND path != ''
     ) ORDER BY requirement`,
  )
  return rows.map((r) => r.requirement)
}

export async function listLibraryDisciplines(): Promise<string[]> {
  const rows = await query<{ discipline: string }>(
    `SELECT DISTINCT cd.discipline FROM card_disciplines cd
     JOIN cards c ON c.id = cd.card_id WHERE c.kind = 'library' ORDER BY cd.discipline`,
  )
  return rows.map((r) => r.discipline)
}

export async function listLibraryTraits(): Promise<string[]> {
  return listCardTraits('library')
}

export async function listLibrarySectRequirements(): Promise<string[]> {
  const rows = await query<{ requirement: string }>(
    `SELECT DISTINCT requirement FROM card_requirements
     WHERE kind = 'sect' ORDER BY requirement`,
  )
  return rows.map((row) => row.requirement)
}

export async function listLibraryTitleRequirements(): Promise<string[]> {
  const rows = await query<{ requirement: string; kind: string }>(
    `SELECT DISTINCT requirement, kind FROM card_requirements
     WHERE kind = 'title' OR requirement IN ('titled', 'non-titled', 'titled_specific')
     ORDER BY requirement`,
  )
  return rows.map((row) => row.requirement)
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
