import { Router } from 'express'
import { getDb, getDeltaSync, getCpeSearch } from '../database/initialize.js'
import { config } from '../config.js'
import {
  validateNvdSearchRequest,
  validateGetCveRequest,
  validateStartSyncRequest,
  validateCpeSearchRequest,
  sanitizeErrorMessage,
} from '../database/ipcRequestValidator.js'
import { sanitizeSqlInput, isValidCveId } from '../database/sqlSanitizer.js'
import { broadcast } from '../websocket.js'
import {
  importNvdData,
  getAvailableNvdYears,
  createBulkDownloadManager,
  getRecentYearsForDownload,
} from '../database/nvd/index.js'
import { searchCVEsFTS, getFTSStats } from '../database/ftsMigration.js'
import { QueryCache } from '../database/performance/queryCache.js'
import {
  getStorageConfig,
  setStorageConfig,
  getPerfConfig,
  setPerfConfig,
  pruneCvesOlderThan,
} from '../database/settingsStore.js'
import { createApiKeyStorage } from '../services/storage/index.js'
import { syncLimiter, searchLimiter } from '../middleware/rateLimit.js'
import type {
  Severity,
  NvdSearchRequest,
  GetCveRequest,
  GetCveFullRequest,
  DeltaSyncProgress,
  DeltaSyncResult,
  CPESearchRequest,
  CveResult,
} from '../types/database.js'

const router = Router()

const syncState: {
  isSyncing: boolean
  kind: 'delta' | 'full' | 'bulk' | null
  progress: number
  total: number
  currentFile: string | null
} = {
  isSyncing: false,
  kind: null,
  progress: 0,
  total: 0,
  currentFile: null,
}

/** Mark a sync as started. `kind` records whether it can be cancelled (only 'delta' can). */
function beginSync(kind: 'delta' | 'full' | 'bulk'): void {
  syncState.isSyncing = true
  syncState.kind = kind
  syncState.progress = 0
  syncState.total = 0
  syncState.currentFile = null
}

/** Clear all sync state. */
function endSync(): void {
  syncState.isSyncing = false
  syncState.kind = null
  syncState.progress = 0
  syncState.total = 0
  syncState.currentFile = null
}

/**
 * Test-only: force-reset the module-level sync flag. /sync/cancel deliberately refuses to clear a
 * full/bulk sync (a real one can't be interrupted), so tests that simulate one in flight reset here.
 */
export function resetSyncStateForTests(): void {
  endSync()
}

/**
 * Short-TTL cache for `/search` responses. Repeated identical searches
 * (pagination, re-opening the same query) skip the FTS lookup and the CWE/
 * reference/tag enrichment. Explicitly cleared on reset, rebuild, delta-sync
 * completion, and full-sync kickoff; the 60s TTL bounds staleness from the
 * background bulk-import and auto-sync paths that finish out of band.
 */
interface SearchResponsePayload {
  results: CveResult[]
  total: number
}

const searchResponseCache = new QueryCache<SearchResponsePayload>({
  maxSize: 200,
  ttlMs: 60_000,
})

// Runtime search-performance settings, retuned by PUT /config/perf and rehydrated
// from the settings table at init. `searchResultLimit === null` means no server-side
// cap; `searchCacheEnabled === false` bypasses the response cache entirely.
let searchResultLimit: number | null = null
let searchCacheEnabled = true
// Persisted perf config is applied to the runtime once, on the first search after the
// DB becomes available, so a saved config survives a restart without cross-module wiring.
let perfConfigHydrated = false

/**
 * Apply persisted performance config to the live runtime. Called by PUT /config/perf
 * and at startup so a saved config survives a restart.
 */
function applyPerfConfig(cfg: {
  searchResultLimit?: number
  enableSearchCache?: boolean
  cacheSizeMB?: number
  cacheTTLMinutes?: number
}): void {
  if (typeof cfg.searchResultLimit === 'number' && cfg.searchResultLimit > 0) {
    searchResultLimit = Math.floor(cfg.searchResultLimit)
  }
  if (typeof cfg.enableSearchCache === 'boolean') {
    searchCacheEnabled = cfg.enableSearchCache
  }
  searchResponseCache.reconfigure({
    ...(typeof cfg.cacheTTLMinutes === 'number' && cfg.cacheTTLMinutes > 0
      ? { ttlMs: cfg.cacheTTLMinutes * 60_000 }
      : {}),
    ...(typeof cfg.cacheSizeMB === 'number' && cfg.cacheSizeMB > 0
      ? { maxMemoryBytes: cfg.cacheSizeMB * 1024 * 1024 }
      : {}),
  })
}

function invalidateSearchResponseCache(): void {
  searchResponseCache.clear()
}

function normalizeDisplaySeverity(severity: string | null | undefined): string {
  return severity === 'NONE' || !severity ? 'LOW' : severity
}

/**
 * POST /search — validate the search request (type/query/limit/offset), rehydrate persisted
 * perf config on first use, clamp `limit` to the server-side cap, and serve from the short-TTL
 * response cache when possible. Dispatches by `type` to CVE-ID lookup, CPE search, or
 * text/FTS search, then enriches results with CWE/reference/tag details. Rate-limited by
 * `searchLimiter`; responds `{ success: false, ... }` (still HTTP 200) for invalid input,
 * an uninitialized database, or a caught error.
 */
