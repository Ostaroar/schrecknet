import { useEffect, useId, useState } from 'react'

interface CardImagePreviewProps {
  imageUrl: string | null
  name: string
}

export default function CardImagePreview({ imageUrl, name }: CardImagePreviewProps) {
  const [open, setOpen] = useState(false)
  const previewId = useId()

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  if (!imageUrl) return null

  return (
    <span className="group/image relative flex shrink-0 items-center" onBlur={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`Preview image for ${name}`}
        aria-expanded={open}
        aria-controls={previewId}
        title="Preview card image"
        onClick={() => setOpen((visible) => !visible)}
        className="grid size-8 place-items-center rounded-lg border border-transparent text-base text-ink-dim hover:border-line hover:bg-raised hover:text-ink focus:border-blood focus:outline-none"
      >
        <span aria-hidden="true">▧</span>
      </button>
      <span
        id={previewId}
        role="tooltip"
        className={
          'fixed left-1/2 top-1/2 z-50 w-[min(78vw,280px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-ground p-1.5 shadow-2xl md:absolute md:left-auto md:right-0 md:top-full md:w-64 md:translate-x-0 md:translate-y-1 ' +
          (open ? 'block' : 'hidden md:group-hover/image:block')
        }
      >
        <img
          src={imageUrl}
          alt={`${name} card`}
          loading="lazy"
          className="w-full rounded-lg"
        />
      </span>
    </span>
  )
}
