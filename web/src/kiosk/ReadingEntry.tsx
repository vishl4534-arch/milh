import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { IngestResult, KioskBundle, Lang } from '../api/types'
import { Check, Cross } from '../components/icons'
import { pick } from '../i18n'
import { NumberPad } from './NumberPad'
import { enqueue } from './outbox'

type Metric = 'water_ec' | 'tank_level_pct'
const LIMITS: Record<Metric, { max: number; decimals: number; unit: string }> = {
  water_ec: { max: 60, decimals: 2, unit: 'dS/m' },
  tank_level_pct: { max: 100, decimals: 0, unit: '%' },
}

interface Props {
  bundle: KioskBundle
  lang: Lang
  onClose: () => void
  onSaved: () => void
}

/** Worker data entry: choose what was measured by colour/icon, type the number on the keypad. */
export function ReadingEntry({ bundle, lang, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [metric, setMetric] = useState<Metric>('water_ec')
  const [target, setTarget] = useState<string | null>(bundle.sources[0]?.id ?? null)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'queued' | 'error'>('idle')
  const [error, setError] = useState('')

  const targets = metric === 'water_ec'
    ? bundle.sources.map((s) => ({ id: s.id, label: pick(s.tap_label, lang) || s.name, color: s.tap_color }))
    : bundle.tanks.map((tk) => ({ id: tk.id, label: tk.name, color: '#1b2421' }))

  function switchMetric(m: Metric) {
    setMetric(m)
    setValue('')
    setTarget(m === 'water_ec' ? bundle.sources[0]?.id ?? null : bundle.tanks[0]?.id ?? null)
  }

  async function save() {
    if (!target || value === '') return
    const body = {
      reading_id: crypto.randomUUID(),
      farm_id: bundle.farm.id,
      metric,
      value: Number(value),
      unit: LIMITS[metric].unit,
      measured_at: new Date().toISOString(),
      ...(metric === 'water_ec' ? { source_id: target } : { tank_id: target }),
    }
    setStatus('saving')
    try {
      const res = await api<{ results: IngestResult[] }>('/api/v1/readings', { method: 'POST', json: body })
      const r = res.results[0]
      if (r.status === 'rejected') {
        setStatus('error')
        setError(r.message ?? r.error ?? '')
        return
      }
      setStatus('saved')
      onSaved()
    } catch (err) {
      if (err instanceof TypeError) {
        await enqueue({ id: body.reading_id, path: '/api/v1/readings', body })
        setStatus('queued')
        return
      }
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t('entry.title')}
      className="fixed inset-0 z-20 grid place-items-center bg-ink/60 p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-panel p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{t('entry.title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="text-3xl"><Cross /></button>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {(['water_ec', 'tank_level_pct'] as Metric[]).map((m) => (
                <button key={m} type="button" onClick={() => switchMetric(m)} aria-pressed={metric === m}
                  className={`rounded-xl px-3 py-3 font-semibold ring-1 ring-line ${metric === m ? 'bg-ink text-salt' : 'bg-salt'}`}>
                  {t(`entry.${m}`)}
                </button>
              ))}
            </div>
            <div className="text-sm text-ink-soft">{metric === 'water_ec' ? t('entry.pickSource') : t('entry.pickTank')}</div>
            <div className="flex flex-wrap gap-2">
              {targets.map((x) => (
                <button key={x.id} type="button" onClick={() => setTarget(x.id)} aria-pressed={target === x.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3 text-lg ring-2 ${target === x.id ? 'ring-ink' : 'ring-line'}`}>
                  <span className="size-6 rounded-full" style={{ background: x.color }} /> {x.label}
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-2xl bg-salt px-4 py-3 text-end" dir="ltr">
              <span className="num text-6xl font-bold">{value || '0'}</span>
              <span className="ms-2 text-xl text-ink-soft">{LIMITS[metric].unit}</span>
            </div>
            {status === 'saved' && <p className="flex items-center gap-2 text-lg font-semibold text-palm"><Check /> {t('entry.saved')}</p>}
            {status === 'queued' && <p className="text-lg font-semibold text-dune">{t('entry.queued')}</p>}
            {status === 'error' && <p role="alert" className="text-lg font-semibold text-brine">{error}</p>}
          </div>
          <div className="flex flex-col gap-3">
            <NumberPad value={value} onChange={(v) => { setValue(v); setStatus('idle') }} max={LIMITS[metric].max}
              decimals={LIMITS[metric].decimals} />
            <button type="button" onClick={save} disabled={!target || value === '' || status === 'saving'}
              className="rounded-2xl bg-palm py-4 text-xl font-bold text-white disabled:opacity-40">
              {t('entry.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
