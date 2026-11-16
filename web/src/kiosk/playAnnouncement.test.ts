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
