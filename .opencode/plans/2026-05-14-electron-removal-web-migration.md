# Electron Removal & Web Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove Electron desktop wrapper and replace with a pure web application backed by an Express.js API server, keeping all CVE/NVD/KEV/EPSS backend logic intact.

**Architecture:** Single-origin Express server serves the built React frontend as static files and exposes REST + WebSocket API. Vite dev server proxies `/api` and `/ws` to Express during development. All renderer code already uses a platform abstraction layer (`getPlatform()`) — only the adapter implementation changes from IPC to HTTP/WebSocket.

**Tech Stack:** Express.js, ws (WebSocket), express-rate-limit, PM2 (process manager), existing sql.js + React + Vite stack unchanged.

**Migration Strategy:** 13 phases executed sequentially. Each phase has: implementation → unit test design → E2E verification → architectural review → QA agent dispatch → docs update. No phase is marked complete until QA passes.

---

## Pre-Plan Commitments

### Lightweight Auth Approach (Item 1)

- Bind Express to `127.0.0.1` only (no external access)
- Generate a random 32-byte API token on first launch, store in `~/.vulnassesstool/.server-token`
- Frontend reads token from a startup handshake endpoint, passes via `Authorization: Bearer` header
- No user management, no login page, no sessions — single token, localhost only
- If token file exists, reuse it. If not, generate new one and print to console on first start.

### Simplified Single-Origin Architecture (Item 2)

- Production: Express serves everything on port 3001
  - `/api/*` → REST endpoints
  - `/ws` → WebSocket upgrade
  - `/*` → static files from `dist/renderer/` (built Vite output)
- Development: Vite on :3000, Express on :3001, Vite proxies `/api` and `/ws`
- No CORS needed (same origin in production, Vite proxy in dev)
- CSP simplified to allow `'self'` only

### Quality Gates Per Phase

1. **Unit tests** — written before/during implementation
2. **E2E verification** — manual or automated smoke test of changed functionality
3. **Architectural review** — verify the phase output matches plan intent
4. **QA agent dispatch** — automated review against plan requirements
5. **Docs + CLAUDE.md update** — track progress

---

## Phase 0: Pre-Migration — Export Encrypted API Keys

**Why:** `electron.safeStorage` ciphertexts are OS-bound. After Electron is removed, existing stored API keys become permanently unreadable. Must export them while Electron still works.

### Implementation

**Task 0.1: Create one-time key export script**

**Files:**

- Create: `scripts/export-api-keys.ts`

The script should:

1. Import Electron's `safeStorage` and `app`
2. Read `secure-credentials.json` from Electron's userData dir
3. Decrypt each stored key using `safeStorage.decryptString()`
4. Write to `~/.vulnassesstool/exported-keys.json` as plaintext JSON: `{ nvd: "key...", osv: "key...", github: "key..." }`
5. Exit

**Step 1:** Write the export script.

**Step 2:** Run script under Electron:

```
npx electron . --export-keys
```

**Step 3:** Verify `~/.vulnassesstool/exported-keys.json` contains valid API keys.

### Testing

**Unit tests:**

- N/A (one-time migration script)

**E2E verification:**

- Manually check exported file contains non-empty keys for each service
- Verify file is not world-readable (check permissions)

### QA Agent Dispatch

- Verify keys file exists and is valid JSON
- Verify no plaintext keys are logged to console
- Verify script doesn't modify original credentials

### Docs Update

- Add "Pre-Migration Step" section to CLAUDE.md
- Note: this phase must be completed on each machine before removing Electron

---

## Phase 1: Server Infrastructure — Express + Config + Health Check

**Why:** Foundation for all backend functionality. Must boot, serve static files, handle graceful shutdown, and respond to health checks before any features are migrated.

### Implementation

**Task 1.1: Create server config module**

**Files:**

- Create: `server/config.ts`

Centralizes all path/port configuration. Replaces Electron's `app.getPath('userData')`:

```ts
import * as os from 'node:os'
import * as path from 'node:path'

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  HOST: '127.0.0.1',
  DATA_DIR: process.env.DATA_DIR || path.join(os.homedir(), '.vulnassesstool'),
  DB_PATH: '', // set in initializePaths()
  BACKUP_DIR: '', // set in initializePaths()
  LOG_DIR: '', // set in initializePaths()
  TOKEN_PATH: '', // set in initializePaths()
  EXPORTED_KEYS_PATH: '', // set in initializePaths()
  NODE_ENV: process.env.NODE_ENV || 'development',
}

export function initializePaths(): void {
  config.DB_PATH = path.join(config.DATA_DIR, 'nvd-data.db')
  config.BACKUP_DIR = path.join(config.DATA_DIR, 'backups')
  config.LOG_DIR = path.join(config.DATA_DIR, 'logs')
  config.TOKEN_PATH = path.join(config.DATA_DIR, '.server-token')
  config.EXPORTED_KEYS_PATH = path.join(config.DATA_DIR, 'exported-keys.json')
}
```

**Task 1.2: Create lightweight auth middleware**

**Files:**

- Create: `server/middleware/auth.ts`

Generate token on first launch, store in `DATA_DIR/.server-token`. Express middleware checks `Authorization: Bearer <token>` header. Skip auth for `GET /api/health`. In development mode, skip auth entirely (checked via NODE_ENV).

**Task 1.3: Create Express entry point**

