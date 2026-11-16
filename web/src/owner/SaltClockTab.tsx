import { useState } from 'react'
import { useCrops, useSaltClock, useSources } from '../api/hooks'
import type { Farm } from '../api/types'
import { pick } from '../i18n'
import { SaltClockView } from './SaltClockView'

export function SaltClockTab({ farm }: { farm: Farm }) {
  const sources = useSources(farm.id)
  const crops = useCrops()
  const [sourceId, setSourceId] = useState<string>()
  const sid = sourceId ?? sources.data?.find((s) => s.kind === 'well')?.id ?? sources.data?.[0]?.id
  const clock = useSaltClock(farm.id, sid)
  const cropName = (k: string) => pick(crops.data?.find((x) => x.key === k)?.names, 'en') || k
  return (
    <div className="grid gap-4">
      <label className="text-sm">Water source
        <select className="ms-2 rounded-xl border border-line bg-panel px-3 py-2" value={sid} onChange={(e) => setSourceId(e.target.value)}>
          {sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {clock.data && <SaltClockView clock={clock.data} tz={farm.timezone} cropName={cropName} />}
    </div>
  )
}
