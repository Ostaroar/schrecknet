// Floating Ko-fi support button. Fixed to the viewport so it follows along
// while scrolling long result lists, rather than only living in the footer.
// The motion is purely decorative — an idle bob plus rising steam, both
// switched off under prefers-reduced-motion (see index.css). Collapsed it is a
// 44px circle (comfortably above the 40px coarse-pointer target rule); hovering
// or focusing expands it to reveal the localized label.

function CupIcon() {
  return (
    <svg viewBox="0 0 26 24" className="size-6 shrink-0" aria-hidden="true" focusable="false">
      {/* steam — three staggered wisps, animated in index.css */}
      <g className="kofi-steam" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path className="kofi-steam-1" d="M7.5 6.4c0-1.2 1.2-1.6 1.2-2.8" />
        <path className="kofi-steam-2" d="M11.2 6.4c0-1.2 1.2-1.6 1.2-2.8" />
        <path className="kofi-steam-3" d="M14.9 6.4c0-1.2 1.2-1.6 1.2-2.8" />
      </g>
      {/* cup body */}
      <path d="M3 9.5h15v5.8a4.7 4.7 0 0 1-4.7 4.7H7.7A4.7 4.7 0 0 1 3 15.3V9.5Z" fill="currentColor" />
      {/* handle */}
      <path
        d="M18 11h1.8a2.9 2.9 0 0 1 0 5.8H18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* heart on the cup, in the page background colour so it reads as a cut-out */}
      <path
        d="M10.5 17.4c-2-1.3-3.2-2.4-3.2-3.6a1.7 1.7 0 0 1 3.2-.8 1.7 1.7 0 0 1 3.2.8c0 1.2-1.2 2.3-3.2 3.6Z"
        fill="var(--color-ground)"
      />
    </svg>
  )
}

export default function KofiButton({ label }: { label: string }) {
  return (
    <a
      href="https://ko-fi.com/jannikostertag"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="kofi-float group fixed bottom-4 right-4 z-40 flex min-h-11 items-center gap-0 rounded-full border border-line bg-surface/90 p-2.5 text-blood-hi shadow-[0_4px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-[gap,border-color,color,box-shadow] duration-300 hover:border-blood hover:gap-2 hover:text-ink hover:shadow-[0_4px_26px_rgba(179,46,64,0.45)] focus-visible:gap-2 focus-visible:border-blood focus-visible:outline-none sm:bottom-6 sm:right-6 print:hidden"
    >
      <CupIcon />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wider opacity-0 transition-[max-width,opacity] duration-300 group-hover:max-w-[14rem] group-hover:pr-1 group-hover:opacity-100 group-focus-visible:max-w-[14rem] group-focus-visible:pr-1 group-focus-visible:opacity-100">
        {label}
      </span>
    </a>
  )
}
