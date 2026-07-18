import { useEffect, useRef, useState } from 'react'
import { quickSearch, type QuickHit } from '../lib/quickSearch'
import { navigate } from '../lib/route'

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [hits, setHits] = useState<QuickHit[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setText('')
      setHits([])
      setSelected(0)
      // focus after the overlay renders
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    quickSearch(text).then((h) => {
      if (!cancelled) {
        setHits(h)
        setSelected(0)
      }
    })
    return () => {
      cancelled = true
    }
  }, [text])

  const go = (hit: QuickHit) => {
    setOpen(false)
    navigate({ page: 'card', id: hit.id })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid justify-items-center bg-black/60 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="h-fit w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="w-full border-b border-line-soft bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          placeholder="Search any card by name…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(s + 1, hits.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter' && hits[selected]) {
              go(hits[selected])
            }
          }}
        />
        <ul className="max-h-72 overflow-y-auto">
          {hits.map((h, i) => (
            <li key={h.id}>
              <button
                onClick={() => go(h)}
                onMouseEnter={() => setSelected(i)}
                className={
                  'flex w-full items-center gap-3 px-4 py-2 text-left text-sm ' +
                  (i === selected ? 'bg-raised text-ink' : 'text-ink-muted')
                }
              >
                <span className="truncate">{h.name}</span>
                <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-ink-dim">
                  {h.kind === 'crypt' ? `${h.clan ?? ''} · cap ${h.capacity ?? '?'}` : 'library'}
                </span>
              </button>
            </li>
          ))}
          {text.trim() && hits.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-dim">No cards named “{text.trim()}”.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
