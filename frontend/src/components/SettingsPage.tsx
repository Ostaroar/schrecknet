// Data & backup (docs/adr/0016). The one place a user can get their local
// decks/inventory out of the browser and back in, see whether the browser has
// promised to keep them, and force a card-data reload without resorting to
// clearing site data (which is what destroyed data before ADR 0015).

import { useCallback, useEffect, useState } from 'react'

import {
  backupFileName,
  createBackup,
  readBackup,
  restoreBackup,
  summarizeLocalData,
} from '../lib/backup'
import { markBackedUp } from '../lib/backupReminder'
import { refreshCardDb } from '../lib/db'
import { requestPersistentStorage } from '../lib/userDb'
import type { UiStrings } from '../lib/i18n'

type Counts = { decks: number; inventory_cards: number; owned_precons: number }

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function SettingsPage({
  ui,
  cardVersion,
}: {
  ui: UiStrings['settings']
  cardVersion: string | null
}) {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState<'backup' | 'restore' | 'refresh' | null>(null)
  const [status, setStatus] = useState<string>('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)

  const reloadCounts = useCallback(() => {
    summarizeLocalData().then(setCounts).catch(() => setCounts(null))
  }, [])

  useEffect(reloadCounts, [reloadCounts])

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
    navigator.storage?.estimate?.().then((e) =>
      setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }),
    ).catch(() => setUsage(null))
  }, [])

  async function onBackup() {
    setBusy('backup')
    setStatus('')
    try {
      const env = await createBackup(cardVersion ?? undefined)
      const name = backupFileName()
      download(name, JSON.stringify(env))
      markBackedUp()
      setStatus(ui.backupCreated(name))
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRestoreFile(file: File) {
    setStatus('')
    let env
    try {
      env = readBackup(await file.text())
    } catch (e) {
      setStatus(ui.restoreFailed(e instanceof Error ? e.message : String(e)))
      return
    }

    // Summarize the incoming file so the confirmation states real numbers on
    // both sides rather than a vague warning.
    const incoming = await countsInEnvelope(env.user_db_base64)
    const current = counts ?? { decks: 0, inventory_cards: 0, owned_precons: 0 }
    const ok = window.confirm(
      ui.restoreConfirm(
        current.decks,
        current.inventory_cards,
        incoming.decks,
        incoming.inventory_cards,
      ),
    )
    if (!ok) return

    setBusy('restore')
    try {
      // Safety net: the current state is irrecoverable once overwritten, so it
      // leaves the machine as a file before we touch anything.
      const safety = await createBackup(cardVersion ?? undefined)
      download(`before-restore-${backupFileName()}`, JSON.stringify(safety))

      await restoreBackup(env)
      markBackedUp()
      reloadCounts()
      setStatus(ui.restoreDone)
    } catch (e) {
      setStatus(ui.restoreFailed(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(null)
    }
  }

  async function onRefreshCards() {
    setBusy('refresh')
    setStatus('')
    try {
      await refreshCardDb()
      setStatus(ui.refreshDone)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-2xl text-ink">{ui.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{ui.intro}</p>
      </div>

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.yourDataTitle}</h2>
        <p className="text-xs text-ink-muted">{ui.yourDataNote}</p>
        {counts && (
          <p className="text-sm text-ink">
            {ui.counts(counts.decks, counts.inventory_cards, counts.owned_precons)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackup}
            disabled={busy !== null}
            className="rounded-lg bg-blood px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            {busy === 'backup' ? ui.creating : ui.downloadBackup}
          </button>
        </div>
        <p className="text-xs text-ink-dim">{ui.sensitiveNote}</p>
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.restoreTitle}</h2>
        <p className="text-xs text-ink-muted">{ui.restoreNote}</p>
        <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="rounded-lg border border-line bg-raised px-3 py-2 text-sm">
            {busy === 'restore' ? ui.restoring : ui.chooseFile}
          </span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Reset so choosing the same file twice still fires onChange.
              e.target.value = ''
              if (file) void onRestoreFile(file)
            }}
          />
        </label>
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.storageTitle}</h2>
        <p className="text-xs text-ink-muted">
          {persisted ? ui.storagePersisted : ui.storageNotPersisted}
        </p>
        {usage && usage.quota > 0 && (
          <p className="text-xs text-ink-dim">
            {ui.storageUsage(formatBytes(usage.used), formatBytes(usage.quota))}
          </p>
        )}
        {persisted === false && (
          <button
            type="button"
            onClick={() => requestPersistentStorage().then(setPersisted)}
            className="w-fit rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
          >
            {ui.enablePersistence}
          </button>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.cardDataTitle}</h2>
        <p className="text-xs text-ink-muted">{ui.cardDataNote}</p>
        {cardVersion && <p className="text-sm text-ink">{ui.cardDataVersion(cardVersion)}</p>}
        <button
          type="button"
          onClick={onRefreshCards}
          disabled={busy !== null}
          className="w-fit rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink disabled:opacity-50"
        >
          {busy === 'refresh' ? ui.refreshing : ui.refreshCardData}
        </button>
      </section>

      {status && <p className="text-sm text-ok">{status}</p>}
    </div>
  )
}

// Reads deck/inventory counts out of an envelope WITHOUT touching the live
// database, so the confirmation dialog can show both sides before anything is
// overwritten. Uses a throwaway in-memory SQLite instance.
async function countsInEnvelope(base64: string): Promise<Counts> {
  const { initSqlite } = await import('../lib/sqlite')
  const sqlite3 = await initSqlite()
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new (sqlite3 as any).oo1.DB()
  try {
    const p = sqlite3.wasm.allocFromTypedArray(bytes)
    sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      p,
      bytes.length,
      bytes.length,
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
    )
    const one = (sql: string): number => {
      try {
        return Number(db.selectValue(sql) ?? 0)
      } catch {
        // Table absent in an older backup — count it as zero rather than
        // failing the whole preview.
        return 0
      }
    }
    return {
      decks: one('SELECT COUNT(*) FROM decks'),
      inventory_cards: one('SELECT COUNT(*) FROM inventory'),
      owned_precons: one('SELECT COUNT(*) FROM inventory_precons'),
    }
  } finally {
    db.close()
  }
}
