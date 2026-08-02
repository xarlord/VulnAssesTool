# Bug-Hunt Fix Session — 2026-08-02

Fixing/verifying the 126 findings from the 2026-08-02 bug hunt. Status per finding is
updated as each file-group is completed, verified (eslint + build + tests), and committed.

Legend: `[ ]` pending · `[x]` fixed · `[~]` skipped (reason given) · each fixed item notes its commit.

## Critical

- [x] C1 nvdDb.ts:469 insertCPEMatches no transaction — FIXED: db.transaction(delete+insert)
- [x] C2 nvdDb.ts:488 insertReferences no transaction — FIXED: db.transaction(delete+insert)
- [x] C3 v2SchemaMigration.ts:137 migration 2 rename not transactional — FIXED: runner wraps every up()+version-record in db.transaction
- [x] C4 v2SchemaMigration.ts:283 migration 4 rename not transactional — FIXED: same central transaction wrap
- [x] C5 v2SchemaMigration.ts:366 migration 5 rename not transactional — FIXED: same central transaction wrap
- [~] C6 dbSeedingService.ts:468 prebuilt-DB swap under open handle — SKIPPED (documented in code): safe fix needs orchestration-level teardown/rebuild of ALL db services around the swap (or ATTACH-copy into the live connection), not a local reopen; downloadPrebuilt path has NO production caller (createDbSeedingService unused); an in-service reopen leaves other services on a closed conn and breaks the fs-mocked tests.
- [~] C7 bulkDatabase.ts:163 fake transaction (rollback no-op) — SKIPPED: legacy sql.js-era abstraction; its only consumer (nvdImportManager) is unwired and doesn't call the txn methods; real fix = rework async upserts into a synchronous better-sqlite3 transaction (feature work). Production sync uses NvdDataImporter (hardened in H15/H16).
- [x] C8 container.ts:65 command injection via runtime — FIXED: allow-list runtime ('docker'|'podman') at the runCommand execFile chokepoint
- [x] C9 BackupService.ts:204 restore overwrites live DB — FIXED: /restore route closeDatabase() → restore → initializeDatabase() (finally), so the file swap happens with no open connection

## High

