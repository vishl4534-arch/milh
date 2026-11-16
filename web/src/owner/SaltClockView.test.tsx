import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SaltClockView } from './SaltClockView'
import type { SaltClock } from '../api/types'

const base: SaltClock = {
  source_id: 'w', crop_key: 'date_palm', status: 'ok', n_readings: 4, span_days: 6940, slope_per_year: 0.68,
  residual_sd: 0.9, current_ecw: 15.36, current_yield_pct: 40, date_loss_10: '2001-03-01', date_loss_25: '2005-06-01',
  suggested_crops: [], as_of: '2010-07-01', stale: true, data_age_days: 5982,
  points: [{ day: '2010-07-01', ec: 15.36, source: 'csv_import', note: 'Al-Rahbi et al. (2019)' }],
}

test('an old series is shown as history, dated, not as today', () => {
  render(<SaltClockView clock={base} tz="Asia/Muscat" cropName={() => 'Date palm'} />)
  expect(screen.getByRole('alert')).toHaveTextContent(/16 years old/)
  expect(screen.getByRole('alert')).toHaveTextContent(/not today/)
  expect(screen.getByText(/as of 1 Jul 2010/)).toBeInTheDocument()
})

test('a current series has no history warning', () => {
  render(<SaltClockView clock={{ ...base, stale: false, as_of: '2026-11-16', data_age_days: 3 }} tz="Asia/Muscat"
    cropName={() => 'Date palm'} />)
  expect(screen.queryByRole('alert')).toBeNull()
})
