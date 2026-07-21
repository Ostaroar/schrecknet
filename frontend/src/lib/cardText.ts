import {
  getCardTypeSymbol,
  getDisciplineSymbol,
  parseCardTextSegments,
} from './core'

export interface CardTextPlainSegment {
  kind: 'text'
  value: string
}

export interface CardTextDisciplineSegment {
  kind: 'discipline'
  token: string
  code: string
  label: string
  asset: string
  superior: boolean
}

export interface CardTextTypeSegment {
  kind: 'card-type'
  token: string
  asset: string
  label: string
}

export type CardTextSegment =
  | CardTextPlainSegment
  | CardTextDisciplineSegment
  | CardTextTypeSegment

export function disciplineSymbol(
  code: string,
  superior = false,
): CardTextDisciplineSegment | null {
  return getDisciplineSymbol(code, superior) as CardTextDisciplineSegment | null
}

export function cardTypeSymbol(type: string): CardTextTypeSegment | null {
  return getCardTypeSymbol(type) as CardTextTypeSegment | null
}

/**
 * Splits KRCG/VDB bracket-token card text without interpreting arbitrary HTML.
 * Unknown or future tokens remain verbatim so a data update can never erase
 * rules text merely because its visual symbol is not known yet.
 */
export function parseCardText(text: string): CardTextSegment[] {
  return parseCardTextSegments(text) as CardTextSegment[]
}
