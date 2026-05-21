import { Router } from 'express'
import { getDb, getDeltaSync, getCpeSearch } from '../database/initialize.js'
import {
  validateNvdSearchRequest,
  validateGetCveRequest,
  validateStartSyncRequest,
  validateCpeSearchRequest,
  sanitizeErrorMessage,
} from '../database/ipcRequestValidator.js'
import { sanitizeSqlInput, isValidCveId, isValidSearchQuery, escapeLikePattern } from '../database/sqlSanitizer.js'
import { broadcast } from '../websocket.js'
import { importNvdData, getAvailableNvdYears } from '../database/nvd/index.js'
import { downloadAndImportNVDData, getAvailableYears } from '../database/nvdDownloader.js'
import { searchCVEsFTS, getFTSStats } from '../database/ftsMigration.js'
import { CacheManager } from '../services/CacheManager.js'
import { createApiKeyStorage } from '../services/storage/index.js'
import type {
  Severity,
  NvdSearchRequest,
  GetCveRequest,
  GetCveFullRequest,
  DeltaSyncProgress,
  DeltaSyncResult,
  CPESearchRequest,
} from '../types/database.js'

const router = Router()

const syncState = {
  isSyncing: false,
}

function normalizeDisplaySeverity(severity: string | null | undefined): string {
  return severity === 'NONE' || !severity ? 'LOW' : severity
}

router.post('/search', async (req, res) => {
  const request = req.body as NvdSearchRequest
  try {
    const validatedRequest = validateNvdSearchRequest(request)

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

      case 'cpe':
        results = database.searchCVEsByCPE(sanitizedQuery, validatedRequest.limit || 100, validatedRequest.offset || 0)
        total = database.getTotalCVECount()
        break

      case 'text': {
        if (!isValidSearchQuery(sanitizedQuery)) {
          res.json({
            success: false,
            results: [],
            total: 0,
            limit: validatedRequest.limit || 100,
            offset: validatedRequest.offset || 0,
            error: 'Invalid search query',
          })
          return
        }
        results = database.searchCVEsByText(
          escapeLikePattern(sanitizedQuery),
          validatedRequest.limit || 100,
          validatedRequest.offset || 0,
        )
        total = database.getTotalCVECount()
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

    const mappedResults = results.map((cve) => ({
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

    res.json({
      success: true,
      results: mappedResults,
      total,
      limit: validatedRequest.limit || 100,
      offset: validatedRequest.offset || 0,
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
        progress: syncState.isSyncing ? 50 : 0,
        total: syncState.isSyncing ? 100 : 0,
        currentFile: syncState.isSyncing ? 'Downloading...' : null,
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

router.post('/sync/start', async (req, res) => {
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

    syncState.isSyncing = true

    const years = validatedRequest?.years || getAvailableNvdYears(2021, 2026)

    importNvdData({
      years,
      batchSize: 1000,
      validateChecksums: true,
      onProgress: (progress) => {
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
        syncState.isSyncing = false

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
        syncState.isSyncing = false

        broadcast('nvd-sync-error', {
          success: false,
          message: error.message,
          error: error.message,
        })
      },
    }).catch((error) => {
      syncState.isSyncing = false

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
    syncState.isSyncing = false
    const errorMessage = sanitizeErrorMessage(error)
    res.json({
      success: false,
      message: 'Failed to start NVD sync',
      error: errorMessage,
    })
  }
})

router.post('/sync/delta', async (req, res) => {
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

  syncState.isSyncing = true

  try {
    const result: DeltaSyncResult = await deltaSync.sync({
      forceFullSync: force,
      onProgress: (progress: DeltaSyncProgress) => {
        broadcast('nvd:sync-progress', { type: 'delta-sync', progress })
      },
    })

    syncState.isSyncing = false

    broadcast('nvd:sync-complete', { type: 'delta-sync', result })

    res.json(result)
  } catch (error) {
    syncState.isSyncing = false
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
    const deltaSync = getDeltaSync()
    if (deltaSync) {
      deltaSync.cancel()
    }
    syncState.isSyncing = false
    res.json({ success: true })
  } catch {
    res.json({ success: false })
  }
})

router.post('/sync/bulk', async (req, res) => {
  try {
    const database = getDb()
    if (!database) {
      res.json({ success: false, error: 'Database not initialized' })
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

    const totalCves = 0

    await downloadAndImportNVDData(years, apiKey, (progress) => {
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
    const { enabled, intervalHours } = req.body as { enabled: boolean; intervalHours: number }
    const database = getDb()
    if (database) {
      const db = database.getRawDb()
      if (db) {
        db.exec(
          `
          UPDATE sync_status
          SET auto_sync_enabled = ?, auto_sync_interval_hours = ?
          WHERE source = 'NVD'
        `,
          [enabled ? 1 : 0, intervalHours],
        )
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

router.get('/config/sync', async (_req, res) => {
  try {
    const deltaSync = getDeltaSync()
    const status = deltaSync?.getSyncStatus()
    res.json({
      success: true,
      config: {
        syncInterval: status?.autoSyncIntervalHours ? 'daily' : 'weekly',
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
    const config = req.body as { syncInterval?: string }
    console.log('Update sync config:', config)
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
    const config = req.body as { maxSizeMB?: number; pruneOldCves?: boolean; pruneOlderThanYear?: number }
    console.log('Update storage config:', config)
    res.json({ success: true })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update storage config',
    })
  }
})

router.put('/config/perf', async (req, res) => {
  try {
    const config = req.body as {
      searchResultLimit?: number
      enableSearchCache?: boolean
      cacheSizeMB?: number
      cacheTTLMinutes?: number
    }
    console.log('Update performance config:', config)
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
      db.run('DELETE FROM "references"')
      db.run('DELETE FROM cpe_matches')
      db.run('DELETE FROM cves')
      db.run('DELETE FROM cwe_references')
      db.run('DELETE FROM cvss_metrics')
    }
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
    if (db) {
      try {
        const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")

        if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
          db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(
              id,
              description,
              content='cves',
              content_rowid='rowid'
            )
          `)
          console.log('Created FTS5 table: cves_fts')
        }

        db.run('DELETE FROM cves_fts')
        db.run(`
          INSERT INTO cves_fts(rowid, id, description)
          SELECT rowid, id, description FROM cves
        `)
        console.log('FTS index rebuilt successfully')
      } catch (ftsError) {
        console.log('FTS rebuild skipped:', ftsError)
      }
    }
    res.json({ success: true })
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

    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
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
    const cache = CacheManager.getInstance()
    const stats = cache.getStats()
    res.json({ success: true, stats })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get cache stats' })
  }
})

router.post('/cache/clear', async (_req, res) => {
  try {
    const cache = CacheManager.getInstance()
    cache.clear()
    res.json({ success: true })
  } catch (error) {
    res.json({ success: false, error: error instanceof Error ? error.message : 'Failed to clear cache' })
  }
})

router.get('/download/queue', async (_req, res) => {
  res.json({ success: true, queue: [] })
})

router.post('/download/clear', async (_req, res) => {
  res.json({ success: true })
})

export { router as databaseRouter }
