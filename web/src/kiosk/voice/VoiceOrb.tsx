import { useEffect, useRef, type RefObject } from 'react'

export type OrbState = 'starting' | 'listening' | 'thinking' | 'speaking' | 'nomic'

/** The assistant's face: a living green orb. Its glow and size follow the sound level (the worker's voice
 *  while listening, the assistant's own voice while it talks), its light swirls slowly, and it breathes
 *  while thinking. The level is read from a ref every frame and written straight to transforms, so the
 *  rest of the screen never re-renders for it. */
export function VoiceOrb({ state, level }: { state: OrbState; level: RefObject<number> }) {
  const core = useRef<HTMLDivElement>(null)
  const halo = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let s = 0
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const k = reduce ? 0.25 : 1
    const loop = () => {
      const target = Math.max(0, Math.min(1, level.current ?? 0))
      s += (target - s) * (target > s ? 0.35 : 0.12) // quick to rise with a syllable, slow to settle
      if (core.current) core.current.style.transform = `scale(${1 + s * 0.2 * k})`
      if (halo.current) {
        halo.current.style.transform = `scale(${1 + s * 0.75 * k})`
        halo.current.style.opacity = String(0.4 + s * 0.6)
      }
      if (sheen.current) sheen.current.style.opacity = String(0.55 + s * 0.45)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [level])

  const thinking = state === 'thinking' || state === 'starting'
  return (
    <div aria-hidden data-state={state} className="relative grid size-72 place-items-center">
      {state === 'listening' && [0, 0.8, 1.6].map((d) => (
        <span key={d} className="ring absolute inset-10 rounded-full bg-[#5fbf7f]/60" style={{ animationDelay: `${d}s` }} />
      ))}
      <div ref={halo} className="absolute inset-4 rounded-full bg-[radial-gradient(circle,rgba(120,224,156,.7)_0%,rgba(63,157,92,.3)_45%,transparent_70%)] blur-2xl will-change-transform" />
      <div className={thinking ? 'orb-breathe' : ''}>
        <div ref={core}
          className="relative size-56 overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_28%,#c9f7d6_0%,#6fd394_26%,#2f9a5a_58%,#1d5c3c_86%,#143f2a_100%)] shadow-[inset_0_-18px_40px_rgba(6,40,22,.55),inset_0_10px_30px_rgba(255,255,255,.25),0_30px_90px_-20px_rgba(76,200,120,.85)] will-change-transform">
          <div className={`orb-spin absolute -inset-[35%] opacity-80 blur-xl mix-blend-screen ${thinking ? 'orb-fast' : ''}`}
            style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(200,255,215,.55) 60deg, transparent 130deg, rgba(120,210,240,.35) 200deg, transparent 260deg, rgba(160,240,120,.45) 320deg, transparent 360deg)' }} />
          <div className="orb-spin-rev absolute -inset-[30%] opacity-60 blur-lg mix-blend-soft-light"
            style={{ background: 'conic-gradient(from 90deg, transparent, rgba(255,255,255,.7) 40deg, transparent 110deg, rgba(20,80,50,.6) 220deg, transparent 300deg)' }} />
          <div ref={sheen} className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle_at_36%_28%,rgba(255,255,255,.75)_0%,rgba(255,255,255,0)_45%)]" />
          <div className="absolute inset-x-[22%] bottom-[8%] h-[18%] rounded-full bg-[radial-gradient(ellipse,rgba(160,255,190,.45),transparent_70%)] blur-md" />
        </div>
      </div>
    </div>
  )
}
