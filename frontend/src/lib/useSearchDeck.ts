import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getDeckCardDetails,
  listDecks,
  setCardQty as persistCardQty,
  type DeckCardDetail,
  type DeckSummary,
} from './deckStore'

const ACTIVE_DECK_STORAGE_KEY = 'schrecknet.search.activeDeckId'

function readRememberedDeckId(): number | null {
  try {
    const value = window.localStorage.getItem(ACTIVE_DECK_STORAGE_KEY)
    if (value === null) return null
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function rememberDeckId(id: number | null): void {
  try {
    if (id === null) window.localStorage.removeItem(ACTIVE_DECK_STORAGE_KEY)
    else window.localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, String(id))
  } catch {
    // Storage preferences are optional. OPFS remains the source of deck data.
  }
}

function quantityMap(cards: DeckCardDetail[]): Map<number, number> {
  return new Map(cards.map((card) => [card.id, card.qty]))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface SearchDeckController {
  decks: DeckSummary[]
  activeDeck: DeckSummary | null
  cards: DeckCardDetail[]
  quantities: ReadonlyMap<number, number>
  loading: boolean
  updating: boolean
  error: string | null
  select: (deckId: number) => Promise<void>
  increment: (cardId: number) => Promise<void>
  decrement: (cardId: number) => Promise<void>
  setQty: (cardId: number, qty: number) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Bridges search results to anonymous decks stored in OPFS. The only value kept
 * in localStorage is the last selected deck id.
 */
export function useSearchDeck(): SearchDeckController {
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [activeDeckId, setActiveDeckId] = useState<number | null>(null)
  const [cards, setCards] = useState<DeckCardDetail[]>([])
  const [quantities, setQuantities] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const activeDeckIdRef = useRef<number | null>(null)
  const quantitiesRef = useRef<Map<number, number>>(new Map())
  const loadVersionRef = useRef(0)
  const mutationVersionRef = useRef(0)
  const pendingWritesRef = useRef(0)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())

  const publishCards = useCallback((nextCards: DeckCardDetail[]) => {
    const nextQuantities = quantityMap(nextCards)
    quantitiesRef.current = nextQuantities
    setCards(nextCards)
    setQuantities(nextQuantities)
  }, [])

  const waitForWrites = useCallback(async () => {
    while (true) {
      const pending = mutationQueueRef.current
      await pending
      if (pending === mutationQueueRef.current) return
    }
  }, [])

  const loadState = useCallback(
    async (preferredDeckId?: number) => {
      const loadVersion = ++loadVersionRef.current
      setLoading(true)
      setError(null)
      try {
        await waitForWrites()
        const nextDecks = await listDecks()
        const candidates = [preferredDeckId, activeDeckIdRef.current, readRememberedDeckId()]
        const nextDeck = candidates
          .map((candidate) => nextDecks.find((deck) => deck.id === candidate))
          .find((deck) => deck !== undefined) ?? nextDecks[0] ?? null
        const mutationVersion = mutationVersionRef.current
        const nextCards = nextDeck ? await getDeckCardDetails(nextDeck.id) : []

        if (!mountedRef.current || loadVersion !== loadVersionRef.current) return
        setDecks(nextDecks)
        activeDeckIdRef.current = nextDeck?.id ?? null
        setActiveDeckId(nextDeck?.id ?? null)
        rememberDeckId(nextDeck?.id ?? null)
        if (mutationVersion === mutationVersionRef.current) publishCards(nextCards)
      } catch (loadError) {
        if (mountedRef.current && loadVersion === loadVersionRef.current) {
          setError(errorMessage(loadError))
        }
      } finally {
        if (mountedRef.current && loadVersion === loadVersionRef.current) setLoading(false)
      }
    },
    [publishCards, waitForWrites],
  )

  useEffect(() => {
    mountedRef.current = true
    void loadState()
    return () => {
      mountedRef.current = false
      loadVersionRef.current += 1
    }
  }, [loadState])

  const reconcileCards = useCallback(
    async (deckId: number, mutationVersion: number) => {
      if (activeDeckIdRef.current !== deckId || mutationVersionRef.current !== mutationVersion) return
      const nextCards = await getDeckCardDetails(deckId)
      if (
        mountedRef.current &&
        activeDeckIdRef.current === deckId &&
        mutationVersionRef.current === mutationVersion
      ) {
        publishCards(nextCards)
      }
    },
    [publishCards],
  )

  const setQty = useCallback(
    async (cardId: number, requestedQty: number) => {
      const deckId = activeDeckIdRef.current
      if (deckId === null) return

      const qty = Number.isFinite(requestedQty) ? Math.max(0, Math.floor(requestedQty)) : 0
      const mutationVersion = ++mutationVersionRef.current
      const optimisticQuantities = new Map(quantitiesRef.current)
      if (qty === 0) optimisticQuantities.delete(cardId)
      else optimisticQuantities.set(cardId, qty)
      quantitiesRef.current = optimisticQuantities
      setQuantities(optimisticQuantities)
      setCards((currentCards) =>
        currentCards
          .map((card) => (card.id === cardId ? { ...card, qty } : card))
          .filter((card) => card.qty > 0),
      )
      setError(null)

      pendingWritesRef.current += 1
      setUpdating(true)
      const write = mutationQueueRef.current.then(() => persistCardQty(deckId, cardId, qty))
      mutationQueueRef.current = write.catch(() => undefined)

      try {
        await write
        await reconcileCards(deckId, mutationVersion)
      } catch (writeError) {
        if (mountedRef.current && mutationVersion === mutationVersionRef.current) {
          setError(errorMessage(writeError))
          try {
            await reconcileCards(deckId, mutationVersion)
          } catch {
            // Preserve the original mutation error; refresh remains available.
          }
        }
      } finally {
        pendingWritesRef.current -= 1
        if (mountedRef.current && pendingWritesRef.current === 0) setUpdating(false)
      }
    },
    [reconcileCards],
  )

  const increment = useCallback(
    (cardId: number) => setQty(cardId, (quantitiesRef.current.get(cardId) ?? 0) + 1),
    [setQty],
  )

  const decrement = useCallback(
    (cardId: number) => setQty(cardId, (quantitiesRef.current.get(cardId) ?? 0) - 1),
    [setQty],
  )

  const select = useCallback(
    async (deckId: number) => {
      activeDeckIdRef.current = deckId
      setActiveDeckId(deckId)
      publishCards([])
      rememberDeckId(deckId)
      await loadState(deckId)
    },
    [loadState, publishCards],
  )

  const refresh = useCallback(() => loadState(), [loadState])
  const activeDeck = useMemo(
    () => decks.find((deck) => deck.id === activeDeckId) ?? null,
    [activeDeckId, decks],
  )

  return {
    decks,
    activeDeck,
    cards,
    quantities,
    loading,
    updating,
    error,
    select,
    increment,
    decrement,
    setQty,
    refresh,
  }
}
