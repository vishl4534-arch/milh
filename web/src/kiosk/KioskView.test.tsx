import { render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { KioskView } from './KioskView'
import { bundleFixture } from '../test/fixtures'
import type { KioskBundle } from '../api/types'

const NOW = Date.parse('2026-11-16T05:10:00+04:00')

function view(b: KioskBundle, offline = false) {
  return render(
    <KioskView state={{ bundle: b, offline, cachedAt: offline ? '2026-11-16T04:00:00+04:00' : null }} lang="en"
      now={NOW} onDone={vi.fn()} onListen={vi.fn()} onLang={vi.fn()} onAddReading={vi.fn()} />,
  )
}

test('shows "No test yet" when soil status none', () => {
  const b = bundleFixture()
  b.blocks[0].soil = { ece: null, ph: null, moisture_vwc: null, tested_on: null, status: 'none', source: null }
  b.blocks[0].next_test_due = null
  view(b)
  expect(within(screen.getByRole('region', { name: 'Soil' })).getByText('No test yet')).toBeInTheDocument()
})

test('renders two step rows with tap labels for a blended run', () => {
  view(bundleFixture())
  const now = screen.getByRole('region', { name: 'Now' })
  const steps = within(now).getAllByTestId('pipe-step')
  expect(steps).toHaveLength(2)
  expect(steps[0]).toHaveTextContent('blue tap')
  expect(steps[0]).toHaveTextContent('33')
  expect(steps[1]).toHaveTextContent('green tap')
  expect(within(now).getByText('44')).toBeInTheDocument()
  expect(within(now).getByRole('button', { name: /Done/ })).toBeInTheDocument()
})

test('shows forecast age badge when age_h > 6', () => {
  const b = bundleFixture()
  b.weather!.age_h = 9
  view(b)
  expect(screen.getByText(/Forecast 9 h old/)).toBeInTheDocument()
})

test('skipped block shows rain icon and no DONE button', () => {
  const b = bundleFixture()
  b.runs[0] = { ...b.runs[0], minutes: 0, steps: [], skip_reason: 'rain', start: null, end: null }
  view(b)
  expect(screen.getByText('No watering: rain')).toBeInTheDocument()
  expect(screen.getByLabelText('rain')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Done/ })).toBeNull()
})

test('empty tank and water readings show empty state, not zero', () => {
  const b = bundleFixture()
  b.tanks[0] = { ...b.tanks[0], level_pct: null, volume_l: null, measured_at: null, source: null }
  b.sources[0] = { ...b.sources[0], ec: null, ec_measured_at: null, trend: null, stale: true }
  view(b)
  const water = screen.getByRole('region', { name: 'Water' })
  expect(within(water).getAllByText('No reading yet').length).toBeGreaterThanOrEqual(2)
  expect(within(water).queryByText('0%')).toBeNull()
})

test('a finished run nobody confirmed stays on screen with its Done button', () => {
  const b = bundleFixture()
  render(
    <KioskView state={{ bundle: b, offline: false, cachedAt: null }} lang="en" now={Date.parse('2026-11-16T13:00:00+04:00')}
      onDone={vi.fn()} onListen={vi.fn()} onLang={vi.fn()} onAddReading={vi.fn()} />,
  )
  const now = screen.getByRole('region', { name: 'Now' })
  expect(within(now).getByText('Not confirmed yet')).toBeInTheDocument()
  expect(within(now).getByRole('button', { name: /Done/ })).toBeInTheDocument()
  expect(screen.queryByText('All watering done for today')).toBeNull()
})

test('offline badge shows cached time', () => {
  view(bundleFixture(), true)
  expect(screen.getByText(/Offline · data from 04:00/)).toBeInTheDocument()
})
