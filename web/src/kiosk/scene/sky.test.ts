import { expect, test } from 'vitest'
import { skyAt } from './sky'

const SUNRISE = Date.parse('2026-11-16T06:24:00+04:00')
const SUNSET = Date.parse('2026-11-16T17:23:00+04:00')
const at = (hhmm: string) => Date.parse(`2026-11-16T${hhmm}:00+04:00`)

test('night before dawn: moon up, no sun', () => {
  const s = skyAt(at('03:00'), SUNRISE, SUNSET)
  expect(s.phase).toBe('night')
  expect(s.sunUp).toBe(false)
})

test('dawn around sunrise', () => {
  expect(skyAt(at('06:10'), SUNRISE, SUNSET).phase).toBe('dawn')
  expect(skyAt(at('06:50'), SUNRISE, SUNSET).phase).toBe('dawn')
})

test('midday puts the sun at the top of its arc', () => {
  const noon = (SUNRISE + SUNSET) / 2
  const s = skyAt(noon, SUNRISE, SUNSET)
  expect(s.phase).toBe('day')
  expect(s.progress).toBeCloseTo(0.5, 2)
  expect(s.height).toBeCloseTo(1, 2)
})

test('dusk around sunset, then night', () => {
  expect(skyAt(at('17:10'), SUNRISE, SUNSET).phase).toBe('dusk')
  expect(skyAt(at('19:30'), SUNRISE, SUNSET).phase).toBe('night')
})

test('without sun times it uses 06:00 to 18:00 in the farm day', () => {
  const s = skyAt(at('12:00'), null, null, 'Asia/Muscat')
  expect(s.phase).toBe('day')
  expect(s.progress).toBeCloseTo(0.5, 1)
})
