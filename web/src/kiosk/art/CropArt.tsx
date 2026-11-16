// Hand-drawn crops for the tablet: a worker who cannot read the crop name still recognises the plant.
// Pure SVG, so it is crisp on any screen, tiny, and works offline.

interface Props {
  crop: string
  className?: string
  sway?: boolean
  label?: string
}

function Mound() {
  return (
    <g>
      <ellipse cx="60" cy="128" rx="50" ry="10" fill="#8a6440" />
      <ellipse cx="60" cy="125" rx="44" ry="7" fill="#a47a52" />
    </g>
  )
}

function Tomato() {
  return (
    <g>
      <path d="M60 126 C58 100 62 80 58 52" stroke="#3f7d4f" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M59 96 C44 92 36 82 34 70 C46 72 56 80 59 92Z" fill="#4f9d69" />
      <path d="M60 80 C76 76 86 66 88 54 C74 56 64 64 60 76Z" fill="#5fae78" />
      <path d="M58 60 C48 52 44 42 46 30 C56 36 60 46 59 58Z" fill="#4f9d69" />
      <path d="M60 104 C74 102 84 96 90 86 C76 86 66 92 60 100Z" fill="#3f8c5a" />
      <circle cx="42" cy="104" r="11" fill="#e2483d" />
      <circle cx="78" cy="70" r="10" fill="#e2483d" />
      <circle cx="74" cy="104" r="9" fill="#f07a3a" />
      <circle cx="38" cy="100" r="3" fill="#fff" opacity="0.55" />
      <circle cx="75" cy="66" r="2.6" fill="#fff" opacity="0.55" />
      <path d="M42 93 l-4 -3 M42 93 l4 -3 M42 93 v-4" stroke="#3f7d4f" strokeWidth="2" strokeLinecap="round" />
    </g>
  )
}

function DatePalm() {
  return (
    <g>
      <path d="M56 126 C55 104 58 82 60 52 L66 52 C66 82 66 104 66 126Z" fill="#9a6b3f" />
      {[60, 70, 80, 90, 100, 110].map((y) => (
        <path key={y} d={`M56 ${y} L66 ${y - 4}`} stroke="#7d5330" strokeWidth="2" />
      ))}
      <g fill="#3f8c5a">
        <path d="M63 50 C46 38 28 40 14 54 C32 48 48 50 63 54Z" />
        <path d="M63 50 C80 38 98 40 110 56 C92 48 78 50 63 54Z" />
        <path d="M63 48 C54 30 40 20 22 20 C40 30 52 40 62 52Z" fill="#4f9d69" />
        <path d="M63 48 C72 30 86 20 102 22 C86 30 74 40 64 52Z" fill="#4f9d69" />
        <path d="M63 48 C62 32 66 18 74 8 C70 24 68 36 65 50Z" fill="#5fae78" />
      </g>
      <g fill="#c26a2c">
        <circle cx="56" cy="60" r="4" /><circle cx="60" cy="64" r="4" /><circle cx="54" cy="66" r="3.5" />
        <circle cx="70" cy="60" r="4" /><circle cx="73" cy="65" r="3.5" />
      </g>
    </g>
  )
}

function Cucumber() {
  return (
    <g>
      <path d="M30 126 V40 M90 126 V40 M30 60 H90 M30 90 H90" stroke="#b08a5a" strokeWidth="3" />
      <path d="M58 126 C50 108 70 96 56 80 C44 66 72 56 60 40" stroke="#3f7d4f" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M57 104 C42 104 36 94 36 86 C48 86 56 94 57 102Z" fill="#4f9d69" />
      <path d="M60 70 C76 70 84 60 84 52 C72 52 62 60 60 68Z" fill="#5fae78" />
      <path d="M60 46 C48 44 42 36 42 28 C52 30 58 36 60 44Z" fill="#4f9d69" />
      <rect x="66" y="84" width="9" height="30" rx="4.5" fill="#3d8b45" transform="rotate(-12 70 99)" />
      <rect x="44" y="56" width="8" height="24" rx="4" fill="#3d8b45" transform="rotate(14 48 68)" />
      <g fill="#f6c443"><circle cx="76" cy="44" r="4" /><circle cx="80" cy="48" r="4" /><circle cx="72" cy="48" r="4" /></g>
      <circle cx="76" cy="47" r="2" fill="#e89a1c" />
    </g>
  )
}

function Barley() {
  return (
    <g>
      {[-18, -6, 6, 18].map((dx, i) => (
        <g key={dx} transform={`translate(${dx} 0) rotate(${dx / 3} 60 126)`}>
          <path d="M60 126 V50" stroke="#c49a3a" strokeWidth="3" />
          {[0, 1, 2, 3, 4].map((k) => (
            <ellipse key={k} cx={k % 2 ? 64 : 56} cy={58 - k * 2 + (i % 2) * 4} rx="4" ry="7" fill="#e3b94f"
              transform={`translate(0 ${k * 6})`} />
          ))}
        </g>
      ))}
    </g>
  )
}

function Pepper() {
  return (
    <g>
      <path d="M60 126 C60 100 58 80 60 56" stroke="#3f7d4f" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M60 98 C44 96 36 86 36 76 C48 78 58 86 60 96Z" fill="#4f9d69" />
      <path d="M60 78 C76 76 84 66 84 56 C72 58 62 66 60 76Z" fill="#5fae78" />
      <path d="M44 100 C40 116 50 122 54 112 C56 104 50 98 44 100Z" fill="#d93a2f" />
      <path d="M74 82 C72 98 82 104 86 94 C88 86 80 80 74 82Z" fill="#3d8b45" />
    </g>
  )
}

function Alfalfa() {
  return (
    <g>
      {[30, 46, 62, 78, 92].map((x, i) => (
        <g key={x}>
          <path d={`M${x} 126 C${x - 4} 104 ${x + 4} 92 ${x} 76`} stroke="#3f7d4f" strokeWidth="3" fill="none" />
          <circle cx={x - 5} cy={96 - (i % 2) * 6} r="6" fill="#5fae78" />
          <circle cx={x + 5} cy={88 - (i % 2) * 6} r="6" fill="#4f9d69" />
          <circle cx={x} cy={74} r="5" fill="#9b6bc7" />
        </g>
      ))}
    </g>
  )
}

function Sprout() {
  return (
    <g>
      <path d="M60 126 V80" stroke="#3f7d4f" strokeWidth="5" strokeLinecap="round" />
      <path d="M60 92 C44 92 34 80 34 66 C50 68 60 78 60 90Z" fill="#4f9d69" />
      <path d="M60 84 C76 84 86 72 86 58 C70 60 60 70 60 82Z" fill="#5fae78" />
    </g>
  )
}

const PLANTS: Record<string, () => React.JSX.Element> = {
  tomato: Tomato, date_palm: DatePalm, cucumber: Cucumber, barley: Barley, sweet_pepper: Pepper, alfalfa: Alfalfa,
}

export function CropArt({ crop, className = '', sway = false, label }: Props) {
  const Plant = PLANTS[crop] ?? Sprout
  return (
    <svg viewBox="0 0 120 140" className={className} role={label ? 'img' : undefined} aria-label={label}
      aria-hidden={label ? undefined : true}>
      <Mound />
      <g className={sway ? 'sway' : undefined}>
        <Plant />
      </g>
    </svg>
  )
}
