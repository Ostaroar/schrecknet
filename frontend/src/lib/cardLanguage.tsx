import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'schrecknet.card-text-language'

interface CardLanguageContextValue {
  language: string
  setLanguage: (language: string) => void
}

const CardLanguageContext = createContext<CardLanguageContextValue | null>(null)

function initialLanguage(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || 'en'
  } catch {
    return 'en'
  }
}

export function CardLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(initialLanguage)
  const setLanguage = useCallback((nextLanguage: string) => {
    setLanguageState(nextLanguage)
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage)
    } catch {
      // Private browsing or storage policy can disable localStorage. The
      // in-memory choice still works for the current session.
    }
  }, [])
  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage])

  return <CardLanguageContext.Provider value={value}>{children}</CardLanguageContext.Provider>
}

export function useCardLanguage(): CardLanguageContextValue {
  const value = useContext(CardLanguageContext)
  if (!value) throw new Error('useCardLanguage must be used inside CardLanguageProvider')
  return value
}

export function languageLabel(language: string): string {
  switch (language.toLowerCase()) {
    case 'en':
      return 'English'
    case 'es':
      return 'Español'
    case 'fr':
      return 'Français'
    case 'de':
      return 'Deutsch'
    case 'pt':
    case 'pt-br':
      return 'Português'
    default:
      return language.toUpperCase()
  }
}
