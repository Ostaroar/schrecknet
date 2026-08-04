// Passkey account UI (docs/adr/0019, docs/accounts-plan.md § A4). Optional —
// SchreckNet works fully with zero account. This page is reached from the
// footer, not the main nav (accounts-plan.md § 6).
//
// Deliberately corrects a specific misconception rather than leaving it
// implied (accounts-plan.md § A4, raised by the project owner): clearing
// browser data does NOT cost you your passkey — it lives in the authenticator,
// not site storage — it costs you the session and, far more importantly, your
// local decks. The "what survives" section says this explicitly.

import { useEffect, useState } from 'react'
import {
  addPasskeyFromSession,
  deleteAccount,
  getAccount,
  listPasskeys,
  login,
  logout,
  recoverWithCode,
  register,
  removePasskey,
  renamePasskey,
  type AccountInfo,
  type PasskeySummary,
} from '../lib/account'
import { createApiToken, listApiTokens, revokeApiToken, type ApiTokenSummary } from '../lib/apiTokens'
import {
  checkSyncState,
  isUnlocked,
  lock as lockSync,
  acceptRemote,
  pushLocal,
  reencryptAfterRotation,
  unlock as unlockSync,
  SyncConflictError,
  type SyncState,
} from '../lib/sync'
import { passkeysSupported } from '../lib/webauthn'
import { navigate } from '../lib/route'
import { useUiStrings } from '../lib/i18n'

type Mode = 'login' | 'register' | 'recover'

/** Shown once, right after it's issued (registration or a rotated code),
 * with a forced "I've saved it" confirmation before the caller can move on. */
function RecoveryCodeReveal({
  title,
  intro,
  code,
  confirmLabel,
  continueLabel,
  onDone,
}: {
  title: string
  intro: string
  code: string
  confirmLabel: string
  continueLabel: string
  onDone: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="grid gap-3 rounded-lg border border-blood-hi bg-surface p-4">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <p className="text-sm text-ink-muted">{intro}</p>
      <p className="select-all break-all rounded-md border border-line bg-raised px-3 py-2 font-mono text-sm text-ink">
        {code}
      </p>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        {confirmLabel}
      </label>
      <button
        type="button"
        disabled={!confirmed}
        onClick={onDone}
        className="w-fit rounded-lg bg-blood px-3 py-2 text-sm text-ink disabled:opacity-50"
      >
        {continueLabel}
      </button>
    </div>
  )
}

