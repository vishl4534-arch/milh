const TOKEN_KEY = 'milh.token'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return readStore(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage blocked: token lives for this page only */
  }
}

type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit }

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail
    if (typeof d === 'string') return d
    if (d && typeof d === 'object' && 'message' in d) return String((d as { message: unknown }).message)
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg)
  }
  return fallback
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body = init.body
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.json)
  }
  const res = await fetch(path, { ...init, headers, body })
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  if (!res.ok) throw new ApiError(res.status, messageOf(parsed, `Request failed (${res.status})`), parsed)
  return parsed as T
}
