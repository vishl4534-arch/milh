import { useLayoutEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  max: number
  decimals?: number
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']

/** Large keypad: no typing or reading needed beyond digits. Rejects keys that would break the limits. */
export function NumberPad({ value, onChange, max, decimals = 2 }: Props) {
  // Quick taps can land before the screen redraws; each key builds on the last key pressed, not on the
  // last value drawn, so "7" then "2" is always 72.
  const latest = useRef(value)
  useLayoutEffect(() => { latest.current = value }, [value])
  function emit(v: string) {
    latest.current = v
    onChange(v)
  }
  function press(k: string) {
    const cur = latest.current
    if (k === '⌫') return emit(cur.slice(0, -1))
    if (k === '.') {
      if (decimals === 0 || cur.includes('.')) return
      return emit(cur === '' ? '0.' : cur + '.')
    }
    const next = cur === '0' ? k : cur + k
    const [, frac = ''] = next.split('.')
    if (frac.length > decimals) return
    if (Number(next) > max) return
    emit(next)
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
          className="press num h-16 rounded-xl border border-line bg-panel text-3xl font-semibold shadow-[0_2px_0_#d9ded9] active:bg-salt disabled:opacity-30"
        >
          {k}
        </button>
      ))}
    </div>
  )
}