router.post('/search', searchLimiter, async (req, res) => {
  const request = req.body as NvdSearchRequest
  try {
    const validatedRequest = validateNvdSearchRequest(request)

    // On the first search after boot, rehydrate persisted perf config into the runtime so
    // a saved searchResultLimit/cache tuning takes effect without waiting for a re-save.
    if (!perfConfigHydrated) {
      const rawDbForConfig = getDb()?.getRawDb()
      if (rawDbForConfig) {
        applyPerfConfig(getPerfConfig(rawDbForConfig))
        perfConfigHydrated = true
      }
    }

    // Apply the server-side result cap (PUT /config/perf) uniformly, before any branch
    // reads validatedRequest.limit — a request over the cap (or with none) is clamped.
    if (
      searchResultLimit !== null &&
      (validatedRequest.limit === undefined || validatedRequest.limit > searchResultLimit)
    ) {
      validatedRequest.limit = searchResultLimit
    }

    const database = getDb()
    if (!database || !database.isInitialized()) {
      res.json({
        success: false,
        results: [],
        total: 0,
        limit: validatedRequest.limit || 100,
        offset: validatedRequest.offset || 0,
        error: 'Database not initialized',
      })
      return
    }

    let results: Array<{
      id: string
      description: string
      severity?: string
      cvss_score?: number
      cvss_vector?: string
      published_at: string
      modified_at: string
      source: string
    }> = []
    let total = 0

    const sanitizedQuery = sanitizeSqlInput(validatedRequest.query)

    const responseLimit = validatedRequest.limit || 100
    const responseOffset = validatedRequest.offset || 0
    // Key the cache on the RAW query, not the sanitized one: the executed query differs by
    // branch (text uses the raw term), and two distinct raw queries that happen to sanitize to
    // the same string must not collide and serve each other's cached results.
    const cacheKey = QueryCache.generateKey('search', {
      type: validatedRequest.type,
      query: validatedRequest.query,
      limit: responseLimit,
      offset: responseOffset,
    })
    const cachedResponse = searchCacheEnabled ? searchResponseCache.get(cacheKey) : null
    if (cachedResponse) {
      res.json({
        success: true,
        results: cachedResponse.results,
        total: cachedResponse.total,
        limit: responseLimit,
        offset: responseOffset,
      })
      return
    }

    switch (validatedRequest.type) {
      case 'cve-id': {
        if (!isValidCveId(sanitizedQuery)) {
          res.json({
            success: false,
            results: [],
            total: 0,
            limit: validatedRequest.limit || 100,
            offset: validatedRequest.offset || 0,
            error: 'Invalid CVE ID format',
          })
          return
        }
        const cve = database.getCVEById(sanitizedQuery.toUpperCase())
        results = cve ? [cve] : []
        total = results.length
        break
      }

      case 'cpe': {
        const limit = validatedRequest.limit || 100
        const offset = validatedRequest.offset || 0
        results = database.searchCVEsByCPE(sanitizedQuery, limit, offset)
        // Approximate "at least this many" (same heuristic as the text/FTS branch) rather than
        // the page length, which under-reported the total whenever a full page came back.
        total = results.length < limit ? offset + results.length : offset + limit + 1
        break
      }

      case 'text': {
        // The text search runs entirely through bound parameters (FTS `MATCH ?`
        // and `LIKE ?`), so SQL injection is already prevented by parameterization.
        // The SQL-string sanitizer, by contrast, mangles legitimate package names
        // ("update-alternatives" -> "-alternatives", "update" -> "") and rejects
        // names with apostrophes — which silently broke name-based CVE matching.
        // Use the raw query with only light cleaning here.
        const term = validatedRequest.query.trim().slice(0, 500)
        const limit = validatedRequest.limit || 100
        const offset = validatedRequest.offset || 0

        if (term.length === 0) {
          res.json({
            success: false,
            results: [],
            total: 0,
            limit,
            offset,
            error: 'Empty search query',
          })
          return
        }

        // searchCVEsByText owns FTS-vs-LIKE routing internally: token-prefix FTS5
        // when the cves_fts index exists (with MATCH-syntax sanitization), exact
        // CVE-ID lookup, and a LIKE fallback. Pass the RAW term — it must not be
        // LIKE-escaped here, since the method handles tokenization and escaping.
        results = database.searchCVEsByText(term, limit, offset)
        // Approximate matching total, not the whole-DB CVE count — getTotalCVECount()
        // reported hundreds of thousands for a handful of matches.
        total = results.length < limit ? offset + results.length : offset + limit + 1
        break
      }

      default:
        res.json({
          success: false,
          results: [],
          total: 0,
          limit: validatedRequest.limit || 100,
          offset: validatedRequest.offset || 0,
          error: 'Invalid search type',
        })
        return
    }

    const mappedResults: CveResult[] = results.map((cve) => ({
      id: cve.id,
      cveId: cve.id,
      description: cve.description,
      severity: normalizeDisplaySeverity(cve.severity ?? 'LOW') as Severity,
      cvssScore: cve.cvss_score || 0,
      cvssVector: cve.cvss_vector,
      publishedAt: cve.published_at,
      modifiedAt: cve.modified_at,
      source: cve.source,
    }))

    // Enrich with CWE + references + tags
    if (mappedResults.length > 0) {
      const detailsMap = database.getCveListDetails(mappedResults.map((r) => r.cveId))
      for (const result of mappedResults) {
        const details = detailsMap.get(result.cveId)
        if (details) {
          if (details.cwes.length > 0) result.cwes = details.cwes
          if (details.references.length > 0) result.references = details.references
          if (details.referenceTags.length > 0) result.referenceTags = details.referenceTags
        }
      }
    }

    if (searchCacheEnabled) {
      searchResponseCache.set(cacheKey, { results: mappedResults, total })
    }

    res.json({
      success: true,
      results: mappedResults,
      total,
      limit: responseLimit,
      offset: responseOffset,
    })
  } catch (error) {
    console.error('Search error:', error)
    const errorMessage = sanitizeErrorMessage(error)
    res.json({
      success: false,
      results: [],
      total: 0,
      limit: request?.limit || 100,
      offset: request?.offset || 0,
      error: errorMessage,
    })
  }
})

