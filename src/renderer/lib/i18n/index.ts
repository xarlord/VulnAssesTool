import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import shellEn from './locales/en/shell.json'

/**
 * The application's i18next singleton (Phase 3 → Internationalization, English baseline).
 *
 * Design choices (see docs/plans/2026-08-09-i18n-baseline-design.md):
 * - Initializes the DEFAULT i18next instance, so `useTranslation()` resolves globally
 *   without an <I18nextProvider> — existing component tests render unchanged.
 * - Resources are bundled (imported JSON) and `initImmediate: false`, so init is
 *   synchronous and `t()` returns real strings the moment this module is imported
 *   (tests get English simply by importing it in tests/setup.ts).
 * - English-only for now. Add a locale later by dropping in locales/<lang>/*.json and
 *   registering it in `resources`; add a namespace by importing its JSON and listing it in `ns`.
 */
export const i18n = i18next

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['shell'],
    defaultNS: 'shell',
    resources: { en: { shell: shellEn } },
    interpolation: { escapeValue: false }, // React already escapes output
    returnNull: false, // a missing key yields the key string, never null
    initImmediate: false, // synchronous init: t() works at import time
    react: { useSuspense: false }, // resources are bundled/sync — never suspend on render
  })
}
