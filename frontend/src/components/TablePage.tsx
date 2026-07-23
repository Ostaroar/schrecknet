// Private playgroup tracker + leaderboard (docs/game-groups-plan.md). No
// accounts: a group is identified by a random shareable code, persisted in
// localStorage on this device — a player can join more than one group. Not
// yet localized (deferred to G4) — every other page in this app goes through
// lib/i18n.ts, this one doesn't yet.
import { useEffect, useState } from 'react'
import {
  addStoredGroupCode,
  createGameGroup,
  deleteGroupGame,
  getActiveGroupCode,
  getGameGroup,
  getGroupLeaderboard,
  getStoredGroupCodes,
  listGroupGames,
  logGroupGame,
  removeStoredGroupCode,
  setActiveGroupCode,
  type GameRecord,
  type GroupInfo,
  type LeaderboardEntry,
  type PlayerResult,
} from '../lib/gameGroups'

type PlayerRow = { player_name: string; deck_name: string; vp: string; game_win: boolean }

const emptyRow = (): PlayerRow => ({ player_name: '', deck_name: '', vp: '', game_win: false })
const emptyRows = (): PlayerRow[] => [emptyRow(), emptyRow(), emptyRow(), emptyRow()]
const todayIso = (): string => new Date().toISOString().slice(0, 10)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function TablePage() {
  const [joinedCodes, setJoinedCodes] = useState<string[]>(() => getStoredGroupCodes())
  const [code, setCode] = useState<string | null>(() => getActiveGroupCode())
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [createName, setCreateName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [showJoinAnother, setShowJoinAnother] = useState(false)

  const [playedAt, setPlayedAt] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<PlayerRow[]>(emptyRows())
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
        setError("That group code doesn't exist anymore.")
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
    if (code) refresh(code)
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
        setError('No group has that code.')
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
    setBusy(true)
    setError('')
    try {
      const info = await createGameGroup(createName.trim())
      addStoredGroupCode(info.code)
      setJoinedCodes(getStoredGroupCodes())
      setCreateName('')
      setCode(info.code)
      setShowJoinAnother(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (await joinByCode(joinCode)) setJoinCode('')
  }

  const handleSwitch = (nextCode: string) => {
    setActiveGroupCode(nextCode)
    setCode(nextCode)
  }

  const handleLeave = () => {
    if (!code) return
    if (!confirm(`Leave ${group?.name ?? 'this group'}? You can rejoin later with its code.`)) return
    removeStoredGroupCode(code)
    setJoinedCodes(getStoredGroupCodes())
    setCode(getActiveGroupCode())
    setGroup(null)
    setLeaderboard([])
    setGames([])
  }

  const updateRow = (index: number, patch: Partial<PlayerRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addRow = () => setRows((current) => [...current, emptyRow()])
  const removeRow = (index: number) => setRows((current) => current.filter((_, i) => i !== index))

  const handleLogGame = async () => {
    if (!code) return
    const filled = rows.filter((row) => row.player_name.trim())
    if (filled.length === 0) {
      setLogError('Add at least one player.')
      return
    }
    const results: PlayerResult[] = []
    for (const row of filled) {
      const vp = Number(row.vp)
      if (row.vp.trim() === '' || Number.isNaN(vp) || vp < 0) {
        setLogError(`${row.player_name}: VP must be a non-negative number.`)
        return
      }
      results.push({
        player_name: row.player_name.trim(),
        deck_name: row.deck_name.trim() || null,
        vp,
        game_win: row.game_win,
      })
    }
    setLogBusy(true)
    setLogError('')
    try {
      const logged = await logGroupGame(code, {
        played_at: playedAt,
        notes: notes.trim() || null,
        results,
      })
      if (!logged) {
        setLogError("That group code doesn't exist anymore.")
        return
      }
      setRows(emptyRows())
      setNotes('')
      setPlayedAt(todayIso())
      await refresh(code)
    } catch (err) {
      setLogError(errorMessage(err))
    } finally {
      setLogBusy(false)
    }
  }

  const handleDeleteGame = async (game: GameRecord) => {
    if (!code) return
    const players = game.results.map((r) => r.player_name).join(', ')
    const confirmed = confirm(
      `Delete the ${game.played_at} game (${players})? This removes it from the leaderboard ` +
        `permanently and can't be undone.`,
    )
    if (!confirmed) return
    setDeletingGameId(game.id)
    setError('')
    try {
      const deleted = await deleteGroupGame(code, game.id)
      if (!deleted) {
        setError('That game was already deleted.')
      }
      await refresh(code)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDeletingGameId(null)
    }
  }

  const copyCode = async () => {
    if (!group) return
    try {
      await navigator.clipboard.writeText(group.code)
      setCopyFeedback('Copied!')
      setTimeout(() => setCopyFeedback(''), 1500)
    } catch {
      setCopyFeedback(group.code)
    }
  }

  const showCreateJoinForms = joinedCodes.length === 0 || showJoinAnother

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Table</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Track games with your regular playgroup and keep a shared leaderboard — no account
          needed. Create a group and share its code with your friends, or join with a code
          someone gave you. You can join more than one group.
        </p>
      </div>

      {joinedCodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {joinedCodes.map((joinedCode) => (
            <button
              key={joinedCode}
              onClick={() => handleSwitch(joinedCode)}
              aria-pressed={joinedCode === code}
              className={
                'rounded-full border px-3 py-1 text-xs ' +
                (joinedCode === code
                  ? 'border-blood bg-blood text-white'
                  : 'border-line bg-surface text-ink-muted hover:text-ink')
              }
            >
              {joinedCode === code && group ? group.name : joinedCode}
            </button>
          ))}
          <button
            onClick={() => setShowJoinAnother((v) => !v)}
            className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-dim hover:text-ink"
          >
            {showJoinAnother ? 'Cancel' : '+ Join another'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-blood-hi">{error}</p>}

      {showCreateJoinForms && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Create a group</h2>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Thursday Night Coterie"
              className="rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={busy || !createName.trim()}
              className="justify-self-start rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
            >
              Create
            </button>
          </div>

          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Join a group</h2>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Group code"
              className="rounded-lg border border-line bg-ground p-2 font-mono text-sm uppercase text-ink placeholder:text-ink-dim placeholder:normal-case focus:border-blood focus:outline-none"
            />
            <button
              onClick={handleJoin}
              disabled={busy || !joinCode.trim()}
              className="justify-self-start rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </div>
      )}

      {code && group && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="font-display text-xl text-ink">{group.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Share this code so your group can log games or check the board:{' '}
                <button
                  onClick={copyCode}
                  className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-xs text-ink hover:text-blood-hi"
                >
                  {group.code}
                </button>{' '}
                {copyFeedback && <span className="text-xs text-ink-dim">{copyFeedback}</span>}
              </p>
            </div>
            <button
              onClick={handleLeave}
              className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-blood-hi"
            >
              Leave group
            </button>
          </div>

          {loading && <p className="text-sm text-ink-dim">Loading…</p>}

          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-ink-dim">No games logged yet — log your first game below.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-dim">
                      <th className="py-1 pr-3">Player</th>
                      <th className="py-1 pr-3">Games</th>
                      <th className="py-1 pr-3">Total VP</th>
                      <th className="py-1 pr-3">Avg VP</th>
                      <th className="py-1 pr-3">Wins</th>
                      <th className="py-1 pr-3">Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry) => (
                      <tr key={entry.player_name} className="border-t border-line">
                        <td className="py-1 pr-3 text-ink">{entry.player_name}</td>
                        <td className="py-1 pr-3 text-ink-muted">{entry.games_played}</td>
                        <td className="py-1 pr-3 text-ink-muted">{entry.total_vp}</td>
                        <td className="py-1 pr-3 text-ink-muted">{entry.average_vp.toFixed(2)}</td>
                        <td className="py-1 pr-3 text-ink-muted">{entry.wins}</td>
                        <td className="py-1 pr-3 text-ink-muted">
                          {(entry.win_rate * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Log a game</h2>
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-1 text-xs text-ink-dim">
                Date played
                <input
                  type="date"
                  value={playedAt}
                  onChange={(e) => setPlayedAt(e.target.value)}
                  className="rounded-lg border border-line bg-ground p-2 text-sm text-ink focus:border-blood focus:outline-none"
                />
              </label>
              <label className="grid min-w-[200px] flex-1 gap-1 text-xs text-ink-dim">
                Notes (optional)
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
                />
              </label>
            </div>

            <div className="grid gap-2">
              {rows.map((row, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    value={row.player_name}
                    onChange={(e) => updateRow(index, { player_name: e.target.value })}
                    placeholder="Player name"
                    className="min-w-[120px] flex-1 rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
                  />
                  <input
                    value={row.deck_name}
                    onChange={(e) => updateRow(index, { deck_name: e.target.value })}
                    placeholder="Deck (optional)"
                    className="min-w-[120px] flex-1 rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
                  />
                  <input
                    value={row.vp}
                    onChange={(e) => updateRow(index, { vp: e.target.value })}
                    placeholder="VP"
                    inputMode="decimal"
                    className="w-16 rounded-lg border border-line bg-ground p-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
                  />
                  <label className="flex items-center gap-1 text-xs text-ink-dim">
                    <input
                      type="checkbox"
                      checked={row.game_win}
                      onChange={(e) => updateRow(index, { game_win: e.target.checked })}
                    />
                    GW
                  </label>
                  <button
                    onClick={() => removeRow(index)}
                    disabled={rows.length <= 1}
                    aria-label={`Remove player row ${index + 1}`}
                    className="text-ink-dim hover:text-blood-hi disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={addRow}
                className="justify-self-start rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
              >
                + Add player
              </button>
            </div>

            {logError && <p className="text-xs text-blood-hi">{logError}</p>}
            <button
              onClick={handleLogGame}
              disabled={logBusy}
              className="justify-self-start rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
            >
              Log game
            </button>
          </div>

          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Recent games</h2>
            {games.length === 0 ? (
              <p className="text-sm text-ink-dim">No games logged yet.</p>
            ) : (
              <div className="grid gap-3">
                {games.map((game) => (
                  <div key={game.id} className="rounded-lg border border-line bg-ground p-3">
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-semibold text-ink">{game.played_at}</span>
                      {game.notes && <span className="text-ink-muted">{game.notes}</span>}
                      <button
                        onClick={() => handleDeleteGame(game)}
                        disabled={deletingGameId === game.id}
                        aria-label={`Delete the ${game.played_at} game`}
                        className="ml-auto text-xs text-ink-dim hover:text-blood-hi disabled:opacity-50"
                      >
                        {deletingGameId === game.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {game.results.map((result, i) => (
                        <span
                          key={i}
                          className={
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ' +
                            (result.game_win
                              ? 'border-blood bg-blood/10 text-blood-hi'
                              : 'border-line text-ink-muted')
                          }
                        >
                          {result.player_name}
                          {result.deck_name ? ` (${result.deck_name})` : ''} — {result.vp} VP
                          {result.game_win ? ' 🏆' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
