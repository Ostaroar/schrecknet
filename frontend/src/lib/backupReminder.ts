// Tracks when the user last took a backup, so the app can nudge — once, quietly
// — rather than either nagging or staying silent until data is already lost
// (docs/adr/0016).

const LAST_BACKUP_KEY = 'schrecknet.last-backup-at'
const DISMISSED_KEY = 'schrecknet.backup-reminder-dismissed-at'

/** Long enough that regular users are not pestered, short enough to matter. */
const REMIND_AFTER_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function readDate(key: string): Date | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function lastBackupAt(): Date | null {
  return readDate(LAST_BACKUP_KEY)
}

export function markBackedUp(now = new Date()): void {
  localStorage.setItem(LAST_BACKUP_KEY, now.toISOString())
  // A fresh backup makes any standing dismissal irrelevant.
  localStorage.removeItem(DISMISSED_KEY)
}

export function dismissReminder(now = new Date()): void {
  localStorage.setItem(DISMISSED_KEY, now.toISOString())
}

/**
 * Whether to show the reminder. Requires the user to actually have something to
 * lose — reminding someone with no decks to back up nothing is just noise.
 */
export function shouldRemind(hasLocalData: boolean, now = new Date()): boolean {
  if (!hasLocalData) return false
  const dismissed = readDate(DISMISSED_KEY)
  if (dismissed && now.getTime() - dismissed.getTime() < REMIND_AFTER_DAYS * DAY_MS) return false
  const last = lastBackupAt()
  if (!last) return true
  return now.getTime() - last.getTime() >= REMIND_AFTER_DAYS * DAY_MS
}
