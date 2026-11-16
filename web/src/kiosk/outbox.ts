import { api, ApiError } from '../api/client'
import { db } from './offline'

/** Keep a worker's entry on the tablet when the server can't be reached; send it later.
 *  The server ignores repeats of the same id, so retrying is safe. */
export async function enqueue(item: { id: string; path: string; body: unknown }): Promise<void> {
  await db.outbox.put({ ...item, createdAt: new Date().toISOString() })
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count()
}

export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  for (const item of await db.outbox.orderBy('createdAt').toArray()) {
    try {
      await api(item.path, { method: 'POST', json: item.body })
      await db.outbox.delete(item.id)
      sent++
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401) {
        await db.outbox.delete(item.id) // the server refused it for good; retrying won't help
      }
      failed++
    }
  }
  return { sent, failed }
}
