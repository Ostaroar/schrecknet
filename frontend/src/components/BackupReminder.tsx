// A quiet, dismissible nudge shown where the user can see the data that is at
// risk (docs/adr/0016). Deliberately not a modal and not recurring: it only
// appears when there is actually something to lose and no recent backup.

import { useEffect, useState } from 'react'

import { summarizeLocalData } from '../lib/backup'
import { dismissReminder, shouldRemind } from '../lib/backupReminder'
import { navigate } from '../lib/route'
import type { UiStrings } from '../lib/i18n'

export default function BackupReminder({ ui }: { ui: UiStrings['settings'] }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false
    summarizeLocalData()
      .then((counts) => {
        const hasData = counts.decks + counts.inventory_cards + counts.owned_precons > 0
        if (!cancelled) setShow(shouldRemind(hasData))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!show) return null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-xs text-ink-muted">
      <span className="min-w-0 flex-1">{ui.reminder}</span>
      <button
        type="button"
        onClick={() => navigate({ page: 'settings' })}
        className="rounded-lg bg-blood px-2.5 py-1.5 text-xs text-ink"
      >
        {ui.downloadBackup}
      </button>
      <button
        type="button"
        onClick={() => {
          dismissReminder()
          setShow(false)
        }}
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
      >
        ✕
      </button>
    </div>
  )
}
