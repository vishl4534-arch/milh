import { beforeEach, expect, test, vi } from 'vitest'
import { clearOffline } from './offline'
import { enqueue, flushOutbox, pendingCount } from './outbox'

beforeEach(async () => {
  await clearOffline()
  vi.unstubAllGlobals()
})

test('queued reading is sent once when back online', async () => {
  await enqueue({ id: 'r1', path: '/api/v1/readings', body: { a: 1 } })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  expect(await flushOutbox()).toEqual({ sent: 0, failed: 1 })
  expect(await pendingCount()).toBe(1)
  const ok = vi.fn(async () => new Response('{"results":[]}', { status: 200 }))
  vi.stubGlobal('fetch', ok)
  expect(await flushOutbox()).toEqual({ sent: 1, failed: 0 })
  expect(await pendingCount()).toBe(0)
  expect(ok).toHaveBeenCalledTimes(1)
})

test('item refused by the server is dropped, not retried forever', async () => {
  await enqueue({ id: 'r2', path: '/api/v1/irrigation-events', body: {} })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"bad"}', { status: 422 })))
  await flushOutbox()
  expect(await pendingCount()).toBe(0)
})
