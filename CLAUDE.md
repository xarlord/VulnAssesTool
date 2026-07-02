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

VulnAssesTool — Express + React + TypeScript web application for vulnerability assessment.
Scans SBOMs/components against NVD, KEV, EPSS databases. Generates VEX documents, attack graphs,
and CVSS reports. (Migrated from Electron to a client/server architecture — see commit `acd0518`.)

## Tech Stack

- **Server (backend):** Express + better-sqlite3 (`server/`, entry `server/index.ts`, `tsconfig.server.json`).
  Exposes a REST API under `/api/*` (routers in `server/routes/`) plus a WebSocket channel.
- **SBOM-from-binary:** `/api/sbom` (`server/routes/sbom.ts`) shells out to the **Syft** CLI
  (`server/services/SyftService.ts`, pinned + checksum-verified in `syftProvision.ts`) to turn an
  uploaded artifact or image ref into CycloneDX JSON, which the client feeds through the existing
  `parseCycloneDX` importer. Syft is an external tool (env `SYFT_PATH`, a provisioned copy, or PATH).
- **Client (renderer):** React + Vite (`src/renderer/`, `tsconfig.app.json`)
- **Shared types:** `src/shared/` (consumed by both client and server)
- **CLI:** `cli/` (shares SBOM parse/export logic with the renderer)
- **Tests:** Vitest (`vitest.config.ts`, `tsconfig.spec.json`) + Playwright E2E (`playwright.config.ts`)
- **Build:** `npm run build` (Vite → client) + `npm run build:server` (tsc → server); `npm run build:all` for both

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
2. `npm run build:all` — client (Vite) and server (`tsconfig.server.json`) both compile
3. `npm run test` — Vitest unit tests pass
4. `npm run test:e2e` — Playwright E2E smoke tests

## Type System Guide

### Reuse existing types — do not create duplicates

| Need                   | Source                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Domain types           | `src/shared/types.ts` (`Vulnerability`, `CveResult`, `Component`, `Project`, `ScanResult`) |
| CVSS metrics           | `src/shared/types/cvss.ts`                                                                 |
| FPF types              | `src/shared/types/fpf.ts`                                                                  |
| API request/response   | `src/shared/types/ipc.ts` (shared client/server contract)                                  |
| Database API contract  | `src/renderer/lib/platform/types.ts`                                                       |
| Recharts custom render | recharts exports (`TooltipProps`, `LabelProps`, `PieLabelRenderProps`)                     |
| sql.js types           | `@types/sql.js` (`SqlJsStatic`, `Database`)                                                |
| better-sqlite3 types   | `@types/better-sqlite3` (`Database`, `Statement`)                                          |

### Patterns

- Error classes: extend `Error` with parameter properties (see `server/database/ipcRequestValidator.ts:13`)
- Request validation: `request: unknown` + type-guard narrowing (server routes and IPC validator)
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

- **Flaky perf test:** `dbSeedingService.test.ts` › `checkFirstRun › should detect has_full_data`
  inserts 200,000 rows one-by-one under a 60s test timeout. It passes on an idle machine but can
  exceed 60s under load. Timing only — the code path (synchronous `checkFirstRun`) is correct.
  Fix options: raise the per-test timeout or batch the insert.

### Fixed (2026-07-01 hardening)

- Unhandled rejection in `dbSeedingService.saveBackgroundSyncState` (write to closed DB) — now
  guarded with `if (!this.db.open) return`.
- 4 `tsconfig.app.json` type errors — resolved (incl. a real bug: `VulnerabilityDetailModal`
  compared the boolean `knownRansomwareUse` to the string `'Known'`, so the RANSOMWARE badge
  never rendered). App type-check is now 0 errors.
