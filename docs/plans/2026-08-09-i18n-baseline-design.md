# i18n Baseline — Design & Scope

**Date:** 2026-08-09
**Status:** Implemented — infra + app-shell slice (`bbdbde2`); scoped lint guardrail via the
documented zero-dependency fallback (`7789dce`), since `eslint-plugin-i18next` lacks clean ESLint-9
flat-config support at this pin. The Settings.tsx conversion (part of the original "first slice") is
**deferred**: it is a ~100-string, drift-risky diff against a 2,700-line assertion-heavy test file
and is better done as its own careful pass. Rest of the app migrates incrementally per the rollout
section, each slice appending its path to the guardrail glob.
**PRD item:** Phase 3 → Internationalization (i18n) — the sole remaining Phase 3 item
**Decisions locked (brainstorm):** infra + English baseline only · convert one first slice + add a guardrail · rest migrates incrementally.

## Goal

Make the renderer **translation-ready** and prove the full pipeline end-to-end on one slice, without a repo-wide diff. After this lands, adding a language is "drop in a JSON file"; migrating a component is "run `t()` on its strings and add its path to the guardrail glob."

## Non-goals (YAGNI for this round)

- No second locale, no language switcher, no RTL/layout work.
- No server-side (`server/`) or CLI string translation — API/CLI messages stay as-is.
- No runtime HTTP/back-end loader — locales are **bundled** (imported JSON), so init is synchronous and tests need no network.
- No repo-wide string extraction — only the first slice this round.

## Framework & dependencies

- `i18next` + `react-i18next` (the React standard; supports React 19).
- Dev: `eslint-plugin-i18next` for the `no-literal-string` guardrail. **Risk/verify:** confirm ESLint-9 flat-config support at install; fallback in "Guardrail" below if unavailable.
- No `i18next-browser-languagedetector` this round (English-only ⇒ fixed `lng: 'en'`).

## Architecture

```
src/renderer/lib/i18n/
  index.ts                 # creates + initializes the i18next singleton, exports it
  locales/en/
    common.json            # shared strings (buttons, generic labels)
    shell.json             # AppShell / Sidebar / TopBar
    settings.json          # Settings page
```

- `index.ts`: `i18n.use(initReactI18next).init({ resources: { en: { common, shell, settings } }, lng: 'en', fallbackLng: 'en', ns: ['common','shell','settings'], defaultNS: 'common', interpolation: { escapeValue: false }, returnNull: false })`. `escapeValue:false` because React already escapes.
- **Wiring:** `import '@/lib/i18n'` at the top of `src/renderer/main.tsx` (before `<App/>` renders). `useTranslation()` binds to the singleton — no `<I18nextProvider>` needed, but we may add it for explicitness.
- **Key convention:** `namespace:section.key` (e.g. `shell:nav.dashboard`, `settings:nvdKey.label`). Interpolation `{{count}}`; plurals via i18next `_one/_other` keys where the slice has counts.

## First slice (this round)

- `components/shell/AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx` → `shell` ns.
- `pages/Settings.tsx` → `settings` ns (shared button/label strings → `common`).

**Hard rule:** extracted English text must be **byte-for-byte identical** to today's hardcoded strings. `Settings.test.tsx` and `AppShell.test.tsx` assert on visible text; if the `en.json` values match, they pass **unchanged** — that is our regression guard. (If any test queries a string that becomes interpolated, we update that one assertion and say so.)

## Guardrail (scoped, so global lint stays green)

`npm run lint` runs `--max-warnings 0`, so a repo-wide literal-string rule would fail immediately against ~all un-migrated strings. Instead, add an **ESLint override block scoped to the migrated files only**:

```js
{ files: ['src/renderer/components/shell/**/*.tsx', 'src/renderer/pages/Settings.tsx'],
  plugins: { i18next },
  rules: { 'i18next/no-literal-string': ['error', { /* ignore className/testids/aria, allow non-alpha */ }] } }
```

Migrated files must then be literal-free (the point), and regressions on them fail lint. Each future slice appends its paths to this glob. **Fallback** if the plugin lacks clean flat-config/ESLint-9 support: ship the infra + slice now and track the guardrail as a fast follow (a small `no-restricted-syntax` JSXText rule scoped to the same glob).

## Testing

- `tests/setup.ts`: `import '@/lib/i18n'` so the singleton is initialized for every component test.
- **Regression:** existing `Settings.test.tsx` / `AppShell.test.tsx` pass unchanged (English preserved).
- **New** `lib/i18n/i18n.test.ts`: asserts init (`i18n.language === 'en'`, a known key resolves to its English value, a missing key falls back to the key not `null`), and one `t()`-driven render of a shell component.

## Verification gate

`npx eslint .` (0 warnings) · `npm run build:all` · `npm run test` (existing + new green) · a11y/e2e unaffected (text unchanged).

## Incremental rollout (after this round)

1. Add a namespace JSON (or extend `common`). 2. Replace literals with `t()` in the target files. 3. Add those paths to the guardrail glob. 4. Later, a new locale = copy `en/` → `<lang>/`, translate, register in `index.ts`, add a switcher.

## Risks

1. **Exact-text drift** breaks string-matching tests → mitigate by copying verbatim; run the suite before/after.
2. **`no-literal-string` noise/plugin compat** → scoped override + ignore options; documented fallback.
3. **Dynamic strings** (counts, names) in the slice → use interpolation/plurals; adjust the few affected test assertions explicitly.
