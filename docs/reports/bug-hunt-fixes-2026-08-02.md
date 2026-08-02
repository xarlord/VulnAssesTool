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
- [ ] C8 container.ts:65 command injection via runtime
- [ ] C9 BackupService.ts:204 restore overwrites live DB

## High

- [ ] H1 config.ts:21 / auth.ts:61 auth fails open (NODE_ENV default)
- [ ] H2 secureStorage.ts:23 weak key derivation
- [ ] H3 ContainerService.ts:316 path traversal via manifest
- [ ] H4 backup.ts:135 path traversal via verify
- [ ] H5 sbom.ts:57 unrestricted fs scan via localPath
- [ ] H6 sbom.ts:29 no dedicated rate limit
- [ ] H7 rateLimit.ts/app.ts dedicated limiters unused
- [ ] H8 database.ts:612 /sync/bulk missing isSyncing guard
- [ ] H9 database.ts:599 /sync/cancel cannot stop full sync
- [ ] H10 database.ts:91 search cache poisoning (mangled key)
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
- [ ] H25 websocket.ts:55 dead-peer leak
- [ ] H26 index.ts:73 startServer no catch
- [ ] H27 index.ts:46 server.listen no error handler
- [ ] H28 app.ts error-handling middleware missing / stack leak
- [ ] H29 app.ts:78 unmatched /api returns 200 HTML (SPA fallback)
- [ ] H30 intelligence.ts raw error.message leak (9 handlers)
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
- [ ] M31 ContainerService.ts:282 layerDigests filter ignored
- [ ] M32 container.ts:132 warnings/errors never populated
- [ ] M33 ContainerService.ts:139 pullImage digest inconsistent
- [ ] M34 AndroidImageService.ts:123 unbounded stdout
- [ ] M35 AndroidImageService.ts:126 spawn no timeout
- [ ] M36 database.ts:882 /rebuild swallows error returns success
- [ ] M37 database.ts:178 text-search total = whole-DB count
- [ ] M38 database.ts:667 /sync/auto unvalidated input
- [ ] M39 database.ts:642 /sync/bulk totalCves always 0
- [ ] M40 database.ts:431 /sync/status fake 50%
- [ ] M41 database.ts:818 PUT /config/storage no-op success
- [ ] M42 database.ts:831 PUT /config/perf no-op success
- [ ] M43 EpssService.ts:254 rate-limit check-then-act race
- [ ] M44 backup.ts:171 schedule not validated
- [ ] M45 index.ts:55 shutdown no re-entrancy guard
- [ ] M46 app.ts:38 CORS wildcard + credentials
- [ ] M47 config.ts:12 PORT parsed without validation
- [ ] M48 app.ts:53 /health hardcodes db:false
- [ ] M49 serverAdapter.ts:258 ping typed as string
- [ ] M50 intelligence.ts:53 duplicate EpssScore type drift
- [ ] M51 intelligence.ts:22 bodies unvalidated
- [ ] M52 osv.ts:49 proxy fetch no timeout
- [ ] M53 useStore.ts:334 merge never updates existing vulns
- [ ] M54 OfflineIndicator.tsx:216 queueLength not initialised
- [ ] M55 falsePositiveFilter.ts:293 none→low in FPF audit
- [ ] M56 DependencyGraphPage.tsx:83 path picker uses unfiltered components
- [ ] M57 cyclonedxGenerator.ts:454 non-unique bom-ref
- [ ] M58 httpClient.ts:108 apiPostForm no timeout
- [x] M59 multiThreadedDownloader.ts:380 fileStream.close not awaited — FIXED: await fileStream.end() (flush) before checksum/extract
- [ ] M60 serverAdapter.ts:245 handshake failure swallowed in prod

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
- [ ] L14 database.ts:133 CPE total = page length
- [ ] L15 database.ts:965 CacheManager endpoints never initialised
- [ ] L16 EpssService.ts:213 NaN-fail-open expired
- [ ] L17 KevService.ts:516 NaN-fail-open sync
- [ ] L18 BackupService.ts:327 retentionCount negative slice
- [ ] L19 auth.ts:78 token compared with !== (not constant-time)
- [ ] L20 auth.ts:59 SKIP_AUTH_PATHS wrong prefix
- [ ] L21 websocket.ts:33 WS token === timing
- [x] L22 cpeSearch.ts:160 product-name cache key not normalized — FIXED: normalize (lowercase+trim+slice) before building the cache key
      </content>
