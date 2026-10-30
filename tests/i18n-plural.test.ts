import { expect, test } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../src/renderer/src/locales/en'
import de from '../src/renderer/src/locales/de'
test('count strings pluralize in en and de', () => {
  const { t, locale } = createI18n({ legacy: false, locale: 'en', messages: { en, de } }).global
  expect(t('editor.errors', 1)).toBe('1 error')
  expect(t('editor.errors', 3)).toBe('3 errors')
  expect(t('editor.warnings', 1)).toBe('1 warning')
  expect(t('editor.gapsFilled', 24)).toBe('Inserted 24 interpolated entries into gaps')
  locale.value = 'de'
  expect(t('editor.errors', 1)).toBe('1 Fehler')
  expect(t('editor.warnings', 1)).toBe('1 Warnung')
  expect(t('editor.warnings', 2)).toBe('2 Warnungen')
})
