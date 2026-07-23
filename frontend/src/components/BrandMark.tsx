// SchreckNet brand sigil: a geometric bat in the blood gradient, drawn as a
// single filled path so it stays crisp at 16px (favicon) and 40px (header).
// Kept in sync by hand with frontend/public/icon.svg — change both together.

export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-blood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e05666" />
          <stop offset="55%" stopColor="#b32e40" />
          <stop offset="100%" stopColor="#7d1c2b" />
        </linearGradient>
      </defs>
      <path
        d="M24 34
           C22 29 19 28 15.5 30
           C15 25 11 23 5 24
           C9.5 19 15 17 20 18.5
           L21.5 12.5
           L24 16
           L26.5 12.5
           L28 18.5
           C33 17 38.5 19 43 24
           C37 23 33 25 32.5 30
           C29 28 26 29 24 34 Z"
        fill="url(#brand-blood)"
        stroke="#e56575"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}
