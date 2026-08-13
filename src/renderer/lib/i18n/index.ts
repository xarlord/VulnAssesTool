import i18next from 'i18next'
import type { Resource, ResourceLanguage } from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * The application's i18next singleton (Phase 3 → Internationalization, English baseline).
 *
 * Design choices (see docs/plans/2026-08-09-i18n-baseline-design.md):
 * - Initializes the DEFAULT i18next instance, so `useTranslation()` resolves globally
 *   without an <I18nextProvider> — existing component tests render unchanged.
 * - Namespaces AUTO-LOAD: every `locales/en/<ns>.json` file is registered as namespace `<ns>`
 *   via `import.meta.glob` (eager, so it is bundled synchronously). Adding a slice is therefore
 *   just "drop a JSON file" — no edit here, no <I18nextProvider>, and no shared-file merge
 *   conflict when several components are migrated in parallel.
 * - Resources are bundled and `initImmediate: false`, so init is synchronous and `t()` returns
 *   real strings the moment this module is imported (tests get English by importing it in setup).
 * - English-only for now. A new locale = add `locales/<lang>/*.json` and register it below.
 */
const modules = import.meta.glob('./locales/en/*.json', { eager: true }) as Record<
  string,
  { default: ResourceLanguage }
>

const en: ResourceLanguage = {}
const namespaces: string[] = []
for (const path of Object.keys(modules).sort()) {
  const ns = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '')
  en[ns] = modules[path].default
  namespaces.push(ns)
}

const resources: Resource = { en }
const defaultNS = namespaces.includes('shell') ? 'shell' : namespaces[0]

export const i18n = i18next

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    ns: namespaces,
    defaultNS,
    resources,
    interpolation: { escapeValue: false }, // React already escapes output
    returnNull: false, // a missing key yields the key string, never null
    initImmediate: false, // synchronous init: t() works at import time
    react: { useSuspense: false }, // resources are bundled/sync — never suspend on render
  })
}