**Files:**

- Create: `server/index.ts`

Express app with:

- `helmet()` for security headers
- `express.json()` body parser
- Auth middleware (skip for health + handshake endpoints)
- `GET /api/health` → `{ status: 'ok', db: boolean, uptime: number }`
- `GET /api/handshake` → returns the auth token (localhost only)
- Static file serving: `express.static(path.join(__dirname, '../renderer'))` with SPA fallback to `index.html`
- Graceful shutdown: SIGINT/SIGTERM → close DB → stop cron → stop server
- Auto-create `DATA_DIR` and subdirectories on boot

**Task 1.4: Create WebSocket server**

**Files:**

- Create: `server/websocket.ts`

Attach `ws.Server` to the HTTP server. Authenticate via first message containing the token. Maintain set of connected clients. Provide `broadcast(type: string, data: unknown)` function for event push. Handle client disconnect/reconnect gracefully.

**Task 1.5: Create tsconfig.server.json**

**Files:**

- Create: `tsconfig.server.json`

Target ES2023, module ESNext, strict mode, paths for `@@/*`.

### Testing

**Unit tests:**

- `server/__tests__/config.test.ts` — verify path resolution, env var overrides
- `server/__tests__/middleware/auth.test.ts` — verify token generation, validation, skip paths
- `server/__tests__/health.test.ts` — verify health endpoint response shape

**E2E verification:**

- Start server → `curl http://127.0.0.1:3001/api/health` returns `{ "status": "ok" }`
- Verify server binds to 127.0.0.1 only (not 0.0.0.0)
- Kill server with SIGINT → graceful shutdown logged
- Verify `~/.vulnassesstool/` directory created with `.server-token`

### Architectural Review

- Verify no Electron imports in server code
- Verify all paths use `config.DATA_DIR` (no hardcoded paths)
- Verify WebSocket server is properly attached but not yet wired to events
- Verify static file serving works with a test `index.html`

### QA Agent Dispatch

- Check for any `from 'electron'` imports in `server/`
- Verify 127.0.0.1 binding
- Verify token file permissions (not world-readable)
- Verify graceful shutdown closes all resources

### Docs Update

- Update CLAUDE.md: add `server/` to project structure, note Express replaces Electron
- Update "Verification Commands" section: add server-specific commands
- Track Phase 1 status in CLAUDE.md "Active Remediation Plan" table

---

## Phase 2: Migrate Backend Modules — Database, Services, Storage

**Why:** Move all backend logic from `electron/` to `server/`, replacing Electron-specific imports with Node.js equivalents.

### Implementation

**Task 2.1: Migrate database module**

**Files:**

- Move: `electron/database/` → `server/database/`
- Modify: `server/database/nvdDb.ts` — replace `import { app } from 'electron'` with `import { config } from '../config.js'`, replace `app.getPath('userData')` with `config.DATA_DIR`, replace `app.getAppPath()` with `config.DATA_DIR`
- Modify: `server/database/nvdDownloader.ts` — same pattern
- Modify: `server/database/nvd/multiThreadedDownloader.ts` — same pattern
- Modify: `server/database/dbSeedingService.ts` — replace `process.resourcesPath` with `config.DATA_DIR`

**Task 2.2: Migrate services**

**Files:**

- Move: `electron/services/` → `server/services/`
- Modify: `server/services/BackupService.ts` — replace `app.getPath('userData')` with `config.BACKUP_DIR`
- `ContainerService.ts` — no changes needed (pure Node.js)
- `CacheManager.ts` — no changes needed
- `KevService.ts` — fix dynamic Electron import fallback, use `config.DATA_DIR` for baseline path
- `EpssService.ts` — no changes needed

**Task 2.3: Rewrite secure storage**

**Files:**

- Create: `server/services/storage/secureStorage.ts` (replaces `electron/main/storage/secureStorage.ts`)

Use Node.js `crypto.createCipheriv('aes-256-gcm', ...)` with a key derived from a machine-specific secret (hash of hostname + username). Store encrypted keys in `DATA_DIR/credentials.json`. On first run, import keys from `exported-keys.json` (Phase 0 output) and re-encrypt with new scheme.

**Task 2.4: Migrate types**

**Files:**

- Move: `electron/types/` → `server/types/` (unchanged, no Electron deps in type files)

**Task 2.5: Migrate database initialization**

**Files:**

- Create: `server/database/initialize.ts`

Extract DB init logic from `electron/main.ts:163-195` into a standalone module. Initialize database, delta sync, CPE search, backup service. Called by `server/index.ts` on startup.

### Testing

**Unit tests:**

- Migrate existing tests from `electron/database/*.test.ts` → `server/database/*.test.ts`
- Migrate existing tests from `electron/services/*.test.ts` → `server/services/*.test.ts`
- New: `server/__tests__/storage.test.ts` — verify encrypt/decrypt roundtrip, key import from Phase 0
- Verify all existing tests still pass after path replacements

**E2E verification:**

- Start server → verify database initializes (log message: "Database initialized successfully")
- Verify seed database is copied on first run
- Verify delta sync initializes
- Verify CPE search initializes
- Import exported keys from Phase 0 → verify stored and retrievable

### Architectural Review

- Verify zero `from 'electron'` imports in `server/`
- Verify zero `app.getPath` calls remain
- Verify `process.resourcesPath` no longer referenced
- Verify all file operations use paths from `config`
- Verify secureStorage encryption uses portable scheme (not OS-bound)

