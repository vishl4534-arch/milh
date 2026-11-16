import type { KioskBundle } from '../api/types'

/** Test-only kiosk bundle. Never imported by the app. */
export function bundleFixture(overrides: Partial<KioskBundle> = {}): KioskBundle {
  return {
    farm: { id: 'f1', name: 'Test farm', timezone: 'Asia/Dubai', languages: ['en', 'ur'], example_label: null },
    day: '2026-11-16',
    generated_at: '2026-11-16T01:00:00Z',
    weather: {
      current: { temperature_2m: 28.9, relative_humidity_2m: 35, wind_speed_10m: 5.1 },
      daily: [{ day: '2026-11-16', et0_mm: 4.33, rain_mm: 0, tmax_c: 29.4, tmin_c: 18.9, rain_chance_pct: 0 }],
      fetched_at: '2026-11-16T00:30:00Z',
      age_h: 0.5,
      source: 'api:open-meteo',
    },
    sun: { sunrise: '2026-11-16T06:32:00+04:00', sunset: '2026-11-16T17:30:00+04:00' },
    runs: [
      {
        plan_id: 'p1', block_id: 'b3', block_name: 'Block 3', crop_names: { en: 'Tomato', ur: 'ٹماٹر' },
        slot: 'morning', start: '2026-11-16T05:03:00+04:00', end: '2026-11-16T05:47:00+04:00', minutes: 44,
        steps: [
          { source_id: 'w', tap_label: { en: 'blue tap', ur: 'نیلا نل' }, tap_color: '#1d4ed8', minutes: 33 },
          { source_id: 'd', tap_label: { en: 'green tap', ur: 'سبز نل' }, tap_color: '#15803d', minutes: 11 },
        ],
        flush: false, skip_reason: null, text: { en: '44 min instead of 60', ur: '44 منٹ' }, fallbacks: [],
        habit_minutes: 60, saved_l: 4043, done: false,
      },
    ],
    announcements: [
      {
        id: 'a1', type: 'irrigation_start', scheduled_at: '2026-11-16T05:03:00+04:00',
        text: { en: 'Block 3: open the blue tap now.', ur: 'بلاک 3' },
        audio: { en: '/media/audio/a-en.mp3', ur: '/media/audio/a-ur.mp3' }, status: 'scheduled', plan_id: 'p1',
      },
    ],
    tanks: [{ id: 't1', name: 'Main tank', capacity_l: 50000, level_pct: 68, volume_l: 34000,
      measured_at: '2026-11-16T00:00:00Z', source: 'manual' }],
    sources: [
      { id: 'w', name: 'Well', kind: 'well', tap_label: { en: 'blue tap' }, tap_color: '#1d4ed8', ec: 3.6,
        ec_measured_at: '2026-11-15T03:00:00Z', ec_source: 'manual', declared_ec: null, trend: 'up', stale: false },
      { id: 'd', name: 'Desalinated', kind: 'desal', tap_label: { en: 'green tap' }, tap_color: '#15803d', ec: 0.4,
        ec_measured_at: '2026-11-15T03:00:00Z', ec_source: 'manual', declared_ec: null, trend: 'flat', stale: false },
    ],
    blocks: [{ id: 'b3', name: 'Block 3', crop_key: 'tomato', crop_names: { en: 'Tomato' }, salt_threshold: 2.5,
      soil: { ece: 2.2, ph: 7.8, moisture_vwc: null, tested_on: '2026-11-15', status: 'warn', source: 'manual' },
      next_test_due: '2026-11-22', next_test_reasons: ['near_threshold'] }],
    alerts: [],
    freshness: [{ item: 'weather', age_h: 0.5, stale: false }],
    ...overrides,
  }
}
