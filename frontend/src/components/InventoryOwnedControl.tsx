import { useEffect, useState } from 'react'
import { getInventoryQty, adjustInventoryQty } from '../lib/inventoryStore'

export default function InventoryOwnedControl({ cardId }: { cardId: number }) {
  const [qty, setQty] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    getInventoryQty(cardId).then((value) => {
      if (active) setQty(value)
    })
    return () => {
      active = false
    }
  }, [cardId])

  const adjust = async (delta: number) => {
    setQty(await adjustInventoryQty(cardId, delta))
  }

  if (qty === null) return null

  return (
    <div className="flex items-center gap-2 text-xs text-ink-dim">
      <span>You own {qty}</span>
      <button
        onClick={() => adjust(-1)}
        aria-label="Decrease owned quantity"
        className="grid size-5 place-items-center rounded border border-line text-ink-dim hover:text-ink-muted"
      >
        −
      </button>
      <button
        onClick={() => adjust(1)}
        aria-label="Increase owned quantity"
        className="grid size-5 place-items-center rounded border border-line text-ink-dim hover:text-ink-muted"
      >
        +
      </button>
    </div>
  )
}
