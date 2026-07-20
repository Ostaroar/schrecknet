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

const DISCIPLINES: Record<string, { label: string; asset: string }> = {
  ani: { label: 'Animalism', asset: 'animalism' },
  aus: { label: 'Auspex', asset: 'auspex' },
  cel: { label: 'Celerity', asset: 'celerity' },
  dom: { label: 'Dominate', asset: 'dominate' },
  for: { label: 'Fortitude', asset: 'fortitude' },
  obf: { label: 'Obfuscate', asset: 'obfuscate' },
  obl: { label: 'Oblivion', asset: 'oblivion' },
  pot: { label: 'Potence', asset: 'potence' },
  pre: { label: 'Presence', asset: 'presence' },
  pro: { label: 'Protean', asset: 'protean' },
  tha: { label: 'Blood Sorcery', asset: 'bloodsorcery' },
}

const CARD_TYPES: Record<string, { asset: string; label: string }> = {
  ACTION: { asset: 'action', label: 'Action' },
  'ACTION MODIFIER': { asset: 'actionmodifier', label: 'Action Modifier' },
  COMBAT: { asset: 'combat', label: 'Combat' },
  'POLITICAL ACTION': { asset: 'politicalaction', label: 'Political Action' },
  REACTION: { asset: 'reaction', label: 'Reaction' },
}

function symbolFor(token: string): CardTextDisciplineSegment | CardTextTypeSegment | null {
  const code = token.toLowerCase()
  const discipline = DISCIPLINES[code]
  if (discipline && (token === code || token === token.toUpperCase())) {
    return {
      kind: 'discipline',
      token,
      code,
      ...discipline,
      superior: token === token.toUpperCase(),
    }
  }

  const cardType = CARD_TYPES[token]
  if (cardType) return { kind: 'card-type', token, ...cardType }
  return null
}

/**
 * Splits KRCG/VDB bracket-token card text without interpreting arbitrary HTML.
 * Unknown or future tokens remain verbatim so a data update can never erase
 * rules text merely because its visual symbol is not known yet.
 */
export function parseCardText(text: string): CardTextSegment[] {
  const segments: CardTextSegment[] = []
  const pattern = /\[([^\]\n]+)\]/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    if (index > cursor) segments.push({ kind: 'text', value: text.slice(cursor, index) })
    const symbol = symbolFor(match[1])
    segments.push(symbol ?? { kind: 'text', value: match[0] })
    cursor = index + match[0].length
  }
  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) })
  return segments
}
