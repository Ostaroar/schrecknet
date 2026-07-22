export default function OwnedBadge({ qty }: { qty: number }) {
  if (qty <= 0) return null
  return (
    <span
      title={`You own ${qty}`}
      className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold"
    >
      Owned {qty}
    </span>
  )
}
