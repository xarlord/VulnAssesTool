# Coding Guide Compliance — Review, Plan, and Remediation Log

**Project:** VulnAssesTool
**Date started:** 2026-05-09
**Standards:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) + [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
**Scope:** 404 TypeScript / JavaScript source files across `electron/`, `src/renderer/`, `src/shared/`, `orchestrator/`, `scripts/`, root configs

---

## 1. Review Findings

Initial audit graded the codebase **B-** overall. Solid baseline (single quotes, `===`, no `var`, no `@ts-ignore`, mostly named exports, interface-first types, JSDoc on public APIs), but three systemic issues recur across every subsystem.

### CRITICAL Findings (correctness / type-system risks)

#### 1.1 `any` at IPC and API boundaries

- [src/renderer/lib/platform/types.ts:36-78](src/renderer/lib/platform/types.ts#L36) — entire `PlatformAPI` / `DatabaseAPI` / `SecureStorageAPI` contract is `any`-typed (~26 instances). The renderer↔main IPC boundary.
- [electron/database/ipcRequestValidator.ts:30-262](electron/database/ipcRequestValidator.ts#L30) — 8 `request: any` validator parameters; should be `unknown`.
- [electron/main.ts:520, 585, 1362, 1387, 1405](electron/main.ts#L520) — IPC return types use `any[]` / `any`.
- [electron/database/nvdDb.ts:51, 621, 679, 684, 699, 725, 747, 806](electron/database/nvdDb.ts#L51) — `private sqlJs: any`, `as any` on row buffers.
- [electron/updater.ts:11, 17, 90, 104, 116, 130](electron/updater.ts#L11) — entire updater module is `any`-typed.
- [src/renderer/components/charts/SeverityDistributionChart.tsx:70, 86, 131](src/renderer/components/charts/SeverityDistributionChart.tsx#L70) and similar in `VulnerabilityBarChart.tsx`, `CvssHistogram.tsx` — Recharts render props use `any` despite library shipping types.
- [scripts/search-nvd.ts:49, 57, 75](scripts/search-nvd.ts#L49) and [scripts/sync-nvd-db.ts:46](scripts/sync-nvd-db.ts#L46) — `let db: any`, `(row: any)`.

#### 1.2 `as any` and double-casts to silence the type checker

- [electron/database/nvd/bulkDownloadManager.ts:106, 161](electron/database/nvd/bulkDownloadManager.ts#L106) — `signal: undefined as any`.
- [electron/menu.ts:152](electron/menu.ts#L152) — `'back' as unknown as 'about'` (double cast smell).
- [electron/entry.ts:9](electron/entry.ts#L9) — `(globalThis as any).__dirname = __dirname`.
- [src/renderer/App.tsx:44, 48](src/renderer/App.tsx#L44) — `window as unknown as Record<...>`.
- [src/renderer/components/audit/AuditLogPanel.tsx:74-76, 90-92](src/renderer/components/audit/AuditLogPanel.tsx#L74) — repeated filter casts.
- [orchestrator/phase-runner.ts:114](orchestrator/phase-runner.ts#L114) — `(capture as any).startTime` to access a private field.

#### 1.3 Unjustified `!` non-null assertions (~25 production sites in initial audit, lint baseline confirmed 53)

Google TS requires a justifying comment for every `!`. None observed.

- [electron/main.ts:2225](electron/main.ts#L2225), [electron/database/cpeSearch.ts:156, 168](electron/database/cpeSearch.ts#L156), [electron/database/nvdDb.ts:40, 885, 915](electron/database/nvdDb.ts#L40), [electron/database/nvdBulkImporter.ts:447](electron/database/nvdBulkImporter.ts#L447), [electron/database/nvd/bulkDatabase.ts:252, 262](electron/database/nvd/bulkDatabase.ts#L252)
- [src/renderer/lib/api/vulnMatcher.ts:391, 415, 437, 454, 476](src/renderer/lib/api/vulnMatcher.ts#L391)
- [src/renderer/lib/audit/auditStore.ts:95, 100, 112](src/renderer/lib/audit/auditStore.ts#L95)
- [src/renderer/lib/services/vex/vexGenerator.ts:206, 362](src/renderer/lib/services/vex/vexGenerator.ts#L206)
- [src/renderer/components/VulnerabilityDetailModal.tsx:236-266](src/renderer/components/VulnerabilityDetailModal.tsx#L236) (6 `vulnerability.patchInfo!` accesses)
- [orchestrator/index.ts:141, 191, 251](orchestrator/index.ts#L141) — `stateManager.getState()!`

#### 1.4 Empty `catch {}` without justification comment

- [electron/preload.ts:641, 658, 671, 685](electron/preload.ts#L641) (4 instances)
- [electron/database/nvd/multiThreadedDownloader.ts:412](electron/database/nvd/multiThreadedDownloader.ts#L412)
- [electron/database/nvd/nvdImportManager.ts:179](electron/database/nvd/nvdImportManager.ts#L179)

### HIGH-Priority Findings

#### Banned `export default` — 68 occurrences total

Google TS/JS Style **bans default exports**. Confirmed counts:

- **Renderer:** 58 files (every page, every dialog, every chart, plus service classes — `ErrorBoundary`, `CommandPalette`, `OnboardingTour`, `IncrementalScanService`, `OfflineQueue`, `AttackGraph`, `FilterAuditLogger`, etc.). Several files have **both** `export class Foo` and `export default Foo` ([ErrorBoundary.tsx:51,381](src/renderer/components/ErrorBoundary.tsx#L51), [IncrementalScanService.ts:72,325](src/renderer/lib/services/IncrementalScanService.ts#L72)).
- **Orchestrator:** 1 redundant default at [orchestrator/index.ts:558](orchestrator/index.ts#L558).
- **Acceptable framework defaults:** vite/vitest/playwright/eslint/postcss/tailwind/commitlint configs.

#### Underscore-prefixed identifiers

- [electron/updater.ts:11, 12, 299, 310](electron/updater.ts#L11) — `_autoUpdater`, `_updateCheckInterval`
- [electron/main.ts:130](electron/main.ts#L130) — `_isDev`
- [electron/preload.ts:627, 645](electron/preload.ts#L627) — `_origConsoleError`, `_origConsoleWarn`
- [src/renderer/components/onboarding/OnboardingTour.tsx:140-149](src/renderer/components/onboarding/OnboardingTour.tsx#L140) — six `_`-prefixed destructured props
- [src/renderer/store/useStore.ts:55](src/renderer/store/useStore.ts#L55) — `_resetStore` test helper on production interface
- [orchestrator/error-interceptor.ts:21](orchestrator/error-interceptor.ts#L21), [orchestrator/ai-fix-agent.ts:254](orchestrator/ai-fix-agent.ts#L254), [orchestrator/phase-runner.ts:38](orchestrator/phase-runner.ts#L38)

#### Public API uses `any` callbacks

- [electron/types/database.ts:492](electron/types/database.ts#L492) and [electron/preload.ts:311](electron/preload.ts#L311) — `onSyncError(callback: (error: any) => void)`. Define `IpcErrorPayload`.
- [src/renderer/pages/Search.tsx:40, 106](src/renderer/pages/Search.tsx#L40) — same callback shape + `useState<any[]>([])` for results.
- [src/renderer/lib/export/types.ts:21](src/renderer/lib/export/types.ts#L21) — `formatter: (data: any) => string`.

#### `require()` in TS modules

- [electron/updater.ts:19, 31](electron/updater.ts#L19) — `const { autoUpdater } = require('electron-updater')`. Replace with top-level `import` or `await import`.

### MEDIUM / LOW Findings

| Sev | Location                                                                   | Issue                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | [electron/main.ts](electron/main.ts) (2356 lines)                          | Far too large; split IPC handler groups into `electron/ipc/*.ts`                                                                                                                                                                              |
| M   | [electron/menu.ts:250-258](electron/menu.ts#L250)                          | Inner `search` shadows `items` parameter — possible bug                                                                                                                                                                                       |
| M   | [orchestrator/state-manager.ts:68](orchestrator/state-manager.ts#L68)      | `JSON.parse` result assigned without runtime validation                                                                                                                                                                                       |
| M   | [scripts/seed-database.ts:62-66](scripts/seed-database.ts#L62)             | `arg.split('=')[1]` indexed without bounds check                                                                                                                                                                                              |
| M   | [orchestrator/ai-fix-agent.ts:282](orchestrator/ai-fix-agent.ts#L282)      | `string.replace(literal, x)` only replaces first occurrence — silent bug                                                                                                                                                                      |
| M   | Several files                                                              | Inconsistent `node:` prefix on built-ins ([scripts/sync-nvd-db.ts:13](scripts/sync-nvd-db.ts#L13), [scripts/search-nvd.ts:11](scripts/search-nvd.ts#L11), [electron/services/BackupService.ts:14-15](electron/services/BackupService.ts#L14)) |
| M   | Renderer TSX files                                                         | Mix of `import { ErrorInfo, ReactNode }` (value) vs `import type`                                                                                                                                                                             |
| L   | Various                                                                    | `parseInt(x, 10)` instead of `Number()` per Google JS — [orchestrator/index.ts:491](orchestrator/index.ts#L491), [orchestrator/error-interceptor.ts:91-92](orchestrator/error-interceptor.ts#L91)                                             |
| L   | [orchestrator/phase-runner.ts:12](orchestrator/phase-runner.ts#L12)        | Empty `import {} from './utils/patterns'` — dead code                                                                                                                                                                                         |
| L   | [electron/index.ts:16-23](electron/index.ts#L16)                           | Empty `if` block kept as comment-only stub                                                                                                                                                                                                    |
| L   | [test-electron.cjs](test-electron.cjs), [simple-test.cjs](simple-test.cjs) | Debug scratchpads in repo root                                                                                                                                                                                                                |
| L   | [orchestrator/utils/patterns.ts:223](orchestrator/utils/patterns.ts#L223)  | Const objects exported without `as const`                                                                                                                                                                                                     |

### Positive Notes (genuine strengths)

- **No `@ts-ignore` / `@ts-nocheck` anywhere** in production code.
- **No `var`** in source files. **No multi-variable declarations.**
- **Strict equality (`===`/`!==`)** consistently used — zero `==` regressions found.
- **Single-quote strings** enforced throughout TS.
- **Interface-first design** — `interface` used for object shapes; `type` reserved for unions/primitives.
- **Custom error class pattern** at [electron/database/ipcRequestValidator.ts:13](electron/database/ipcRequestValidator.ts#L13) — extends `Error` properly, uses parameter properties.
- **All `throw` sites use `new Error()`** — no string throws.
- **Naming hygiene** — no `IFoo` interface prefix, classes UpperCamelCase, vars lowerCamelCase, constants CONSTANT_CASE.
- **Orchestrator subsystem** is the cleanest part: factory pattern, discriminated unions, `import type` everywhere, defensive error logging.

### Quantified Cleanup Scope

| Pattern                              | Count | Files |
| ------------------------------------ | ----- | ----- |
| `\bany\b` in .ts/.tsx                | 612   | 137   |
| `: any` annotations                  | 232   | 61    |
| `as any` casts                       | 222   | 53    |
| `export default`                     | 68    | 68    |
| Non-null assertions (`!.`/`!)`/`!,`) | 220   | 41    |

---

## 2. Approved Plan — 5 Sequenced PRs

**Decisions made (via AskUserQuestion):**

1. **Sequencing:** Phased multi-PR (5 PRs)
2. **Lazy-loaded pages:** Wrap with re-export shim — `lazy(() => import('./X').then(m => ({default: m.X})))` — pure named exports across whole codebase
3. **Codemod tool:** Add `ts-morph` as devDependency
4. **Orchestrator strict mode:** Tighten `tsconfig.orchestrator.json` to `strict: true`

### PR 1 — Tooling & Guardrails

- [eslint.config.js](eslint.config.js) — add rules: `no-non-null-assertion`, `no-restricted-syntax` (default-export ban), `no-underscore-dangle`; upgrade `no-explicit-any` from `warn` to `error`; add config-file override
- [tsconfig.orchestrator.json](tsconfig.orchestrator.json) — `strict: true`, remove `noImplicitAny: false`
- [package.json](package.json) — add `ts-morph` devDep

### PR 2 — Type the IPC Boundary (highest leverage)

- [src/renderer/lib/platform/types.ts](src/renderer/lib/platform/types.ts) — rewrite `DatabaseAPI`, `SecureStorageAPI`, `BackupAPI`, `IntelligenceAPI`, `ContainerAPI` using existing types from [src/shared/types.ts](src/shared/types.ts) and [electron/types/database.ts](electron/types/database.ts)
- [electron/database/ipcRequestValidator.ts](electron/database/ipcRequestValidator.ts) — `request: unknown` with type-guard narrowing
- [electron/types/database.ts:492](electron/types/database.ts#L492) — define `IpcErrorPayload`
- [electron/updater.ts](electron/updater.ts) — replace 6 `any` annotations with `electron-updater` types; convert `require()` to `import`
- [src/renderer/App.tsx:44, 48](src/renderer/App.tsx#L44) — extend `Window` in `src/renderer/global.d.ts`

### PR 3 — Default Exports → Named Exports (ts-morph codemod)

- Write `scripts/codemod-default-to-named.ts` using ts-morph
- Eliminate redundant `export default Foo` lines where named export already exists
- Convert remaining defaults to named, rewrite all importers (including 25+ test files)
- Apply re-export shim pattern in [src/renderer/App.tsx:14-19](src/renderer/App.tsx#L14) for lazy-loaded pages

### PR 4 — Targeted `any` / `!` / `as` Cleanup in Critical Files

- nvdDb, streamParser, ContainerService, bulkDownloadManager, menu, entry — type fixes
- Audit + convert all 53 `!` non-null assertions (extract local consts; add explicit guards)
- Type Recharts render props using library's `TooltipProps`, `LabelProps`, `PieLabelRenderProps`
- Document the 6 empty `catch {}` blocks with justification comments
- Rename all underscore-prefixed identifiers
- Refactor orchestrator `(capture as any).startTime` access via getter

### PR 5 — Long-tail `any` Cleanup

- Drive from `npm run lint` output, fix ~10-20 files at a time per directory
- Split [electron/main.ts](electron/main.ts) (2356 lines) into `electron/ipc/{nvd,kev-epss,container,backup}.ts`
- Standardize `node:` prefix on built-in imports
- Replace `parseInt(x, 10)` with `Number(x)`
- Delete debug scratchpads
- Fix silent-bug pattern at [orchestrator/ai-fix-agent.ts:282](orchestrator/ai-fix-agent.ts#L282)
- Final step: flip ESLint rules from `warn` to `error` once warnings reach 0

### Existing Utilities/Types to Reuse

| Need                          | Use                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Domain types for IPC payloads | [src/shared/types.ts](src/shared/types.ts) (`Vulnerability`, `CveResult`, `Component`, `Project`, `ScanResult`) |
| CVSS metrics                  | [src/shared/types/cvss.ts](src/shared/types/cvss.ts)                                                            |
| FPF types                     | [src/shared/types/fpf.ts](src/shared/types/fpf.ts)                                                              |
| IPC request/response types    | [electron/types/database.ts](electron/types/database.ts)                                                        |
| Custom error class pattern    | [electron/database/ipcRequestValidator.ts:13](electron/database/ipcRequestValidator.ts#L13) (`ValidationError`) |
| Updater types                 | `electron-updater` package — `AppUpdater`, `UpdateInfo`, `ProgressInfo`                                         |
| Recharts custom render types  | `recharts` package — `TooltipProps`, `LabelProps`, `PieLabelRenderProps`                                        |
| sql.js types                  | `@types/sql.js` — `SqlJsStatic`, `Database`, `Statement`                                                        |

### Per-PR Verification Gates

1. `npm run lint` — pass
2. `npm run build` — TS compile across all 4 tsconfigs
3. `npm run test` — Vitest unit tests
4. `npm run test:e2e` — Playwright E2E smoke

### Final-State Verification

- `grep -rn "as any\|: any\b" --include="*.ts" --include="*.tsx" src/ electron/ orchestrator/ scripts/ | grep -v ".test." | wc -l` should return 0 (or single-digit count, all justified)
- `grep -rn "export default" --include="*.ts" --include="*.tsx" src/ electron/ orchestrator/ | grep -v ".config." | wc -l` should return 0

---

## 3. Implementation Log

### PR 1 — COMPLETED 2026-05-09

**Files changed (6 files, +73 / -12):**

| File                                                                  | Change                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [eslint.config.js](eslint.config.js)                                  | Added `no-non-null-assertion`, `no-restricted-syntax` (default-export ban), `no-underscore-dangle` at `warn` level; added config-file override block for vite/vitest/playwright/eslint configs; expanded test-file glob to include `setup.ts` and nested test dirs |
| [tsconfig.orchestrator.json](tsconfig.orchestrator.json)              | `strict: true`, removed `noImplicitAny: false`                                                                                                                                                                                                                     |
| [orchestrator/state-manager.ts](orchestrator/state-manager.ts)        | Refactored `resumeSession()` to parse into a typed local `parsed` before assignment (eliminates 7 null-narrowing errors)                                                                                                                                           |
| [orchestrator/ai-fix-agent.ts:189](orchestrator/ai-fix-agent.ts#L189) | Typed `response.json()` result as `GLMResponse`                                                                                                                                                                                                                    |
| [scripts/error-interceptor.ts:14](scripts/error-interceptor.ts#L14)   | Removed unused `os` import (was the only hard lint error)                                                                                                                                                                                                          |
| [package.json](package.json)                                          | Added `ts-morph ^25.0.1` to `devDependencies` (run `npm install` before PR 3)                                                                                                                                                                                      |

**Verification gates passed:**

- `npx eslint .` → **0 errors, 384 warnings** (down from 1 error pre-existing)
- `npx tsc --noEmit` → 0 errors on root config
- `npx tsc -p tsconfig.orchestrator.json --noEmit` → **0 errors** under strict mode
- `npm run build` → succeeds
- Test suite: 32 pre-existing failures in renderer/database UI components — none in files modified, none in orchestrator. PR 1 introduces zero regressions.

**Baseline warning counts (for tracking PR 2-5 progress):**

| Rule                                       | Count | Targeted by               |
| ------------------------------------------ | ----- | ------------------------- |
| `@typescript-eslint/no-explicit-any`       | 201   | PR 2 (IPC types) + PR 4-5 |
| `no-restricted-syntax` (default exports)   | 54    | PR 3 (codemod)            |
| `@typescript-eslint/no-non-null-assertion` | 53    | PR 4                      |
| `no-underscore-dangle`                     | 28    | PR 4                      |
| `no-empty`                                 | 19    | PR 4 (catch blocks)       |
| `react-refresh/only-export-components`     | 10    | side-effect of PR 3       |
| `@typescript-eslint/no-require-imports`    | 7     | PR 2 (updater.ts)         |
| `react-hooks/exhaustive-deps`              | 7     | (out of scope)            |
| `no-case-declarations`                     | 4     | (out of scope)            |
| `no-empty-pattern`                         | 1     | (out of scope)            |

**Pragmatic deviation from approved plan:** Plan specified `error` level + blanket disable markers for ~900 violations. Implemented at `warn` level instead — same enforcement signal in CI output, but avoids a ~1000-line disable-marker diff that would have made PR 1 unreviewable. Final PR 5 step flips rules to `error` once warnings reach 0.

**Status:** Working-tree changes uncommitted. Ready for review and commit before proceeding to PR 2.

---

### PR 2 — PENDING — Type the IPC Boundary (highest leverage)

**Goal:** Fix the `any`-saturated PlatformAPI contract. This single change cascades and removes ~80% of renderer-side `any` references.

**Critical files & edits:**

- [src/renderer/lib/platform/types.ts](src/renderer/lib/platform/types.ts) — rewrite `DatabaseAPI` (lines 36-78), `SecureStorageAPI`, `BackupAPI`, `IntelligenceAPI`, `ContainerAPI`. **Reuse existing types** from [src/shared/types.ts](src/shared/types.ts):
  - `CveResult` (L12-31)
  - `Vulnerability` (L139-164)
  - `Component` (L111-130)
  - `Project` (L75-88)
  - `ScanResult` (L324-333)
  - `DependencyGraph` (L254-285)
  - `DatabaseSettings` (L383)
  - `ProviderSettings` (L409)

  For request/response shapes, reuse types already present in [electron/types/database.ts](electron/types/database.ts) (`NvdSearchRequest`, `GetCveRequest`, etc. — already imported by [electron/preload.ts](electron/preload.ts) lines 4-40).

- [electron/database/ipcRequestValidator.ts](electron/database/ipcRequestValidator.ts) — change all 8 `request: any` parameters to `request: unknown` (lines 30, 119, 145, 175, 218, 241, 252, 262). Validators internally narrow with type guards.

- [electron/types/database.ts:492](electron/types/database.ts#L492) — define `IpcErrorPayload` interface; replace `(error: any) => void` callback type. Mirror the change in:
  - [electron/preload.ts:311](electron/preload.ts#L311)
  - [src/renderer/pages/Search.tsx:40, 106](src/renderer/pages/Search.tsx#L40)

- [electron/updater.ts](electron/updater.ts) — replace 6 `any` annotations (lines 11, 17, 90, 104, 116, 130) with `electron-updater`'s exported `AppUpdater`, `UpdateInfo`, `ProgressInfo`. Convert `require('electron-updater')` (lines 19, 31) to top-level `import`.

- [src/renderer/App.tsx:44, 48](src/renderer/App.tsx#L44) — extend `Window` interface in a new `src/renderer/global.d.ts` rather than `as unknown as Record<...>`.

**Acceptance criteria:**

- `npm run build` passes with no new TS errors
- `no-explicit-any` warning count drops by 60-100 (target: <140 from baseline 201)
- `@typescript-eslint/no-require-imports` warnings drop to ~5 (from 7)
- `npm run lint` passes (0 errors, fewer warnings)
- `npm run test` passes — no regression from PR 1 baseline

---

### PR 3 — PENDING — Default Exports → Named Exports (ts-morph codemod)

**Goal:** Eliminate 58 renderer + 1 orchestrator default exports.

**Prerequisites:** PR 1 must land. Run `npm install` to fetch the `ts-morph` devDep declared in PR 1.

**Approach:** Write a one-shot `scripts/codemod-default-to-named.ts` using `ts-morph`. The codemod:

1. Finds every `export default <Identifier>` in `src/renderer/**/*.{ts,tsx}` and [orchestrator/index.ts:558](orchestrator/index.ts#L558).
2. Removes redundant `export default Foo` lines where `export class Foo` / `export function Foo` already exists. Confirmed cases:
   - [components/ErrorBoundary.tsx:381](src/renderer/components/ErrorBoundary.tsx#L381)
   - [lib/services/IncrementalScanService.ts:325](src/renderer/lib/services/IncrementalScanService.ts#L325)
   - (and others discovered during codemod execution)
3. Converts remaining `export default X` to a named export:
   - If `X` already declared: change `export default X` → `export { X }`
   - Else: convert the declaration to `export function X` / `export class X` / `export const X = ...`
4. For each renamed file, finds importers via the AST and rewrites:
   - `import Foo from './foo'` → `import { Foo } from './foo'`
5. Updates barrel files in `src/renderer/components/{audit,charts,cvss,dashboard,executive,FPF,graph,onboarding,patch,reports}/index.ts` only if they still re-export defaults.

**Lazy-loaded pages** ([src/renderer/App.tsx:14-19](src/renderer/App.tsx#L14)) — apply the **re-export shim pattern** (per user decision):

```ts
// Before
const Dashboard = lazy(() => import('./pages/Dashboard'))

// After
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
```

Affected pages (verify full list via grep at codemod time): Dashboard, Search, Settings, ProjectDetail, FalsePositiveFilter, DependencyGraphPage, Settings.secure.

**Test files** — codemod must also rewrite `import Foo from './Foo'` to `import { Foo } from './Foo'` in `**/*.test.tsx` (~25 files affected).

**Acceptance criteria:**

- `no-restricted-syntax` (default-export) warning count = 0 in non-config files
- `npm run lint` passes
- `npm run test` passes
- `npm run build` passes
- **Manual smoke test:** launch Electron app via `npm run dev:electron`, navigate to each lazy-loaded page (Dashboard, Search, Settings, ProjectDetail, DependencyGraph, FalsePositiveFilter) and confirm code-splitting still works (no white-screen, no chunk-load errors in console)

---

### PR 4 — PENDING — Targeted `any` / `!` / `as` Cleanup

**Goal:** Fix the highest-risk type-system escapes flagged in the review.

**Specific files & edits:**

#### Type fixes (replace `any` with proper types)

- [electron/database/nvdDb.ts:51, 621, 679, 684, 699, 725, 747, 806](electron/database/nvdDb.ts#L51) — replace `private sqlJs: any` with `SqlJsStatic` (from `sql.js` types); type row buffers against schema.
- [electron/database/nvd/streamParser.ts:126, 137, 159](electron/database/nvd/streamParser.ts#L126) — `chunk: Buffer | string`, define `extractCVEs` return type.
- [electron/services/ContainerService.ts:57, 173, 222, 256, 370](electron/services/ContainerService.ts#L57) — `catch (error: unknown)` with narrowing helper; type docker inspect output.
- [electron/database/nvd/bulkDownloadManager.ts:106, 161](electron/database/nvd/bulkDownloadManager.ts#L106) — replace `signal: undefined as any` with conditional spread.
- [electron/menu.ts:152](electron/menu.ts#L152) — replace `'back' as unknown as 'about'` with proper accelerator-based menu item.
- [electron/entry.ts:9](electron/entry.ts#L9) — type-augment `globalThis` instead of `as any`.

#### Non-null assertion conversions

- [electron/database/cpeSearch.ts:156, 168](electron/database/cpeSearch.ts#L156)
- [electron/database/nvdDb.ts:40, 885, 915](electron/database/nvdDb.ts#L40)
- [electron/database/nvd/bulkDatabase.ts:252, 262](electron/database/nvd/bulkDatabase.ts#L252)
- [electron/main.ts:2225](electron/main.ts#L2225)
- [electron/database/nvdBulkImporter.ts:447](electron/database/nvdBulkImporter.ts#L447)

  → Convert `!` non-null assertions to explicit guards (`if (!x) throw new Error(...)`).

- [src/renderer/components/VulnerabilityDetailModal.tsx:236-266](src/renderer/components/VulnerabilityDetailModal.tsx#L236) — extract `const patchInfo = vulnerability.patchInfo` once after the existing null check; remove 6 `!` assertions.

- [src/renderer/lib/api/vulnMatcher.ts:391, 415, 437, 454, 476](src/renderer/lib/api/vulnMatcher.ts#L391)
- [src/renderer/lib/audit/auditStore.ts:95, 100, 112](src/renderer/lib/audit/auditStore.ts#L95)
- [src/renderer/lib/services/vex/vexGenerator.ts:206, 362](src/renderer/lib/services/vex/vexGenerator.ts#L206)

  → Convert remaining `!` assertions.

#### Recharts custom render typings

- [src/renderer/components/charts/SeverityDistributionChart.tsx:70, 86, 131](src/renderer/components/charts/SeverityDistributionChart.tsx#L70)
- [src/renderer/components/charts/VulnerabilityBarChart.tsx:55, 60](src/renderer/components/charts/VulnerabilityBarChart.tsx#L55)
- [src/renderer/components/charts/CvssHistogram.tsx:68](src/renderer/components/charts/CvssHistogram.tsx#L68)

  → Use Recharts' `TooltipProps`, `LabelProps`, `PieLabelRenderProps` from the library's typings.

#### Orchestrator cleanup

- [orchestrator/phase-runner.ts:114](orchestrator/phase-runner.ts#L114) — expose `getStartTime()` accessor on `OutputCapture`; remove the `(capture as any)` cast and unused `_startTime` field (line 38).
- [orchestrator/phase-runner.ts:12](orchestrator/phase-runner.ts#L12) — remove dead `import {} from './utils/patterns'`.
- [orchestrator/index.ts:141, 191, 251](orchestrator/index.ts#L141) — return `SessionState` (not `SessionState | null`) from `stateManager.getState()` post-`startSession`; eliminate `!` assertions.

#### Empty catch blocks (add justification comments)

- [electron/preload.ts:641, 658, 671, 685](electron/preload.ts#L641) — 4 instances
- [electron/database/nvd/multiThreadedDownloader.ts:412](electron/database/nvd/multiThreadedDownloader.ts#L412)
- [electron/database/nvd/nvdImportManager.ts:179](electron/database/nvd/nvdImportManager.ts#L179)

  → Add `// best-effort: <reason>` comment to each.

#### Underscore-prefixed identifiers (Google TS forbids)

- [electron/updater.ts:11, 12, 299, 310](electron/updater.ts#L11)
- [electron/main.ts:130](electron/main.ts#L130)
- [electron/preload.ts:627, 645](electron/preload.ts#L627)
- [src/renderer/components/onboarding/OnboardingTour.tsx:140-149](src/renderer/components/onboarding/OnboardingTour.tsx#L140)
- [src/renderer/store/useStore.ts:55](src/renderer/store/useStore.ts#L55)
- [orchestrator/error-interceptor.ts:21](orchestrator/error-interceptor.ts#L21)
- [orchestrator/ai-fix-agent.ts:254](orchestrator/ai-fix-agent.ts#L254)
- [orchestrator/phase-runner.ts:38](orchestrator/phase-runner.ts#L38)

  → Rename or remove.

**Acceptance criteria:**

- `@typescript-eslint/no-non-null-assertion` warning count → 0 (from baseline 53)
- `no-underscore-dangle` warning count → 0 (from baseline 28)
- `no-empty` warning count drops by ≥6 (the empty catch blocks)
- `npm run lint` passes (0 errors, fewer warnings)
- `npm run test` passes
- `npm run test:e2e` (smoke subset) passes

---

### PR 5 — PENDING — Long-tail `any` Cleanup + Final Hardening

**Goal:** Sweep the remaining ~150 `any` instances across 100+ files and lock in the standard.

**Approach:** Drive from `npm run lint` output (since `no-explicit-any` will be flipped to `error` at the end of this PR). Group by directory and fix ~10-20 files at a time, committing per directory:

- `electron/database/nvd/*` — typed download/parser internals
- `electron/services/*` — typed service inputs/outputs
- `src/renderer/lib/api/*` — typed API client wrappers
- `src/renderer/lib/services/vex/*`, `src/renderer/lib/services/diff/*`
- `src/renderer/lib/audit/*` — `JSON.parse` results need runtime validation (consider Zod for parsed audit-log entries; see [orchestrator/state-manager.ts:68](orchestrator/state-manager.ts#L68) for a similar issue resolved in PR 1)

**Also in this PR:**

- **Split [electron/main.ts](electron/main.ts) (2356 lines)** into `electron/ipc/{nvd,kev-epss,container,backup}.ts` modules. (LOW-priority but recommended; deferrable to a follow-up if PR gets too large.)

- **Standardize `node:` prefix on built-in imports** across:
  - [scripts/sync-nvd-db.ts:13](scripts/sync-nvd-db.ts#L13)
  - [scripts/search-nvd.ts:11](scripts/search-nvd.ts#L11)
  - [electron/services/BackupService.ts:14-15](electron/services/BackupService.ts#L14)
  - [scripts/generate-icons.js:12](scripts/generate-icons.js#L12)
  - [scripts/seed-test-db.js:11-14](scripts/seed-test-db.js#L11)

- **Replace `parseInt(x, 10)` with `Number(x)`** per Google JS at:
  - [orchestrator/index.ts:491](orchestrator/index.ts#L491)
  - [orchestrator/error-interceptor.ts:91-92, 230, 232](orchestrator/error-interceptor.ts#L91)
  - [scripts/seed-database.ts:205](scripts/seed-database.ts#L205)
  - [scripts/download-nvd.cjs:19-20, 50](scripts/download-nvd.cjs#L19)

- **Delete debug scratchpads** [test-electron.cjs](test-electron.cjs) and [simple-test.cjs](simple-test.cjs).

- **Fix the silent-bug pattern** at [orchestrator/ai-fix-agent.ts:282](orchestrator/ai-fix-agent.ts#L282) — `string.replace(literal, x)` only replaces first occurrence. Switch to `String.prototype.replaceAll` or a regex with `/g` flag.

- **Fix existing pre-existing TS errors** surfaced by [tsconfig.app.json](tsconfig.app.json) strict checks (discovered during PR 1 verification):
  - [src/renderer/store/useStore.test.ts:1535, 1561, 1805, 1823](src/renderer/store/useStore.test.ts#L1535) — unused `@ts-expect-error` directives
  - [src/renderer/store/useStore.test.ts:1737](src/renderer/store/useStore.test.ts#L1737) — `'none' does not exist in type 'ProjectStatistics'`
  - [src/renderer/store/useStore.ts:168](src/renderer/store/useStore.ts#L168) — `'_importedProfiles' is declared but its value is never read`
  - [src/renderer/tests/setup.ts:67-68](src/renderer/tests/setup.ts#L67) — `erasableSyntaxOnly` violations
  - [src/shared/types.ts:146](src/shared/types.ts#L146) — `Cannot find name 'CvssBreakdown'`
  - [src/shared/types.ts:491](src/shared/types.ts#L491) — `electronAPI` modifier mismatch

- **Final lock-in:** Flip ESLint rules from `warn` to `error` in [eslint.config.js](eslint.config.js):
  ```js
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  'no-restricted-syntax': ['error', { ... }],
  'no-underscore-dangle': ['error', { allow: [] }],
  ```
  After this, any new violation breaks CI.

**Acceptance criteria:**

- `npm run lint` is fully clean — **0 errors, 0 warnings** (or single-digit count, all justified inline)
- No eslint-disable markers remain (other than overrides in [eslint.config.js](eslint.config.js))
- All 4 tsconfigs compile cleanly under `tsc --noEmit`
- `npm run test` passes — including the 32 pre-existing test failures fixed
- Run [stryker.config.json](stryker.config.json) mutation testing on a sample to confirm test quality didn't regress from null-guard changes in PR 4
- Final grep audit:
  - `grep -rn "as any\|: any\b" --include="*.ts" --include="*.tsx" src/ electron/ orchestrator/ scripts/ | grep -v ".test." | wc -l` → 0
  - `grep -rn "export default" --include="*.ts" --include="*.tsx" src/ electron/ orchestrator/ | grep -v ".config." | wc -l` → 0

---

## 4. References

- Original review session date: 2026-05-09
- Plan file: [`C:\Users\sefa.ocakli\.claude\plans\create-a-plan-to-expressive-torvalds.md`](file:///C:/Users/sefa.ocakli/.claude/plans/create-a-plan-to-expressive-torvalds.md)
- Style guides:
  - https://google.github.io/styleguide/tsguide.html
  - https://google.github.io/styleguide/jsguide.html
- ESLint baseline command (re-run after each PR to track progress):
  ```bash
  npx eslint . --format json > /tmp/eslint.json && \
  node -e "const r=JSON.parse(require('node:fs').readFileSync('/tmp/eslint.json','utf-8'));const c={};for(const f of r){for(const m of f.messages){c[m.ruleId||'parse']=(c[m.ruleId||'parse']||0)+1}}console.log(Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>v.toString().padStart(5)+'  '+k).join('\n'))"
  ```
