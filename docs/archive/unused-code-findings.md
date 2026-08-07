# Unused Code & Code Quality Findings

**Date:** 2026-04-16
**Scope:** Full codebase review + security fix changes
**Status:** Open

---

## CRITICAL - Dead Modules (Entire Files Unused)

| #   | File                                           | Description                                                                                                 | Action             |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ |
| A1  | `electron/safeStorage.ts`                      | Legacy storage module superseded by `electron/main/storage/secureStorage.ts`. All 6 exports never imported. | Delete file        |
| A2  | `electron/database/nvdIpcService.ts`           | Earlier IPC service attempt, never integrated. Only referenced by its own test.                             | Delete file + test |
| A3  | `electron/database/nvdSyncService.ts`          | Superseded by `electron/database/nvd/nvdDeltaSync.ts`. Only referenced by its own test.                     | Delete file + test |
| A4  | `electron/database/nvdDbFts.ts`                | 579-line FTS module never imported by production code. Only used in test files.                             | Delete file + test |
| A5  | `src/renderer/lib/api/cpeApi.ts`               | 16-line CPE API module never imported by any component.                                                     | Delete file        |
| A6  | `src/renderer/lib/utils/errorSanitizer.ts`     | Never imported. Renderer uses `ipcRequestValidator.ts`'s version.                                           | Delete file + test |
| A7  | `src/renderer/lib/storage/encryptedStorage.ts` | Never imported. Dead storage module.                                                                        | Delete file        |
| A8  | `src/renderer/lib/storage/encodingUtils.ts`    | Only dependency of dead `encryptedStorage.ts`.                                                              | Delete file        |

---

## HIGH - Unused Exports (Functions Never Called in Production)

### `electron/ipcRateLimit.ts`

| Function                | Status         | Note                                                                                   |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `recordRequest()`       | No-op function | Empty body, only called within `wrapIpcHandler` with zero effect. Remove or implement. |
| `resetRateLimit()`      | Test-only      | Never called in production code.                                                       |
| `getRateLimitStats()`   | Test-only      | Never called in production code.                                                       |
| `isRateLimited()`       | Test-only      | Never called in production code.                                                       |
| `updateChannelConfig()` | Test-only      | Never called in production code.                                                       |
| `getAllLimiters()`      | Test-only      | Leaky abstraction - returns mutable state. Consider `@internal` export.                |

### `electron/database/nvdDb.ts`

| Method                          | Status                 |
| ------------------------------- | ---------------------- |
| `searchCVEsByCPEComponents()`   | Only called from tests |
| `searchCVEsBySeverityAndDate()` | Only called from tests |
| `getCVECountsByYear()`          | Only called from tests |
| `getCVECountsBySeverity()`      | Only called from tests |

### `src/renderer/lib/cvss/explanations.ts`

| Function                | Status                          |
| ----------------------- | ------------------------------- |
| `generateCvssSummary()` | Never called from any component |

### `src/renderer/lib/audit/ulid.ts`

| Function             | Status    |
| -------------------- | --------- |
| `getUlidTimestamp()` | Test-only |
| `isValidUlid()`      | Test-only |
| `ulidToDate()`       | Test-only |

### `electron/database/dbVersionManager.ts`

| Function            | Status    |
| ------------------- | --------- |
| `generateVersion()` | Test-only |

### `electron/database/dbSeedingService.ts`

| Symbol                   | Status                          |
| ------------------------ | ------------------------------- |
| `DbSeedingService` class | Only used in test + seed script |
| `getBundledSeedPath()`   | Test-only                       |
| `hasBundledSeed()`       | Test-only                       |
| `copyBundledSeed()`      | Test-only                       |

---

## MEDIUM - Code Quality Issues

### Copy-Paste Patterns

| Location                           | Issue                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `main.ts:528,587` + `nvdDb.ts:798` | Severity normalization `(cve.severity === 'NONE' \|\| !cve.severity) ? 'LOW' : cve.severity` repeated 3 times |
| `nvdDb.ts:362-428`                 | 13 near-identical "check column, ALTER TABLE" migration blocks                                                |
| `nvdDb.ts` (9 locations)           | `columns.forEach((col, i) => { obj[col] = row[i] })` row mapping pattern duplicated                           |

### Code Organization

| Location            | Issue                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| `main.ts:939-978`   | CPE validation inlined in handler instead of using `ipcRequestValidator.ts` |
| `main.ts:1196-1245` | Updater channels use raw strings instead of `UPDATER_IPC_CHANNELS` constant |

### Redundant State

| Location            | Issue                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| `AppLogo.tsx:31-52` | `isDark` useState + useEffect could be derived synchronously via `useSyncExternalStore` |

### Unnecessary Comments

| Location                     | Issue                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `ipcRateLimit.ts` throughout | JSDoc blocks restate function names/types. Missing WHY comments on design decisions. |

---

## FIXED During This Review

| Issue                                                                         | Fix Applied                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `startPeriodicCleanup()` / `stopPeriodicCleanup()` never called               | Wired into `app.whenReady()` and `app.on('before-quit')` in main.ts |
| Unused imports: `checkRateLimit`, `ValidationError`, `BackupInfo`, `KevEntry` | Removed from main.ts                                                |
