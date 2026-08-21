# BDD Testing with Cucumber.js

This directory contains Behavior-Driven Development (BDD) tests using Cucumber.js (NFR-08.4).
Step definitions call the app's real logic modules directly (parsers, exporters, analytics,
audit log, SBOM generator) — the same way a unit test would — rather than driving a browser,
except for the handful of scenarios tagged `@ui`.

## Directory Structure

```
tests/bdd/
├── features/              # Feature files (.feature)
│   ├── analytics/
│   ├── audit/
│   ├── database/          # nvd-database runs; hybrid-scanner + update-scheduler are @wip
│   ├── export/
│   ├── parsers/
│   ├── sbom-generator/
│   └── example.feature
├── step-definitions/      # Step definition implementations (*.steps.ts)
├── support/
│   ├── world.ts           # Custom World class (browser/page for @ui, scenario state)
│   └── hooks.ts           # Before/After hooks
├── tsconfig.json           # Path aliases (@/, @@/) for the step-definition files
└── README.md               # This file
```

## Running Tests

```bash
npm run test:bdd
```

This runs `cucumber-js` (via `tsx`, so the TypeScript step definitions and the `@/`/`@@/`
path aliases they import from `src/` resolve correctly) with `--tags "not @ui and not @wip"` —
the default gate excludes browser-driven scenarios (no server running) and known-excluded
scenarios (see below). The equivalent explicit invocation, if you need to tweak flags:

```bash
cross-env TSX_TSCONFIG_PATH=tests/bdd/tsconfig.json NODE_OPTIONS="--import tsx" cucumber-js --tags "not @ui and not @wip"
```

### Run a subset by tag

```bash
cross-env TSX_TSCONFIG_PATH=tests/bdd/tsconfig.json NODE_OPTIONS="--import tsx" cucumber-js --tags "@audit"
```

`npm run test:bdd:watch` currently runs the same thing — cucumber-js has no built-in watch
mode, so there's no file-watching rerun-on-save behavior; it's kept as an alias so the script
name exists.

## Excluded scenarios (`@wip`, `@ui`)

The default gate (`npm run test:bdd`) excludes:

- **`hybrid-scanner.feature`** (15 scenarios) — `@wip` at the Feature level.
  `src/renderer/lib/database/hybridScanner.ts` is still a declared stub: `scanComponent` returns
  an empty result, `scanComponents` returns `[]`, `getStatistics` returns `{ totalCves: 0 }`.
  Step defs against it would assert the stub's return values, which is vacuous.
- **`update-scheduler.feature`** (10 scenarios) — `@wip` at the Feature level.
  `src/renderer/lib/refresh/autoRefreshScheduler.ts` exports one thing,
  `startAutoRefreshScheduler`, a 5-minute interval check (`AUTO_REFRESH_CHECK_INTERVAL_MS`). The
  scenarios describe a cron-style daily/weekly/monthly scheduler with pause/resume,
  missed-schedule recovery and timezone handling — none of which exists.
- **9 of 26 scenarios in `nvd-database.feature`** — `@wip` individually, with the reason above
  each in the feature file. The other 17 run for real against `server/database/nvdDb.ts`.
  (This feature was `@wip` wholesale until 2026-08-21 on the grounds that no CRUD/transaction
  `nvdDb.ts` module existed. That was wrong: only the _renderer_ lacks one. `server/database/nvdDb.ts`
  is a 1,241-line better-sqlite3 module with the initialize/upsert/insert/search/metadata/close API
  the scenarios describe, and the step defs now drive it against a throwaway database under the OS
  temp directory.) The 9 that remain excluded need APIs the module does not have: filtered list
  queries by severity / CVSS range / date range (`DatabaseQueryOptions` and
  `SeverityDateSearchOptions` are declared in `server/database/types.ts` but have no consumer),
  caller-visible begin/commit/rollback, and a clear-all-data call.
