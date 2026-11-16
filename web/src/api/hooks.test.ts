import { afterEach, expect, test, vi } from 'vitest'
import { fetchBundle } from './hooks'
import { cacheBundle, clearOffline } from '../kiosk/offline'
import { bundleFixture } from '../test/fixtures'

afterEach(() => vi.unstubAllGlobals())

test('an expired sign-in is reported, not hidden behind the offline copy', async () => {
  await clearOffline()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']))))
  await cacheBundle(bundleFixture())
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"Not authenticated"}', { status: 401 })))
  await expect(fetchBundle()).rejects.toMatchObject({ status: 401 })
})

test('a network failure falls back to the cached bundle', async () => {
  await clearOffline()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']))))
  await cacheBundle(bundleFixture())
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  const s = await fetchBundle()
  expect(s.offline).toBe(true)
})
