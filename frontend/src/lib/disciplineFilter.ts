export interface DisciplineRequirement {
  code: string
  superior: boolean
}

export type LibraryDisciplineLogic = 'all' | 'any' | 'none' | 'only'