### QA Agent Dispatch

- Grep `server/` for any remaining `electron` references
- Verify secureStorage test: encrypt → decrypt produces original value
- Verify database auto-save interval is configured
- Verify database close handler is registered (SIGINT/SIGTERM)

### Docs Update

- Update CLAUDE.md: note `electron/` code moved to `server/`
- Update type system guide table (electron/types → server/types)
- Track Phase 2 status

---

## Phase 3: API Route Layer — REST Endpoints

**Why:** Replace Electron IPC handlers with Express REST routes. Each IPC channel becomes an HTTP endpoint.

### Implementation

**Task 3.1: Create database routes**

**Files:**

- Create: `server/routes/database.ts`

Map all `DB_IPC_CHANNELS` to Express routes:

| IPC Channel                                 | HTTP Endpoint                       |
| ------------------------------------------- | ----------------------------------- |
| `DB_IPC_CHANNELS.SEARCH`                    | `POST /api/database/search`         |
| `DB_IPC_CHANNELS.GET_CVE`                   | `POST /api/database/cve`            |
| `DB_IPC_CHANNELS.GET_CVE_FULL`              | `POST /api/database/cve/full`       |
| `DB_IPC_CHANNELS.GET_STATS`                 | `GET /api/database/stats`           |
| `DB_IPC_CHANNELS.GET_DETAILED_STATS`        | `GET /api/database/stats/detailed`  |
| `DB_IPC_CHANNELS.GET_SYNC_STATUS`           | `GET /api/database/sync/status`     |
| `DB_IPC_CHANNELS.START_SYNC`                | `POST /api/database/sync/start`     |
| `DB_IPC_CHANNELS.START_DELTA_SYNC`          | `POST /api/database/sync/delta`     |
| `DB_IPC_CHANNELS.CANCEL_SYNC`               | `POST /api/database/sync/cancel`    |
| `DB_IPC_CHANNELS.START_BULK_DOWNLOAD`       | `POST /api/database/sync/bulk`      |
| `DB_IPC_CHANNELS.SET_AUTO_SYNC`             | `POST /api/database/sync/auto`      |
| `DB_IPC_CHANNELS.CPE_SEARCH`                | `POST /api/database/cpe/search`     |
| `DB_IPC_CHANNELS.GET_SYNC_CONFIG`           | `GET /api/database/config/sync`     |
| `DB_IPC_CHANNELS.UPDATE_SYNC_CONFIG`        | `PUT /api/database/config/sync`     |
| `DB_IPC_CHANNELS.UPDATE_STORAGE_CONFIG`     | `PUT /api/database/config/storage`  |
| `DB_IPC_CHANNELS.UPDATE_PERFORMANCE_CONFIG` | `PUT /api/database/config/perf`     |
| `DB_IPC_CHANNELS.RESET_DATABASE`            | `POST /api/database/reset`          |
| `DB_IPC_CHANNELS.REBUILD_INDEXES`           | `POST /api/database/rebuild`        |
| `db:search-fts`                             | `POST /api/database/fts/search`     |
| `db:fts-stats`                              | `GET /api/database/fts/stats`       |
| `db:cache-stats`                            | `GET /api/database/cache/stats`     |
| `db:cache-clear`                            | `POST /api/database/cache/clear`    |
| `DB_IPC_CHANNELS.GET_DOWNLOAD_QUEUE`        | `GET /api/database/download/queue`  |
| `DB_IPC_CHANNELS.CLEAR_DOWNLOAD_QUEUE`      | `POST /api/database/download/clear` |

Extract handler logic directly from `electron/main.ts:500-1760`. The logic is identical — just wrapped in Express route handlers instead of `ipcMain.handle()`.

**Task 3.2: Create intelligence routes**

**Files:**

- Create: `server/routes/intelligence.ts`

| IPC Channel          | HTTP Endpoint                         |
| -------------------- | ------------------------------------- |
| `CHECK_KEV`          | `POST /api/intelligence/kev/check`    |
| `GET_KEV_DETAILS`    | `POST /api/intelligence/kev/details`  |
| `GET_KEV_STATS`      | `GET /api/intelligence/kev/stats`     |
| `SYNC_KEV`           | `POST /api/intelligence/kev/sync`     |
| `GET_EPSS_SCORE`     | `POST /api/intelligence/epss/score`   |
| `GET_EPSS_SCORES`    | `POST /api/intelligence/epss/scores`  |
| `REFRESH_EPSS_SCORE` | `POST /api/intelligence/epss/refresh` |
| `GET_EPSS_STATS`     | `GET /api/intelligence/epss/stats`    |
| `CLEANUP_EPSS_CACHE` | `POST /api/intelligence/epss/cleanup` |

**Task 3.3: Create storage routes**

**Files:**

- Create: `server/routes/storage.ts`

| IPC Channel       | HTTP Endpoint                   |
| ----------------- | ------------------------------- |
| `IS_AVAILABLE`    | `GET /api/storage/available`    |
| `SET_API_KEY`     | `POST /api/storage/keys/set`    |
| `GET_API_KEY`     | `POST /api/storage/keys/get`    |
| `DELETE_API_KEY`  | `POST /api/storage/keys/delete` |
| `HAS_API_KEY`     | `POST /api/storage/keys/has`    |
| `NEEDS_MIGRATION` | `GET /api/storage/migration`    |
| `MIGRATE_KEYS`    | `POST /api/storage/migrate`     |
| `GET_ALL_KEYS`    | `GET /api/storage/keys/all`     |

