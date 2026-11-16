import { beforeEach, expect, test } from 'vitest'
import { i18n, setLanguage } from './index'

beforeEach(async () => {
  await setLanguage('en')
})

test('sets dir=rtl for ur and ltr for en', async () => {
  await setLanguage('ur')
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ur')
  await setLanguage('en')
  expect(document.documentElement.dir).toBe('ltr')
})

test('urdu strings exist for every english key', () => {
  const en = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>
  const ur = i18n.getResourceBundle('ur', 'translation') as Record<string, unknown>
  const flat = (o: Record<string, unknown>, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
    )
  expect(flat(ur).sort()).toEqual(flat(en).sort())
})
