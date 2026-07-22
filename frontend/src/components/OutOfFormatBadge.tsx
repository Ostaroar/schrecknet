export default function OutOfFormatBadge({ legal }: { legal: boolean }) {
  if (legal) return null
  return (
    <span
      title="Not legal in the active limited format"
      className="inline-flex items-center gap-1 rounded-full border border-blood/40 bg-blood/10 px-1.5 py-0.5 text-[10px] font-semibold text-blood-hi"
    >
      Out of format
    </span>
  )
}