**Task 3.4: Create backup routes**

**Files:**

- Create: `server/routes/backup.ts`

| IPC Channel      | HTTP Endpoint                 |
| ---------------- | ----------------------------- |
| `INITIALIZE`     | `POST /api/backup/initialize` |
| `SHUTDOWN`       | `POST /api/backup/shutdown`   |
| `CREATE_BACKUP`  | `POST /api/backup/create`     |
| `LIST_BACKUPS`   | `GET /api/backup/list`        |
| `RESTORE_BACKUP` | `POST /api/backup/restore`    |
| `DELETE_BACKUP`  | `POST /api/backup/delete`     |
| `VERIFY_BACKUP`  | `POST /api/backup/verify`     |
| `GET_CONFIG`     | `GET /api/backup/config`      |
| `UPDATE_CONFIG`  | `PUT /api/backup/config`      |
| `GET_STATS`      | `GET /api/backup/stats`       |

**Task 3.5: Create container routes**

**Files:**

- Create: `server/routes/container.ts`

| IPC Channel        | HTTP Endpoint                       |
| ------------------ | ----------------------------------- |
| `CHECK_RUNTIME`    | `POST /api/container/check-runtime` |
| `PULL_IMAGE`       | `POST /api/container/pull`          |
| `GET_MANIFEST`     | `POST /api/container/manifest`      |
| `INSPECT_IMAGE`    | `POST /api/container/inspect`       |
| `SCAN_IMAGE`       | `POST /api/container/scan`          |
| `EXTRACT_PACKAGES` | `POST /api/container/extract`       |

**Task 3.6: Add rate limiting**

**Files:**

- Create: `server/middleware/rateLimit.ts`

Use `express-rate-limit` with per-route configuration matching existing IPC rate limits:

- Search: 300 requests/minute
- Sync start: 10 requests/hour
- Container scan: 5 requests/minute
- Other routes: 60 requests/minute

**Task 3.7: Wire routes into Express app**

**Files:**

- Modify: `server/index.ts` — mount all route modules

### Testing

**Unit tests:**

- `server/__tests__/routes/database.test.ts` — test each endpoint with mocked database
- `server/__tests__/routes/intelligence.test.ts` — test with mocked services
- `server/__tests__/routes/storage.test.ts` — test encrypt/decrypt via API
- `server/__tests__/routes/backup.test.ts` — test backup CRUD cycle
- `server/__tests__/routes/container.test.ts` — test with mocked execFile

**E2E verification:**

- `curl -X POST .../api/database/search -d '{"type":"cve-id","query":"CVE-2024-0001"}'` → returns results
- `curl .../api/database/stats` → returns stats
- `curl -X POST .../api/storage/keys/set -d '{"keyType":"nvd","apiKey":"test"}'` → stores key
- `curl -X POST .../api/storage/keys/get -d '{"keyType":"nvd"}'` → retrieves key
- Test rate limiting: send 301 rapid search requests → last one returns 429

### Architectural Review

- Verify all IPC handlers from `electron/main.ts` have corresponding REST endpoints
- Verify request/response shapes match IPC type contracts
- Verify no `mainWindow` references in route handlers
- Verify rate limiting configuration matches original IPC rate limits

### QA Agent Dispatch

- Compare every `ipcMain.handle()` in `electron/main.ts` against route list — verify none missed
- Verify response shapes match `electron/types/*.ts` contracts
- Test error responses follow consistent `{ success: false, error: string }` pattern
- Verify validation logic from `ipcRequestValidator.ts` is applied in routes

### Docs Update

- Document API endpoint reference
- Track Phase 3 status

---

## Phase 4: WebSocket Events — Real-Time Push

**Why:** Replace `mainWindow.webContents.send()` with WebSocket broadcasts. 13+ event push sites need migration.

### Implementation

**Task 4.1: Define WebSocket event types**

**Files:**

- Create: `server/websocket/events.ts`

```ts
export type WsEventType =
  | 'sync-progress'
  | 'sync-complete'
  | 'sync-error'
  | 'delta-sync-progress'
  | 'delta-sync-complete'
  | 'delta-sync-error'
  | 'bulk-download-progress'
  | 'scan-progress'
  | 'backup-created'
  | 'backup-restored'
  | 'backup-deleted'
  | 'backup-config-updated'
  | 'kev-synced'
```

**Task 4.2: Wire broadcast calls into routes/services**

**Files:**

- Modify: `server/routes/database.ts` — replace `mainWindow.webContents.send()` with `broadcast(type, data)`
- Modify: `server/routes/backup.ts` — same
- Modify: `server/routes/container.ts` — same
- Modify: `server/services/BackupService.ts` — accept broadcast callback in constructor

Replace pattern:

```ts
// Before (Electron):
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send('nvd-sync-progress', data)
}

// After (Express + WebSocket):
broadcast('sync-progress', data)
```

The `broadcast()` function from `server/websocket.ts` handles "no clients connected" gracefully (no-op).

**Task 4.3: Add connection lifecycle management**

**Files:**

