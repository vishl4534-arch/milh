import { afterEach, expect, test, vi } from 'vitest'
import { playAnnouncement } from './player'
import type { KAnnouncement } from '../api/types'

afterEach(() => vi.unstubAllGlobals())

test('a missing chime does not stop the announcement clip', async () => {
  const played: string[] = []
  class FakeAudio {
    src: string
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(src: string) { this.src = src }
    play() {
      if (this.src.includes('chime')) return Promise.reject(new Error('offline'))
      played.push(this.src)
      setTimeout(() => this.onended?.(), 0)
      return Promise.resolve()
    }
  }
  vi.stubGlobal('Audio', FakeAudio)
  const a = { id: 'x', type: 't', scheduled_at: '', text: { en: 'hi' }, audio: { en: '/media/audio/x.mp3' },
    status: 'scheduled', plan_id: null } as KAnnouncement
  await playAnnouncement(a, 'en')
  expect(played).toEqual(['/media/audio/x.mp3'])
})

test('with no clip in the bundle, it asks the server for the announcer clip before using the tablet voice', async () => {
  const played: string[] = []
  class FakeAudio {
    src: string
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(src: string) { this.src = src }
    play() {
      played.push(this.src)
      setTimeout(() => this.onended?.(), 0)
      return Promise.resolve()
    }
  }
  vi.stubGlobal('Audio', FakeAudio)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: 'hi', audio_url: '/media/audio/new.mp3' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  const a = { id: 'ann-1', type: 'custom', scheduled_at: '', text: { ur: 'سلام' }, audio: {},
    status: 'scheduled', plan_id: null } as KAnnouncement
  await playAnnouncement(a, 'ur')
  expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/api/v1/kiosk/announcements/ann-1/speech?lang=ur')
  expect(played).toEqual(['/chime.wav', '/media/audio/new.mp3'])
})
