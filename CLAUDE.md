# CLAUDE.md

## Project Overview

VulnAssesTool — Electron + React + TypeScript desktop application for vulnerability assessment.
Scans SBOMs/components against NVD, KEV, EPSS databases. Generates VEX documents, attack graphs,
and CVSS reports.

## Tech Stack

- **Main process:** Electron (`electron/`, `tsconfig.main.json`)
- **Renderer:** React + Vite (`src/renderer/`, `tsconfig.app.json`)
- **Shared types:** `src/shared/` (consumed by both)
- **Orchestrator:** CLI phase-runner (`orchestrator/`, `tsconfig.orchestrator.json`)
- **Tests:** Vitest (`vitest.config.ts`) + Playwright E2E (`playwright.e2e.config.ts`)
- **Build:** `npm run build` (compiles all 4 tsconfigs)

## Coding Standards

**Google TypeScript Style Guide** + **Google JavaScript Style Guide** enforced via ESLint.

### Absolute Rules

- No `any` — use `unknown` + type guards, or proper domain types
- No `export default` — named exports only (lazy pages use re-export shim)
- No non-null assertions (`!`) — use explicit guards: `if (!x) throw new Error(...)`
- No underscore-prefixed identifiers (`_foo`) — rename to descriptive name
- No `require()` in TS — use `import` or `await import()`
- Single quotes, `===` only, no `var`, interfaces for object shapes
- `import type` for type-only imports

### Config files exempt from rules above

`vite.config.*`, `vitest.config.*`, `playwright.config.*`, `eslint.config.*`, `postcss.config.*`, `tailwind.config.*`, `commitlint.config.*`

## Verification Commands

Run after every change:

1. `npx eslint .` — must be 0 errors
2. `npm run build` — all 4 tsconfigs compile
3. `npm run test` — Vitest unit tests pass
4. `npm run test:e2e` — Playwright E2E smoke tests

## Type System Guide

### Reuse existing types — do not create duplicates

| Need                   | Source                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Domain types           | `src/shared/types.ts` (`Vulnerability`, `CveResult`, `Component`, `Project`, `ScanResult`) |
| CVSS metrics           | `src/shared/types/cvss.ts`                                                                 |
| FPF types              | `src/shared/types/fpf.ts`                                                                  |
| IPC request/response   | `electron/types/database.ts`                                                               |
| Database API contract  | `src/renderer/lib/platform/types.ts`                                                       |
| Recharts custom render | recharts exports (`TooltipProps`, `LabelProps`, `PieLabelRenderProps`)                     |
| sql.js types           | `@types/sql.js` (`SqlJsStatic`, `Database`)                                                |
| electron-updater       | `electron-updater` exports (`AppUpdater`, `UpdateInfo`, `ProgressInfo`)                    |

### Patterns

- Error classes: extend `Error` with parameter properties (see `electron/database/ipcRequestValidator.ts:13`)
- IPC validation: `request: unknown` + type-guard narrowing
- Window augmentation: `src/renderer/global.d.ts` (not `as unknown as`)
- Lazy pages: `lazy(() => import('./X').then(m => ({ default: m.X })))`

## Active Remediation Plan

See `coding-guide-fixed.md` for full details. Current status:

| PR   | Status  | Description                                                           |
| ---- | ------- | --------------------------------------------------------------------- |
| PR 1 | DONE    | Tooling & guardrails (ESLint rules, tsconfig strict, ts-morph devDep) |
| PR 2 | NEXT    | Type the IPC boundary — rewrite PlatformAPI types                     |
| PR 3 | Pending | Default exports → named (ts-morph codemod)                            |
| PR 4 | Pending | Targeted any/!/as cleanup, Recharts types, catch comments             |
| PR 5 | Pending | Long-tail any sweep, main.ts split, rules → error                     |

### Baseline Warning Counts (post-PR 1)

| Rule                  | Count | Targeted by   |
| --------------------- | ----- | ------------- |
| no-explicit-any       | 201   | PR 2 + PR 4-5 |
| default exports       | 54    | PR 3          |
| no-non-null-assertion | 53    | PR 4          |
| no-underscore-dangle  | 28    | PR 4          |
| no-empty              | 19    | PR 4          |

## Pre-existing Issues

- 32 test failures in renderer/database UI components (unrelated to style-guide work)
- `tsconfig.app.json` strict checks surface ~6 type errors in tests (tracked in PR 5)