- Modify: `server/websocket.ts`
- On connect: authenticate via token message
- On disconnect: remove from client set
- Heartbeat ping/pong every 30 seconds to detect dead connections
- Store last event per type so newly connected clients can request current state

### Testing

**Unit tests:**

- `server/__tests__/websocket.test.ts` — test broadcast, client management, auth
- Test: broadcast with no clients → no error
- Test: broadcast with 3 clients → all receive message
- Test: unauthenticated client → disconnected

**E2E verification:**

- Connect WebSocket client (wscat or browser console)
- Trigger sync via REST API → verify progress events arrive on WebSocket
- Kill WebSocket client → verify server doesn't crash
- Reconnect → verify connection succeeds

### Architectural Review

- Verify all 13+ `mainWindow.webContents.send()` sites have corresponding `broadcast()` calls
- Verify WebSocket events have same data shape as IPC events
- Verify no race conditions for late-joining clients

### QA Agent Dispatch

- Grep `server/` for any remaining `mainWindow` references
- Verify each WebSocket event type has a corresponding broadcast call
- Test: start sync, connect WebSocket mid-sync → verify late-join behavior

### Docs Update

- Document WebSocket event protocol
- Track Phase 4 status

---

## Phase 5: Frontend ServerAdapter — HTTP/WebSocket Client

**Why:** Replace `electronAdapter.ts` + `browserAdapter.ts` with a single `serverAdapter.ts` that communicates with Express via HTTP and WebSocket.

### Implementation

**Task 5.1: Create HTTP client utility**

**Files:**

- Create: `src/renderer/lib/platform/httpClient.ts`

```ts
const BASE_URL = '/api'  // relative — works in both dev (proxy) and prod (same origin)

export async function apiPost<T>(path: string, body: unknown): Promise<T> { ... }
export async function apiGet<T>(path: string): Promise<T> { ... }
export async function apiPut<T>(path: string, body: unknown): Promise<T> { ... }
```

Handle:

- Auth token from localStorage (set during handshake on first load)
- Consistent error shape mapping (HTTP errors → `{ success: false, error: string }`)
- Network error handling (server unreachable)

**Task 5.2: Create WebSocket client utility**

**Files:**

- Create: `src/renderer/lib/platform/wsClient.ts`

Features:

- Connect to `ws://127.0.0.1:3001/ws` (dev) or relative (prod, same origin)
- Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- Event subscription: `on('sync-progress', callback)` → cleanup function
- Buffer last event per type for late subscribers
- Authenticate on connect via token message

**Task 5.3: Create serverAdapter**

**Files:**

- Create: `src/renderer/lib/platform/serverAdapter.ts`

Implements `PlatformAPI` (from `types.ts`). Each method maps to HTTP call:

- `database.search(request)` → `apiPost('/database/search', request)`
- `intelligence.checkKev(cveId)` → `apiPost('/intelligence/kev/check', { cveId })`
- Event listeners → `wsClient.on('sync-progress', callback)`
- `generatePDF()` → client-side jsPDF (Phase 8)
- `updater.*` → no-ops (web app is always latest)
- `onMenuAction()` → no-op (no menu in browser)
- `onThemeChange()` → `window.matchMedia` (from browserAdapter)

**Task 5.4: Update platform initialization**

**Files:**

- Modify: `src/renderer/lib/platform/index.ts`

```ts
import { createServerAdapter } from './serverAdapter'

export function initPlatform(): PlatformAPI {
  if (platform) return platform
  platform = createServerAdapter()
  return platform
}
```

Remove `isElectron()` detection, always use server adapter.

**Task 5.5: Delete old adapters**

**Files:**

- Delete: `src/renderer/lib/platform/electronAdapter.ts`
- Delete: `src/renderer/lib/platform/browserAdapter.ts`

### Testing

**Unit tests:**

- `src/renderer/lib/platform/__tests__/httpClient.test.ts` — test fetch wrapper, error handling
- `src/renderer/lib/platform/__tests__/wsClient.test.ts` — test reconnect, subscription, cleanup
- `src/renderer/lib/platform/__tests__/serverAdapter.test.ts` — test each API method calls correct endpoint

**E2E verification:**

- Start Express server + Vite dev server
- Open browser → verify frontend loads
- Navigate to Search page → search for CVE → verify results appear
- Navigate to Settings → verify database stats load
- Verify no console errors about `window.electronAPI`

### Architectural Review

- Verify `serverAdapter` implements complete `PlatformAPI` interface
- Verify no references to `window.electronAPI` remain in adapter code
- Verify WebSocket reconnect handles server restart gracefully
- Verify auth token is properly stored and passed

### QA Agent Dispatch

- Grep `src/renderer/` for `window.electronAPI` — should find zero references (except `global.d.ts` deleted in Phase 6)
- Grep `src/renderer/` for `isElectron` — verify all usages are removed or updated
- Verify all 109 `getPlatform()` call sites still compile
- Test full workflow: search → CVE detail → vulnerability enrichment → report

### Docs Update

- Document serverAdapter as the sole platform implementation
- Track Phase 5 status

---

## Phase 6: Fix Type Mismatches & Remove Cross-Boundary Imports

**Why:** Several type inconsistencies and cross-directory imports will cause runtime failures or build errors. Found by both review agents.

### Implementation

**Task 6.1: Fix `BulkDownloadResult.failedYears` — Map → Record**

