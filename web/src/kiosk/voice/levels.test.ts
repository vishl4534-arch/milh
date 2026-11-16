import { expect, test } from 'vitest'
import { createDetector, type DetectorEvent, type Mode } from './levels'

function feed(d: ReturnType<typeof createDetector>, rms: number, ms: number, mode: Mode = 'listening'): DetectorEvent[] {
  const out: DetectorEvent[] = []
  for (let t = 0; t < ms; t += 20) {
    const e = d.step(rms, 20, mode)
    if (e) out.push(e)
  }
  return out
}

test('steady background noise never counts as speech', () => {
  const d = createDetector()
  expect(feed(d, 0.02, 5000)).not.toContain('speech_start')
  expect(d.heard).toBe(false)
})

test('speech then 900 ms of quiet ends the question', () => {
  const d = createDetector()
  feed(d, 0.005, 2000)
  expect(feed(d, 0.12, 300)).toEqual(['speech_start'])
  const after = feed(d, 0.005, 1000)
  expect(after).toEqual(['speech_end'])
})

test('a short bang is not speech', () => {
  const d = createDetector()
  feed(d, 0.005, 2000)
  expect(feed(d, 0.3, 100)).toEqual([])
  expect(feed(d, 0.005, 2000)).not.toContain('speech_end')
})

test('nothing said for 12 s restarts the recording', () => {
  const d = createDetector()
  expect(feed(d, 0.005, 12100)).toContain('idle_restart')
})

test('talking over the answer for 300 ms is a barge-in', () => {
  const d = createDetector()
  feed(d, 0.005, 2000)
  expect(feed(d, 0.2, 320, 'speaking')).toEqual(['barge'])
})

test('noise while the tablet speaks does not barge in', () => {
  const d = createDetector()
  feed(d, 0.005, 2000)
  expect(feed(d, 0.02, 3000, 'speaking')).toEqual([])
})
