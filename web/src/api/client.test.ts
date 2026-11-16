import { afterEach, expect, test, vi } from 'vitest'
import { api, ApiError, setToken } from './client'

afterEach(() => {
  vi.restoreAllMocks()
  setToken(null)
})

test('throws ApiError with status on 401', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401 })))
  await expect(api('/api/v1/me')).rejects.toMatchObject({ status: 401, message: 'Not authenticated' })
  await expect(api('/api/v1/me')).rejects.toBeInstanceOf(ApiError)
})

test('sends bearer token and json body', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  setToken('abc')
  await api('/api/v1/x', { method: 'POST', json: { a: 1 } })
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
  expect(init.body).toBe('{"a":1}')
})
