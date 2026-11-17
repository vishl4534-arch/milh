import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlanDetail } from './PlanDetail'
import { ImportCsv } from './ImportCsv'
import type { Plan, Source } from '../api/types'

afterEach(() => vi.unstubAllGlobals())

const plan: Plan = {
  id: 'p1', block_id: 'b', block_name: 'Block 3', crop_key: 'tomato', day: '2026-11-16', slot: 'morning',
  start_at: '2026-11-16T01:03:00Z', end_at: '2026-11-16T01:47:00Z', minutes: 44,
  steps: [{ source_id: 'w', minutes: 33 }, { source_id: 'd', minutes: 11 }], gross_l: 10957, fractions: { w: 0.75, d: 0.25 },
  ecw: 2.8, lr: 0.2887, cap_exceeded: false, flush: false, habit_l: 15000, saved_l: 4043, saved_aed: -10.31,
  habit_yield_pct: 71.3, plan_yield_pct: 100,
  explanation: { et0: 6.1, kc: 1.15, stage: 'mid', etc: 7.02, net_mm: 7.02, ecw: 2.8, lr: 0.2887, lr_cheapest_alone: 0.4045 },
  text: { en: '44 min instead of 60: ...' }, fallbacks: ['no_soil_test', 'water_ec_stale:w'], skip_reason: null,
  computed_at: '2026-11-15T23:00:00Z',
}
const sources = [
  { id: 'w', name: 'Well', tap_color: '#1d4ed8', tap_label: { en: 'blue tap' } },
  { id: 'd', name: 'Desalinated', tap_color: '#15803d', tap_label: { en: 'green tap' } },
] as unknown as Source[]

test('PlanDetail shows fallback chips and habit comparison', () => {
  render(<PlanDetail plan={plan} sources={sources} tz="Asia/Dubai" />)
  expect(screen.getByText('No soil test yet')).toBeInTheDocument()
  expect(screen.getByText('Water salt reading is old')).toBeInTheDocument()
  expect(screen.getByText('15,000 L')).toBeInTheDocument()
  expect(screen.getByText('10,957 L')).toBeInTheDocument()
  expect(screen.getByText(/71%/)).toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Usual routine vs Milh' })).toBeInTheDocument()
  expect(screen.getByText('Saved vs usual')).toBeInTheDocument()
})

test('ImportCsv shows row errors and disables commit until clean', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    rows_ok: 1, errors: [{ row: 3, column: 'unit', message: "unit 'ppm' not accepted" }],
    committed: false, created: 0, duplicates: 0,
  }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<ImportCsv farmId="f1" />)
  const file = new File(['measured_at,metric\n'], 'r.csv', { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText(/CSV file/), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
  await waitFor(() => expect(screen.getByText(/ppm/)).toBeInTheDocument())
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Import/ })).toBeDisabled()
})