/**
 * POST /cve — validate the request body's `cveId` and return the matching CVE's summary
 * fields, or `cve: null` if it doesn't exist. Responds `{ success: false, cve: null, error }`
 * (still HTTP 200) if the database isn't initialized or the lookup throws.
 */
router.post('/cve', async (req, res) => {
  try {
    const request = req.body as GetCveRequest
    const validatedRequest = validateGetCveRequest(request)

    const database = getDb()
    if (!database || !database.isInitialized()) {
      res.json({
        success: false,
        cve: null,
        error: 'Database not initialized',
      })
      return
    }

    const cveId = sanitizeSqlInput(validatedRequest.cveId).toUpperCase()
    const cve = database.getCVEById(cveId)

    if (!cve) {
      res.json({
        success: true,
        cve: null,
      })
      return
    }

    res.json({
      success: true,
      cve: {
        id: cve.id,
        cveId: cve.id,
        description: cve.description,
        severity: normalizeDisplaySeverity(cve.severity) as Severity,
        cvssScore: cve.cvss_score || 0,
        cvssVector: cve.cvss_vector,
        publishedAt: cve.published_at,
        modifiedAt: cve.modified_at,
        source: cve.source,
      },
    })
  } catch (error) {
    console.error('Get CVE error:', error)
    const errorMessage = sanitizeErrorMessage(error)
    res.json({
      success: false,
      cve: null,
      error: errorMessage,
    })
  }
})

/**
 * POST /cve/full — validate the request body's `cveId` and return the full CVE record
 * (all detail fields, not just the summary from POST /cve), or `cve: null` if it doesn't
 * exist. Responds `{ success: false, cve: null, error }` if the database isn't initialized
 * or the lookup throws.
 */
router.post('/cve/full', async (req, res) => {
  try {
    const request = req.body as GetCveFullRequest
    const validatedRequest = validateGetCveRequest(request as GetCveRequest)

    const database = getDb()
    if (!database || !database.isInitialized()) {
      res.json({
        success: false,
        cve: null,
        error: 'Database not initialized',
      })
      return
    }

    const cveId = sanitizeSqlInput(validatedRequest.cveId).toUpperCase()
    const cve = database.getCVEFullDetails(cveId)

    if (!cve) {
      res.json({
        success: true,
        cve: null,
      })
      return
    }

    res.json({
      success: true,
      cve,
    })
  } catch (error) {
    console.error('Get CVE full details error:', error)
    const errorMessage = sanitizeErrorMessage(error)
    res.json({
      success: false,
      cve: null,
      error: errorMessage,
    })
  }
})

/**
 * GET /stats — return top-level database stats (total CVEs, last sync time, DB file size)
 * plus the configured DB path. `dbPath` is included even when the database isn't
 * initialized, since it's a config fact the Settings page shows regardless of DB state.
 * Responds `{ success: false, stats: null, error }` if reading the stats throws.
 */
router.get('/stats', async (_req, res) => {
  try {
    const database = getDb()
    if (!database || !database.isInitialized()) {
      res.json({
        success: false,
        stats: null,
        error: 'Database not initialized',
        // Storage location (FR-10.3) is a config fact, available even before the
        // DB file exists, so the Settings page can always show where it lives.
        dbPath: config.DB_PATH,
      })
      return
    }

    const metadata = database.getMetadata()
    const dbSize = database.getDbSize()

    res.json({
      success: true,
      stats: {
        totalCves: metadata.total_cves,
        lastUpdate: metadata.last_sync_at || null,
        dbSize,
        version: 1,
      },
      dbPath: config.DB_PATH,
    })
  } catch (error) {
    console.error('Get stats error:', error)
    res.json({
      success: false,
      stats: null,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    })
  }
})

/**
 * GET /stats/detailed — return extended database stats (CVE/CWE/CPE/reference counts,
 * oldest/newest CVE, last successful sync, auto-sync config), falling back to metadata
 * defaults when the delta-sync service has no stats yet. Responds `{ success: false, stats:
 * null, error }` if the database isn't initialized or the lookup throws.
 */
