export type SetAgeMode = 'exact' | 'or_newer' | 'or_older' | 'not_newer' | 'not_older'
export type SetPrintMode = 'any' | 'only' | 'first' | 'reprint'

export const defaultSetAge: SetAgeMode = 'exact'
export const defaultSetPrint: SetPrintMode = 'any'
