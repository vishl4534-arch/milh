import { useState } from 'react'

/** A silent background loop that starts as its still photo and fades into motion once it plays.
 *  Reduced-motion and data-saver settings keep the photo only; offline, the photo is all that shows. */
export function LoopVideo({ src, poster, className = '' }: { src: string; poster: string; className?: string }) {
  const [playing, setPlaying] = useState(false)
  const [still] = useState(() => {
    try {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? false
      return reduce || saveData
    } catch {
      return false
    }
  })
  return (
    <div aria-hidden className={`overflow-hidden ${className}`}>
      <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {!still && (
        <video src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" disablePictureInPicture
          onPlaying={() => setPlaying(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${playing ? 'opacity-100' : 'opacity-0'}`} />
      )}
    </div>
  )
}
