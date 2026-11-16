// Hand-written mirrors of the backend schemas (backend/milh/kiosk.py, schemas/*, api/*).
export type Lang = 'en' | 'ur' | 'ar' | 'hi'
export type I18nText = Partial<Record<string, string>>

export interface Me {
  id: string
  name: string
  role: 'owner' | 'worker' | 'admin'
  language: Lang
  farm_id: string | null
}

export interface KDaily {
  day: string
  et0_mm: number
  rain_mm: number
  tmax_c: number
  tmin_c: number | null
  rain_chance_pct: number | null
}

export interface KWeather {
  current: Record<string, number | string | null>
  daily: KDaily[]
  fetched_at: string
  age_h: number
  source: string
}

export interface KStep {
  source_id: string
  tap_label: I18nText
  tap_color: string
  minutes: number
}

export interface KRun {
  plan_id: string
  block_id: string
  block_name: string
  crop_names: I18nText
  slot: string | null
  start: string | null
  end: string | null
  minutes: number
  steps: KStep[]
  flush: boolean
  skip_reason: 'rain' | 'no_need' | null
  text: I18nText
  fallbacks: string[]
  habit_minutes: number
  saved_l: number
  done: boolean
}

export interface KAnnouncement {
  id: string
  type: string
  scheduled_at: string
  text: I18nText
  audio: I18nText
  status: string
  plan_id: string | null
}

export interface KTank {
  id: string
  name: string
  capacity_l: number
  level_pct: number | null
  volume_l: number | null
  measured_at: string | null
  source: string | null
}

export interface KSource {
  id: string
  name: string
  kind: string
  tap_label: I18nText
  tap_color: string
  ec: number | null
  ec_measured_at: string | null
  ec_source: string | null
  declared_ec: number | null
  trend: 'up' | 'down' | 'flat' | null
  stale: boolean
}

export interface KBlock {
  id: string
  name: string
  crop_key: string
  crop_names: I18nText
  salt_threshold: number
  soil: {
    ece: number | null
    ph: number | null
    moisture_vwc: number | null
    tested_on: string | null
    status: 'ok' | 'warn' | 'high' | 'none'
    source: string | null
  }
  next_test_due: string | null
  next_test_reasons: string[]
}

export interface KAlert {
  id: string
  severity: 'info' | 'warning' | 'critical'
  type: string
  message: I18nText
  created_at: string
}

export interface KioskBundle {
  farm: { id: string; name: string; timezone: string; languages: Lang[]; example_label: string | null }
  day: string
  generated_at: string
  weather: KWeather | null
  sun: { sunrise: string | null; sunset: string | null } | null
  runs: KRun[]
  announcements: KAnnouncement[]
  tanks: KTank[]
  sources: KSource[]
  blocks: KBlock[]
  alerts: KAlert[]
  freshness: { item: string; age_h: number | null; stale: boolean }[]
}

export interface FarmSettings {
  lr_cap: number
  earliest_start: string
  briefing_time: string
  daily_plan_time: string
  heat_c: number
  tank_low_pct: number
  flush_extra_mm: number
  languages: Lang[]
  [k: string]: unknown
}

export interface Farm {
  id: string
  owner_id: string
  name: string
  lat: number
  lon: number
  timezone: string
  settings: FarmSettings
  example_label: string | null
}

export interface Plan {
  id: string
  block_id: string
  block_name: string
  crop_key: string
  day: string
  slot: string | null
  start_at: string | null
  end_at: string | null
  minutes: number
  steps: { source_id: string; minutes: number }[]
  gross_l: number
  fractions: Record<string, number>
  ecw: number | null
  lr: number | null
  cap_exceeded: boolean
  flush: boolean
  habit_l: number
  saved_l: number
  saved_aed: number
  habit_yield_pct: number | null
  plan_yield_pct: number | null
  habit_well_l?: number | null
  plan_well_l?: number | null
  aquifer_saved_l?: number | null
  explanation: Record<string, unknown>
  text: I18nText
  fallbacks: string[]
  skip_reason: string | null
  computed_at: string
}

export interface Source {
  id: string
  farm_id: string
  name: string
  kind: string
  cost_per_m3: number
  declared_ec: number | null
  declared_ec_note: string | null
  tap_label: I18nText
  tap_color: string
  position: number
}

export interface Block {
  id: string
  farm_id: string
  name: string
  area_m2: number
  crop_key: string
  planting_date: string
  flow_l_per_h: number
  efficiency: number
  habit_minutes: number
  habit_source_id: string
  soil_texture: string | null
}

export interface Tank {
  id: string
  farm_id: string
  name: string
  capacity_l: number
  source_id: string | null
}

export interface Crop {
  key: string
  names: I18nText
  salt_a: number
  salt_b: number
  citation: string
}

export interface SoilTest {
  id: string
  block_id: string
  tested_on: string
  ec_1to5: number | null
  ece: number
  ph: number | null
  moisture_vwc: number | null
  lab: string | null
  note: string | null
  source: string
}

export interface Reading {
  id: string
  metric: string
  value: number
  unit: string
  raw_value: number
  raw_unit: string
  measured_at: string
  received_at: string
  source: string
  source_id: string | null
  tank_id: string | null
  block_id: string | null
  note: string | null
  flags: string[]
}

export interface IngestResult {
  reading_id: string | null
  status: 'created' | 'duplicate' | 'rejected'
  error: string | null
  message: string | null
  flags: string[]
}

export interface ImportPreview {
  rows_ok: number
  errors: { row: number; column: string; message: string }[]
  committed: boolean
  created: number
  duplicates: number
}

export interface SaltClock {
  source_id: string
  crop_key: string
  status: 'collecting' | 'ok'
  n_readings: number
  span_days: number
  slope_per_year: number | null
  residual_sd: number | null
  current_ecw: number | null
  current_yield_pct: number | null
  date_loss_10: string | null
  date_loss_25: string | null
  suggested_crops: string[]
  as_of: string | null
  stale: boolean
  data_age_days: number | null
  points: { day: string; ec: number; source: string; note: string | null }[]
}

export interface WaterReport {
  start: string
  end: string
  days: {
    day: string
    planned_l: number
    actual_l: number | null
    habit_l: number
    saved_l: number
    saved_aed: number
    aquifer_saved_l?: number
    adherence_pct: number | null
  }[]
  totals: {
    planned_l: number; actual_l: number | null; habit_l: number; saved_l: number; saved_aed: number
    aquifer_saved_l?: number
  }
}

export interface Alert {
  id: string
  severity: string
  type: string
  message: I18nText
  created_at: string
}
