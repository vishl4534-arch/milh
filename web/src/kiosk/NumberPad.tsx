interface Props {
  value: string
  onChange: (v: string) => void
  max: number
  decimals?: number
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']

/** Large keypad: no typing or reading needed beyond digits. Rejects keys that would break the limits. */
export function NumberPad({ value, onChange, max, decimals = 2 }: Props) {
  function press(k: string) {
    if (k === '⌫') return onChange(value.slice(0, -1))
    if (k === '.') {
      if (decimals === 0 || value.includes('.')) return
      return onChange(value === '' ? '0.' : value + '.')
    }
    const next = value === '0' ? k : value + k
    const [, frac = ''] = next.split('.')
    if (frac.length > decimals) return
    if (Number(next) > max) return
    onChange(next)
  }
  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k}
          onClick={() => press(k)}
          disabled={k === '.' && decimals === 0}
          className="press num h-16 rounded-xl border border-line bg-white/6 text-3xl font-semibold shadow-[0_2px_0_rgba(255,255,255,.08)] active:bg-white/12 disabled:opacity-30"
        >
          {k}
        </button>
      ))}
    </div>
  )
}
