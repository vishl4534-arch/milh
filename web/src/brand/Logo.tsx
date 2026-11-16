import { useId } from 'react'

// The Milh mark: a water drop with a sprout cut out of it, growing from a salt crystal ("milh" is Arabic
// for salt): salty water, turned into growth. The wordmark is drawn, not typed, so it looks the same
// offline and on every device; the dot of the "i" is the same salt crystal.
// Keep in step with web/public/{favicon,milh,milh-logo}.svg.

const BRAND = { green: '#1F5C45', sand: '#EAD9B5', gold: '#F6B73C' }

const DROP = 'M50 3 C58 16 90 46 90 78 A40 40 0 0 1 10 78 C10 46 42 16 50 3 Z'
const STEM = 'M50 97 V70'
const LEAF_L = 'M48.5 72 C40 75 27 73 22.5 64 C20.5 60 20.5 56 21 53 C34 52 46 58 48.5 72 Z'
const LEAF_R = 'M51.5 70 C51 56 60 45 77 43 C78 47.5 78 53 76 57.5 C72 66.5 63 70.5 51.5 70 Z'
const CRYSTAL = 'M50 88.5 L59.5 98 L50 107.5 L40.5 98 Z'

// "milh" on a 228 × 112 grid: 20-unit round strokes, baseline at y 100, x-height 62, ascender 28.
const LETTERS = [
  'M10 100 V62', 'M10 80 C10 68 16 62 27 62 C38 62 44 68 44 80 V100', 'M44 80 C44 68 50 62 61 62 C72 62 78 68 78 80 V100',
  'M113 100 V62', 'M148 100 V28', 'M183 100 V28', 'M183 80 C183 68 189 62 200 62 C211 62 217 68 217 80 V100',
]
const DOT = 'M113 17.5 L125.5 30 L113 42.5 L100.5 30 Z'

function MarkShapes({ color, id }: { color: string; id: string }) {
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="120">
        <rect width="100" height="120" fill="#fff" />
        <path d={STEM} stroke="#000" strokeWidth="6.5" />
        <path d={LEAF_L} fill="#000" />
        <path d={LEAF_R} fill="#000" />
      </mask>
      <path d={DROP} fill={color} mask={`url(#${id})`} />
      <path d={CRYSTAL} fill={BRAND.gold} stroke={BRAND.gold} strokeWidth="2.5" strokeLinejoin="round" />
    </>
  )
}

interface Props {
  className?: string
  /** colour of the drop and the letters; the crystal is always gold */
  color?: string
  label?: string
}

/** The drop alone: icons, small spaces, loading states. */
export function MilhMark({ className = '', color = BRAND.green, label }: Props) {
  const id = `milh-cut-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 100 120" className={className} role={label ? 'img' : undefined} aria-label={label}
      aria-hidden={label ? undefined : true}>
      <MarkShapes color={color} id={id} />
    </svg>
  )
}

/** The full logo: the drop and "milh". */
export function MilhLogo({ className = '', color = BRAND.green, label = 'Milh' }: Props) {
  const id = `milh-cut-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 300 120" className={className} role="img" aria-label={label}>
      <MarkShapes color={color} id={id} />
      <g transform="translate(100 9) scale(0.87)">
        <g fill="none" stroke={color} strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
          {LETTERS.map((d) => <path key={d} d={d} />)}
        </g>
        <path d={DOT} fill={BRAND.gold} stroke={BRAND.gold} strokeWidth="3" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