router.get('/stats/detailed', async (_req, res) => {
  try {
    const database = getDb()
    if (!database || !database.isInitialized()) {
      res.json({
        success: false,
        stats: null,
        error: 'Database not initialized',
      })
      return
    }

    const deltaSync = getDeltaSync()
    const stats = deltaSync?.getStats()
    const status = deltaSync?.getSyncStatus()

    const metadata = database.getMetadata()

    res.json({
      success: true,
      stats: {
        totalCves: stats?.totalCves ?? metadata.total_cves ?? 0,
        totalCwe: stats?.totalCwe ?? 0,
        totalCpe: stats?.totalCpe ?? 0,
        totalRefs: stats?.totalRefs ?? 0,
        oldestCve: stats?.oldestCve ?? null,
        newestCve: stats?.newestCve ?? null,
        lastSuccessfulSync: status?.lastSuccessfulSyncAt ?? metadata.last_sync_at ?? null,
        autoSyncEnabled: status?.autoSyncEnabled ?? false,
        autoSyncIntervalHours: status?.autoSyncIntervalHours ?? 24,
      },
    })
  } catch (error) {
    res.json({
      success: false,
      stats: null,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    })
  }
})

/**
 * GET /sync/status — return the current in-memory sync state (isSyncing, progress, total,
 * currentFile) plus the last successful sync time from metadata. Responds `{ success:
 * false, status: null, error }` if the database isn't initialized or the lookup throws.
 */
router.get('/sync/status', async (_req, res) => {
  try {
    const database = getDb()
    if (!database || !database.isInitialized()) {
      res.json({
        success: false,
        status: null,
        error: 'Database not initialized',
      })
      return
    }

    const metadata = database.getMetadata()
    res.json({
      success: true,
      status: {
        isSyncing: syncState.isSyncing,
        progress: syncState.progress,
        total: syncState.total,
        currentFile: syncState.currentFile,
        error: null,
        lastSync: metadata.last_sync_at || null,
      },
    })
  } catch (error) {
    res.json({
      success: false,
      status: null,
      error: error instanceof Error ? error.message : 'Failed to get sync status',
    })
  }
})

/**
 * POST /sync/start — kick off a full NVD sync for the requested years (or a default
 * range) as fire-and-forget: marks the sync as in-progress and invalidates the search
 * cache synchronously, then lets `importNvdData` run in the background, broadcasting
 * `nvd-sync-progress`/`nvd-sync-complete`/`nvd-sync-error` events as it proceeds. Rate-limited
 * by `syncLimiter`; responds immediately with `{ success: true, message }` once started, or
 * `{ success: false, ... }` if one is already running or validation fails.
 */
router.post('/sync/start', syncLimiter, async (req, res) => {
  try {
    const validatedRequest = validateStartSyncRequest(req.body)

    if (syncState.isSyncing) {
      res.json({
        success: false,
        message: 'Sync already in progress',
        error: 'SYNC_IN_PROGRESS',
      })
      return
    }

    beginSync('full')
    invalidateSearchResponseCache()

    const years = validatedRequest?.years || getAvailableNvdYears(2021, 2026)

    // Fetch through the REST client into the shared DB. getRawDb() may be null before init;
    // importNvdData then resolves to a not-initialized failure (broadcast via onError) rather
    // than throwing, preserving this handler's fire-and-forget "started" response.
    importNvdData({
      years,
      db: getDb()?.getRawDb() ?? null,
      batchSize: 1000,
      onProgress: (progress) => {
        syncState.progress = progress.years.completed
        syncState.total = progress.years.total
        syncState.currentFile = progress.currentYear ? `Year ${progress.currentYear}` : progress.phase
        broadcast('nvd-sync-progress', {
          year: progress.currentYear,
          status: progress.phase,
          downloaded: progress.download.downloadedBytes,
          total: progress.download.totalBytes,
          totalYears: progress.years.total,
          completedYears: progress.years.completed,
          totalCVEs: progress.import.totalCVEs,
          processedCVEs: progress.import.importedCVEs,
        })
      },
      onComplete: (result) => {
        endSync()

        broadcast('nvd-sync-complete', {
          success: result.success,
          message: result.success
            ? `NVD sync completed successfully. Imported ${result.importedCVEs} CVEs from ${result.yearsProcessed.length} years.`
            : 'NVD sync completed with errors',
          yearsProcessed: result.yearsProcessed,
          yearsFailed: result.yearsFailed,
          totalCVEs: result.importedCVEs,
          duration: result.duration,
        })
      },
      onError: (error) => {
        endSync()

        broadcast('nvd-sync-error', {
          success: false,
          message: error.message,
          error: error.message,
        })
      },
    }).catch((error) => {
      endSync()

      broadcast('nvd-sync-error', {
        success: false,
        message: error.message,
        error: error.message,
      })
    })

    res.json({
      success: true,
      message: `Starting NVD sync for years: ${years.join(', ')}`,
    })
  } catch (error) {
    endSync()
    const errorMessage = sanitizeErrorMessage(error)
    res.json({
      success: false,
      message: 'Failed to start NVD sync',
      error: errorMessage,
    })
  }
})

/**
 * POST /sync/delta — run a delta (incremental) NVD sync synchronously, optionally forced
 * to a full resync via `force` in the request body, broadcasting `nvd:sync-progress` /
 * `nvd:sync-complete` / `nvd:sync-error` events. Rate-limited by `syncLimiter`; responds
 * with the sync result, or an all-zero result with an error message if a sync is already
 * running, delta sync isn't initialized, or the sync throws.
 */