function SignedOut({ ui }: { ui: ReturnType<typeof useUiStrings>['account'] }) {
  const [mode, setMode] = useState<Mode>('login')
  const [displayName, setDisplayName] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [freshCode, setFreshCode] = useState<{ title: string; intro: string; code: string } | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        const result = await register(displayName.trim())
        setFreshCode({
          title: ui.recoveryCodeTitle,
          intro: ui.recoveryCodeIntro,
          code: result.recovery_code,
        })
      } else if (mode === 'login') {
        await login(displayName.trim())
        navigate({ page: 'account' })
        window.location.reload()
      } else {
        const result = await recoverWithCode(displayName.trim(), recoveryCode.trim())
        if (result.new_recovery_code) {
          // The old recovery code is now spent, which would otherwise
          // permanently orphan any existing sync blob — it was encrypted
          // under the old code, and the server cannot re-encrypt it (it
          // never has a key). Re-encrypt under the new code while both are
          // still known, here, in the browser.
          await reencryptAfterRotation(recoveryCode.trim(), result.new_recovery_code).catch(() => {
            // Best-effort: nothing was synced yet, or this device never
            // unlocked sync with the old code — either way, not fatal.
          })
          setFreshCode({
            title: ui.newRecoveryCodeTitle,
            intro: ui.newRecoveryCodeIntro,
            code: result.new_recovery_code,
          })
        } else {
          navigate({ page: 'account' })
          window.location.reload()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (freshCode) {
    return (
      <RecoveryCodeReveal
        title={freshCode.title}
        intro={freshCode.intro}
        code={freshCode.code}
        confirmLabel={ui.recoveryCodeSavedConfirm}
        continueLabel={ui.recoveryCodeContinue}
        onDone={() => {
          navigate({ page: 'account' })
          window.location.reload()
        }}
      />
    )
  }

  if (!passkeysSupported()) {
    return <p className="text-sm text-ink-muted">{ui.unsupportedBrowser}</p>
  }

  return (
    <div className="grid max-w-md gap-4">
      <p className="text-sm text-ink-muted">{mode === 'recover' ? '' : ui.signedOutIntro}</p>
      {mode !== 'recover' && (
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted">
          <p>{ui.whatItsFor}</p>
          <p>{ui.passkeyNote}</p>
        </div>
      )}
      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="grid gap-1 text-sm text-ink">
          {ui.displayNameLabel}
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={ui.displayNamePlaceholder}
            required
            maxLength={64}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
        {mode === 'recover' && (
          <label className="grid gap-1 text-sm text-ink">
            {ui.recoveryCodeLabel}
            <input
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              required
              className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
            />
          </label>
        )}
        {error && <p className="text-sm text-blood-hi">{ui.error(error)}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blood px-3 py-2 text-sm text-ink disabled:opacity-50"
        >
          {mode === 'register'
            ? busy
              ? ui.registering
              : ui.registerButton
            : mode === 'login'
              ? busy
                ? ui.loggingIn
                : ui.loginButton
              : busy
                ? ui.recovering
                : ui.recoverButton}
        </button>
      </form>

      <div className="grid gap-1 text-sm">
        {mode !== 'recover' ? (
          <>
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-left text-ink-muted hover:text-ink"
            >
              {mode === 'login' ? ui.switchToRegister : ui.switchToLogin}
            </button>
            <button
              type="button"
              onClick={() => setMode('recover')}
              className="text-left text-ink-dim hover:text-ink-muted"
            >
              {ui.recoveryInstead}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setMode('login')}
            className="text-left text-ink-muted hover:text-ink"
          >
            {ui.backToLogin}
          </button>
        )}
      </div>
    </div>
  )
}

function SyncSection({ ui }: { ui: ReturnType<typeof useUiStrings>['account'] }) {
  const [unlocked, setUnlocked] = useState(isUnlocked())
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'unlock' | 'sync' | 'keep' | 'use-other' | null>(null)
  const [error, setError] = useState('')
  const [state, setState] = useState<SyncState | null>(null)

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy('unlock')
    try {
      await unlockSync(code)
      setCode('')
      setUnlocked(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function onSyncNow() {
    setError('')
    setBusy('sync')
    try {
      const result = await checkSyncState()
      if (result.kind === 'never-synced') {
        const blob = await pushLocal(navigator.userAgent.slice(0, 40))
        setState({ kind: 'up-to-date', version: blob.version, updatedAt: blob.updated_at })
      } else {
        setState(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function onKeepThisDevice() {
    if (state?.kind !== 'conflict') return
    setError('')
    setBusy('keep')
    try {
      const blob = await pushLocal(navigator.userAgent.slice(0, 40), undefined, state.remote.blob.version)
      setState({ kind: 'up-to-date', version: blob.version, updatedAt: blob.updated_at })
    } catch (err) {
      if (err instanceof SyncConflictError) {
        // A third device pushed between checkSyncState() and this push — the
        // conflict moved, not resolved. Re-run the check to show the current one.
        await onSyncNow()
        return
      }
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function onUseOtherDevice() {
    if (state?.kind !== 'conflict') return
    setError('')
    setBusy('use-other')
    try {
      await acceptRemote(state.remote.envelope, state.remote.blob.version)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.syncTitle}</h2>
      <p className="text-xs text-ink-muted">{ui.syncIntro}</p>

      {!unlocked ? (
        <form onSubmit={onUnlock} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm text-ink">
            {ui.unlockLabel}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="rounded-md border border-line bg-raised px-3 py-2 font-mono text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            disabled={busy === 'unlock'}
            className="rounded-lg bg-blood px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            {busy === 'unlock' ? ui.unlocking : ui.unlockButton}
          </button>
        </form>
      ) : state?.kind === 'conflict' ? (
        <div className="grid gap-2">
          <h3 className="text-sm text-ink">{ui.conflictTitle}</h3>
          <p className="text-xs text-ink-muted">
            {ui.conflictIntro(
              state.local.decks,
              state.local.inventory_cards,
              state.remote.blob.device_label ?? '?',
              state.remote.blob.updated_at.slice(0, 10),
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onKeepThisDevice}
              disabled={busy !== null}
              className="rounded-lg bg-blood px-3 py-2 text-xs text-ink disabled:opacity-50"
            >
              {ui.keepThisDevice}
            </button>
            <button
              type="button"
              onClick={onUseOtherDevice}
              disabled={busy !== null}
              className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-ink disabled:opacity-50"
            >
              {ui.useOtherDevice}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSyncNow}
            disabled={busy !== null}
            className="rounded-lg bg-blood px-3 py-2 text-xs text-ink disabled:opacity-50"
          >
            {busy === 'sync' ? ui.syncing : ui.syncNow}
          </button>
          <button
            type="button"
            onClick={() => {
              lockSync()
              setUnlocked(false)
              setState(null)
            }}
            className="text-xs text-ink-dim hover:text-ink-muted"
          >
            {ui.lockSync}
          </button>
          {state?.kind === 'up-to-date' && (
            <span className="text-xs text-ink-dim">{ui.upToDate(state.updatedAt.slice(0, 10))}</span>
          )}
          {state === null && <span className="text-xs text-ink-dim">{ui.neverSynced}</span>}
        </div>
      )}
      {error && <p className="text-sm text-blood-hi">{ui.error(error)}</p>}
    </section>
  )
}

function TokensSection({ ui }: { ui: ReturnType<typeof useUiStrings>['account'] }) {
  const [tokens, setTokens] = useState<ApiTokenSummary[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [freshToken, setFreshToken] = useState<string | null>(null)

  const reload = () => listApiTokens().then(setTokens).catch((e) => setError(String(e)))
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onCreate() {
    setError('')
    setBusy('create')
    try {
      const nickname = window.prompt(ui.tokenNicknamePrompt) ?? undefined
      const result = await createApiToken(nickname)
      setFreshToken(result.token)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function onRevoke(id: number) {
    setError('')
    setBusy(`revoke-${id}`)
    try {
      await revokeApiToken(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  if (freshToken) {
    return (
      <RecoveryCodeReveal
        title={ui.tokenCreatedTitle}
        intro={ui.tokenCreatedIntro}
        code={freshToken}
        confirmLabel={ui.recoveryCodeSavedConfirm}
        continueLabel={ui.tokenCreatedContinue}
        onDone={() => setFreshToken(null)}
      />
    )
  }

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.tokensTitle}</h2>
        <button
          type="button"
          onClick={onCreate}
          disabled={busy === 'create'}
          className="rounded-lg bg-blood px-3 py-1.5 text-xs text-ink disabled:opacity-50"
        >
          {busy === 'create' ? ui.creatingToken : ui.createTokenButton}
        </button>
      </div>
      <p className="text-xs text-ink-muted">{ui.tokensNote}</p>
      {tokens === null ? (
        <p className="text-sm text-ink-dim">{ui.loadingTokens}</p>
      ) : tokens.length > 0 ? (
        <ul className="divide-y divide-line-soft rounded-lg border border-line bg-raised text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <p className="text-ink">{t.nickname || ui.unnamedToken}</p>
                <p className="text-xs text-ink-dim">{t.created_at.slice(0, 10)}</p>
              </div>
              <button
                type="button"
                onClick={() => onRevoke(t.id)}
                disabled={busy === `revoke-${t.id}`}
                className="text-xs text-blood-hi hover:text-blood disabled:opacity-50"
              >
                {busy === `revoke-${t.id}` ? ui.revokingToken : ui.revokeToken}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error && <p className="text-sm text-blood-hi">{ui.error(error)}</p>}
    </section>
  )
}

function SignedIn({
  ui,
  account,
  onSignedOut,
}: {
  ui: ReturnType<typeof useUiStrings>['account']
  account: AccountInfo
  onSignedOut: () => void
}) {
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [freshCode, setFreshCode] = useState<string | null>(null)

  const reload = () => listPasskeys().then(setPasskeys).catch((e) => setError(String(e)))
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onLogout() {
    setBusy('logout')
    await logout()
    onSignedOut()
  }

  async function onDeleteAccount() {
    if (!window.confirm(ui.deleteAccountConfirm)) return
    setError('')
    setBusy('delete-account')
    try {
      await deleteAccount()
      onSignedOut()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  async function onAddPasskey() {
    setError('')
    setBusy('add')
    try {
      const nickname = window.prompt(ui.nicknamePrompt) ?? undefined
      await addPasskeyFromSession(nickname)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRename(id: number, current: string | null) {
    const next = window.prompt(ui.nicknamePrompt, current ?? '')
    if (next === null) return
    setError('')
    try {
      await renamePasskey(id, next.trim() || null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRemove(id: number) {
    setError('')
    setBusy(`remove-${id}`)
    try {
      await removePasskey(id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (freshCode) {
    return (
      <RecoveryCodeReveal
        title={ui.newRecoveryCodeTitle}
        intro={ui.newRecoveryCodeIntro}
        code={freshCode}
        confirmLabel={ui.recoveryCodeSavedConfirm}
        continueLabel={ui.recoveryCodeContinue}
        onDone={() => setFreshCode(null)}
      />
    )
  }

  return (
    <div className="grid max-w-lg gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-ink">{ui.signedInAs(account.display_name)}</p>
          <p className="text-xs text-ink-dim">{ui.memberSince(account.created_at.slice(0, 10))}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          disabled={busy === 'logout'}
          className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink disabled:opacity-50"
        >
          {busy === 'logout' ? ui.loggingOut : ui.logout}
        </button>
      </div>

      <section className="grid gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.dataSafetyTitle}</h2>
        <ul className="grid gap-1 text-sm text-ink-muted">
          <li>✔ {ui.dataSafetyPasskey}</li>
          <li>↺ {ui.dataSafetySession}</li>
          <li>✘ {ui.dataSafetyDecks}</li>
        </ul>
        <p className="text-xs text-ink-dim">{ui.passkeyManagerNote}</p>
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.passkeysTitle}</h2>
          <button
            type="button"
            onClick={onAddPasskey}
            disabled={busy === 'add'}
            className="rounded-lg bg-blood px-3 py-1.5 text-xs text-ink disabled:opacity-50"
          >
            {busy === 'add' ? ui.addingPasskey : ui.addPasskeyButton}
          </button>
        </div>
        <p className="text-xs text-ink-muted">{ui.passkeysNote}</p>

        {passkeys === null ? (
          <p className="text-sm text-ink-dim">{ui.loadingPasskeys}</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-lg border border-line bg-raised text-sm">
            {passkeys.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div>
                  <p className="text-ink">{p.nickname || ui.unnamedPasskey}</p>
                  <p className="text-xs text-ink-dim">
                    {p.created_at.slice(0, 10)}
                    {passkeys.length === 1 && <span className="ml-2 text-blood-hi">{ui.lastPasskeyBadge}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRename(p.id, p.nickname)}
                    className="text-xs text-ink-muted hover:text-ink"
                  >
                    {ui.renamePasskey}
                  </button>
                  {passkeys.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      disabled={busy === `remove-${p.id}`}
                      className="text-xs text-blood-hi hover:text-blood disabled:opacity-50"
                    >
                      {busy === `remove-${p.id}` ? ui.removing : ui.removePasskey}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SyncSection ui={ui} />
      <TokensSection ui={ui} />

      <section className="grid gap-2 rounded-lg border border-blood-hi bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-blood-hi">{ui.dangerZoneTitle}</h2>
        <button
          type="button"
          onClick={onDeleteAccount}
          disabled={busy === 'delete-account'}
          className="w-fit rounded-lg border border-blood-hi px-3 py-2 text-sm text-blood-hi hover:bg-blood-hi hover:text-ink disabled:opacity-50"
        >
          {busy === 'delete-account' ? ui.deletingAccount : ui.deleteAccountButton}
        </button>
      </section>

      {error && <p className="text-sm text-blood-hi">{ui.error(error)}</p>}
    </div>
  )
}

export default function AccountPage() {
  const strings = useUiStrings()
  const ui = strings.account
  const [account, setAccount] = useState<AccountInfo | null | undefined>(undefined)

  useEffect(() => {
    getAccount().then(setAccount)
  }, [])

  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl text-ink">{ui.title}</h1>
      {account === undefined ? null : account === null ? (
        <SignedOut ui={ui} />
      ) : (
        <SignedIn ui={ui} account={account} onSignedOut={() => setAccount(null)} />
      )}
    </div>
  )
}
