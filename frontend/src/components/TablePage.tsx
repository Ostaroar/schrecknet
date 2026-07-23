import { useEffect, useMemo, useState } from 'react'
import { ARCHETYPE_OPTIONS, archetypeLabel } from '../lib/archetypeTags'
import {
  addStoredGroupCode,
  createGameGroup,
  deleteGroupGame,
  getActiveGroupCode,
  getGameGroup,
  getGroupLeaderboard,
  getSessionWritePassphrase,
  getStoredGroupCodes,
  listGroupGames,
  logGroupGame,
  removeStoredGroupCode,
  setActiveGroupCode,
  setSessionWritePassphrase,
  updateGroupGame,
  type GameRecord,
  type GroupInfo,
  type LeaderboardEntry,
  type PlayerResult,
} from '../lib/gameGroups'
import { useUiStrings } from '../lib/i18n'

type PlayerRow = {
  player_name: string
  deck_name: string
  archetype_id: string
  vp: string
  game_win: boolean
}

const emptyRow = (): PlayerRow => ({
  player_name: '',
  deck_name: '',
  archetype_id: '',
  vp: '',
  game_win: false,
})
const emptyRows = (): PlayerRow[] => [emptyRow(), emptyRow(), emptyRow(), emptyRow()]
const todayIso = (): string => new Date().toISOString().slice(0, 10)
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
const csvCell = (value: unknown): string => `"${String(value ?? '').replaceAll('"', '""')}"`

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function TablePage() {
  const ui = useUiStrings().table
  const [joinedCodes, setJoinedCodes] = useState<string[]>(() => getStoredGroupCodes())
  const [code, setCode] = useState<string | null>(() => getActiveGroupCode())
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createName, setCreateName] = useState('')
  const [createPassphrase, setCreatePassphrase] = useState('')
  const [createPassphraseConfirm, setCreatePassphraseConfirm] = useState('')
  const [writePassphrase, setWritePassphrase] = useState('')
  const [unlockInput, setUnlockInput] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [showJoinAnother, setShowJoinAnother] = useState(false)
  const [playedAt, setPlayedAt] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<PlayerRow[]>(emptyRows())
  const [editingGameId, setEditingGameId] = useState<number | null>(null)
  const [logError, setLogError] = useState('')
  const [logBusy, setLogBusy] = useState(false)
  const [deletingGameId, setDeletingGameId] = useState<number | null>(null)

  const refresh = async (activeCode: string) => {
    setLoading(true)
    setError('')
    try {
      const [info, board, history] = await Promise.all([
        getGameGroup(activeCode),
        getGroupLeaderboard(activeCode),
        listGroupGames(activeCode),
      ])
      if (!info) {
        setError(ui.groupMissing)
        removeStoredGroupCode(activeCode)
        setJoinedCodes(getStoredGroupCodes())
        setCode(getActiveGroupCode())
        setGroup(null)
        return
      }
      setGroup(info)
      setLeaderboard(board ?? [])
      setGames(history ?? [])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (code) {
      setWritePassphrase(getSessionWritePassphrase(code))
      setUnlockInput('')
      void refresh(code)
    }
    else setGroup(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const joinByCode = async (rawCode: string): Promise<boolean> => {
    const trimmed = rawCode.trim().toUpperCase()
    if (!trimmed) return false
    setBusy(true)
    setError('')
    try {
      const info = await getGameGroup(trimmed)
      if (!info) {
        setError(ui.noGroup)
        return false
      }
      addStoredGroupCode(info.code)
      setJoinedCodes(getStoredGroupCodes())
      setCode(info.code)
      setShowJoinAnother(false)
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    if (!createName.trim()) return
    if (createPassphrase && createPassphrase.length < 8) {
      setError(ui.passphraseTooShort)
      return
    }
    if (createPassphrase && createPassphrase !== createPassphraseConfirm) {
      setError(ui.passphrasesDiffer)
      return
    }
    setBusy(true)
    setError('')
    try {
      const info = await createGameGroup(createName.trim(), createPassphrase)
      if (createPassphrase) setSessionWritePassphrase(info.code, createPassphrase)
      addStoredGroupCode(info.code)
      setJoinedCodes(getStoredGroupCodes())
      setCreateName('')
      setCreatePassphrase('')
      setCreatePassphraseConfirm('')
      setWritePassphrase(createPassphrase)
      setCode(info.code)
      setShowJoinAnother(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleSwitch = (nextCode: string) => {
    setActiveGroupCode(nextCode)
    setCode(nextCode)
  }

  const unlockEditing = () => {
    if (!code || !unlockInput) return
    setSessionWritePassphrase(code, unlockInput)
    setWritePassphrase(unlockInput)
    setUnlockInput('')
  }

  const handleWriteError = (err: unknown, setter: (message: string) => void) => {
    const message = errorMessage(err)
    if (message === 'incorrect write passphrase' && code) {
      setSessionWritePassphrase(code, '')
      setWritePassphrase('')
      setter(ui.wrongPassphrase)
      return
    }
    setter(message)
  }

  const handleLeave = () => {
    if (!code || !confirm(ui.confirmLeave(group?.name ?? ui.thisGroup))) return
    removeStoredGroupCode(code)
    setJoinedCodes(getStoredGroupCodes())
    setCode(getActiveGroupCode())
    setGroup(null)
    setLeaderboard([])
    setGames([])
  }

  const resetForm = () => {
    setEditingGameId(null)
    setRows(emptyRows())
    setNotes('')
    setPlayedAt(todayIso())
    setLogError('')
  }

  const editGame = (game: GameRecord) => {
    setEditingGameId(game.id)
    setPlayedAt(game.played_at)
    setNotes(game.notes ?? '')
    setRows(
      game.results.map((result) => ({
        player_name: result.player_name,
        deck_name: result.deck_name ?? '',
        archetype_id: result.archetype_id ?? '',
        vp: String(result.vp),
        game_win: result.game_win,
      })),
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleLogGame = async () => {
    if (!code) return
    const filled = rows.filter((row) => row.player_name.trim())
    if (filled.length === 0) {
      setLogError(ui.addOnePlayer)
      return
    }
    const results: PlayerResult[] = []
    for (const row of filled) {
      const vp = Number(row.vp)
      if (row.vp.trim() === '' || Number.isNaN(vp) || vp < 0) {
        setLogError(ui.invalidVp(row.player_name))
        return
      }
      results.push({
        player_name: row.player_name.trim(),
        deck_name: row.deck_name.trim() || null,
        archetype_id: row.archetype_id || null,
        vp,
        game_win: row.game_win,
      })
    }
    setLogBusy(true)
    setLogError('')
    try {
      const payload = { played_at: playedAt, notes: notes.trim() || null, results }
      const saved = editingGameId
        ? await updateGroupGame(code, writePassphrase, editingGameId, payload)
        : await logGroupGame(code, writePassphrase, payload)
      if (!saved) {
        setLogError(ui.groupMissing)
        return
      }
      resetForm()
      await refresh(code)
    } catch (err) {
      handleWriteError(err, setLogError)
    } finally {
      setLogBusy(false)
    }
  }

  const handleDeleteGame = async (game: GameRecord) => {
    if (!code || !confirm(ui.confirmDelete(game.played_at, game.results.map((r) => r.player_name).join(', ')))) return
    setDeletingGameId(game.id)
    setError('')
    try {
      if (!(await deleteGroupGame(code, writePassphrase, game.id))) setError(ui.alreadyDeleted)
      if (editingGameId === game.id) resetForm()
      await refresh(code)
    } catch (err) {
      handleWriteError(err, setError)
    } finally {
      setDeletingGameId(null)
    }
  }

  const archetypes = useMemo(() => {
    const totals = new Map<string, { games: number; vp: number; wins: number }>()
    for (const game of games) {
      for (const result of game.results) {
        if (!result.archetype_id) continue
        const total = totals.get(result.archetype_id) ?? { games: 0, vp: 0, wins: 0 }
        total.games++
        total.vp += result.vp
        total.wins += result.game_win ? 1 : 0
        totals.set(result.archetype_id, total)
      }
    }
    return [...totals].sort((a, b) => b[1].wins - a[1].wins || b[1].vp - a[1].vp)
  }, [games])

  const exportGames = (format: 'csv' | 'txt') => {
    if (!group) return
    const rows = games.flatMap((game) =>
      game.results.map((result, seat, results) => ({
        date: game.played_at,
        notes: game.notes ?? '',
        seat: seat + 1,
        predator: results[(seat - 1 + results.length) % results.length]?.player_name ?? '',
        prey: results[(seat + 1) % results.length]?.player_name ?? '',
        player: result.player_name,
        deck: result.deck_name ?? '',
        archetype: archetypeLabel(result.archetype_id),
        vp: result.vp,
        gw: result.game_win ? 1 : 0,
      })),
    )
    const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'
    if (format === 'csv') {
      const keys = ['date', 'notes', 'seat', 'predator', 'prey', 'player', 'deck', 'archetype', 'vp', 'gw'] as const
      download(`${slug}-games.csv`, [keys.join(','), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))].join('\n'), 'text/csv;charset=utf-8')
    } else {
      const text = games.map((game) => [
        `${game.played_at}${game.notes ? ` — ${game.notes}` : ''}`,
        ...game.results.map((result, seat, results) =>
          `${seat + 1}. ${result.player_name} → ${results[(seat + 1) % results.length]?.player_name ?? ''} | ${result.deck_name ?? '—'} | ${archetypeLabel(result.archetype_id) || '—'} | ${result.vp} VP${result.game_win ? ' | GW' : ''}`),
      ].join('\n')).join('\n\n')
      download(`${slug}-games.txt`, text, 'text/plain;charset=utf-8')
    }
  }

  const showCreateJoinForms = joinedCodes.length === 0 || showJoinAnother
  const canWrite = Boolean(group && (!group.write_protected || writePassphrase))
  const updateRow = (index: number, patch: Partial<PlayerRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-2xl text-ink">{ui.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{ui.intro}</p>
      </div>

      {joinedCodes.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        {joinedCodes.map((joinedCode) => <button key={joinedCode} onClick={() => handleSwitch(joinedCode)} aria-pressed={joinedCode === code} className={'rounded-full border px-3 py-1 text-xs ' + (joinedCode === code ? 'border-blood bg-blood text-white' : 'border-line bg-surface text-ink-muted hover:text-ink')}>{joinedCode === code && group ? group.name : joinedCode}</button>)}
        <button onClick={() => setShowJoinAnother((value) => !value)} className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-dim hover:text-ink">{showJoinAnother ? ui.cancel : ui.joinAnother}</button>
      </div>}

      {error && <p className="text-sm text-blood-hi">{error}</p>}
      {showCreateJoinForms && <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.createGroup}</h2>
          <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={ui.groupExample} className="rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none" />
          <input type="password" autoComplete="new-password" value={createPassphrase} onChange={(e) => setCreatePassphrase(e.target.value)} placeholder={ui.writePassphraseOptional} className="rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none" />
          {createPassphrase && <input type="password" autoComplete="new-password" value={createPassphraseConfirm} onChange={(e) => setCreatePassphraseConfirm(e.target.value)} placeholder={ui.confirmPassphrase} className="rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none" />}
          <button onClick={handleCreate} disabled={busy || !createName.trim()} className="justify-self-start rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{ui.create}</button>
        </div>
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.joinGroup}</h2>
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder={ui.groupCode} className="rounded-lg border border-line bg-ground p-2 font-mono text-sm uppercase text-ink placeholder:normal-case focus:border-blood focus:outline-none" />
          <button onClick={() => void joinByCode(joinCode).then((joined) => joined && setJoinCode(''))} disabled={busy || !joinCode.trim()} className="justify-self-start rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted disabled:opacity-50">{ui.join}</button>
        </div>
      </div>}

      {code && group && <>
        <div className="flex flex-wrap items-center gap-3">
          <div><h2 className="font-display text-xl text-ink">{group.name}</h2><p className="mt-1 text-sm text-ink-muted">{ui.shareCode} <button onClick={() => void navigator.clipboard.writeText(group.code).then(() => { setCopyFeedback(ui.copied); setTimeout(() => setCopyFeedback(''), 1500) })} className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-xs text-ink">{group.code}</button> {copyFeedback && <span className="text-xs text-ink-dim">{copyFeedback}</span>}</p></div>
          <button onClick={handleLeave} className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-blood-hi">{ui.leaveGroup}</button>
        </div>
        {group.write_protected && !canWrite && <section className="grid gap-2 rounded-lg border border-gold/30 bg-gold/5 p-4">
          <h2 className="text-xs uppercase tracking-wide text-gold">{ui.editingLocked}</h2>
          <p className="text-sm text-ink-muted">{ui.editingLockedHelp}</p>
          <div className="flex flex-wrap gap-2">
            <input type="password" autoComplete="current-password" value={unlockInput} onChange={(e) => setUnlockInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlockEditing()} placeholder={ui.writePassphrase} className="min-w-[220px] flex-1 rounded-lg border border-line bg-ground p-2 text-sm text-ink" />
            <button onClick={unlockEditing} disabled={!unlockInput} className="rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{ui.unlockEditing}</button>
          </div>
        </section>}
        {group.write_protected && canWrite && <p className="text-xs text-gold">{ui.editingUnlocked}</p>}
        {loading && <p className="text-sm text-ink-dim">{ui.loading}</p>}

        <section className="grid gap-2 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.leaderboard}</h2>
          {leaderboard.length === 0 ? <p className="text-sm text-ink-dim">{ui.noGamesFirst}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-dim">{[ui.player, ui.games, ui.totalVp, ui.avgVp, ui.wins, ui.winRate].map((heading) => <th key={heading} className="py-1 pr-3">{heading}</th>)}</tr></thead><tbody>{leaderboard.map((entry) => <tr key={entry.player_name} className="border-t border-line"><td className="py-1 pr-3 text-ink">{entry.player_name}</td><td>{entry.games_played}</td><td>{entry.total_vp}</td><td>{entry.average_vp.toFixed(2)}</td><td>{entry.wins}</td><td>{(entry.win_rate * 100).toFixed(0)}%</td></tr>)}</tbody></table></div>}
        </section>

        {canWrite && <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{editingGameId ? ui.editGame : ui.logGame}</h2>
          <div className="flex flex-wrap gap-3"><label className="grid gap-1 text-xs text-ink-dim">{ui.datePlayed}<input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} className="rounded-lg border border-line bg-ground p-2 text-sm text-ink" /></label><label className="grid min-w-[200px] flex-1 gap-1 text-xs text-ink-dim">{ui.notes}<input value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-lg border border-line bg-ground p-2 text-sm text-ink" /></label></div>
          <div className="grid gap-2">{rows.map((row, index) => <div key={index} className="grid gap-2 rounded-lg border border-line/70 bg-ground p-2 sm:grid-cols-[auto_1fr_1fr_1fr_4rem_auto_auto] sm:items-center">
            <span className="text-xs font-semibold text-ink-dim">{ui.seat(index + 1)}</span>
            <input value={row.player_name} onChange={(e) => updateRow(index, { player_name: e.target.value })} placeholder={ui.playerName} className="min-w-0 rounded-lg border border-line bg-surface p-2 text-sm text-ink" />
            <input value={row.deck_name} onChange={(e) => updateRow(index, { deck_name: e.target.value })} placeholder={ui.deckOptional} className="min-w-0 rounded-lg border border-line bg-surface p-2 text-sm text-ink" />
            <select value={row.archetype_id} onChange={(e) => updateRow(index, { archetype_id: e.target.value })} aria-label={ui.archetype} className="min-w-0 rounded-lg border border-line bg-surface p-2 text-sm text-ink"><option value="">{ui.anyArchetype}</option>{ARCHETYPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            <input value={row.vp} onChange={(e) => updateRow(index, { vp: e.target.value })} placeholder="VP" inputMode="decimal" className="rounded-lg border border-line bg-surface p-2 text-sm text-ink" />
            <label className="flex items-center gap-1 text-xs text-ink-dim"><input type="checkbox" checked={row.game_win} onChange={(e) => updateRow(index, { game_win: e.target.checked })} />GW</label>
            <button onClick={() => setRows((current) => current.filter((_, i) => i !== index))} disabled={rows.length <= 1} aria-label={ui.removeRow(index + 1)} className="text-ink-dim hover:text-blood-hi disabled:opacity-30">×</button>
          </div>)}<button onClick={() => setRows((current) => [...current, emptyRow()])} className="justify-self-start rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted">{ui.addPlayer}</button></div>
          {logError && <p className="text-xs text-blood-hi">{logError}</p>}
          <div className="flex gap-2"><button onClick={handleLogGame} disabled={logBusy} className="rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{editingGameId ? ui.saveChanges : ui.logGame}</button>{editingGameId && <button onClick={resetForm} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted">{ui.cancel}</button>}</div>
        </section>}

        {archetypes.length > 0 && <section className="grid gap-2 rounded-lg border border-line bg-surface p-4"><h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.archetypePerformance}</h2><div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-dim"><th>{ui.archetype}</th><th>{ui.games}</th><th>{ui.avgVp}</th><th>{ui.wins}</th><th>{ui.winRate}</th></tr></thead><tbody>{archetypes.map(([id, total]) => <tr key={id} className="border-t border-line"><td className="py-1 text-ink">{archetypeLabel(id)}</td><td>{total.games}</td><td>{(total.vp / total.games).toFixed(2)}</td><td>{total.wins}</td><td>{(total.wins / total.games * 100).toFixed(0)}%</td></tr>)}</tbody></table></div></section>}

        <section className="grid gap-2 rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.recentGames}</h2>{games.length > 0 && <div className="ml-auto flex gap-2"><button onClick={() => exportGames('csv')} className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted">{ui.exportCsv}</button><button onClick={() => exportGames('txt')} className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted">{ui.exportText}</button></div>}</div>
          {games.length === 0 ? <p className="text-sm text-ink-dim">{ui.noGames}</p> : <div className="grid gap-3">{games.map((game) => <article key={game.id} className="rounded-lg border border-line bg-ground p-3">
            <div className="flex flex-wrap items-baseline gap-2 text-sm"><span className="font-semibold text-ink">{game.played_at}</span>{game.notes && <span className="text-ink-muted">{game.notes}</span>}{canWrite && <><button onClick={() => editGame(game)} className="ml-auto text-xs text-ink-dim hover:text-ink">{ui.edit}</button><button onClick={() => void handleDeleteGame(game)} disabled={deletingGameId === game.id} aria-label={ui.deleteAria(game.played_at)} className="text-xs text-ink-dim hover:text-blood-hi disabled:opacity-50">{deletingGameId === game.id ? ui.deleting : ui.delete}</button></>}</div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{game.results.map((result, seat, results) => <div key={seat} className={'rounded-lg border px-2 py-1.5 text-xs ' + (result.game_win ? 'border-blood bg-blood/10 text-blood-hi' : 'border-line text-ink-muted')}><div><strong>{ui.seat(seat + 1)} · {result.player_name}</strong> — {result.vp} VP{result.game_win ? ' 🏆' : ''}</div><div className="text-[11px] text-ink-dim">{ui.predator(results[(seat - 1 + results.length) % results.length]?.player_name ?? '—')} · {ui.prey(results[(seat + 1) % results.length]?.player_name ?? '—')}</div>{(result.deck_name || result.archetype_id) && <div className="text-[11px]">{result.deck_name ?? '—'}{result.archetype_id ? ` · ${archetypeLabel(result.archetype_id)}` : ''}</div>}</div>)}</div>
          </article>)}</div>}
        </section>
      </>}
    </div>
  )
}
