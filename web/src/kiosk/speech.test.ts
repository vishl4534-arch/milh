import { expect, test } from 'vitest'
import { forSpeech, phrases, pickVoice } from './speech'

test('units are spelled the way people say them', () => {
  expect(forSpeech('93 min, salt 4.35 dS/m, 28% extra')).toBe('93 minutes, salt 4.35 deci-siemens per metre, 28 percent extra')
})

test('an instruction is read as phrases with rising, emphatic and falling pitch', () => {
  const p = phrases('Block 1, Date palm. Please open the blue tap now... 65 minutes.')
  expect(p.map((x) => x.text)).toEqual(['Block 1,', 'Date palm.', 'Please open the blue tap now.', '65 minutes.'])
  expect(p[0].pitch).toBeGreaterThan(1)          // heading lifts
  expect(p[2].pauseMs).toBeGreaterThan(p[1].pauseMs) // "..." holds longer than a full stop
  expect(p[3].pitch).toBeLessThan(1)             // last phrase falls
  expect(p[3].rate).toBeLessThan(p[2].rate)      // numbers slower
  expect(p[3].pauseMs).toBe(0)
})

test('decimals and thousands stay whole', () => {
  expect(phrases('Salt 4.01 today, 1,500 litres.').map((x) => x.text)).toEqual(['Salt 4.01 today,', '1,500 litres.'])
})

test('an exclamation is emphasised', () => {
  const [first] = phrases('Heat warning! Drink water.')
  expect(first.pitch).toBeGreaterThan(1.1)
})

test('picks a natural voice over a robotic default', () => {
  const v = (name: string, lang: string, extra: Partial<SpeechSynthesisVoice> = {}) =>
    ({ name, lang, localService: true, default: false, voiceURI: name, ...extra }) as SpeechSynthesisVoice
  const all = [v('Microsoft David', 'en-US', { default: true }), v('Microsoft Aria Online (Natural)', 'en-US', { localService: false }),
    v('Microsoft Uzma Online (Natural)', 'ur-PK', { localService: false })]
  expect(pickVoice(all, 'en')?.name).toBe('Microsoft Aria Online (Natural)')
  expect(pickVoice(all, 'ur')?.name).toBe('Microsoft Uzma Online (Natural)')
  expect(pickVoice(all, 'ar')).toBeNull()
})