- [x] H1 config.ts:21 / auth.ts:61 auth fails open (NODE_ENV default) — FIXED: NODE_ENV defaults to 'production' (auth ON, fail-safe); dev/dev:server set NODE_ENV=development via cross-env
- [x] H2 secureStorage.ts:23 weak key derivation — FIXED: 32-byte random key in DATA_DIR/storage-key.bin (mode 600); legacy machine-key kept only as a decrypt fallback for old data
- [x] H3 ContainerService.ts:316 path traversal via manifest — FIXED: resolveInside() containment check for manifest config/layer paths
- [x] H4 backup.ts:135 path traversal via verify — FIXED: confine the path fallback to backupDir (basename + containment)
- [x] H5 sbom.ts:57 unrestricted fs scan via localPath — FIXED: confine localPath to SBOM_LOCAL_SCAN_ROOT (opt-in; reject if unset or outside)
- [x] H6 sbom.ts:29 no dedicated rate limit — FIXED: /api/sbom mounted behind containerLimiter (5/min) via H7
- [x] H7 rateLimit.ts/app.ts dedicated limiters unused — FIXED: container/sbom→containerLimiter, /sync/\*→syncLimiter, /search→searchLimiter
- [x] H8 database.ts:612 /sync/bulk missing isSyncing guard — FIXED: guard + beginSync('bulk')/endSync (finally)
- [x] H9 database.ts:599 /sync/cancel cannot stop full sync — FIXED: syncState.kind; cancel refuses full/bulk instead of clearing the flag
- [x] H10 database.ts:91 search cache poisoning (mangled key) — FIXED: cache key uses the RAW query, not the sanitized one
- [x] H11 nvdDb.ts:443 upsertCVE skips v2 CVSS columns — FIXED: populate v31/v30/v2 from vector prefix
- [x] H12 nvdDb.ts:475 insertCPEMatches drops version-range columns — FIXED: insert 4 version-range cols
- [x] H13 dbSeedingService.ts:592 year coverage gap — FIXED: getRecentImportStartYear() single source of truth; historical sweep ends at recentStart-1
- [x] H14 nvdApiV2Client.ts:1113 dates formatted in local time — FIXED: UTC window construction (Date.UTC) + getUTC\* in formatDateForNvd
- [x] H15 nvdDataImporter.ts:198 BEGIN-failure assumed in-transaction — FIXED: only proceed if db.inTransaction, else rethrow
- [x] H16 nvdDataImporter.ts:230 skipExisting overwrites child rows — FIXED: child inserts moved into the non-skip branch
- [~] H17 bulkDownloadManager.ts:297 downloadYear never persists — SKIPPED: explicit "Phase E5" stub (self-documented), no production caller; persisting = implementing the unfinished feature (out of scope)
- [x] H18 multiThreadedDownloader.ts:432 checksum fails open — FIXED: return false (fail closed) on missing/errored checksum
- [x] H19 nvdDownloader.ts:218 dead CVSS fallback (=== undefined) — FIXED: guard on === null so v3.0/v2 fallbacks run
- [x] H20 initialize.ts:44 bundled-seed copy dead code — FIXED: check/copy bundled seed before the first initialize()
- [ ] H21 nvd.ts:118 CVSS v3.1-only extraction
- [ ] H22 csv.ts:78 patch 'none' truthy → Available
- [ ] H23 scan.ts:270 CLI no CVE dedup
- [ ] H24 VulnerabilitiesTab.tsx:97 cvssScore===0 bypasses range filter
- [x] H25 websocket.ts:55 dead-peer leak — FIXED: isAlive/pong tracking; terminate + evict clients that don't pong
- [x] H26 index.ts:73 startServer no catch — FIXED: startServer().catch(exit 1)
- [x] H27 index.ts:46 server.listen no error handler — FIXED: server.on('error') → clear message + exit 1
- [x] H28 app.ts error-handling middleware missing / stack leak — FIXED: terminal 4-arg handler → sanitized JSON (honors err.status)
- [x] H29 app.ts:78 unmatched /api returns 200 HTML (SPA fallback) — FIXED: app.use('/api', 404 JSON) before the SPA fallback
- [x] H30 intelligence.ts raw error.message leak (9 handlers) — FIXED: sanitizeErrorMessage(error) in all 9 catches
- [ ] H31 useProjectScan.ts:205 refresh overwrites vulns
- [ ] H32 Dashboard.tsx:106 refresh overwrites vulns
- [ ] H33 Search.tsx:258 stale-response race
- [ ] H34 providers/base.ts:191 rate limit once not per retry

## Medium

