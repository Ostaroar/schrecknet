// Loads the full owned-quantity map once for search-result badges/filtering.
// Browser-local only: reads from the user-db worker (inventoryStore), never
// touches the shared crypt/library search surface or its server-mirrored
// params — "only owned" is a post-filter over already-fetched results, not a
// new search capability (see docs/inventory-plan.md § I5).

import { useEffect, useState } from 'react'
import { listInventory } from './inventoryStore'

export function useInventoryOwnedMap(): Map<number, number> {
  const [owned, setOwned] = useState<Map<number, number>>(new Map())

  useEffect(() => {
    let active = true
    listInventory().then((entries) => {
      if (active) setOwned(new Map(entries.map((e) => [e.cardId, e.qty])))
    })
    return () => {
      active = false
    }
  }, [])

  return owned
}
