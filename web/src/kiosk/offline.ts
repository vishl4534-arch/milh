import Dexie, { type Table } from 'dexie'
import type { KioskBundle } from '../api/types'

interface BundleRow {
  day: string
  bundle: KioskBundle
  savedAt: string
}
interface AudioRow {
  url: string
  blob: Blob
}
export interface OutboxRow {
  id: string
  path: string
  body: unknown
  createdAt: string
}

class MilhDB extends Dexie {
  bundles!: Table<BundleRow, string>
  audio!: Table<AudioRow, string>
  outbox!: Table<OutboxRow, string>
  constructor() {
    super('milh')
    this.version(1).stores({ bundles: 'day, savedAt', audio: 'url', outbox: 'id, createdAt' })
  }
}

export const db = new MilhDB()

export async function clearOffline(): Promise<void> {
  await Promise.all([db.bundles.clear(), db.audio.clear(), db.outbox.clear()])
}

/** Keep today's bundle and every announcement's audio on the tablet so it works with no connection. */
export async function cacheBundle(b: KioskBundle): Promise<void> {
  await db.bundles.put({ day: b.day, bundle: b, savedAt: new Date().toISOString() })
  const urls = new Set(b.announcements.flatMap((a) => Object.values(a.audio).filter((u): u is string => !!u)))
  for (const url of urls) {
    if (await db.audio.get(url)) continue
    try {
      const res = await fetch(url)
      if (res.ok) await db.audio.put({ url, blob: await res.blob() })
    } catch {
      /* fetched again on the next refresh */
    }
  }
  const keep = new Set([b.day])
  const old = (await db.bundles.toCollection().primaryKeys()).filter((d) => !keep.has(d))
  if (old.length > 2) await db.bundles.bulkDelete(old.sort().slice(0, old.length - 2))
}

/** The cached bundle for `day`, or the most recently saved one when no day is given. */
export async function loadCachedBundle(day?: string): Promise<BundleRow | undefined> {
  if (day) return db.bundles.get(day)
  return db.bundles.orderBy('savedAt').last()
}

/** A playable URL: the cached copy if we have one, otherwise the network URL. */
export async function audioUrl(url: string): Promise<string> {
  const row = await db.audio.get(url)
  return row ? URL.createObjectURL(row.blob) : url
}
