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
import { sanitizeSqlInput, isValidCveId, escapeLikePattern } from '../database/sqlSanitizer.js'
import { broadcast } from '../websocket.js'
import { importNvdData, getAvailableNvdYears, createBulkDownloadManager } from '../database/nvd/index.js'
import { downloadAndImportNVDData, getAvailableYears } from '../database/nvdDownloader.js'
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

        const rawDb = database.getRawDb()

        if (rawDb) {
          const ftsTable = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'").get()
          if (ftsTable) {
            // Wrap as an FTS5 phrase so special characters (-, :, *, ") are treated
            // literally and can't trigger an FTS5 syntax error.
            const ftsQuery = `"${term.replace(/"/g, '""')}"`
            const ftsIds = searchCVEsFTS(rawDb, ftsQuery, limit, offset)
            const batchDetails = database.getCVEsByIds(ftsIds.map((r) => r.id))
            results = ftsIds
              .map((f) => batchDetails.get(f.id))
              .filter((r): r is NonNullable<typeof r> => r !== undefined)
            total = results.length < limit ? offset + results.length : offset + limit + 1
            break
          }
        }

        results = database.searchCVEsByText(escapeLikePattern(term), limit, offset)
        // Approximate matching total (same heuristic as the FTS branch), not the whole-DB CVE
        // count — getTotalCVECount() reported hundreds of thousands for a handful of matches.
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

    importNvdData({
      years,
      batchSize: 1000,
      validateChecksums: true,
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

router.post('/sync/bulk', syncLimiter, async (req, res) => {
  try {
    const database = getDb()
    if (!database) {
      res.json({ success: false, error: 'Database not initialized' })
      return
    }

    if (syncState.isSyncing) {
      res.json({ success: false, error: 'Sync already in progress' })
      return
    }

    const nvdStorage = createApiKeyStorage('nvd')
    let apiKey = await nvdStorage.getApiKey()

    if (!apiKey) {
      apiKey = process.env.NIST_API_KEY || process.env.NVD_API_KEY || ''
    }

    if (!apiKey) {
      res.json({
        success: false,
        error:
          'NVD API key required. Please add your NVD API key in Settings > API Configuration. Get a free key at: https://nvd.nist.gov/developers/request-an-api-key',
      })
      return
    }

    const availableYears = getAvailableYears()
    const request = req.body as { years?: number[] }
    const years = request.years || availableYears.slice(-3)

    console.log('Starting bulk download for years:', years)

    beginSync('bulk')
    let totalCves = 0

    try {
      await downloadAndImportNVDData(years, apiKey, (progress) => {
        totalCves = progress.processedCVEs ?? totalCves
        syncState.progress = progress.completedYears ?? 0
        syncState.total = progress.totalYears ?? 0
        syncState.currentFile = progress.year ? `Year ${progress.year}` : null
        broadcast('nvd:bulk-download-progress', {
          year: progress.year,
          status: progress.status,
          downloaded: progress.downloaded,
          total: progress.total,
          totalYears: progress.totalYears,
          completedYears: progress.completedYears,
          totalCves: progress.totalCVEs,
          processedCves: progress.processedCVEs,
        })
      })
    } finally {
      endSync()
    }

    res.json({ success: true, totalCves })
  } catch (error) {
    console.error('Bulk download failed:', error)
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download NVD data',
    })
  }
})

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

router.post('/cache/clear', async (_req, res) => {
  try {
    // Clear the real search-response cache, not the never-initialized CacheManager (no-op).
    invalidateSearchResponseCache()
    res.json({ success: true })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to clear cache' })
  }
})

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
