import { api, getToken } from '../../api/client'

export interface AssistantReply {
  ok: boolean
  transcript: string
  reply: string
  audio_url: string | null
  pending: Record<string, string> | null
  context: Record<string, unknown>
  resume: boolean
  message?: string | null
  lang?: string | null // the language of the reply
}

export interface Line {
  text: string
  audio_url: string | null
}

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

const q = (farmId?: string) => (farmId ? `&farm_id=${farmId}` : '')

export async function assistantStatus(lang: string, farmId?: string): Promise<{ available: boolean; reason: string | null }> {
  return api(`/api/v1/assistant/status?lang=${lang}${q(farmId)}`)
}

export async function fetchLines(lang: string, farmId?: string): Promise<Record<string, Line>> {
  const r = await api<{ lines: Record<string, Line> }>(`/api/v1/assistant/lines?lang=${lang}${q(farmId)}`)
  return r.lines
}

export async function askText(body: { question: string; lang: string; fallback?: string; history: Turn[]; context: Record<string, unknown>;
  farm_id?: string }): Promise<AssistantReply> {
  return api('/api/v1/assistant/text', { method: 'POST', json: body })
}

export async function askAudio(blob: Blob, opts: { lang: string; fallback?: string; history: Turn[]; context: Record<string, unknown>;
  interrupted?: string; farmId?: string }): Promise<AssistantReply> {
  const form = new FormData()
  form.append('audio', blob, blob.type.includes('mp4') ? 'question.mp4' : 'question.webm')
  form.append('lang', opts.lang)
  if (opts.fallback) form.append('fallback', opts.fallback)
  form.append('history', JSON.stringify(opts.history))
  form.append('context', JSON.stringify(opts.context))
  if (opts.interrupted) form.append('interrupted', opts.interrupted)
  if (opts.farmId) form.append('farm_id', opts.farmId)
  return api('/api/v1/assistant/ask', { method: 'POST', body: form, headers: getToken() ? {} : undefined })
}