router.post('/sync/delta', syncLimiter, async (req, res) => {
  const force = (req.body as { force?: boolean }).force ?? false

  if (syncState.isSyncing) {
    res.json({
      success: false,
      cvesFetched: 0,
      cvesAdded: 0,
      cvesUpdated: 0,
      cvesSkipped: 0,
      cvesFailed: 0,
      durationMs: 0,
      syncedAt: new Date().toISOString(),
      errors: ['Sync already in progress'],
    })
    return
  }

  const deltaSync = getDeltaSync()
  if (!deltaSync) {
    res.json({
      success: false,
      cvesFetched: 0,
      cvesAdded: 0,
      cvesUpdated: 0,
      cvesSkipped: 0,
      cvesFailed: 0,
      durationMs: 0,
      syncedAt: new Date().toISOString(),
      errors: ['Delta sync not initialized'],
    })
    return
  }

  beginSync('delta')

  try {
    const result: DeltaSyncResult = await deltaSync.sync({
      forceFullSync: force,
      onProgress: (progress: DeltaSyncProgress) => {
        broadcast('nvd:sync-progress', { type: 'delta-sync', progress })
      },
    })

    endSync()
    invalidateSearchResponseCache()

    broadcast('nvd:sync-complete', { type: 'delta-sync', result })

    res.json(result)
  } catch (error) {
    endSync()
    const errorMessage = error instanceof Error ? error.message : String(error)

    broadcast('nvd:sync-error', { type: 'delta-sync', error: errorMessage })

    res.json({
      success: false,
      cvesFetched: 0,
      cvesAdded: 0,
      cvesUpdated: 0,
      cvesSkipped: 0,
      cvesFailed: 0,
      durationMs: 0,
      syncedAt: new Date().toISOString(),
      errors: [errorMessage],
    })
  }
})

/**
 * POST /sync/cancel — cancel an in-progress delta sync. Refuses (`success: false`) when
 * the running sync is a full or bulk import, since those can't be interrupted safely and
 * clearing the busy flag would let a second sync start writing concurrently.
 */
router.post('/sync/cancel', async (_req, res) => {
  try {
    // Only a delta sync exposes a cancellation token. A full/bulk import can't be interrupted,
    // so refuse rather than clearing the busy flag — clearing it would let a second sync start
    // writing to the database concurrently with the one still running.
    if (syncState.kind === 'full' || syncState.kind === 'bulk') {
      res.json({ success: false, error: 'A full or bulk sync is running and cannot be cancelled' })
      return
    }
    const deltaSync = getDeltaSync()
    if (deltaSync) {
      deltaSync.cancel()
    }
    endSync()
    res.json({ success: true })
  } catch {
    res.json({ success: false })
  }
})

/**
 * POST /sync/bulk — run a bulk NVD download/import synchronously for the requested years
 * (or a default recent range), using a stored or environment-provided NVD API key,
 * broadcasting `nvd:bulk-download-progress` events. Claims the sync lock synchronously
 * before any await to prevent two concurrent requests both starting an import against the
 * same SQLite file. Rate-limited by `syncLimiter`; responds `{ success: false, error }` if
 * the database isn't initialized, a sync is already running, or no API key is available.
 */
router.post('/sync/bulk', syncLimiter, async (req, res) => {
  const database = getDb()
  const rawDb = database?.getRawDb()
  if (!rawDb) {
    res.json({ success: false, error: 'Database not initialized' })
    return
  }

  if (syncState.isSyncing) {
    res.json({ success: false, error: 'Sync already in progress' })
    return
  }

  // Claim the sync lock synchronously — BEFORE any await — so two concurrent requests can't
  // both pass the isSyncing check above and start dueling imports on the same SQLite file (H8).
  // endSync() runs in finally, covering every path below (including the no-API-key early return).
  beginSync('bulk')

  try {
    const nvdStorage = createApiKeyStorage('nvd')
    const apiKey = (await nvdStorage.getApiKey()) || process.env.NIST_API_KEY || process.env.NVD_API_KEY || ''

    if (!apiKey) {
      res.json({
        success: false,
        error:
          'NVD API key required. Please add your NVD API key in Settings > API Configuration. Get a free key at: https://nvd.nist.gov/developers/request-an-api-key',
      })
      return
    }

    const request = req.body as { years?: number[] }
    const years = request.years || getRecentYearsForDownload(3)

    console.log('Starting bulk download for years:', years)

    const result = await importNvdData({
      years,
      db: rawDb,
      apiKey,
      batchSize: 1000,
      onProgress: (progress) => {
        syncState.progress = progress.years.completed
        syncState.total = progress.years.total
        syncState.currentFile = progress.currentYear ? `Year ${progress.currentYear}` : null
        broadcast('nvd:bulk-download-progress', {
          year: progress.currentYear,
          status: progress.phase,
          downloaded: progress.download.downloadedBytes,
          total: progress.download.totalBytes,
          totalYears: progress.years.total,
          completedYears: progress.years.completed,
          totalCves: progress.import.totalCVEs,
          processedCves: progress.import.importedCVEs,
        })
      },
    })

    invalidateSearchResponseCache()
    res.json({ success: result.success, totalCves: result.importedCVEs })
  } catch (error) {
    console.error('Bulk download failed:', error)
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download NVD data',
    })
  } finally {
    endSync()
  }
})

/**
 * POST /sync/auto — persist the auto-sync `enabled`/`intervalHours` settings for NVD to
 * the `sync_status` table. Responds `{ success: false, error }` if the body fails
 * validation (enabled must be boolean, intervalHours a non-negative finite number) or the
 * update throws.
 */
