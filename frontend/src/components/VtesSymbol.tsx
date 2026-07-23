import {
  cardTypeSymbol,
  disciplineSymbol,
  type CardTextSegment,
} from '../lib/cardText'

type SymbolSegment = Exclude<CardTextSegment, { kind: 'text' }>

function symbolLabel(segment: SymbolSegment): string {
  if (segment.kind === 'card-type') return `${segment.label} symbol`
  return `${segment.superior ? 'Superior ' : ''}${segment.label} symbol`
}

export function VtesSymbol({
  segment,
  className = 'size-[1.2em]',
  decorative = false,
  cardTextToken,
}: {
  segment: SymbolSegment
  className?: string
  decorative?: boolean
  cardTextToken?: string
}) {
  const label = symbolLabel(segment)
  const source =
    segment.kind === 'card-type'
      ? `/images/types/${segment.asset}.svg`
      : `/images/disciplines/${segment.asset}${segment.superior ? 'sup' : ''}.svg`

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : label}
      title={decorative ? undefined : label}
      data-card-text-symbol={cardTextToken}
      data-vtes-symbol={segment.token}
      data-symbol-kind={segment.kind}
      data-symbol-src={source}
      className={`inline-flex shrink-0 ${className}`}
    >
      <img aria-hidden="true" src={source} alt="" className="size-full object-contain" />
    </span>
  )
}

export function DisciplineSymbol({
  code,
  superior = false,
  className,
  decorative = false,
}: {
  code: string
  superior?: boolean
  className?: string
  decorative?: boolean
}) {
  const segment = disciplineSymbol(code, superior)
  return segment ? (
    <VtesSymbol segment={segment} className={className} decorative={decorative} />
  ) : null
}

const CLAN_ASSETS: Record<string, string> = {
  'banu haqim': 'banuhaqim',
  brujah: 'brujah',
  gangrel: 'gangrel',
  'gangrel antitribu': 'gangrelantitribu',
  hecata: 'hecata',
  lasombra: 'lasombra',
  malkavian: 'malkavian',
  ministry: 'ministry',
  nosferatu: 'nosferatu',
  ravnos: 'ravnos',
  salubri: 'salubri',
  toreador: 'toreador',
  'toreador antitribu': 'toreadorantitribu',
  tremere: 'tremere',
  'tremere antitribu': 'tremereantitribu',
  tzimisce: 'tzimisce',
  ventrue: 'ventrue',
}

const PATH_ASSETS: Record<string, string> = {
  'Path of Caine': 'caine',
  'Path of Cathari': 'cathari',
  'Path of Death and the Soul': 'death',
  'Path of Power and the Inner Voice': 'power',
  Caine: 'caine',
  Cathari: 'cathari',
  'Death and the Soul': 'death',
  'Power and the Inner Voice': 'power',
}

function NamedSymbol({
  source,
  label,
  className = 'size-4',
}: {
  source: string | undefined
  label: string
  className?: string
}) {
  if (!source) return null
  return (
    <span role="img" aria-label={`${label} symbol`} title={label} className={`inline-flex shrink-0 ${className}`}>
      <img aria-hidden="true" src={source} alt="" className="size-full object-contain" />
    </span>
  )
}

export function ClanSymbol({ clan, className }: { clan: string; className?: string }) {
  const asset = CLAN_ASSETS[clan.trim().toLowerCase()]
  return <NamedSymbol source={asset && `/images/clans/${asset}.svg`} label={clan} className={className} />
}

export function PathSymbol({ path, className }: { path: string | null; className?: string }) {
  if (!path) return null
  const asset = PATH_ASSETS[path]
  return <NamedSymbol source={asset && `/images/paths/${asset}.svg`} label={path} className={className} />
}

export function CardTypeSymbol({
  type,
  className,
  decorative = false,
}: {
  type: string
  className?: string
  decorative?: boolean
}) {
  const segment = cardTypeSymbol(type)
  return segment ? (
    <VtesSymbol segment={segment} className={className} decorative={decorative} />
  ) : null
}

export function DisciplineBadge({
  code,
  superior = false,
  compact = false,
}: {
  code: string
  superior?: boolean
  compact?: boolean
}) {
  return (
    <span
      className={
        'inline-flex items-center rounded font-mono font-bold uppercase tracking-wide ' +
        (compact ? 'h-[19px] gap-0.5 px-1 text-[9px] ' : 'h-6 gap-1 px-1.5 text-[10px] ') +
        (superior ? 'bg-gold/15 text-gold' : 'border border-line text-ink-muted')
      }
    >
      <DisciplineSymbol code={code} superior={superior} className={compact ? 'size-3.5' : 'size-4'} />
      {code}
    </span>
  )
}

export function CardTypeSummary({
  types,
  className = '',
}: {
  types: string[]
  className?: string
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden="true">
        {types.map((type) => (
          <CardTypeSymbol key={type} type={type} className="size-4" decorative />
        ))}
      </span>
      <span className="truncate">{types.join(' / ')}</span>
    </span>
  )
}
