# CLAUDE.md

## Operational Rules (apply to every task)

1. **Think Before Coding** — State assumptions. If uncertain, ask. Present multiple interpretations on ambiguity. Push back when simpler approach exists. Stop when confused.
2. **Simplicity First** — Minimum code that solves the problem. Nothing speculative. No features beyond what was asked. No abstractions for single-use code.
3. **Surgical Changes** — Touch only what you must. Clean up only your own mess. Don't refactor what isn't broken. Match existing style.
4. **Goal-Driven Execution** — Define success criteria. Loop until verified. Don't follow steps — define success and iterate.
5. **Use the model only for judgment calls** — Classification, drafting, summarization, extraction. NOT for routing, retries, deterministic transforms. If code can answer, code answers.
6. **Token budgets are not advisory** — Per-task: 4,000. Per-session: 30,000. If approaching budget, summarize and start fresh. Surface the breach.
7. **Surface conflicts, don't average them** — Pick one pattern (more recent / more tested). Explain why. Flag the other for cleanup.
8. **Read before you write** — Before adding code, read exports, callers, shared utilities. "Looks orthogonal" is dangerous.
9. **Tests verify intent, not just behavior** — Tests encode WHY behavior matters. A test that can't fail when business logic changes is wrong.
10. **Checkpoint after every significant step** — Summarize what was done, what's verified, what's left. If you lose track, stop and restate.
11. **Match the codebase's conventions** — Conformance > taste. If a convention seems harmful, surface it — don't fork silently.
12. **Fail loud** — "Completed" is wrong if anything was skipped silently. Default to surfacing uncertainty.

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
| IPC request/response   | `src/shared/types/ipc.ts` + `electron/types/database.ts`                                   |
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

| PR   | Status | Description                                                           |
| ---- | ------ | --------------------------------------------------------------------- |
| PR 1 | DONE   | Tooling & guardrails (ESLint rules, tsconfig strict, ts-morph devDep) |
| PR 2 | DONE   | Type the IPC boundary — shared IPC types, platform/types.ts rewrite   |
| PR 3 | DONE   | Default exports → named (ts-morph codemod)                            |
| PR 4 | DONE   | Targeted any/!/as cleanup, underscore rename, catch comments          |
| PR 5 | DONE   | Long-tail any sweep, require→import, no-empty fixes, rules → error    |

### Warning Counts (post-PR 5: 20 total, down from 384)

| Rule                                 | Count | Status                            |
| ------------------------------------ | ----- | --------------------------------- |
| no-explicit-any                      | 0     | DONE (PR 5)                       |
| default exports                      | 0     | DONE (PR 3)                       |
| no-non-null-assertion                | 0     | DONE (PR 4)                       |
| no-underscore-dangle                 | 0     | DONE (PR 4)                       |
| no-require-imports                   | 0     | DONE (PR 5)                       |
| no-empty                             | 0     | DONE (PR 5)                       |
| react-refresh/only-export-components | 10    | out of scope (dev-only)           |
| react-hooks/exhaustive-deps          | 5     | out of scope (intentional deps)   |
| no-case-declarations                 | 4     | out of scope (existing patterns)  |
| no-empty-pattern                     | 1     | out of scope (Playwright fixture) |

## Pre-existing Issues

- 32 test failures in renderer/database UI components (unrelated to style-guide work)
- `tsconfig.app.json` strict checks surface ~6 type errors in tests (tracked in PR 5)