router.post('/sync/auto', async (req, res) => {
  try {
    const { enabled, intervalHours } = req.body as { enabled?: unknown; intervalHours?: unknown }
    if (
      typeof enabled !== 'boolean' ||
      typeof intervalHours !== 'number' ||
      !Number.isFinite(intervalHours) ||
      intervalHours < 0
    ) {
      res.json({
        success: false,
        error: 'Invalid request: enabled must be a boolean and intervalHours a non-negative number',
      })
      return
    }
    const database = getDb()
    if (database) {
      const db = database.getRawDb()
      if (db) {
        db.prepare(
          `
          UPDATE sync_status
          SET auto_sync_enabled = ?, auto_sync_interval_hours = ?
          WHERE source = 'NVD'
        `,
        ).run(enabled ? 1 : 0, intervalHours)
      }
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Failed to set auto sync:', error)
    res.json({ success: false })
  }
})

/**
 * POST /cpe/search — search CPEs either by `tokens` or by `productName` from the request
 * body (tokens take precedence if both are given). Responds `{ success: false, results:
 * [], error }` if CPE search isn't initialized, validation fails, neither field is
 * provided, or the search throws.
 */
router.post('/cpe/search', async (req, res) => {
  try {
    const request = req.body as CPESearchRequest
    const cpeSearch = getCpeSearch()
    if (!cpeSearch) {
      res.json({
        success: false,
        results: [],
        error: 'CPE search not initialized',
      })
      return
    }

    const { limit, error: validationError } = validateCpeSearchRequest(request)
    if (validationError) {
      res.json({ success: false, results: [], error: validationError })
      return
    }

    let results

    if (request.tokens && request.tokens.length > 0) {
      results = await cpeSearch.searchByTokens(request.tokens, limit)
    } else if (request.productName) {
      results = await cpeSearch.searchByProductName(request.productName, limit)
    } else {
      res.json({
        success: false,
        results: [],
        error: 'Either productName or tokens must be provided',
      })
      return
    }

    res.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error('CPE search error:', error)
    res.json({
      success: false,
      results: [],
      error: error instanceof Error ? error.message : 'Failed to search CPEs',
    })
  }
})

// Sync schedule <-> auto_sync_interval_hours mapping. Kept in sync with
// SYNC_SCHEDULE_OPTIONS in src/shared/constants.ts.
const SYNC_INTERVAL_HOURS: Record<string, number> = { manual: 0, daily: 24, weekly: 168, monthly: 720 }

function hoursToSyncInterval(hours: number | undefined): string {
  switch (hours) {
    case 0:
      return 'manual'
    case 24:
      return 'daily'
    case 720:
      return 'monthly'
    case 168:
    default:
      return 'weekly'
  }
}

/**
 * GET /config/sync — return the current NVD sync schedule (mapped from
 * `autoSyncIntervalHours` via `hoursToSyncInterval`) and bandwidth limit. Responds
 * `{ success: false, error }` if the lookup throws.
 */
router.get('/config/sync', async (_req, res) => {
  try {
    const deltaSync = getDeltaSync()
    const status = deltaSync?.getSyncStatus()
    res.json({
      success: true,
      config: {
        syncInterval: hoursToSyncInterval(status?.autoSyncIntervalHours),
        bandwidthLimitKBps: status?.bandwidthLimitKBps ?? 0,
      },
    })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sync config',
    })
  }
})

/**
 * PUT /config/sync — update the NVD sync schedule (`syncInterval`, mapped to hours via
 * `SYNC_INTERVAL_HOURS`) and/or `bandwidthLimitKBps` from the request body; both fields are
 * independently optional. Responds `{ success: false, error }` if either supplied field
 * fails validation or the delta-sync service isn't initialized.
 */
router.put('/config/sync', async (req, res) => {
  try {
    const config = req.body as { syncInterval?: string; bandwidthLimitKBps?: number }

    // syncInterval and bandwidthLimitKBps are independently optional — the Settings
    // UI updates one at a time. Validate whichever is present before any DB access.
    let hours: number | undefined
    if (config.syncInterval !== undefined) {
      hours = SYNC_INTERVAL_HOURS[config.syncInterval]
      if (hours === undefined) {
        res.json({ success: false, error: `Invalid syncInterval: ${String(config.syncInterval)}` })
        return
      }
    }

    const { bandwidthLimitKBps } = config
    if (bandwidthLimitKBps !== undefined) {
      if (typeof bandwidthLimitKBps !== 'number' || !Number.isFinite(bandwidthLimitKBps) || bandwidthLimitKBps < 0) {
        res.json({ success: false, error: `Invalid bandwidthLimitKBps: ${String(bandwidthLimitKBps)}` })
        return
      }
    }

    const deltaSync = getDeltaSync()
    if (!deltaSync) {
      res.json({ success: false, error: 'Sync service not initialized' })
      return
    }
    if (hours !== undefined) {
      deltaSync.setAutoSyncInterval(hours)
    }
    if (bandwidthLimitKBps !== undefined) {
      deltaSync.setBandwidthLimitKBps(bandwidthLimitKBps)
    }
    res.json({ success: true })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update sync config',
    })
  }
})