- **10 scenarios in `sbom-generator.feature`** — tagged `@wip` individually (see the comment
  above each in the feature file). They're UI-only concerns with no non-UI equivalent to drive
  (dialog open/close, inline preview edit/remove, progress indicators, template download, column
  mapping persistence, multi-sheet dropdown, project auto-upload) or depend on unimplemented
  behavior (`generateCycloneDX` throws for `format: 'xml'`). The other 8 scenarios in that
  feature run for real against `excelParser.ts`/`cyclonedxGenerator.ts`.
- **`export-formats.feature` → "Export to PDF format"** — tagged `@wip`. jsPDF's default export
  only resolves to the real constructor under a browser/Vite bundle's ESM interop; under plain
  Node (tsx) `import jsPDF from 'jspdf'` yields the raw CJS module object, not the class.
- **`example.feature` → "Verify World context"** — tagged `@ui`; it launches a real Playwright
  browser via `CustomWorld.initBrowser()`, which this suite doesn't run against a live server.

Do not silently delete a feature/scenario to make the suite pass — if something can't be made to
pass, tag it `@wip` (or `@ui` if it's browser-only) and add a comment explaining why, as above.

## Writing Feature Files

Feature files use Gherkin syntax and are located in `tests/bdd/features/`:

```gherkin
Feature: Feature Name
  As a user role
  I want to perform an action
  So that I can achieve a goal

  @tag1 @tag2
  Scenario: Scenario description
    Given a precondition
    When I take an action
    Then I expect an outcome
    And another expectation
```

## Writing Step Definitions

Step definitions are implemented in TypeScript in `tests/bdd/step-definitions/`. Import `expect`
from `vitest` (not `@vitest/expect`, which doesn't export it), and import the real modules
under test from `src/renderer/lib/...` / `server/...` — see `audit.steps.ts` or
`analytics.steps.ts` for the established pattern:

```typescript
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'vitest'
import { someRealFunction } from '../../../src/renderer/lib/some/module.ts'

Given('a precondition', function () {
  // Implementation
})

When('I take an action', function () {
  // Implementation
})

Then('I expect an outcome', function () {
  expect(someRealFunction()).toBe(expected)
})
```

Register `Before`/`After` hooks scoped to a tag matching the feature (e.g. `{ tags: '@audit' }`)
to reset shared test-context state between scenarios — and remember to tag the feature file
itself with that same tag, or the hook silently never runs (this caused real cross-scenario
state leakage before it was caught).

## Tags in use

- `@ui` — drives a real Playwright browser (`CustomWorld.initBrowser()`); excluded from the
  default gate since there's no server running.
- `@wip` — known-excluded scenario/feature; see "Excluded scenarios" above. Always pair with a
  comment explaining why.
- `@audit`, `@export`, `@analytics`, `@parser`, `@sbom-generator`, `@database` — scope the matching
  Before/After reset hooks in each step-definition file to that feature. `@database`'s hooks also
  create and delete the per-scenario temp directory the real SQLite file lives in.

## World Context

The `CustomWorld` class (used by `@ui` scenarios) provides Playwright browser/page management,
generic test-data storage (`set`/`get`/`has`), scenario state (`setState`/`getState`), and error
tracking. Non-`@ui` step-definition files mostly use their own local `context` object instead
(see `audit.steps.ts`).

## Configuration

- Cucumber config: `cucumber.mjs` (project root)
- TypeScript path aliases for step definitions: `tests/bdd/tsconfig.json`

## Troubleshooting

### `ERR_MODULE_NOT_FOUND` for `@/...` or `@@/...`

`TSX_TSCONFIG_PATH=tests/bdd/tsconfig.json` is required — the root `tsconfig.json` has no path
aliases, only `tests/bdd/tsconfig.json` does.

### "Multiple step definitions match" (ambiguous)

Two `Given`/`When`/`Then` calls registered the identical Cucumber Expression pattern. Search the
step-definition files for the exact pattern text; keep one, delete/merge the other.
