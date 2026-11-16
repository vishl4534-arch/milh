import { expect, test, vi } from 'vitest'
import { createPlayer, type PlayerDeps } from './player'
import type { KAnnouncement } from '../api/types'

const T0 = Date.parse('2026-11-16T05:00:00+04:00')
const ann = (id: string, at: string, status = 'scheduled'): KAnnouncement => ({
  id, type: 'irrigation_start', scheduled_at: at, text: { en: id }, audio: { en: `/media/${id}.mp3` }, status,
  plan_id: null,
})

function harness(play: PlayerDeps['play'] = vi.fn(async () => undefined)) {
  const timers: { fn: () => void; ms: number }[] = []
  const player = createPlayer({
    now: () => T0,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearTimer: vi.fn(),
    play,
  })
  return { player, timers, play }
}

test('refuses to schedule before unlock and shows banner on NotAllowedError', async () => {
  const blocked = vi.fn()
  const { player, timers } = harness(vi.fn(async () => { throw new DOMException('no gesture', 'NotAllowedError') }))
  player.onBlocked(blocked)
  player.load([ann('a', '2026-11-16T05:03:00+04:00')], 'en')
  expect(timers).toHaveLength(0)
  player.unlock()
  expect(timers).toHaveLength(1)
  timers[0].fn()
  await vi.waitFor(() => expect(blocked).toHaveBeenCalled())
})

test('schedules only future items and plays chime then audio', () => {
  const { player, timers, play } = harness()
  player.unlock()
  player.load([
    ann('past', '2026-11-16T04:30:00+04:00'),
    ann('soon', '2026-11-16T05:03:00+04:00'),
    ann('played', '2026-11-16T05:10:00+04:00', 'played'),
  ], 'en')
  expect(timers.map((t) => t.ms)).toEqual([3 * 60 * 1000])
  timers[0].fn()
  expect(play).toHaveBeenCalledWith(expect.objectContaining({ id: 'soon' }), 'en')
})

test('reloading same announcements does not double-schedule', () => {
  const { player, timers } = harness()
  player.unlock()
  const list = [ann('soon', '2026-11-16T05:03:00+04:00')]
  player.load(list, 'en')
  player.load(list, 'en')
  expect(timers).toHaveLength(1)
})

test('slightly late items still play right away', () => {
  const { player, timers } = harness()
  player.unlock()
  player.load([ann('late', '2026-11-16T04:55:00+04:00')], 'en')
  expect(timers.map((t) => t.ms)).toEqual([0])
})

test('reloading drops timers for announcements no longer in the plan', () => {
  const cleared: unknown[] = []
  const timers: { fn: () => void; ms: number }[] = []
  const player = createPlayer({
    now: () => T0,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return `t${timers.length}` },
    clearTimer: (t) => { cleared.push(t) },
    play: vi.fn(async () => undefined),
  })
  player.unlock()
  player.load([ann('old', '2026-11-16T05:03:00+04:00')], 'en')
  player.load([ann('new', '2026-11-16T05:04:00+04:00')], 'en')
  expect(cleared).toEqual(['t1'])
  expect(timers).toHaveLength(2)
})

test('an announcement blocked by the browser plays once sound is enabled', async () => {
  let allow = false
  const play = vi.fn(async () => { if (!allow) throw new DOMException('no gesture', 'NotAllowedError') })
  const { player, timers } = harness(play)
  player.unlock()
  player.load([ann('a', '2026-11-16T05:03:00+04:00')], 'en')
  timers[0].fn()
  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1))
  allow = true
  player.unlock()
  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2))
})