/**
 * PUT /config/storage — update storage config (`maxSizeMB`, `pruneOldCves`,
 * `pruneOlderThanYear`) from the request body, merging over the existing stored config so
 * a partial update doesn't wipe other fields, then immediately enforces the prune-old-CVEs
 * policy if enabled. Responds `{ success: false, error }` if any supplied field fails
 * validation or the database isn't initialized.
 */
router.put('/config/storage', async (req, res) => {
  try {
    const body = req.body as { maxSizeMB?: unknown; pruneOldCves?: unknown; pruneOlderThanYear?: unknown }

    // Validate each supplied field before persisting so a malformed body can't corrupt config.
    const config: { maxSizeMB?: number; pruneOldCves?: boolean; pruneOlderThanYear?: number } = {}
    if (body.maxSizeMB !== undefined) {
      if (typeof body.maxSizeMB !== 'number' || body.maxSizeMB <= 0) {
        res.json({ success: false, error: 'Invalid maxSizeMB' })
        return
      }
      config.maxSizeMB = body.maxSizeMB
    }
    if (body.pruneOldCves !== undefined) {
      if (typeof body.pruneOldCves !== 'boolean') {
        res.json({ success: false, error: 'Invalid pruneOldCves' })
        return
      }
      config.pruneOldCves = body.pruneOldCves
    }
    if (body.pruneOlderThanYear !== undefined) {
      if (typeof body.pruneOlderThanYear !== 'number' || !Number.isInteger(body.pruneOlderThanYear)) {
        res.json({ success: false, error: 'Invalid pruneOlderThanYear' })
        return
      }
      config.pruneOlderThanYear = body.pruneOlderThanYear
    }

    const db = getDb()?.getRawDb()
    if (!db) {
      res.json({ success: false, error: 'Database not initialized' })
      return
    }

    // Merge over the stored config so a partial update never wipes other fields.
    setStorageConfig(db, { ...getStorageConfig(db), ...config })

    // Enforce the prune-old-CVEs policy immediately when enabled (H1: persist AND enforce).
    let pruned = 0
    const effective = getStorageConfig(db)
    if (effective.pruneOldCves && typeof effective.pruneOlderThanYear === 'number') {
      pruned = pruneCvesOlderThan(db, effective.pruneOlderThanYear)
      if (pruned > 0) invalidateSearchResponseCache()
    }

    res.json({ success: true, pruned })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update storage config',
    })
  }
})

/**
 * PUT /config/perf — update search-performance config (`searchResultLimit`,
 * `enableSearchCache`, `cacheSizeMB`, `cacheTTLMinutes`) from the request body, persist it
 * merged over the existing stored config, then apply it to the live cache/search runtime
 * and invalidate the search response cache. Responds `{ success: false, error }` if any
 * supplied field fails validation or the database isn't initialized.
 */
router.put('/config/perf', async (req, res) => {
  try {
    const body = req.body as {
      searchResultLimit?: unknown
      enableSearchCache?: unknown
      cacheSizeMB?: unknown
      cacheTTLMinutes?: unknown
    }

    const config: {
      searchResultLimit?: number
      enableSearchCache?: boolean
      cacheSizeMB?: number
      cacheTTLMinutes?: number
    } = {}
    if (body.searchResultLimit !== undefined) {
      if (typeof body.searchResultLimit !== 'number' || body.searchResultLimit <= 0) {
        res.json({ success: false, error: 'Invalid searchResultLimit' })
        return
      }
      config.searchResultLimit = Math.floor(body.searchResultLimit)
    }
    if (body.enableSearchCache !== undefined) {
      if (typeof body.enableSearchCache !== 'boolean') {
        res.json({ success: false, error: 'Invalid enableSearchCache' })
        return
      }
      config.enableSearchCache = body.enableSearchCache
    }
    if (body.cacheSizeMB !== undefined) {
      if (typeof body.cacheSizeMB !== 'number' || body.cacheSizeMB <= 0) {
        res.json({ success: false, error: 'Invalid cacheSizeMB' })
        return
      }
      config.cacheSizeMB = body.cacheSizeMB
    }
    if (body.cacheTTLMinutes !== undefined) {
      if (typeof body.cacheTTLMinutes !== 'number' || body.cacheTTLMinutes <= 0) {
        res.json({ success: false, error: 'Invalid cacheTTLMinutes' })
        return
      }
      config.cacheTTLMinutes = body.cacheTTLMinutes
    }

    const db = getDb()?.getRawDb()
    if (!db) {
      res.json({ success: false, error: 'Database not initialized' })
      return
    }

    // Persist merged config, then apply it to the live cache + search runtime (H2).
    setPerfConfig(db, { ...getPerfConfig(db), ...config })
    applyPerfConfig(getPerfConfig(db))
    invalidateSearchResponseCache()

    res.json({ success: true })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update performance config',
    })
  }
})

/**
 * POST /reset — wipe all CVE data (references, CPE matches, CVEs, CWE references, CVSS
 * metrics) and invalidate the search response cache. Responds `{ success: false, error }`
 * if the database isn't initialized or the deletes throw.
 */
router.post('/reset', async (_req, res) => {
  try {
    const database = getDb()
    if (!database) {
      res.json({ success: false, error: 'Database not initialized' })
      return
    }
    const db = database.getRawDb()
    if (db) {
      db.exec('DELETE FROM "references"')
      db.exec('DELETE FROM cpe_matches')
      db.exec('DELETE FROM cves')
      db.exec('DELETE FROM cwe_references')
      db.exec('DELETE FROM cvss_metrics')
    }
    invalidateSearchResponseCache()
    res.json({ success: true })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset database',
    })
  }
})