**Files:**

- Modify: `src/shared/types/ipc.ts:243` — change `Map<number, string>` to `Record<number, string>`
- Modify: Any code that constructs `BulkDownloadResult` to use plain object instead of `Map`

**Task 6.2: Fix BackupInfo field alignment**

**Files:**

- Modify: `src/renderer/pages/Settings.tsx:289-296,373` — use `createdAt` and `verified` (from IPC type) instead of `timestamp` and `integrity`
- Decision: align Settings.tsx to use the IPC type fields (cleaner, server will return typed data)

**Task 6.3: Remove cross-boundary import in NvdDatabaseManager.tsx**

**Files:**

- Modify: `src/renderer/components/database/NvdDatabaseManager.tsx:29`
- Change: `import type { ... } from '../../../electron/types/database'`
- To: `import type { ... } from '@@/types/ipc'` (or from platform types)

**Task 6.4: Remove conflicting `declare global` blocks**

**Files:**

- Modify: `src/renderer/pages/Search.tsx:88-94` — remove `declare global { interface Window { electronAPI } }`
- Modify: `src/renderer/lib/database/nvdDbFts.ts:92-103` — remove `declare global { interface Window { electronAPI } }`

**Task 6.5: Delete `global.d.ts`**

**Files:**

- Delete: `src/renderer/global.d.ts` (window.electronAPI type augmentation no longer needed)

**Task 6.6: Fix `verifyBackup` parameter name mismatch**

**Files:**

- Modify: `src/renderer/pages/Settings.tsx:433` — ensure server route `/api/backup/verify` accepts the same parameter the frontend sends (backupId vs backupPath)

### Testing

**Unit tests:**

- Verify all type changes compile: `npx tsc --noEmit`
- Run existing tests: `npm run test`

**E2E verification:**

- Build: `npm run build` → no type errors
- Settings page → backup list → timestamps and integrity display correctly
- Search page → bulk download → `failedYears` renders correctly

### Architectural Review

- Verify no `electron/` imports remain in `src/renderer/`
- Verify no `declare global { Window { electronAPI } }` blocks remain
- Verify `BulkDownloadResult` serializes correctly over JSON (no Map)

### QA Agent Dispatch

- Grep `src/renderer/` for `from '.*electron'` — should find zero
- Grep `src/renderer/` for `declare global` — verify only legitimate declarations remain
- Run `npm run build` → must pass with zero errors

### Docs Update

- Update type system guide in CLAUDE.md
- Track Phase 6 status

---

## Phase 7: Fix Storage Bypass — Route Through Platform Layer

**Why:** `src/renderer/lib/storage/index.ts:73` directly accesses `window.electronAPI`, bypassing the platform abstraction. This must go through `getPlatform().secureStorage` for the server adapter to work.

### Implementation

**Task 7.1: Refactor storage service to use platform layer**

**Files:**

- Modify: `src/renderer/lib/storage/index.ts`

Replace `window.electronAPI` access with `getPlatform().secureStorage`. Remove the fallback service (localStorage) since the server adapter's `secureStorage` handles all storage operations via the backend.

### Testing

**Unit tests:**

- Update existing tests for storage service to mock `getPlatform()` instead of `window.electronAPI`
- Test: store key → retrieve key → delete key via platform layer

**E2E verification:**

- Settings page → API Configuration → set NVD API key → reload page → verify key persists
- Verify key is stored server-side (check `~/.vulnassesstool/credentials.json`)

### Architectural Review

- Verify no `window.electronAPI` access in storage module
- Verify storage service works identically through platform layer

### QA Agent Dispatch

- Grep `src/renderer/lib/storage/` for `window.electronAPI` — zero results
- Test full API key lifecycle: set → get → has → delete

### Docs Update

- Track Phase 7 status

---

## Phase 8: PDF Generation — Client-Side jsPDF

**Why:** Current PDF generation uses Electron's hidden BrowserWindow + Chromium's `printToPDF()`. No Node.js equivalent. `jspdf` is already a dependency but not used in the renderer.

### Implementation

**Task 8.1: Implement client-side PDF generation**

**Files:**

- Modify: `src/renderer/lib/services/reports/reportGenerator.ts`

Replace `getPlatform().generatePDF(htmlContent)` path with direct jsPDF usage:

- Import `jspdf` and `jspdf-autotable` (already dependencies)
- Generate PDF directly in the renderer using jsPDF
- The `serverAdapter.generatePDF()` method becomes the jsPDF implementation

**Task 8.2: Remove server-side PDF endpoint** (if it was created)

### Testing

**Unit tests:**

- `src/renderer/lib/services/reports/__tests__/reportGenerator.test.ts` — verify PDF generation produces valid Uint8Array

**E2E verification:**

- Navigate to report → generate PDF → verify download triggers
- Verify PDF is valid (can be opened)
- Verify report content matches on-screen data

### Architectural Review

- Verify PDF generation works without any server-side component
- Verify jsPDF output quality is acceptable vs old Chromium printToPDF

### QA Agent Dispatch

- Generate each report type → verify PDF output
- Check for any remaining `printToPDF` references

### Docs Update

- Track Phase 8 status

---

## Phase 9: Performance — Async Chunking for Bulk Import

**Why:** NVD bulk import runs 200K+ synchronous sql.js operations, each followed by a full database export-to-disk. This will freeze the Express event loop for minutes, making the server unresponsive to all HTTP/WebSocket traffic.

