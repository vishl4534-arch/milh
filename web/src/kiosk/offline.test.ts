import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { audioUrl, cacheBundle, clearOffline, loadCachedBundle } from './offline'
import { bundleFixture } from '../test/fixtures'

beforeEach(async () => {
  await clearOffline()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:cached') }))
})
afterEach(() => vi.unstubAllGlobals())

test('cacheBundle stores bundle and all audio blobs', async () => {
  const fetchMock = vi.fn(async () => new Response(new Blob(['ID3']), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const b = bundleFixture()
  await cacheBundle(b)
  const got = await loadCachedBundle()
  expect(got?.bundle.day).toBe(b.day)
  const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]))
  expect(urls.sort()).toEqual(['/media/audio/a-en.mp3', '/media/audio/a-ur.mp3'])
})

test('loadCachedBundle returns undefined for other day', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']))))
  await cacheBundle(bundleFixture())
  expect(await loadCachedBundle('2030-01-01')).toBeUndefined()
})

test('player uses cached audio when offline', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['ID3']))))
  await cacheBundle(bundleFixture())
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  expect(await audioUrl('/media/audio/a-en.mp3')).toBe('blob:cached')
  expect(await audioUrl('/media/audio/missing.mp3')).toBe('/media/audio/missing.mp3')
})
