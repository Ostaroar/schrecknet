export type RequirementLogic = 'all' | 'any' | 'none'

type SqlParameter = string | number | null

function tokenExpression(
  params: SqlParameter[],
  requirement: string,
): string {
  params.push(requirement.toLowerCase())
  return `EXISTS (SELECT 1 FROM card_requirements cre
       WHERE cre.card_id = c.id AND cre.requirement = ?${params.length})`
}

function familyAbsentExpression(params: SqlParameter[], kind: string): string {
  params.push(kind)
  return `NOT EXISTS (SELECT 1 FROM card_requirements crn
     WHERE crn.card_id = c.id AND crn.kind = ?${params.length})`
}

/** Mirrors server-side VDB All/Any/Not requirement-token composition. */
export function appendLibraryRequirementFilter(
  sql: string,
  params: SqlParameter[],
  requirements: string[],
  logic: RequirementLogic,
  includeNoRequirement: boolean,
  familyKind: 'sect' | 'title',
): string {
  if (logic === 'all') {
    for (const requirement of requirements) {
      sql += ` AND ${tokenExpression(params, requirement)}`
    }
    if (includeNoRequirement) {
      sql +=
        requirements.length === 0
          ? ` AND ${familyAbsentExpression(params, familyKind)}`
          : ' AND 0'
    }
    return sql
  }

  const alternatives = requirements.map((requirement) => tokenExpression(params, requirement))
  if (includeNoRequirement) alternatives.push(familyAbsentExpression(params, familyKind))
  if (alternatives.length === 0) return sql
  return `${sql} AND ${logic === 'none' ? 'NOT ' : ''}(${alternatives.join(' OR ')})`
}