### Implementation

**Task 9.1: Decouple per-CVE save from upsertCVE**

**Files:**

- Modify: `server/database/nvdDb.ts`

Currently `upsertCVE()` calls `saveToDisk()` after every single insert. Change to:

- `upsertCVE()` does NOT call `saveToDisk()` — just the in-memory sql.js operation
- Auto-save interval (30s) handles periodic disk persistence
- Explicit `saveToDisk()` called after batch operations complete

**Task 9.2: Add `setImmediate()` yields during bulk import**

**Files:**

- Modify: `server/database/nvd/nvdImportManager.ts` (or equivalent bulk import file)

Insert `setImmediate()` breaks every N records (e.g., every 1000 CVEs):

```ts
if (processedCount % 1000 === 0) {
  await new Promise((resolve) => setImmediate(resolve))
}
```

This yields to the event loop, allowing HTTP request handling between import chunks.

**Task 9.3: Same treatment for delta sync**

**Files:**

- Modify: `server/database/nvd/nvdDeltaSync.ts`
- Add `setImmediate()` yields during CVE processing loops

### Testing

**Unit tests:**

- Verify bulk import still produces correct results with async chunking
- Verify auto-save still triggers during import

**E2E verification:**

- Start sync for a year → verify server remains responsive (health check returns during sync)
- Start sync → open another tab → search for CVEs → verify search works during sync
- Verify sync progress events still arrive on WebSocket

### Architectural Review

- Verify event loop is not blocked for more than 100ms at a time
- Verify data integrity: no CVEs lost during async chunking
- Verify save-to-disk still happens periodically during long imports

### QA Agent Dispatch

- Measure server response time during bulk import (health check latency)
- Verify WebSocket events continue flowing during import
- Verify no data corruption after interrupted import (kill server mid-sync, restart, verify DB integrity)

### Docs Update

- Document async import behavior
- Track Phase 9 status

---

## Phase 10: Build System Updates — Remove Electron, Configure for Web

**Why:** Remove all Electron build tooling, update Vite config, add PM2 for server process management.

### Implementation

**Task 10.1: Update vite.config.ts**

**Files:**

- Modify: `vite.config.ts`

Changes:

- Remove `import electron from 'vite-plugin-electron'`
- Remove entire `electron([...])` plugin block
- Remove `copySqlJsWasm()` function and plugin
- Remove `runConversion()` function and plugin
- Change `base: './'` → `base: '/'`
- Add dev proxy:
  ```ts
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
  ```

**Task 10.2: Update package.json**

**Files:**

- Modify: `package.json`

Remove dependencies: `electron-store`

Remove devDependencies: `electron`, `electron-builder`, `electron-playwright-helpers`, `electron-updater`, `@electron/notarize`, `vite-plugin-electron`

Add dependencies: `express`, `cors`, `helmet`, `ws`

Add devDependencies: `@types/express`, `@types/cors`, `@types/ws`, `express-rate-limit`, `@types/express-rate-limit`, `concurrently`, `pm2`

Update scripts:

```json
"dev": "concurrently -n server,client -c blue,green \"tsx watch server/index.ts\" \"vite\"",
"dev:server": "tsx watch server/index.ts",
"dev:client": "vite",
"build": "vite build",
"build:server": "tsc -p tsconfig.server.json",
"build:all": "npm run build && npm run build:server",
"start": "node dist/server/index.js",
"start:pm2": "pm2 start ecosystem.config.cjs",
"stop:pm2": "pm2 stop ecosystem.config.cjs"
```

Remove the entire `"build"` section (electron-builder config).
Remove scripts: `dev:electron`, `dev:app`, `run:app`, `build:main`, `build:e2e`, `build:renderer:e2e`, `pack`, `dist*`, `release*`

**Task 10.3: Create ecosystem.config.cjs**

**Files:**

- Create: `ecosystem.config.cjs`

**Task 10.4: Update tsconfig.json references**

**Files:**

- Modify: `tsconfig.json` — remove `tsconfig.main.json` reference, add `tsconfig.server.json`
- Delete: `tsconfig.main.json`
- Delete: `vite.config.electron.ts`

**Task 10.5: Delete Electron launch scripts**

**Files:**

- Delete: `launch-app.bat`, `launch-app.vbs`, `launch-debug.bat`, `launch-raw-electron.bat`
- Delete: `scripts/run-electron.cjs`, `scripts/dev-with-rebuild.cjs`, `scripts/convert-to-cjs.cjs`
- Delete: `electron/splash.html`

**Task 10.6: Update index.html CSP**

**Files:**

- Modify: `index.html` — simplify CSP for single-origin web app, remove Electron-specific domains

### Testing

**Unit tests:**

- Verify `npm run build` succeeds
- Verify `npm run build:server` succeeds
- Verify no TypeScript errors: `npx tsc --noEmit`

**E2E verification:**

- `npm run dev` → both Vite and Express start
- Browser opens `http://localhost:3000` → frontend loads, API calls work
- `npm run build:all` → `npm run start` → production mode works on single port 3001
- PM2: `npm run start:pm2` → server starts, auto-restarts on crash

### Architectural Review

- Verify production build serves frontend as static files from Express
- Verify dev proxy routes API calls correctly
- Verify no Electron artifacts in build output
- Verify bundle size is reasonable (no Electron in output)

