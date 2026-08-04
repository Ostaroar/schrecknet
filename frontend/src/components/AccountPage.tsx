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
      {mode !== 'recover' && (
        <p className="rounded-lg border border-gold bg-surface p-3 text-sm text-ink">
          {ui.syncNotYet}
        </p>
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

      <p className="rounded-lg border border-gold bg-surface p-3 text-sm text-ink">
        {ui.syncNotYet}
      </p>

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
