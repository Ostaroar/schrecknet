import { useEffect, useState } from 'react'
import { searchCrypt, emptyCryptFilters } from '../lib/cryptSearch'
import { searchLibrary, emptyLibraryFilters } from '../lib/librarySearch'

export default function AddCardBox({
  kind,
  onAdd,
}: {
  kind: 'crypt' | 'library'
  onAdd: (cardId: number) => void | Promise<void>
}) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<{ id: number; name: string; sub: string }[]>([])

  useEffect(() => {
    if (!text.trim()) {
      setResults([])
      return
    }
    if (kind === 'crypt') {
      searchCrypt({ ...emptyCryptFilters, text }).then((rows) =>
        setResults(rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name, sub: `${r.clan} · cap ${r.capacity}` }))),
      )
    } else {
      searchLibrary({ ...emptyLibraryFilters, text }).then((rows) =>
        setResults(rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name, sub: r.types.join(' / ') }))),
      )
    }
  }, [text, kind])

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <input
        className="min-w-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
        placeholder={`Add ${kind} card by name…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {results.length > 0 && (
        <div className="grid gap-1 rounded-lg border border-line-soft bg-ground p-1.5">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={async () => {
                await onAdd(r.id)
                setText('')
                setResults([])
              }}
              className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-raised"
            >
              <span className="flex-1 truncate text-ink">{r.name}</span>
              <span className="shrink-0 text-ink-dim">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