### QA Agent Dispatch

- Verify `package.json` has no Electron dependencies
- Verify `vite.config.ts` has no Electron plugins
- Verify `dist/` output contains no Electron files
- Verify production mode works: build → start → all features functional

### Docs Update

- Update CLAUDE.md: new scripts, new architecture, new verification commands
- Update README.md: installation and usage instructions
- Track Phase 10 status

---

## Phase 11: E2E Test Migration — Playwright Browser Mode

**Why:** E2E tests currently use Electron Playwright. Must switch to standard browser-based Playwright.

### Implementation

**Task 11.1: Update Playwright config**

**Files:**

- Modify: `playwright.e2e.config.ts` — remove `electron` project, use `chromium` with `baseURL: 'http://127.0.0.1:3001'`

**Task 11.2: Update E2E test setup**

**Files:**

- Modify: `e2e/` test files — remove Electron-specific helpers, use standard Playwright browser APIs

**Task 11.3: Add test setup for starting Express server before tests**

**Files:**

- Modify: `playwright.e2e.config.ts` — add `webServer` config to start Express before tests

### Testing

**E2E verification:**

- `npm run test:e2e` → all E2E tests pass in browser mode
- Verify test coverage is equivalent to previous Electron-based tests

### Architectural Review

- Verify no Electron-specific test patterns remain
- Verify test setup starts/stops server correctly

### QA Agent Dispatch

- Grep `e2e/` for `electron` references — zero results
- Run full E2E suite → all tests pass

### Docs Update

- Update CLAUDE.md: E2E test commands
- Track Phase 11 status

---

## Phase 12: Cleanup — Remove Electron Directory & Final Verification

**Why:** Final cleanup. Remove all Electron code, update all documentation.

### Implementation

**Task 12.1: Delete electron/ directory**

- Delete entire `electron/` directory

**Task 12.2: Delete src/main/ directory** (if it exists and is unused)

- Delete `src/main/`

**Task 12.3: Delete build/ directory** (electron-builder resources)

- Delete `build/` (keep favicon for web if needed)

**Task 12.4: Clean up scripts/ directory**

- Delete any remaining Electron-specific scripts
- Keep: `seed-test-db.js`, `sync.js`, `generate-checksums.js`, etc.

**Task 12.5: Update all documentation**

- Rewrite: `CLAUDE.md` — complete overhaul to reflect web architecture
- Update: `README.md` — new installation, development, deployment instructions
- Update: `CONTRIBUTING.md` — updated development workflow

**Task 12.6: Final verification**

- `npm run lint` → zero errors
- `npm run build` → success
- `npm run test` → all unit tests pass
- `npm run test:e2e` → all E2E tests pass
- Full manual smoke test: search → CVE detail → vulnerability enrichment → report → settings → backup

### Testing

**E2E verification:**

- Complete end-to-end workflow test
- Verify no broken links or missing assets
- Verify all features work: search, CVE detail, SBOM upload, reports, settings, backup

### Architectural Review

- Verify zero Electron artifacts remain in the entire codebase
- Verify documentation is accurate and complete
- Verify new developer can clone, install, and run the app following README

### QA Agent Dispatch

- Full grep of entire repo for `electron` references (excluding node_modules, lock files, docs)
- Verify `package.json` is clean (no Electron deps, no Electron scripts)
- Verify `npm run build && npm run start` produces a working application
- Verify all files in `server/` have zero Electron imports

### Docs Update

- Final CLAUDE.md update marking all phases complete
- Update README with final architecture diagram
- Archive this plan document

---

## Progress Tracking

| Phase | Description                  | Status | QA Status | Docs Updated |
| ----- | ---------------------------- | ------ | --------- | ------------ |
| 0     | Pre-migration: Export keys   | DONE   | -         | -            |
| 1     | Server infrastructure        | DONE   | -         | -            |
| 2     | Migrate backend modules      | DONE   | -         | -            |
| 3     | API route layer              | DONE   | -         | -            |
| 4     | WebSocket events             | DONE   | -         | -            |
| 5     | Frontend serverAdapter       | DONE   | -         | -            |
| 6     | Fix type mismatches          | DONE   | -         | -            |
| 7     | Fix storage bypass           | DONE   | -         | -            |
| 8     | PDF generation (jsPDF)       | DONE   | -         | -            |
| 9     | Performance: async chunking  | DONE   | -         | -            |
| 10    | Build system updates         | DONE   | -         | -            |
| 11    | E2E test migration           | DONE   | -         | -            |
| 12    | Cleanup & final verification | DONE   | -         | -            |

## Dependency Changes Summary

**Remove:** `electron`, `electron-builder`, `electron-playwright-helpers`, `electron-updater`, `@electron/notarize`, `vite-plugin-electron`, `electron-store`

**Add:** `express`, `@types/express`, `cors`, `@types/cors`, `helmet`, `ws`, `@types/ws`, `express-rate-limit`, `@types/express-rate-limit`, `concurrently` (devDep), `pm2` (devDep)

**Keep unchanged:** `sql.js`, `better-sqlite3`, `axios`, `react`, `react-dom`, `react-router-dom`, `vite`, `zustand`, `recharts`, `cytoscape`, `jspdf`, `jspdf-autotable`, `tailwindcss`, `zod`
