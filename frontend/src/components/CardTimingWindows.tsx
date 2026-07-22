import { useEffect, useState } from 'react'
import { describeHook, getTimingWindowsForCard } from '../lib/cardTiming'
import { loadGameLoop, type GameLoop, type GameLoopHook } from '../lib/gameLoop'
import { navigate } from '../lib/route'

export default function CardTimingWindows({ types }: { types: string[] }) {
  const [gameLoop, setGameLoop] = useState<GameLoop | null>(null)

  useEffect(() => {
    let active = true
    loadGameLoop()
      .then((value) => {
        if (active) setGameLoop(value)
      })
      .catch(() => {
        // Rules reference is additive; a load failure here shouldn't block the card page.
      })
    return () => {
      active = false
    }
  }, [])

  if (!gameLoop) return null

  const windows: GameLoopHook[] = getTimingWindowsForCard(gameLoop, types)
  if (windows.length === 0) return null

  return (
    <section className="grid gap-2 text-sm">
      <h2 className="text-xs uppercase tracking-wide text-ink-dim">When can I play this?</h2>
      <ul className="grid gap-1.5 text-ink-muted">
        {windows.map((hook) => (
          <li key={hook.id} className="rounded-lg border border-line bg-surface px-3 py-2">
            {describeHook(hook)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => navigate({ page: 'rules' })}
        className="justify-self-start text-xs text-blood-hi underline"
      >
        See the full rules reference →
      </button>
    </section>
  )
}
