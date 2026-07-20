import type { CryptCard, CryptSort } from './cryptSearch'
import type { LibraryCard, LibrarySort } from './librarySearch'

const byName = (left: string, right: string) => left.localeCompare(right, 'en')

export function sortCryptResults<T extends CryptCard>(cards: T[], sort: CryptSort): T[] {
  return [...cards].sort((left, right) => {
    switch (sort) {
      case 'capacity_asc':
        return left.capacity - right.capacity || byName(left.name, right.name)
      case 'clan':
        return (
          byName(left.clan, right.clan) ||
          right.capacity - left.capacity ||
          byName(left.name, right.name)
        )
      case 'group':
        return left.grp - right.grp || right.capacity - left.capacity || byName(left.name, right.name)
      case 'name':
        return byName(left.name, right.name)
      case 'sect':
        return (
          byName(left.sect ?? '', right.sect ?? '') ||
          right.capacity - left.capacity ||
          byName(left.name, right.name)
        )
      case 'capacity_desc':
        return right.capacity - left.capacity || byName(left.name, right.name)
    }
  })
}

function numericCost(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  return Number(value)
}

function compareCost(left: string | null, right: string | null, direction: 1 | -1): number {
  const leftNumber = numericCost(left)
  const rightNumber = numericCost(right)
  if (leftNumber !== null && rightNumber === null) return -1
  if (leftNumber === null && rightNumber !== null) return 1
  if (leftNumber === null || rightNumber === null) return 0
  return (leftNumber - rightNumber) * direction
}

function compareLibraryType(left: LibraryCard, right: LibraryCard): number {
  const leftDisciplines = [...left.disciplines].sort().join(',')
  const rightDisciplines = [...right.disciplines].sort().join(',')
  return (
    byName(left.types.join('/'), right.types.join('/')) ||
    byName(left.clan ?? '', right.clan ?? '') ||
    byName(leftDisciplines, rightDisciplines) ||
    byName(left.name, right.name)
  )
}

function compareLibraryRequirement(left: LibraryCard, right: LibraryCard): number {
  const leftHasClan = left.clan ? 0 : 1
  const rightHasClan = right.clan ? 0 : 1
  const leftHasDiscipline = left.disciplines.length > 0 ? 0 : 1
  const rightHasDiscipline = right.disciplines.length > 0 ? 0 : 1
  const leftDisciplines = [...left.disciplines].sort().join(',')
  const rightDisciplines = [...right.disciplines].sort().join(',')
  return (
    leftHasClan - rightHasClan ||
    byName(left.clan ?? '', right.clan ?? '') ||
    leftHasDiscipline - rightHasDiscipline ||
    byName(leftDisciplines, rightDisciplines) ||
    compareLibraryType(left, right)
  )
}

export function sortLibraryResults<T extends LibraryCard>(cards: T[], sort: LibrarySort): T[] {
  return [...cards].sort((left, right) => {
    switch (sort) {
      case 'requirement':
        return compareLibraryRequirement(left, right)
      case 'cost_desc':
        return (
          compareCost(left.blood_cost, right.blood_cost, -1) ||
          compareCost(left.pool_cost, right.pool_cost, -1) ||
          compareLibraryType(left, right)
        )
      case 'cost_asc':
        return (
          compareCost(left.blood_cost, right.blood_cost, 1) ||
          compareCost(left.pool_cost, right.pool_cost, 1) ||
          compareLibraryType(left, right)
        )
      case 'type':
        return compareLibraryType(left, right)
      case 'name':
        return byName(left.name, right.name)
    }
  })
}