/**
 * POST /rebuild — rebuild the `cves_fts` FTS5 index from the `cves` table, creating the
 * virtual table first if it doesn't exist, and invalidate the search response cache.
 * Responds `{ success: false, error }` if the database isn't initialized or the rebuild
 * throws (the FTS-specific failure is captured and surfaced rather than reporting success).
 */
router.post('/rebuild', async (_req, res) => {
  try {
    const database = getDb()
    if (!database) {
      res.json({ success: false, error: 'Database not initialized' })
      return
    }
    const db = database.getRawDb()
    let rebuilt = false
    let rebuildError: string | undefined
    if (db) {
      try {
        const ftsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'").get()

        if (!ftsTable) {
          db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(
              id,
              description,
              content='cves',
              content_rowid='rowid'
            )
          `)
          console.log('Created FTS5 table: cves_fts')
        }

        db.exec('DELETE FROM cves_fts')
        db.exec(`
          INSERT INTO cves_fts(rowid, id, description)
          SELECT rowid, id, description FROM cves
        `)
        console.log('FTS index rebuilt successfully')
        rebuilt = true
      } catch (ftsError) {
        // Surface the failure instead of swallowing it and reporting success anyway.
        rebuildError = ftsError instanceof Error ? ftsError.message : String(ftsError)
        console.error('FTS rebuild failed:', ftsError)
      }
    }
    invalidateSearchResponseCache()
    if (rebuilt) {
      res.json({ success: true })
    } else {
      res.json({ success: false, error: rebuildError ?? 'FTS rebuild failed (database not available)' })
    }
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rebuild indexes',
    })
  }
})

/**
 * POST /fts/search — run a raw FTS5 search for `query` (with optional `limit`, default 50)
 * against the `cves_fts` table. Responds `{ success: false, error }` if the database/raw
 * connection isn't available, the FTS index doesn't exist, or the search throws.
 */
router.post('/fts/search', async (req, res) => {
  try {
    const database = getDb()
    if (!database) {
      res.json({ success: false, error: 'Database not initialized' })
      return
    }
    const db = database.getRawDb()
    if (!db) {
      res.json({ success: false, error: 'Raw database not available' })
      return
    }

    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'").get()
    if (!tableCheck) {
      res.json({ success: false, error: 'FTS index not available' })
      return
    }

    const { query, limit } = req.body as { query: string; limit?: number }
    const results = searchCVEsFTS(db, query, limit || 50)
    res.json({ success: true, results })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'FTS search failed' })
  }
})

/**
 * GET /fts/stats — return FTS5 index stats via `getFTSStats`. Responds `{ success: false,
 * error }` if the database/raw connection isn't available or the lookup throws.
 */
router.get('/fts/stats', async (_req, res) => {
  try {
    const database = getDb()
    if (!database) {
      res.json({ success: false, error: 'Database not initialized' })
      return
    }
    const db = database.getRawDb()
    if (!db) {
      res.json({ success: false, error: 'Raw database not available' })
      return
    }

    const stats = getFTSStats(db)
    res.json({ success: true, stats })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get FTS stats' })
  }
})

/**
 * GET /cache/stats — return stats for the search-response `QueryCache`, not the unused
 * `CacheManager` singleton (which was never initialized and always reported all-zero
 * stats). Responds `{ success: false, error }` if reading the stats throws.
 */
router.get('/cache/stats', async (_req, res) => {
  try {
    // Report the real search-response cache (QueryCache), not the never-initialized
    // CacheManager singleton, whose getInstance() returned all-zero stats.
    const stats = searchResponseCache.getStats()
    res.json({ success: true, stats })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get cache stats' })
  }
})

/**
 * POST /cache/clear — clear the search-response `QueryCache` (the real cache, not the
 * unused `CacheManager` singleton, which would be a no-op). Responds `{ success: false,
 * error }` if clearing throws.
 */
router.post('/cache/clear', async (_req, res) => {
  try {
    // Clear the real search-response cache, not the never-initialized CacheManager (no-op).
    invalidateSearchResponseCache()
    res.json({ success: true })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to clear cache' })
  }
})

/**
 * GET /download/queue — return the current bulk-download queue status. Responds `{
 * success: true, queue: [] }` (not an error) when there's no database yet, since an empty
 * queue is a genuine state; responds `{ success: false, error }` if the lookup throws.
 */
router.get('/download/queue', async (_req, res) => {
  try {
    const db = getDb()?.getRawDb()
    // No DB yet → the queue is genuinely empty, not an error.
    if (!db) {
      res.json({ success: true, queue: [] })
      return
    }
    const queue = createBulkDownloadManager(db).getQueueStatus()
    res.json({ success: true, queue })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to read download queue' })
  }
})

/**
 * POST /download/clear — clear the bulk-download queue if a database is available (a
 * no-op success if not). Responds `{ success: false, error }` if clearing throws.
 */
router.post('/download/clear', async (_req, res) => {
  try {
    const db = getDb()?.getRawDb()
    if (db) {
      createBulkDownloadManager(db).clearQueue()
    }
    res.json({ success: true })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to clear download queue' })
  }
})

export { router as databaseRouter }
