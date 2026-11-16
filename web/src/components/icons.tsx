import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { label?: string }

function Svg({ label, children, ...rest }: P) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined} aria-label={label}
      aria-hidden={label ? undefined : true} {...rest}>
      {children}
    </svg>
  )
}

export const Drop = (p: P) => <Svg {...p}><path d="M12 3c-4 5.5-6 8.6-6 11.2A6 6 0 0 0 18 14.2C18 11.6 16 8.5 12 3z" /></Svg>
export const Sunrise = (p: P) => (
  <Svg {...p}><path d="M4 18h16M6.5 18a5.5 5.5 0 0 1 11 0M12 4v5M8.5 7.5 12 4l3.5 3.5M3 13.5l1.5.6M21 13.5l-1.5.6" /></Svg>
)
export const Sunset = (p: P) => (
  <Svg {...p}><path d="M4 18h16M6.5 18a5.5 5.5 0 0 1 11 0M12 9V4M8.5 5.5 12 9l3.5-3.5M3 13.5l1.5.6M21 13.5l-1.5.6" /></Svg>
)
export const Rain = (p: P) => (
  <Svg {...p}><path d="M7 15a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17 6.5 4 4 0 0 1 17 15H7zM8 18l-1 3M12 18l-1 3M16 18l-1 3" /></Svg>
)
export const Check = (p: P) => <Svg {...p}><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></Svg>
export const Warn = (p: P) => <Svg {...p}><path d="M12 3 2 20h20L12 3zM12 10v4.5M12 17.5v.01" /></Svg>
export const Cross = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
export const Speaker = (p: P) => (
  <Svg {...p}><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></Svg>
)
export const Mic = (p: P) => (
  <Svg {...p}><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>
)
export const Eye = (p: P) => <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Svg>
export const EyeOff = (p: P) => <Svg {...p}><path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.9M6.6 6.6A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>
export const Plus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const Leaf = (p: P) => <Svg {...p}><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7" /></Svg>
export const Thermo = (p: P) => <Svg {...p}><path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z" /></Svg>
export const Wifi = (p: P) => <Svg {...p}><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5.5-2.8M19 12.5a10 10 0 0 0-2.2-1.6M12 20h.01" /></Svg>
