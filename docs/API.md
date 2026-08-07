# VulnAssesTool API Documentation

**Last Updated:** 2026-08-07

VulnAssesTool is an Express + React/Vite web app. The server exposes a REST API under `/api/*`
plus a single WebSocket channel (`/ws`) for real-time progress/event broadcasts — there is no
Electron main/renderer process or IPC layer in the current architecture.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Global Middleware](#global-middleware)
- [Public Routes](#public-routes)
- [Database API — `/api/database`](#database-api--apidatabase)
- [Storage (API Key) API — `/api/storage`](#storage-api-key-api--apistorage)
- [Threat Intelligence API — `/api/intelligence`](#threat-intelligence-api--apiintelligence)
- [Backup API — `/api/backup`](#backup-api--apibackup)
- [Container Scanning API — `/api/container`](#container-scanning-api--apicontainer)
- [Projects API — `/api/projects`](#projects-api--apiprojects)
- [SBOM Generation API — `/api/sbom`](#sbom-generation-api--apisbom)
- [OSV Proxy API — `/api/osv`](#osv-proxy-api--apiosv)
- [WebSocket Channel — `/ws`](#websocket-channel--ws)
- [Type Definitions](#type-definitions)
- [Error Handling Conventions](#error-handling-conventions)

---

## Overview

- **Server entry:** `server/index.ts` — binds Express + the WebSocket server to a single HTTP
  server (`127.0.0.1:3001` by default; `PORT`/`HOST` are configurable via `server/config.ts`).
- **App wiring:** `server/app.ts` (`createApp()`) — assembles middleware and mounts every router.
  Split from `index.ts` so integration tests can build the app with supertest without binding a
  port or touching the database/WebSocket lifecycle.
- **Production:** the built React client (`server/renderer/`) is served as static files from the
  same origin as the API; any non-API GET falls back to `index.html` for client-side routing.
- **Development:** Express runs on `:3001`, Vite runs on `:3000` and proxies `/api` and `/ws` to
  the Express server.

## Authentication

`server/middleware/auth.ts` implements a lightweight bearer-token scheme instead of any
session/cookie system:

- On first launch the server generates a random 32-byte token and persists it to
  `config.TOKEN_PATH`. Every subsequent boot reuses that stored token.
- All routes mounted under `/api` (except `GET /api/health` and `GET /api/handshake`) require a
  `Authorization: Bearer <token>` header, checked with a constant-time comparison
  (`timingSafeEqual`) so response timing can't leak the token byte-by-byte.
- In development (`isDev()`), auth is skipped entirely.
- The client obtains the token via `GET /api/handshake` on startup.
- The same token is used to authenticate the WebSocket connection (see below).

## Global Middleware

Applied in `server/app.ts`, in order:

1. `helmet()` — standard security headers.
2. `compression()` — gzip/deflate for search results, project payloads, and SBOM JSON.
3. `cors()` — same-origin only in production (`origin: false`); allows `http://localhost:3000`
   with credentials in development (for the Vite dev server).
4. `express.json({ limit: '10mb' })` — JSON body parsing.
5. Static file serving (production only) for the built client.
6. `authMiddleware` (see above), applied to everything under `/api`.
7. Per-route-group rate limiting (`server/middleware/rateLimit.ts`) — a **fresh limiter instance
   per mount** so each router has its own bucket instead of sharing one across all of them:

   | Limiter                  | Window | Max requests | Applied to                                                                                         |
   | ------------------------ | ------ | ------------ | -------------------------------------------------------------------------------------------------- |
   | `makeDefaultLimiter()`   | 60s    | 60           | `/api/database`, `/api/intelligence`, `/api/storage`, `/api/backup`, `/api/projects`, SPA fallback |
   | `makeContainerLimiter()` | 60s    | 5            | `/api/container`, `/api/sbom` (expensive/long-running operations)                                  |
   | `searchLimiter`          | 60s    | 300          | `POST /api/database/search`                                                                        |
   | `syncLimiter`            | 60min  | 10           | `POST /api/database/sync/start`, `/sync/delta`, `/sync/bulk`                                       |

   All limits can be overridden uniformly via the `RATE_LIMIT_MAX` env var (used for controlled
   runs like E2E that share one client IP).

8. A catch-all `/api/*` 404 handler returning JSON (`{ success: false, error: 'Not found' }`),
   so a typo'd/removed endpoint never falls through to the SPA's HTML `index.html`.
9. The SPA fallback (production only), served last.
10. A terminal error handler that turns any uncaught throw or malformed-JSON-body error into a
    sanitized JSON response instead of Express's default HTML error page.

## Public Routes

These bypass `authMiddleware` entirely.

| Method | Path             | Description                                                                 |
| ------ | ---------------- | --------------------------------------------------------------------------- |
| GET    | `/api/health`    | Liveness check: `{ status: 'ok', db: boolean, uptime, version }`            |
| GET    | `/api/handshake` | Returns `{ success: true, token }` — the client fetches the auth token here |

---

## Database API — `/api/database`

Router: `server/routes/database.ts`. Covers local NVD CVE search/lookup, NVD sync (full, delta,
bulk), CPE search, FTS5 search/maintenance, response-cache management, and storage/performance
config. Backed by the shared SQLite database (`better-sqlite3`).

| Method | Path                           | Description                                                                                                                                                            |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/database/search`         | Search local CVEs by `cve-id`, `cpe`, or free-text (FTS5). See `NvdSearchRequest`/`NvdSearchResponse`. Rate-limited by `searchLimiter`.                                |
| POST   | `/api/database/cve`            | Get a single CVE's summary fields by ID. See `GetCveRequest`/`GetCveResponse`.                                                                                         |
| POST   | `/api/database/cve/full`       | Get a CVE's full detail record (CWEs, CPE matches, references, CVSS metrics). See `GetCveFullRequest`/`GetCveFullResponse`.                                            |
| GET    | `/api/database/stats`          | Top-level DB stats (total CVEs, last sync, DB file size, configured path). See `GetStatsResponse`.                                                                     |
| GET    | `/api/database/stats/detailed` | Extended stats (CVE/CWE/CPE/reference counts, oldest/newest CVE, auto-sync config). See `GetDetailedStatsResponse`.                                                    |
| GET    | `/api/database/sync/status`    | Current in-memory sync state (`isSyncing`, `progress`, `total`, `currentFile`) plus last sync time. See `SyncStatusResponse`.                                          |
| POST   | `/api/database/sync/start`     | Kick off a full NVD sync for given/default years (fire-and-forget; progress via WebSocket). Rate-limited by `syncLimiter`. See `StartSyncRequest`/`StartSyncResponse`. |
| POST   | `/api/database/sync/delta`     | Run an incremental (delta) NVD sync synchronously; `{ force?: boolean }`. Rate-limited by `syncLimiter`. See `DeltaSyncResult`.                                        |
| POST   | `/api/database/sync/cancel`    | Cancel an in-progress delta sync. Refuses if a full/bulk sync is running (those can't be interrupted).                                                                 |
| POST   | `/api/database/sync/bulk`      | Bulk NVD download/import for given/default years using a stored or env-provided NVD API key. Rate-limited by `syncLimiter`.                                            |
| POST   | `/api/database/sync/auto`      | Persist auto-sync settings: `{ enabled: boolean, intervalHours: number }`.                                                                                             |
| POST   | `/api/database/cpe/search`     | Search CPEs by `tokens` or `productName`. See `CPESearchRequest`/`CPESearchResponse`.                                                                                  |
| GET    | `/api/database/config/sync`    | Get the current sync schedule (`manual`/`daily`/`weekly`/`monthly`) and bandwidth limit.                                                                               |
| PUT    | `/api/database/config/sync`    | Update `{ syncInterval?, bandwidthLimitKBps? }`. See `SyncConfigUpdate`/`SyncConfigResponse`.                                                                          |
| PUT    | `/api/database/config/storage` | Update `{ maxSizeMB?, pruneOldCves?, pruneOlderThanYear? }`; enforces pruning immediately if enabled. See `StorageConfigUpdate`.                                       |
| PUT    | `/api/database/config/perf`    | Update `{ searchResultLimit?, enableSearchCache?, cacheSizeMB?, cacheTTLMinutes? }`, applied live. See `PerformanceConfigUpdate`.                                      |
| POST   | `/api/database/reset`          | Wipe all CVE data (CVEs, CPE matches, CWE refs, CVSS metrics, references).                                                                                             |
| POST   | `/api/database/rebuild`        | Rebuild the `cves_fts` FTS5 virtual table from the `cves` table.                                                                                                       |
| POST   | `/api/database/fts/search`     | Raw FTS5 search: `{ query, limit? }`. See `FtsSearchResult`.                                                                                                           |
| GET    | `/api/database/fts/stats`      | FTS5 index stats (document count, index size). See `FtsStats`.                                                                                                         |
| GET    | `/api/database/cache/stats`    | Search-response cache stats (entries, memory usage). See `CacheStats`.                                                                                                 |
| POST   | `/api/database/cache/clear`    | Clear the search-response cache.                                                                                                                                       |
| GET    | `/api/database/download/queue` | Current bulk-download queue status.                                                                                                                                    |
| POST   | `/api/database/download/clear` | Clear the bulk-download queue.                                                                                                                                         |

**Sync WebSocket events broadcast by this router:** `nvd-sync-progress`, `nvd-sync-complete`,
`nvd-sync-error` (full sync); `nvd:sync-progress`, `nvd:sync-complete`, `nvd:sync-error` (delta
sync); `nvd:bulk-download-progress` (bulk sync).

**Response convention:** almost every endpoint here responds with HTTP 200 and a
`{ success: boolean, ... }` envelope even on failure (e.g. "database not initialized", validation
errors) — see [Error Handling Conventions](#error-handling-conventions).

---

## Storage (API Key) API — `/api/storage`

Router: `server/routes/storage.ts`. Manages secure storage of third-party API keys (NVD, OSV,
GitHub) via `server/services/storage/`.

| Method | Path                       | Description                                                                                              |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/storage/available`   | Whether the OS-level safe-storage backend is available. See `IsAvailableResponse`.                       |
| POST   | `/api/storage/keys/set`    | Store an API key: `{ keyType: ApiKeyType, apiKey: string }`. See `SetApiKeyRequest`/`SetApiKeyResponse`. |
| POST   | `/api/storage/keys/get`    | Retrieve a stored API key: `{ keyType: ApiKeyType }`. See `GetApiKeyRequest`/`GetApiKeyResponse`.        |
| POST   | `/api/storage/keys/delete` | Delete a stored API key: `{ keyType: ApiKeyType }`. See `DeleteApiKeyRequest`/`DeleteApiKeyResponse`.    |
| POST   | `/api/storage/keys/has`    | Check whether a key is stored: `{ keyType: ApiKeyType }`. See `HasApiKeyRequest`/`HasApiKeyResponse`.    |
| GET    | `/api/storage/migration`   | Whether any plaintext-stored keys still need migrating. See `NeedsMigrationResponse`.                    |
| POST   | `/api/storage/migrate`     | Migrate plaintext keys into the safe-storage backend. See `MigrateKeysResponse`.                         |
| GET    | `/api/storage/keys/all`    | Return stored keys for all providers (`nvd`, `osv`, `github`) in one call. See `GetAllKeysResponse`.     |

`ApiKeyType` is `'nvd' | 'osv' | 'github'`.

---

## Threat Intelligence API — `/api/intelligence`

Router: `server/routes/intelligence.ts`. Wraps `KevService` (CISA Known Exploited Vulnerabilities
catalog) and `EpssService` (Exploit Prediction Scoring System).

| Method | Path                             | Description                                                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/api/intelligence/kev/check`    | Is `{ cveId }` in the CISA KEV catalog? See `CheckKevResponse`.                                   |
| POST   | `/api/intelligence/kev/details`  | Full KEV catalog entry for `{ cveId }`, or `entry: null`. See `GetKevDetailsResponse`.            |
| GET    | `/api/intelligence/kev/stats`    | Aggregate KEV stats (total, ransomware-related count, last updated). See `GetKevStatsResponse`.   |
| POST   | `/api/intelligence/kev/sync`     | Sync the KEV catalog from CISA's published feed; broadcasts `kev-synced`. See `SyncKevResponse`.  |
| POST   | `/api/intelligence/epss/score`   | EPSS score for `{ cveId }`. See `GetEpssScoreResponse`.                                           |
| POST   | `/api/intelligence/epss/scores`  | EPSS scores for `{ cveIds: string[] }` (map keyed by CVE ID). See `GetEpssScoresResponse`.        |
| POST   | `/api/intelligence/epss/refresh` | Force a fresh (non-cached) EPSS lookup for `{ cveId }`. See `RefreshEpssScoreResponse`.           |
| GET    | `/api/intelligence/epss/stats`   | Aggregate EPSS cache stats (cached count, avg score, avg percentile). See `GetEpssStatsResponse`. |
| POST   | `/api/intelligence/epss/cleanup` | Remove stale entries from the EPSS score cache.                                                   |

---

## Backup API — `/api/backup`

Router: `server/routes/backup.ts`. Wraps `BackupService` for on-demand/scheduled SQLite database
backups.

| Method | Path                     | Description                                                                                            |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| POST   | `/api/backup/initialize` | Initialize the backup service (no-op success if not configured).                                       |
| POST   | `/api/backup/shutdown`   | Shut down the backup service.                                                                          |
| POST   | `/api/backup/create`     | Trigger an on-demand backup; broadcasts `backup-created`.                                              |
| GET    | `/api/backup/list`       | List existing backups. See `ListBackupsResponse`.                                                      |
| POST   | `/api/backup/restore`    | Restore `{ backupId }`; closes and reinitializes the live DB connection; broadcasts `backup-restored`. |
| POST   | `/api/backup/delete`     | Delete `{ backupId }`; broadcasts `backup-deleted`.                                                    |
| POST   | `/api/backup/verify`     | Verify a backup's integrity by `{ backupId }` or `{ backupPath }`. See `VerifyBackupResponse`.         |
| GET    | `/api/backup/config`     | Get backup service config (`enabled`, `schedule`, `retentionCount`). See `GetBackupConfigResponse`.    |
| PUT    | `/api/backup/config`     | Update backup config (`Partial<BackupConfig>`); broadcasts `backup-config-updated`.                    |
| GET    | `/api/backup/stats`      | Backup stats (total backups, total size). See `GetBackupStatsResponse`.                                |

---

## Container Scanning API — `/api/container`

Router: `server/routes/container.ts`. Wraps `ContainerService`, which shells out to the Docker or
Podman CLI to pull an image, read its manifest/config, and extract installed packages
(dpkg/apk/rpm) from its layers. See `docs/CONTAINER_SCANNING.md` for the end-to-end feature guide
(prerequisites, supported image reference formats, limitations).

| Method | Path                           | Description                                                                                                                                                      |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/container/check-runtime` | Check whether `{ runtime: 'docker' \| 'podman' }` is installed/available. See `CheckRuntimeResponse`.                                                            |
| POST   | `/api/container/pull`          | Pull `{ imageRef, runtime, platform? }`; broadcasts `scan-progress`. See `PullImageResponse`.                                                                    |
| POST   | `/api/container/manifest`      | Fetch the image manifest (layers, config digest). See `GetManifestResponse`.                                                                                     |
| POST   | `/api/container/inspect`       | Inspect image config (OS, architecture, labels, history). See `InspectImageResponse`.                                                                            |
| POST   | `/api/container/scan`          | Full scan: runtime check → pull → manifest → inspect → extract packages, broadcasting `scan-progress` at each phase. See `ScanImageRequest`/`ScanImageResponse`. |
| POST   | `/api/container/extract`       | Extract packages from `{ imageRef, runtime, layerDigests? }`, broadcasting `scan-progress`. See `ExtractPackagesResponse`.                                       |

---

## Projects API — `/api/projects`

Router: `server/routes/projects.ts`. Simple file-backed persistence for `Project` JSON documents
under `<DATA_DIR>/projects/<id>.json` (project ids are validated against a safe filename charset,
not sanitized, to avoid lossy/colliding ids).

| Method | Path                       | Description                                                                              |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/api/projects`            | Save a project (`ProjectData`, must include a safe `id`). 400 if `id` is missing/unsafe. |
| GET    | `/api/projects/:projectId` | Load a project by id. Returns `{ success: true, data: null }` if it doesn't exist.       |
| DELETE | `/api/projects/:projectId` | Delete a project by id (no-op success if already absent).                                |
| GET    | `/api/projects`            | List all saved projects (corrupt files are silently skipped).                            |

---

## SBOM Generation API — `/api/sbom`

Router: `server/routes/sbom.ts`. Generates a CycloneDX SBOM from an uploaded artifact, a local
host path, or a container image reference, by shelling out to the **Syft** CLI
(`server/services/SyftService.ts`; pinned + checksum-verified via `syftProvision.ts`). The client
feeds the returned CycloneDX JSON into the existing `parseCycloneDX` importer — there's no new
parsing on the server. Android prebuilt-image directories (`super.img`/`boot.img`) are unpacked
first via `AndroidImageService` since Syft can't read them directly. Mounted with
`makeContainerLimiter()` (5 requests/min) since generation is long-running.

| Method | Path                      | Description                                                                                                                                                                                              |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/sbom/engine-status` | Report whether the Syft engine is available/provisioned.                                                                                                                                                 |
| POST   | `/api/sbom/generate`      | Generate a CycloneDX SBOM from an uploaded `artifact` file (multipart, ≤500MB), a `localPath` (opt-in via `SBOM_LOCAL_SCAN_ROOT`, path-confined), or an `imageRef`. Broadcasts `sbom-generate-progress`. |

---

## OSV Proxy API — `/api/osv`

Router: `server/routes/osv.ts`. The browser cannot call `api.osv.dev` directly due to CORS, so the
client sends OSV queries to this same-origin endpoint and the server forwards them to the real OSV
API (10s upstream timeout), passing the upstream status/body straight through.

| Method | Path                 | Description                                                                                                                       |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/osv/query`     | Proxy `{ package: { purl } }` to `POST https://api.osv.dev/v1/query`. 400 on validation failure, 502 on upstream/network failure. |
| GET    | `/api/osv/vulns/:id` | Proxy to `GET https://api.osv.dev/v1/vulns/:id`. 502 on upstream/network failure.                                                 |

---

## WebSocket Channel — `/ws`

Implemented in `server/websocket.ts` (`initWebSocketServer`). Replaces the old
`mainWindow.webContents.send()` push pattern with a broadcast channel to all connected clients.

- **Auth handshake:** on connect, the client sends `{ type: 'auth', token: <server token> }`. The
  server verifies it with a constant-time comparison and replies `{ type: 'auth-ok' }`, then
  immediately replays the last known payload for every event type it has seen (up to 50 distinct
  types) so a client that connects mid-stream isn't missing state.
- **Liveness:** the server pings every connected client every 30s; a client that doesn't pong
  before the next tick is terminated and removed.
- **Broadcast format:** every server-pushed message is `{ type: string, data: unknown }`. Only
  authenticated clients receive broadcasts (`broadcast()` in `server/websocket.ts`).

**Event types currently broadcast**, by originating router:

| Event type                                                   | Emitted by                                      |
| ------------------------------------------------------------ | ----------------------------------------------- |
| `nvd-sync-progress` / `nvd-sync-complete` / `nvd-sync-error` | `POST /api/database/sync/start`                 |
| `nvd:sync-progress` / `nvd:sync-complete` / `nvd:sync-error` | `POST /api/database/sync/delta`                 |
| `nvd:bulk-download-progress`                                 | `POST /api/database/sync/bulk`                  |
| `kev-synced`                                                 | `POST /api/intelligence/kev/sync`               |
| `backup-created`                                             | `POST /api/backup/create`                       |
| `backup-restored`                                            | `POST /api/backup/restore`                      |
| `backup-deleted`                                             | `POST /api/backup/delete`                       |
| `backup-config-updated`                                      | `PUT /api/backup/config`                        |
| `scan-progress`                                              | `POST /api/container/pull`, `/scan`, `/extract` |
| `sbom-generate-progress`                                     | `POST /api/sbom/generate`                       |

---

## Type Definitions

Request/response shapes referenced above are defined in the shared type modules, consumed by both
client and server (do not duplicate these — import them):

| Domain                                                                                                                             | Source                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| CVE search/lookup, sync, CPE search, FTS, cache                                                                                    | `src/shared/types/ipc.ts`                                                                             |
| API key storage                                                                                                                    | `src/shared/types/ipc.ts` (`ApiKeyType`, `*ApiKeyRequest/Response`)                                   |
| Backup                                                                                                                             | `src/shared/types/ipc.ts` (`BackupInfo`, `BackupConfig`, `BackupResult`, `BackupStats`)               |
| KEV / EPSS                                                                                                                         | `src/shared/types/ipc.ts` (`KevEntry`, `KevSyncResult`, `EpssScore`, etc.)                            |
| Container scanning                                                                                                                 | `src/shared/types/ipc.ts` (`ContainerRuntime`, `ContainerPackage`, `ScanImageRequest/Response`, etc.) |
| Core domain types (`Project`, `Component`, `Vulnerability`, `CveResult`, `NvdSearchRequest/Response`, `CPESearchRequest/Response`) | `src/shared/types.ts`                                                                                 |
| CVSS metrics/vectors                                                                                                               | `src/shared/types/cvss.ts`                                                                            |
| FPF (ISO 21434) types                                                                                                              | `src/shared/types/fpf.ts`                                                                             |

---

## Error Handling Conventions

- Most `/api/database`, `/api/storage`, `/api/intelligence`, `/api/backup`, and `/api/container`
  endpoints respond with **HTTP 200** and a `{ success: boolean, ... }` envelope even for expected
  failure modes (uninitialized database, validation errors, "not found") — check `success`, not
  just the HTTP status, when consuming these.
- `/api/projects` uses conventional HTTP status codes: 400 for invalid/unsafe project ids, 500 for
  filesystem failures.
- `/api/osv` passes through the upstream OSV HTTP status on success, and uses 400/502 for local
  validation and upstream/network failures respectively.
- Any error that reaches the terminal error handler in `server/app.ts` (uncaught throw, malformed
  JSON body) is sanitized via `sanitizeErrorMessage` (`server/database/ipcRequestValidator.ts`)
  before being returned, to avoid leaking stack traces or internal details.