- [x] M1 nvdDb.ts:446 ON CONFLICT never updates source — FIXED: source=excluded.source
- [x] M2 nvdDb.ts:774 searchCVEsByText LIKE unescaped — FIXED: escapeLikePattern + ESCAPE
- [x] M3 nvdDb.ts:802 searchCVEsByCPE literal LIKE unescaped — FIXED: escapeLikePattern + ESCAPE
- [x] M4 nvdDb.ts:802 CPE literal query no LIMIT — FIXED: LIMIT 5000 cap
- [x] M5 v2SchemaMigration.ts:122 v1→v2 mislabels CVSS as v3.1 — FIXED: leave cvss*v31*\* NULL in generic copy
- [x] M6 v2SchemaMigration.ts:644 migration 10 loads whole table — FIXED: page by rowid cursor (5000/batch)
- [x] M7 dbVersionManager.ts:218 version compare via parseInt — FIXED: numeric fast-path only for pure ints; full field-by-field ordering otherwise
- [x] M8 dbSeedingService.ts:393 background sync resets progress — FIXED: preserve yearsCompleted from a resumable (syncing/paused) state
- [x] M9 nvdApiV2Client.ts:715 fetchModifiedSince no cap — FIXED: 50000 cap + truncated flag (mirrors fetchDateRange)
- [x] M10 ftsMigration.ts:92 hardcoded version=2 insert collision — FIXED: removed redundant schema_migrations insert
- [x] M11 nvdDataImporter.ts:274 redundant full FTS rebuild — FIXED: full rebuild only when FTS table absent; migration-7 triggers maintain it otherwise
- [x] M12 cpeSearch.ts:351 getProductVendors positional LIKE — FIXED: exact indexed cpe_product match (JS-verified product in legacy fallback); drop sanitizeSqlInput
- [x] M13 cpeSearch.ts:239 sanitizeSqlInput mangles tokens — FIXED: parameterized query, lowercase+trim only (no denylist mangling)
- [x] M14 cpeSearch.ts:312 unbounded DISTINCT loads — FIXED: indexed cpe_product DISTINCT; bounded (LIMIT) legacy fallback
- [x] M15 sqlSanitizer.ts:25 denylist reconstruction bypass — FIXED: fixed-point strip loop + defense-in-depth JSDoc
- [x] M16 cpeLookupCache.ts:479 totalCount from capped result — FIXED: real uncapped COUNT(DISTINCT) for totalCount
- [x] M17 v2SchemaMigration.ts:419 sync_status UNIQUE mismatch — FIXED: source TEXT NOT NULL UNIQUE
- [ ] M18 cyclonedx.ts:657 unknown source → broken NVD URL
- [ ] M19 cyclonedx.ts:655 first rating always wins
- [ ] M20 cyclonedx.ts:712 unknown severity → low
- [ ] M21 filterAuditLogger.ts:163 hash chain ordered by non-unique created_at
- [ ] M22 attackGraph.ts:311 blocking edge labels wrong node
- [ ] M23 DiffEngine.ts:136 hash only sorts vulnerabilities
- [ ] M24 SbomUploadDialog.tsx:554 CPE version from product split
- [ ] M25 notificationService.ts:99 projectId set to name
- [ ] M26 notificationService.ts:110 scanComplete projectId set to name
- [ ] M27 ComponentsTab.tsx:268 clear-filters misses coverage
- [ ] M28 profiles.ts:143 deleteProfile doesn't repoint active id
- [ ] M29 containerScanner.ts:309 SBOM discarded unless sbomOnly
- [ ] M30 configService.ts:264 critical-autofilter warning never fires when unset
- [x] M31 ContainerService.ts:282 layerDigests filter ignored — FIXED: skip layers not in the requested digest set
- [x] M32 container.ts:132 warnings/errors never populated — FIXED: extractPackages returns per-layer warnings; scan route surfaces them
- [x] M33 ContainerService.ts:139 pullImage digest inconsistent — FIXED: always return the image config Id (inspect) on both paths
- [x] M34 AndroidImageService.ts:123 unbounded stdout — FIXED: 100MB cap → kill child + reject
- [x] M35 AndroidImageService.ts:126 spawn no timeout — FIXED: 15-min watchdog kills the child; cleared on close/error
- [x] M36 database.ts:882 /rebuild swallows error returns success — FIXED: track rebuild success; return success:false + error on failure
- [x] M37 database.ts:178 text-search total = whole-DB count — FIXED: approximate matching total (same heuristic as FTS branch)
- [x] M38 database.ts:667 /sync/auto unvalidated input — FIXED: reject non-boolean enabled / non-finite/negative intervalHours
- [x] M39 database.ts:642 /sync/bulk totalCves always 0 — FIXED: capture progress.processedCVEs
- [x] M40 database.ts:431 /sync/status fake 50% — FIXED: syncState tracks real progress/total/currentFile
- [~] M41 database.ts:818 PUT /config/storage no-op success — SKIPPED: unimplemented storage-pruning feature (console.log stub); real fix = build the feature or a success:false contract change with unverifiable UI impact
- [~] M42 database.ts:831 PUT /config/perf no-op success — SKIPPED: same as M41 (unimplemented perf-config stub)
- [x] M43 EpssService.ts:254 rate-limit check-then-act race — FIXED: reserve the slot synchronously (schedule vs lastRequestTime) before any await
- [x] M44 backup.ts:171 schedule not validated — FIXED: updateConfig rejects any schedule not in daily|weekly|manual
- [x] M45 index.ts:55 shutdown no re-entrancy guard — FIXED: isShuttingDown guard
- [x] M46 app.ts:38 CORS wildcard + credentials — FIXED: origin:false in production (no cross-origin), only localhost:3000 in dev
- [x] M47 config.ts:12 PORT parsed without validation — FIXED: parsePort() validates range, falls back to 3001
- [x] M48 app.ts:53 /health hardcodes db:false — FIXED: db: isDatabaseReady()
- [x] M49 serverAdapter.ts:258 ping typed as string — FIXED: typed against the real /health response shape
- [~] M50 intelligence.ts:53 duplicate EpssScore type drift — SKIPPED (documented in type): server-side EpssScore is intentionally Date (EpssService's internal cache rep); res.json serializes to the ISO string the client's ipc.ts EpssScore already declares. No server path deserializes it, so no runtime bug; unifying cascades Date→string through the cache logic.
- [x] M51 intelligence.ts:22 bodies unvalidated — FIXED: readCveId/readCveIds guards reject missing/non-string(-array) input
- [x] M52 osv.ts:49 proxy fetch no timeout — FIXED: AbortSignal.timeout(10s) on both OSV fetches
- [ ] M53 useStore.ts:334 merge never updates existing vulns
- [ ] M54 OfflineIndicator.tsx:216 queueLength not initialised
- [ ] M55 falsePositiveFilter.ts:293 none→low in FPF audit
- [ ] M56 DependencyGraphPage.tsx:83 path picker uses unfiltered components
- [ ] M57 cyclonedxGenerator.ts:454 non-unique bom-ref
- [ ] M58 httpClient.ts:108 apiPostForm no timeout
- [x] M59 multiThreadedDownloader.ts:380 fileStream.close not awaited — FIXED: await fileStream.end() (flush) before checksum/extract
- [x] M60 serverAdapter.ts:245 handshake failure swallowed in prod — FIXED: console.error the handshake failure instead of a bare catch

## Low

- [ ] L1 SbomUploadDialog.tsx:556 matchType hardcoded token
- [ ] L2 cpeUtils.ts:397 dead confidence ternary
- [ ] L3 pdf.ts:344 dead 'Not scanned' fallback
- [ ] L4 ComponentVulnerabilitiesPopup.tsx:83 setTimeout no cleanup
- [ ] L5 VulnerabilitiesTab.tsx:244 setTimeout no cleanup
- [ ] L6 VulnerabilityDetailModal.tsx:39 setTimeout no cleanup
- [ ] L7 reportGenerator.ts:78 NaN% divide by zero
- [ ] L8 cyclonedx.ts:388 sanitizeVersion doc vs behavior
- [ ] L9 FalsePositiveFilter.tsx:61 none→low in UI/CSV
- [ ] L10 useStore.ts:66 orphaned notificationPreferences slice
- [ ] L11 vulnCache.ts:225 shouldRefreshData inverted
- [ ] L12 excelParser.ts:351 column double-mapped
- [ ] L13 parser.ts:52 cli --max-gaps gate dead
- [x] L14 database.ts:133 CPE total = page length — FIXED: approximate total heuristic (like text/FTS)
- [x] L15 database.ts:965 CacheManager endpoints never initialised — FIXED: /cache/stats + /cache/clear target the real searchResponseCache (QueryCache)
- [x] L16 EpssService.ts:213 NaN-fail-open expired — FIXED: Number.isNaN guard treats a corrupt timestamp as expired
- [x] L17 KevService.ts:516 NaN-fail-open sync — FIXED: Number.isNaN guard treats a corrupt timestamp as sync-needed
- [x] L18 BackupService.ts:327 retentionCount negative slice — FIXED: clamp to Math.max(0, trunc(n)) before slice
- [x] L19 auth.ts:78 token compared with !== (not constant-time) — FIXED: timingSafeEqual on equal-length buffers
- [x] L20 auth.ts:59 SKIP_AUTH_PATHS wrong prefix — FIXED: mount-relative paths ['/health','/handshake']
- [x] L21 websocket.ts:33 WS token === timing — FIXED: tokenMatches() constant-time comparison
- [x] L22 cpeSearch.ts:160 product-name cache key not normalized — FIXED: normalize (lowercase+trim+slice) before building the cache key
      </content>
