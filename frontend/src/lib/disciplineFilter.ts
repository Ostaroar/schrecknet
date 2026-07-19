export interface DisciplineRequirement {
  code: string
  superior: boolean
}

type SqlParameter = string | number | null

export type LibraryDisciplineLogic = 'all' | 'any' | 'none' | 'only'

function requirementExpression(
  params: SqlParameter[],
  requirement: DisciplineRequirement,
): string {
  const expression = `EXISTS (SELECT 1 FROM card_disciplines cdx
       WHERE cdx.card_id = c.id AND cdx.discipline = ?${params.length + 1} AND cdx.superior >= ?${params.length + 2})`
  params.push(requirement.code.toLowerCase(), requirement.superior ? 1 : 0)
  return expression
}

function appendRequirementGroup(
  sql: string,
  params: SqlParameter[],
  requirements: DisciplineRequirement[],
): string {
  if (requirements.length === 0) return sql
  const alternatives = requirements.map((requirement) =>
    requirementExpression(params, requirement),
  )
  return `${sql} AND (${alternatives.join(' OR ')})`
}

/**
 * Appends VDB-compatible discipline composition. Detailed requirements take
 * precedence over the legacy global-level fields; ordinary requirements are
 * ANDed, while each OR row requires at least one of its alternatives.
 */
export function appendDisciplineFilters(
  sql: string,
  params: SqlParameter[],
  requirements: DisciplineRequirement[],
  legacyCodes: string[],
  legacySuperior: boolean,
  orGroups: DisciplineRequirement[][] = [],
): string {
  const effective =
    requirements.length > 0
      ? requirements
      : legacyCodes.map((code) => ({ code, superior: legacySuperior }))
  for (const requirement of effective) {
    sql = appendRequirementGroup(sql, params, [requirement])
  }
  for (const group of orGroups) sql = appendRequirementGroup(sql, params, group)
  return sql
}

/** Applies VDB's level-neutral library requirement logic. */
export function appendLibraryDisciplineFilters(
  sql: string,
  params: SqlParameter[],
  codes: string[],
  logic: LibraryDisciplineLogic,
  includeNoDiscipline: boolean,
  legacySuperior: boolean,
): string {
  const requirements = codes.map((code) => ({ code, superior: legacySuperior }))
  const noRequirement =
    'NOT EXISTS (SELECT 1 FROM card_disciplines cdn WHERE cdn.card_id = c.id)'

  if (logic === 'all') {
    for (const requirement of requirements) {
      sql = appendRequirementGroup(sql, params, [requirement])
    }
    if (includeNoDiscipline) {
      sql += requirements.length === 0 ? ` AND ${noRequirement}` : ' AND 0'
    }
    return sql
  }

  if (logic === 'any' || logic === 'none') {
    const alternatives = requirements.map((requirement) =>
      requirementExpression(params, requirement),
    )
    if (includeNoDiscipline) alternatives.push(noRequirement)
    if (alternatives.length > 0) {
      sql += ` AND ${logic === 'none' ? 'NOT ' : ''}(${alternatives.join(' OR ')})`
    }
    return sql
  }

  if (includeNoDiscipline) {
    return `${sql}${requirements.length === 0 ? ` AND ${noRequirement}` : ' AND 0'}`
  }
  if (requirements.length === 0) return sql
  for (const requirement of requirements) {
    sql = appendRequirementGroup(sql, params, [requirement])
  }
  params.push(requirements.length)
  return `${sql} AND (SELECT COUNT(DISTINCT cdo.discipline) FROM card_disciplines cdo
     WHERE cdo.card_id = c.id) = ?${params.length}`
}
