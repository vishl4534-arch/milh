import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ur from './ur.json'
import type { I18nText, Lang } from '../api/types'

export const RTL = new Set<string>(['ur', 'ar'])
const LANG_KEY = 'milh.lang'

export const i18n = i18next.createInstance()
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function savedLanguage(): Lang | null {
  try {
    return (localStorage.getItem(LANG_KEY) as Lang | null) ?? null
  } catch {
    return null
  }
}

export async function setLanguage(lang: Lang): Promise<void> {
  await i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr'
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* ignore */
  }
}

/** Pick the text for `lang` from a per-language map, falling back to English, then anything. */
export function pick(text: I18nText | undefined, lang: string): string {
  if (!text) return ''
  return text[lang] ?? text.en ?? Object.values(text)[0] ?? ''
}
