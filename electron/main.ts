import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initMainErrorInterceptor } from '../scripts/error-interceptor.js'
import { setupMenu } from './menu.js'
import { getDatabase } from './database/index.js'
import { downloadAndImportNVDData, getAvailableYears } from './database/nvdDownloader.js'
import {
  isSafeStorageAvailable,
  createApiKeyStorage,
  needsMigration,
  migratePlaintextKeys,
} from './main/storage/index.js'
import { sanitizeSqlInput, isValidCveId, isValidSearchQuery, escapeLikePattern } from './database/sqlSanitizer.js'
import { wrapIpcHandler, startPeriodicCleanup, stopPeriodicCleanup } from './ipcRateLimit.js'
import {
  validateNvdSearchRequest,
  validateGetCveRequest,
  validateStartSyncRequest,
  validateSetApiKeyRequest,
  validateGetApiKeyRequest,
  validateDeleteApiKeyRequest,
  validateHasApiKeyRequest,
  validateCpeSearchRequest,
  sanitizeErrorMessage,
} from './database/ipcRequestValidator.js'
import {
  initializeUpdater,
  checkForUpdates as checkForUpdatesImpl,
  downloadUpdate as downloadUpdateImpl,
  installUpdate as installUpdateImpl,
  getCurrentVersion,
  getUpdateState,
  setAutoDownload,
  setAutoInstallOnQuit,
} from './updater.js'
import {
  DB_IPC_CHANNELS,
  type NvdSearchRequest,
  type GetCveRequest,
  type GetCveFullRequest,
  type NvdSearchResponse,
  type GetCveResponse,
  type GetCveFullResponse,
  type GetStatsResponse,
  type SyncStatusResponse,
  type StartSyncRequest,
  type StartSyncResponse,
  type DeltaSyncResult,
  type DeltaSyncProgress,
  type GetDetailedStatsResponse,
  type CPESearchRequest,
  type CPESearchResponse,
} from './types/database.js'
import {
  BACKUP_IPC_CHANNELS,
  type ListBackupsResponse,
  type GetBackupStatsResponse,
  type GetBackupConfigResponse,
  type VerifyBackupResponse,
} from './types/backup.js'
import {
  initializeBackupService,
  getBackupService,
  type BackupConfig,
  type BackupResult,
} from './services/BackupService.js'
import { createNvdDeltaSync } from './database/nvd/nvdDeltaSync.js'
import { CPESearch } from './database/cpeSearch.js'
import {
  STORAGE_IPC_CHANNELS,
  type SetApiKeyRequest,
  type GetApiKeyRequest,
  type DeleteApiKeyRequest,
  type HasApiKeyRequest,
  type SetApiKeyResponse,
  type GetApiKeyResponse,
  type DeleteApiKeyResponse,
  type HasApiKeyResponse,
  type NeedsMigrationResponse,
  type MigrateKeysResponse,
  type GetAllKeysResponse,
  type IsAvailableResponse,
} from './types/storage.js'
import {
  INTELLIGENCE_IPC_CHANNELS,
  type CheckKevResponse,
  type GetKevDetailsResponse,
  type GetKevStatsResponse,
  type SyncKevResponse,
  type GetEpssScoreResponse,
  type GetEpssScoresResponse,
  type RefreshEpssScoreResponse,
  type GetEpssStatsResponse,
} from './types/intelligence.js'
import { KevService, getKevService } from './services/intelligence/KevService.js'
import { EpssService, getEpssService, type EpssScore } from './services/intelligence/EpssService.js'
import {
  CONTAINER_IPC_CHANNELS,
  type CheckRuntimeRequest,
  type CheckRuntimeResponse,
  type PullImageRequest,
  type PullImageResponse,
  type GetManifestRequest,
  type GetManifestResponse,
  type InspectImageRequest,
  type InspectImageResponse,
  type ScanImageRequest,
  type ScanImageResponse,
  type ExtractPackagesRequest,
  type ExtractPackagesResponse,
} from './types/container.js'
import { ContainerService } from './services/ContainerService.js'

// In CommonJS, __dirname is available natively

let mainWindow: BrowserWindow | null = null
let applicationMenu: Menu | null = null

/**
 * Normalize severity for display purposes.
 * CVSS 'NONE' severity is displayed as 'LOW' in the UI.
 */
function normalizeDisplaySeverity(severity: string | null | undefined): string {
  return severity === 'NONE' || !severity ? 'LOW' : severity
}

// Determine if we're in development mode (lazy evaluation to avoid accessing app before ready)
let isDev: boolean | null = null
function getIsDev(): boolean {
  if (isDev === null) {
    isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged
  }
  return isDev
}

// Initialize error interceptor before anything else
initMainErrorInterceptor()

// Get the E2E test URL (for preview server during testing)
const e2eTestUrl = process.env.E2E_TEST_URL

// Determine if we should open DevTools (lazy)
function shouldOpenDevTools(): boolean {
  return getIsDev() && process.env.E2E_NO_DEVTOOLS !== 'true'
}

// Database instance
let database: Awaited<ReturnType<typeof getDatabase>> | null = null

// Delta sync instance
let deltaSync: ReturnType<typeof createNvdDeltaSync> | null = null

// CPE search instance
let cpeSearch: CPESearch | null = null

// Sync state
const syncState = {
  isSyncing: false,
}

async function initializeDatabase() {
  try {
    database = getDatabase()
    await database.initialize()

    // Copy bundled seed DB on first run if no existing DB
    const dbPath = database.getDbPath?.()
    if (dbPath) {
      const { hasBundledSeed, copyBundledSeed } = await import('./database/dbSeedingService.js')
      if (hasBundledSeed() && !fs.existsSync(dbPath)) {
        console.log('Bundled seed database found, copying to user data...')
        copyBundledSeed(dbPath)
        // Re-initialize with the seeded data
        await database.initialize()
      }
    }

    // Initialize delta sync with the raw SQL.js database
    const rawDb = database.getRawDb?.()
    if (rawDb) {
      deltaSync = createNvdDeltaSync(rawDb)
      console.log('Delta sync initialized')

      // Initialize CPE search with the same raw database
      cpeSearch = new CPESearch(rawDb)
      console.log('CPE search initialized')
    }

    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }
}

function createWindow(): void {
  // Show splash screen during initial load (production only)
  let splashWindow: BrowserWindow | null = null

  if (!getIsDev() && !e2eTestUrl) {
    const splashPath = path.join(__dirname, 'splash.html')
    if (fs.existsSync(splashPath)) {
      splashWindow = new BrowserWindow({
        width: 450,
        height: 300,
        frame: false,
        backgroundColor: '#1e3a5f',
        alwaysOnTop: true,
        transparent: false,
        resizable: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      })
      splashWindow.loadFile(splashPath)
    }
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'VulnAssessTool v2.0.0',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: process.env.E2E_TEST !== 'true',
      // Additional CSP security: session will enforce CSP for navigation
    },
  })

  // Set CSP on the session for additional security (CRITICAL-002)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Only apply to main document and same-origin resources
    if (details.resourceType === 'mainFrame') {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://services.nvd.nist.gov https://api.osv.dev https://api.github.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
        },
      })
    } else {
      callback({})
    }
  })

  mainWindow.once('ready-to-show', () => {
    // Close splash screen before showing main window
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close()
      splashWindow = null
    }
    mainWindow?.show()
  })

  if (e2eTestUrl) {
    mainWindow.loadURL(e2eTestUrl)
    if (shouldOpenDevTools()) {
      mainWindow.webContents.openDevTools()
    }
  } else if (getIsDev()) {
    mainWindow.loadURL('http://127.0.0.1:3000')
    if (shouldOpenDevTools()) {
      mainWindow.webContents.openDevTools()
    }
  } else {
    const indexPath = path.join(__dirname, '..', 'index.html')
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath)
    } else {
      console.error('Index.html not found at:', indexPath)
      app.quit()
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// IPC handlers
ipcMain.handle('ping', async () => 'pong')

ipcMain.handle('app-version', async () => app.getVersion())

ipcMain.handle('app-platform', async () => process.platform)

/**
 * Validate URL for safe external opening
 * Only allows http/https protocols to prevent security issues
 */
function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Only allow http and https protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

ipcMain.handle('open-external', async (_: IpcMainInvokeEvent, url: string) => {
  if (!isValidExternalUrl(url)) {
    console.error('Blocked invalid URL scheme:', url.substring(0, 50))
    return false
  }
  await shell.openExternal(url)
  return true
})

// ============================================================================
// Secure Storage IPC Handlers
// ============================================================================

ipcMain.handle(STORAGE_IPC_CHANNELS.IS_AVAILABLE, async (): Promise<IsAvailableResponse> => {
  try {
    return {
      success: true,
      isAvailable: isSafeStorageAvailable(),
    }
  } catch {
    return {
      success: false,
      isAvailable: false,
    }
  }
})

ipcMain.handle(
  STORAGE_IPC_CHANNELS.SET_API_KEY,
  async (_: IpcMainInvokeEvent, request: SetApiKeyRequest): Promise<SetApiKeyResponse> => {
    try {
      // Validate request structure and API key format
      const validatedRequest = validateSetApiKeyRequest(request)
      const storage = createApiKeyStorage(validatedRequest.keyType)
      const success = await storage.setApiKey(validatedRequest.apiKey)

      return {
        success,
        error: success ? undefined : 'Failed to store API key securely',
      }
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(error)
      return {
        success: false,
        error: errorMessage,
      }
    }
  },
)

ipcMain.handle(
  STORAGE_IPC_CHANNELS.GET_API_KEY,
  async (_: IpcMainInvokeEvent, request: GetApiKeyRequest): Promise<GetApiKeyResponse> => {
    try {
      // Validate request structure
      const validatedRequest = validateGetApiKeyRequest(request)
      const storage = createApiKeyStorage(validatedRequest.keyType)
      const apiKey = await storage.getApiKey()

      return {
        success: true,
        apiKey,
      }
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(error)
      return {
        success: false,
        apiKey: null,
        error: errorMessage,
      }
    }
  },
)

ipcMain.handle(
  STORAGE_IPC_CHANNELS.DELETE_API_KEY,
  async (_: IpcMainInvokeEvent, request: DeleteApiKeyRequest): Promise<DeleteApiKeyResponse> => {
    try {
      // Validate request structure
      const validatedRequest = validateDeleteApiKeyRequest(request)
      const storage = createApiKeyStorage(validatedRequest.keyType)
      const success = await storage.deleteApiKey()

      return {
        success,
        error: success ? undefined : 'Failed to delete API key',
      }
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(error)
      return {
        success: false,
        error: errorMessage,
      }
    }
  },
)

ipcMain.handle(
  STORAGE_IPC_CHANNELS.HAS_API_KEY,
  async (_: IpcMainInvokeEvent, request: HasApiKeyRequest): Promise<HasApiKeyResponse> => {
    try {
      // Validate request structure
      const validatedRequest = validateHasApiKeyRequest(request)
      const storage = createApiKeyStorage(validatedRequest.keyType)
      const hasKey = await storage.hasApiKey()

      return {
        success: true,
        hasKey,
      }
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(error)
      return {
        success: false,
        hasKey: false,
        error: errorMessage,
      }
    }
  },
)

ipcMain.handle(STORAGE_IPC_CHANNELS.NEEDS_MIGRATION, async (): Promise<NeedsMigrationResponse> => {
  try {
    const needsMigrate = await needsMigration()

    return {
      success: true,
      needsMigration: needsMigrate,
    }
  } catch (error) {
    return {
      success: false,
      needsMigration: false,
      error: error instanceof Error ? error.message : 'Failed to check migration status',
    }
  }
})

ipcMain.handle(STORAGE_IPC_CHANNELS.MIGRATE_KEYS, async (): Promise<MigrateKeysResponse> => {
  try {
    const result = await migratePlaintextKeys()

    return {
      success: result.success,
      migrated: result.migrated,
      failed: result.failed,
    }
  } catch (error) {
    return {
      success: false,
      migrated: [],
      failed: [],
      error: error instanceof Error ? error.message : 'Failed to migrate keys',
    }
  }
})

ipcMain.handle(STORAGE_IPC_CHANNELS.GET_ALL_KEYS, async (): Promise<GetAllKeysResponse> => {
  try {
    const nvdStorage = createApiKeyStorage('nvd')
    const osvStorage = createApiKeyStorage('osv')
    const githubStorage = createApiKeyStorage('github')

    const keys = {
      nvd: await nvdStorage.getApiKey(),
      osv: await osvStorage.getApiKey(),
      github: await githubStorage.getApiKey(),
    }

    return {
      success: true,
      keys,
    }
  } catch (error) {
    return {
      success: false,
      keys: { nvd: null, osv: null, github: null },
      error: error instanceof Error ? error.message : 'Failed to retrieve API keys',
    }
  }
})

// ============================================================================
// Database IPC Handlers
// ============================================================================

ipcMain.handle(
  DB_IPC_CHANNELS.SEARCH,
  wrapIpcHandler(
    DB_IPC_CHANNELS.SEARCH,
    async (_: IpcMainInvokeEvent, request: NvdSearchRequest): Promise<NvdSearchResponse> => {
      try {
        // Validate request structure and content
        const validatedRequest = validateNvdSearchRequest(request)

        if (!database || !database.isInitialized()) {
          return {
            success: false,
            results: [],
            total: 0,
            limit: validatedRequest.limit || 100,
            offset: validatedRequest.offset || 0,
            error: 'Database not initialized',
          }
        }

        let results: any[] = []
        let total = 0

        // Sanitize query input based on search type
        const sanitizedQuery = sanitizeSqlInput(validatedRequest.query)

        switch (validatedRequest.type) {
          case 'cve-id':
            // Additional validation for CVE ID format
            if (!isValidCveId(sanitizedQuery)) {
              return {
                success: false,
                results: [],
                total: 0,
                limit: validatedRequest.limit || 100,
                offset: validatedRequest.offset || 0,
                error: 'Invalid CVE ID format',
              }
            }
            const cve = database.getCVEById(sanitizedQuery.toUpperCase())
            results = cve ? [cve] : []
            total = results.length
            break

          case 'cpe':
            results = database.searchCVEsByCPE(
              sanitizedQuery,
              validatedRequest.limit || 100,
              validatedRequest.offset || 0,
            )
            total = database.getTotalCVECount()
            break

          case 'text':
            // Validate search query for text searches
            if (!isValidSearchQuery(sanitizedQuery)) {
              return {
                success: false,
                results: [],
                total: 0,
                limit: validatedRequest.limit || 100,
                offset: validatedRequest.offset || 0,
                error: 'Invalid search query',
              }
            }
            results = database.searchCVEsByText(
              escapeLikePattern(sanitizedQuery),
              validatedRequest.limit || 100,
              validatedRequest.offset || 0,
            )
            total = database.getTotalCVECount()
            break

          default:
            return {
              success: false,
              results: [],
              total: 0,
              limit: validatedRequest.limit || 100,
              offset: validatedRequest.offset || 0,
              error: 'Invalid search type',
            }
        }

        // Convert 'NONE' severity to 'LOW' for display
        const mappedResults = results.map((cve: any) => ({
          id: cve.id,
          cveId: cve.id,
          description: cve.description,
          severity: normalizeDisplaySeverity(cve.severity),
          cvssScore: cve.cvss_score || 0,
          cvssVector: cve.cvss_vector,
          publishedAt: cve.published_at,
          modifiedAt: cve.modified_at,
          source: cve.source,
        }))

        return {
          success: true,
          results: mappedResults,
          total,
          limit: validatedRequest.limit || 100,
          offset: validatedRequest.offset || 0,
        }
      } catch (error) {
        console.error('Search error:', error)
        const errorMessage = sanitizeErrorMessage(error)
        return {
          success: false,
          results: [],
          total: 0,
          limit: request?.limit || 100,
          offset: request?.offset || 0,
          error: errorMessage,
        }
      }
    },
  ),
)

ipcMain.handle(
  DB_IPC_CHANNELS.GET_CVE,
  async (_: IpcMainInvokeEvent, request: GetCveRequest): Promise<GetCveResponse> => {
    try {
      // Validate request structure and CVE ID format
      const validatedRequest = validateGetCveRequest(request)

      if (!database || !database.isInitialized()) {
        return {
          success: false,
          cve: null,
          error: 'Database not initialized',
        }
      }

      // Sanitize CVE ID (already validated in validateGetCveRequest)
      const cveId = sanitizeSqlInput(validatedRequest.cveId).toUpperCase()
      const cve = database.getCVEById(cveId)

      if (!cve) {
        return {
          success: true,
          cve: null,
        }
      }

      return {
        success: true,
        cve: {
          id: cve.id,
          cveId: cve.id,
          description: cve.description,
          severity: normalizeDisplaySeverity(cve.severity),
          cvssScore: cve.cvss_score || 0,
          cvssVector: cve.cvss_vector,
          publishedAt: cve.published_at,
          modifiedAt: cve.modified_at,
          source: cve.source,
        },
      }
    } catch (error) {
      console.error('Get CVE error:', error)
      const errorMessage = sanitizeErrorMessage(error)
      return {
        success: false,
        cve: null,
        error: errorMessage,
      }
    }
  },
)

ipcMain.handle(
  DB_IPC_CHANNELS.GET_CVE_FULL,
  async (_: IpcMainInvokeEvent, request: GetCveFullRequest): Promise<GetCveFullResponse> => {
    try {
      // Validate request structure and CVE ID format
      const validatedRequest = validateGetCveRequest(request as GetCveRequest)

      if (!database || !database.isInitialized()) {
        return {
          success: false,
          cve: null,
          error: 'Database not initialized',
        }
      }

      // Sanitize CVE ID
      const cveId = sanitizeSqlInput(validatedRequest.cveId).toUpperCase()
      const cve = database.getCVEFullDetails(cveId)

      if (!cve) {
        return {
          success: true,
          cve: null,
        }
      }

      return {
        success: true,
        cve,
      }
    } catch (error) {
      console.error('Get CVE full details error:', error)
      const errorMessage = sanitizeErrorMessage(error)
      return {
        success: false,
        cve: null,
        error: errorMessage,
      }
    }
  },
)

ipcMain.handle(DB_IPC_CHANNELS.GET_STATS, async (_: IpcMainInvokeEvent): Promise<GetStatsResponse> => {
  try {
    if (!database || !database.isInitialized()) {
      return {
        success: false,
        stats: null,
        error: 'Database not initialized',
      }
    }

    const metadata = database.getMetadata()
    const dbSize = database.getDbSize()

    return {
      success: true,
      stats: {
        totalCves: metadata.total_cves,
        lastUpdate: metadata.last_sync_at || null,
        dbSize,
        version: 1,
      },
    }
  } catch (error) {
    console.error('Get stats error:', error)
    return {
      success: false,
      stats: null,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    }
  }
})

ipcMain.handle(DB_IPC_CHANNELS.GET_SYNC_STATUS, async (_: IpcMainInvokeEvent): Promise<SyncStatusResponse> => {
  try {
    if (!database || !database.isInitialized()) {
      return {
        success: false,
        status: null,
        error: 'Database not initialized',
      }
    }

    const metadata = database.getMetadata()
    return {
      success: true,
      status: {
        isSyncing: syncState.isSyncing,
        progress: syncState.isSyncing ? 50 : 0, // Simplified progress
        total: syncState.isSyncing ? 100 : 0,
        currentFile: syncState.isSyncing ? 'Downloading...' : null,
        error: null,
        lastSync: metadata.last_sync_at || null,
      },
    }
  } catch (error) {
    return {
      success: false,
      status: null,
      error: error instanceof Error ? error.message : 'Failed to get sync status',
    }
  }
})

ipcMain.handle(
  DB_IPC_CHANNELS.START_SYNC,
  wrapIpcHandler(
    DB_IPC_CHANNELS.START_SYNC,
    async (_: IpcMainInvokeEvent, request?: StartSyncRequest): Promise<StartSyncResponse> => {
      try {
        // Validate request structure
        const validatedRequest = validateStartSyncRequest(request)

        const { importNvdData, getAvailableNvdYears } = await import('./database/nvd/index.js')

        // Check if sync is already in progress
        if (syncState.isSyncing) {
          return {
            success: false,
            message: 'Sync already in progress',
            error: 'SYNC_IN_PROGRESS',
          }
        }

        syncState.isSyncing = true

        // Get years to download (2021-2026 as requested)
        const years = validatedRequest?.years || getAvailableNvdYears(2021, 2026)

        // Start download and import using new manager
        importNvdData({
          years,
          batchSize: 1000,
          validateChecksums: true,
          onProgress: (progress) => {
            // Notify renderer of progress
            if (mainWindow) {
              mainWindow.webContents.send('nvd-sync-progress', {
                year: progress.currentYear,
                status: progress.phase,
                downloaded: progress.download.downloadedBytes,
                total: progress.download.totalBytes,
                totalYears: progress.years.total,
                completedYears: progress.years.completed,
                totalCVEs: progress.import.totalCVEs,
                processedCVEs: progress.import.importedCVEs,
              })
            }
          },
          onComplete: (result) => {
            syncState.isSyncing = false

            if (mainWindow) {
              mainWindow.webContents.send('nvd-sync-complete', {
                success: result.success,
                message: result.success
                  ? `NVD sync completed successfully. Imported ${result.importedCVEs} CVEs from ${result.yearsProcessed.length} years.`
                  : 'NVD sync completed with errors',
                yearsProcessed: result.yearsProcessed,
                yearsFailed: result.yearsFailed,
                totalCVEs: result.importedCVEs,
                duration: result.duration,
              })
            }
          },
          onError: (error) => {
            syncState.isSyncing = false

            if (mainWindow) {
              mainWindow.webContents.send('nvd-sync-error', {
                success: false,
                message: error.message,
                error: error.message,
              })
            }
          },
        }).catch((error) => {
          // This shouldn't happen since onError handles errors, but just in case
          syncState.isSyncing = false

          if (mainWindow) {
            mainWindow.webContents.send('nvd-sync-error', {
              success: false,
              message: error.message,
              error: error.message,
            })
          }
        })

        return {
          success: true,
          message: `Starting NVD sync for years: ${years.join(', ')}`,
        }
      } catch (error) {
        syncState.isSyncing = false
        const errorMessage = sanitizeErrorMessage(error)
        return {
          success: false,
          message: 'Failed to start NVD sync',
          error: errorMessage,
        }
      }
    },
  ),
)

// Delta sync handler for incremental updates
ipcMain.handle(
  DB_IPC_CHANNELS.START_DELTA_SYNC,
  async (_: IpcMainInvokeEvent, force: boolean = false): Promise<DeltaSyncResult> => {
    if (syncState.isSyncing) {
      return {
        success: false,
        cvesFetched: 0,
        cvesAdded: 0,
        cvesUpdated: 0,
        cvesSkipped: 0,
        cvesFailed: 0,
        durationMs: 0,
        syncedAt: new Date().toISOString(),
        errors: ['Sync already in progress'],
      }
    }

    if (!deltaSync) {
      return {
        success: false,
        cvesFetched: 0,
        cvesAdded: 0,
        cvesUpdated: 0,
        cvesSkipped: 0,
        cvesFailed: 0,
        durationMs: 0,
        syncedAt: new Date().toISOString(),
        errors: ['Delta sync not initialized'],
      }
    }

    syncState.isSyncing = true

    try {
      const result = await deltaSync.sync({
        forceFullSync: force,
        onProgress: (progress: DeltaSyncProgress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('nvd:sync-progress', { type: 'delta-sync', progress })
          }
        },
      })

      syncState.isSyncing = false

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nvd:sync-complete', { type: 'delta-sync', result })
      }

      return result
    } catch (error) {
      syncState.isSyncing = false
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nvd:sync-error', { type: 'delta-sync', error: errorMessage })
      }

      return {
        success: false,
        cvesFetched: 0,
        cvesAdded: 0,
        cvesUpdated: 0,
        cvesSkipped: 0,
        cvesFailed: 0,
        durationMs: 0,
        syncedAt: new Date().toISOString(),
        errors: [errorMessage],
      }
    }
  },
)

// Cancel sync handler
ipcMain.handle(DB_IPC_CHANNELS.CANCEL_SYNC, async (): Promise<{ success: boolean }> => {
  try {
    if (deltaSync) {
      deltaSync.cancel()
    }
    syncState.isSyncing = false
    return { success: true }
  } catch {
    return { success: false }
  }
})

// Detailed stats handler
ipcMain.handle(DB_IPC_CHANNELS.GET_DETAILED_STATS, async (): Promise<GetDetailedStatsResponse> => {
  try {
    if (!database || !database.isInitialized()) {
      return {
        success: false,
        stats: null,
        error: 'Database not initialized',
      }
    }

    const stats = deltaSync?.getStats()
    const status = deltaSync?.getSyncStatus()

    // Get counts from database
    const metadata = database.getMetadata()

    return {
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
    }
  } catch (error) {
    return {
      success: false,
      stats: null,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    }
  }
})

// CPE Search handler
ipcMain.handle(
  DB_IPC_CHANNELS.CPE_SEARCH,
  async (_: IpcMainInvokeEvent, request: CPESearchRequest): Promise<CPESearchResponse> => {
    try {
      if (!cpeSearch) {
        return {
          success: false,
          results: [],
          error: 'CPE search not initialized',
        }
      }

      // Validate request parameters
      const { limit, error: validationError } = validateCpeSearchRequest(request)
      if (validationError) {
        return { success: false, results: [], error: validationError }
      }

      let results

      // Use tokens if provided, otherwise use productName
      if (request.tokens && request.tokens.length > 0) {
        results = await cpeSearch.searchByTokens(request.tokens, limit)
      } else if (request.productName) {
        results = await cpeSearch.searchByProductName(request.productName, limit)
      } else {
        return {
          success: false,
          results: [],
          error: 'Either productName or tokens must be provided',
        }
      }

      return {
        success: true,
        results,
      }
    } catch (error) {
      console.error('CPE search error:', error)
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Failed to search CPEs',
      }
    }
  },
)

// Sync configuration handlers
ipcMain.handle(
  DB_IPC_CHANNELS.GET_SYNC_CONFIG,
  async (): Promise<{ success: boolean; config?: { syncInterval?: string }; error?: string }> => {
    try {
      const status = deltaSync?.getSyncStatus()
      return {
        success: true,
        config: {
          syncInterval: status?.autoSyncIntervalHours ? 'daily' : 'weekly',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get sync config',
      }
    }
  },
)

ipcMain.handle(
  DB_IPC_CHANNELS.UPDATE_SYNC_CONFIG,
  async (_: IpcMainInvokeEvent, config: { syncInterval?: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      // In a full implementation, this would persist the config
      console.log('Update sync config:', config)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update sync config',
      }
    }
  },
)

ipcMain.handle(
  DB_IPC_CHANNELS.UPDATE_STORAGE_CONFIG,
  async (
    _: IpcMainInvokeEvent,
    config: { maxSizeMB?: number; pruneOldCves?: boolean; pruneOlderThanYear?: number },
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // In a full implementation, this would persist the config
      console.log('Update storage config:', config)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update storage config',
      }
    }
  },
)

ipcMain.handle(
  DB_IPC_CHANNELS.UPDATE_PERFORMANCE_CONFIG,
  async (
    _: IpcMainInvokeEvent,
    config: { searchResultLimit?: number; enableSearchCache?: boolean; cacheSizeMB?: number; cacheTTLMinutes?: number },
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // In a full implementation, this would persist the config
      console.log('Update performance config:', config)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update performance config',
      }
    }
  },
)

ipcMain.handle(DB_IPC_CHANNELS.RESET_DATABASE, async (): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!database) {
      return { success: false, error: 'Database not initialized' }
    }
    // Clear all CVEs from database
    const db = database.getRawDb()
    if (db) {
      db.run('DELETE FROM "references"')
      db.run('DELETE FROM cpe_matches')
      db.run('DELETE FROM cves')
      db.run('DELETE FROM cwe_references')
      db.run('DELETE FROM cvss_metrics')
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset database',
    }
  }
})

ipcMain.handle(DB_IPC_CHANNELS.REBUILD_INDEXES, async (): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!database) {
      return { success: false, error: 'Database not initialized' }
    }
    // Rebuild FTS index if available
    const db = database.getRawDb()
    if (db) {
      try {
        // Check if FTS table exists
        const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")

        if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
          // Create FTS5 virtual table
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

        // Rebuild FTS index
        db.run('DELETE FROM cves_fts')
        db.run(`
          INSERT INTO cves_fts(rowid, id, description)
          SELECT rowid, id, description FROM cves
        `)
        console.log('FTS index rebuilt successfully')
      } catch (ftsError) {
        // FTS table creation/rebuild failed
        console.log('FTS rebuild skipped:', ftsError)
      }
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rebuild indexes',
    }
  }
})

ipcMain.handle(
  DB_IPC_CHANNELS.START_BULK_DOWNLOAD,
  async (
    _: IpcMainInvokeEvent,
    request: { years?: number[] },
  ): Promise<{ success: boolean; error?: string; totalCves?: number }> => {
    try {
      if (!database) {
        return { success: false, error: 'Database not initialized' }
      }

      // Get NVD API key from secure storage (required since 2024)
      // Also check environment variable as fallback for development/testing
      const nvdStorage = createApiKeyStorage('nvd')
      let apiKey = await nvdStorage.getApiKey()

      // Fallback to environment variable for development
      if (!apiKey) {
        apiKey = process.env.NIST_API_KEY || process.env.NVD_API_KEY || ''
      }

      if (!apiKey) {
        return {
          success: false,
          error:
            'NVD API key required. Please add your NVD API key in Settings > API Configuration. Get a free key at: https://nvd.nist.gov/developers/request-an-api-key',
        }
      }

      // Get years to download (default to last 3 years for faster initial sync)
      const availableYears = getAvailableYears()
      const years = request.years || availableYears.slice(-3) // Last 3 years by default

      console.log('Starting bulk download for years:', years)

      const totalCves = 0

      await downloadAndImportNVDData(years, apiKey, (progress) => {
        // Send progress to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('nvd:bulk-download-progress', {
            year: progress.year,
            status: progress.status,
            downloaded: progress.downloaded,
            total: progress.total,
            totalYears: progress.totalYears,
            completedYears: progress.completedYears,
            totalCves: progress.totalCVEs,
            processedCves: progress.processedCVEs,
          })
        }
      })

      return { success: true, totalCves }
    } catch (error) {
      console.error('Bulk download failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download NVD data',
      }
    }
  },
)

// ============================================================================
// Missing DB Handlers (SET_AUTO_SYNC, Download Queue)
// ============================================================================

ipcMain.handle(
  DB_IPC_CHANNELS.SET_AUTO_SYNC,
  async (_: IpcMainInvokeEvent, enabled: boolean, intervalHours: number): Promise<{ success: boolean }> => {
    try {
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
      return { success: true }
    } catch (error) {
      console.error('Failed to set auto sync:', error)
      return { success: false }
    }
  },
)

ipcMain.handle(
  DB_IPC_CHANNELS.GET_DOWNLOAD_QUEUE,
  async (): Promise<{ success: boolean; queue: { year: number; status: string }[] }> => {
    // Download queue is managed by bulkDownloadManager
    // Return empty queue for now — bulk download state is tracked per-request
    return { success: true, queue: [] }
  },
)

ipcMain.handle(DB_IPC_CHANNELS.CLEAR_DOWNLOAD_QUEUE, async (): Promise<{ success: boolean }> => {
  return { success: true }
})

// ============================================================================
// PDF Generation Handler
// ============================================================================

ipcMain.handle('generatePdf', async (_: IpcMainInvokeEvent, htmlContent: string): Promise<Uint8Array> => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window not available')
  }

  // Create a hidden BrowserWindow to render the HTML and print to PDF
  const { BrowserWindow: BW } = await import('electron')
  const pdfWindow = new BW({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  try {
    // Load HTML content
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)

    // Wait for content to render
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Generate PDF
    const pdfData = await pdfWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
      },
    })

    return pdfData
  } finally {
    pdfWindow.close()
  }
})

// ============================================================================
// FTS Search & Cache Handlers
// ============================================================================

ipcMain.handle(
  'db:search-fts',
  async (
    _: IpcMainInvokeEvent,
    query: string,
    limit?: number,
  ): Promise<{ success: boolean; results?: any[]; error?: string }> => {
    try {
      if (!database) {
        return { success: false, error: 'Database not initialized' }
      }
      const db = database.getRawDb()
      if (!db) {
        return { success: false, error: 'Raw database not available' }
      }

      // Check if FTS table exists
      const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")
      if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
        return { success: false, error: 'FTS index not available' }
      }

      const { searchCVEsFTS } = await import('./database/ftsMigration.js')
      const results = searchCVEsFTS(db, query, limit || 50)
      return { success: true, results }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'FTS search failed' }
    }
  },
)

ipcMain.handle('db:fts-stats', async (): Promise<{ success: boolean; stats?: any; error?: string }> => {
  try {
    if (!database) {
      return { success: false, error: 'Database not initialized' }
    }
    const db = database.getRawDb()
    if (!db) {
      return { success: false, error: 'Raw database not available' }
    }

    const { getFTSStats } = await import('./database/ftsMigration.js')
    const stats = getFTSStats(db)
    return { success: true, stats }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get FTS stats' }
  }
})

ipcMain.handle('db:cache-stats', async (): Promise<{ success: boolean; stats?: any; error?: string }> => {
  try {
    const { CacheManager } = await import('./services/CacheManager.js')
    const cache = CacheManager.getInstance()
    const stats = cache.getStats()
    return { success: true, stats }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get cache stats' }
  }
})

ipcMain.handle('db:cache-clear', async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const { CacheManager } = await import('./services/CacheManager.js')
    const cache = CacheManager.getInstance()
    cache.clear()
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to clear cache' }
  }
})

// ============================================================================
// Updater IPC Handlers
// ============================================================================

ipcMain.handle('updater:check', async () => {
  try {
    await checkForUpdatesImpl()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check for updates',
    }
  }
})

ipcMain.handle('updater:download', async () => {
  try {
    downloadUpdateImpl()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download update',
    }
  }
})

ipcMain.handle('updater:install', async () => {
  try {
    installUpdateImpl()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to install update',
    }
  }
})

ipcMain.handle('updater:get-version', async () => {
  return { success: true, version: getCurrentVersion() }
})

ipcMain.handle('updater:get-state', async () => {
  return { success: true, state: getUpdateState() }
})

ipcMain.handle('updater:set-auto-download', async (_: IpcMainInvokeEvent, enabled: boolean) => {
  setAutoDownload(enabled)
  return { success: true }
})

ipcMain.handle('updater:set-auto-install', async (_: IpcMainInvokeEvent, enabled: boolean) => {
  setAutoInstallOnQuit(enabled)
  return { success: true }
})

// ============================================================================
// Backup IPC Handlers
// ============================================================================

let backupInitialized = false

ipcMain.handle(BACKUP_IPC_CHANNELS.INITIALIZE, async (): Promise<{ success: boolean; error?: string }> => {
  try {
    if (backupInitialized) {
      return { success: true }
    }

    if (!database || !database.isInitialized()) {
      return { success: false, error: 'Database not initialized' }
    }

    const dbPath = database.getDbPath?.() || ''
    if (!dbPath) {
      return { success: false, error: 'Database path not available' }
    }

    // Get database buffer function
    const getDbBuffer = async () => {
      const rawDb = database?.getRawDb?.()
      if (!rawDb) {
        throw new Error('Database not available')
      }
      // Export database to buffer
      const data = rawDb.export()
      return Buffer.from(data)
    }

    initializeBackupService(dbPath, getDbBuffer)
    const service = getBackupService()

    if (service) {
      await service.initialize()
      backupInitialized = true
    }

    return { success: true }
  } catch (error) {
    console.error('[Backup] Initialize error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize backup service',
    }
  }
})

ipcMain.handle(BACKUP_IPC_CHANNELS.SHUTDOWN, async (): Promise<{ success: boolean }> => {
  try {
    const service = getBackupService()
    if (service) {
      service.shutdown()
      backupInitialized = false
    }
    return { success: true }
  } catch {
    return { success: false }
  }
})

ipcMain.handle(BACKUP_IPC_CHANNELS.CREATE_BACKUP, async (): Promise<BackupResult> => {
  try {
    const service = getBackupService()
    if (!service) {
      return { success: false, error: 'Backup service not initialized' }
    }

    const result = await service.createBackup()

    // Notify renderer of backup completion
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backup:created', result)
    }

    return result
  } catch (error) {
    console.error('[Backup] Create backup error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create backup',
    }
  }
})

ipcMain.handle(BACKUP_IPC_CHANNELS.LIST_BACKUPS, async (): Promise<ListBackupsResponse> => {
  try {
    const service = getBackupService()
    if (!service) {
      return { success: false, backups: [], error: 'Backup service not initialized' }
    }

    const backups = await service.listBackups()
    return { success: true, backups }
  } catch (error) {
    console.error('[Backup] List backups error:', error)
    return {
      success: false,
      backups: [],
      error: error instanceof Error ? error.message : 'Failed to list backups',
    }
  }
})

ipcMain.handle(
  BACKUP_IPC_CHANNELS.RESTORE_BACKUP,
  async (_: IpcMainInvokeEvent, backupId: string): Promise<BackupResult> => {
    try {
      const service = getBackupService()
      if (!service) {
        return { success: false, error: 'Backup service not initialized' }
      }

      const result = await service.restoreBackup(backupId)

      // Notify renderer of restore completion
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:restored', result)
      }

      return result
    } catch (error) {
      console.error('[Backup] Restore backup error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to restore backup',
      }
    }
  },
)

ipcMain.handle(
  BACKUP_IPC_CHANNELS.DELETE_BACKUP,
  async (_: IpcMainInvokeEvent, backupId: string): Promise<BackupResult> => {
    try {
      const service = getBackupService()
      if (!service) {
        return { success: false, error: 'Backup service not initialized' }
      }

      const result = await service.deleteBackup(backupId)

      // Notify renderer of deletion
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:deleted', { backupId, result })
      }

      return result
    } catch (error) {
      console.error('[Backup] Delete backup error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete backup',
      }
    }
  },
)

ipcMain.handle(
  BACKUP_IPC_CHANNELS.VERIFY_BACKUP,
  async (_: IpcMainInvokeEvent, backupPath: string): Promise<VerifyBackupResponse> => {
    try {
      const service = getBackupService()
      if (!service) {
        return { success: false, integrity: 'unknown', error: 'Backup service not initialized' }
      }

      const integrity = await service.verifyBackupIntegrity(backupPath)
      return { success: true, integrity }
    } catch (error) {
      console.error('[Backup] Verify backup error:', error)
      return {
        success: false,
        integrity: 'unknown',
        error: error instanceof Error ? error.message : 'Failed to verify backup',
      }
    }
  },
)

ipcMain.handle(BACKUP_IPC_CHANNELS.GET_CONFIG, async (): Promise<GetBackupConfigResponse> => {
  try {
    const service = getBackupService()
    if (!service) {
      // Return default config if service not initialized
      return {
        success: true,
        config: {
          enabled: true,
          schedule: 'daily',
          retentionCount: 5,
        },
      }
    }

    const config = service.getConfig()
    return { success: true, config }
  } catch (error) {
    console.error('[Backup] Get config error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get backup config',
    }
  }
})

ipcMain.handle(
  BACKUP_IPC_CHANNELS.UPDATE_CONFIG,
  async (_: IpcMainInvokeEvent, config: Partial<BackupConfig>): Promise<{ success: boolean; error?: string }> => {
    try {
      const service = getBackupService()
      if (!service) {
        return { success: false, error: 'Backup service not initialized' }
      }

      service.updateConfig(config)

      // Notify renderer of config update
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:config-updated', config)
      }

      return { success: true }
    } catch (error) {
      console.error('[Backup] Update config error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update backup config',
      }
    }
  },
)

ipcMain.handle(BACKUP_IPC_CHANNELS.GET_STATS, async (): Promise<GetBackupStatsResponse> => {
  try {
    const service = getBackupService()
    if (!service) {
      return {
        success: false,
        stats: {
          totalBackups: 0,
          totalSize: 0,
        },
        error: 'Backup service not initialized',
      }
    }

    const stats = await service.getStats()
    return { success: true, stats }
  } catch (error) {
    console.error('[Backup] Get stats error:', error)
    return {
      success: false,
      stats: {
        totalBackups: 0,
        totalSize: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to get backup stats',
    }
  }
})

// ============================================================================
// Intelligence IPC Handlers (KEV & EPSS)
// ============================================================================

// Intelligence service instances
let kevService: KevService | null = null
let epssService: EpssService | null = null

/**
 * Initialize intelligence services
 */
async function initializeIntelligenceServices(): Promise<void> {
  try {
    if (!database || !database.isInitialized()) {
      console.log('[Intelligence] Database not ready, skipping initialization')
      return
    }

    const rawDb = database.getRawDb?.()
    if (!rawDb) {
      console.log('[Intelligence] Raw database not available')
      return
    }

    // Initialize KEV service
    kevService = getKevService(rawDb)
    await kevService.initialize()
    console.log('[Intelligence] KEV service initialized')

    // Initialize EPSS service
    epssService = getEpssService(rawDb)
    console.log('[Intelligence] EPSS service initialized')
  } catch (error) {
    console.error('[Intelligence] Failed to initialize services:', error)
  }
}

// KEV Handlers

ipcMain.handle(
  INTELLIGENCE_IPC_CHANNELS.CHECK_KEV,
  async (_: IpcMainInvokeEvent, cveId: string): Promise<CheckKevResponse> => {
    try {
      if (!kevService) {
        return { success: false, isKev: false, error: 'KEV service not initialized' }
      }

      const isKev = kevService.isKev(cveId)
      return { success: true, isKev }
    } catch (error) {
      return {
        success: false,
        isKev: false,
        error: error instanceof Error ? error.message : 'Failed to check KEV status',
      }
    }
  },
)

ipcMain.handle(
  INTELLIGENCE_IPC_CHANNELS.GET_KEV_DETAILS,
  async (_: IpcMainInvokeEvent, cveId: string): Promise<GetKevDetailsResponse> => {
    try {
      if (!kevService) {
        return { success: false, entry: null, error: 'KEV service not initialized' }
      }

      const entry = kevService.getKevDetails(cveId)
      return { success: true, entry }
    } catch (error) {
      return {
        success: false,
        entry: null,
        error: error instanceof Error ? error.message : 'Failed to get KEV details',
      }
    }
  },
)

ipcMain.handle(INTELLIGENCE_IPC_CHANNELS.GET_KEV_STATS, async (): Promise<GetKevStatsResponse> => {
  try {
    if (!kevService) {
      return {
        success: false,
        stats: { total: 0, ransomwareRelated: 0, lastUpdated: null },
        error: 'KEV service not initialized',
      }
    }

    const stats = kevService.getCatalogStats()
    return { success: true, stats }
  } catch (error) {
    return {
      success: false,
      stats: { total: 0, ransomwareRelated: 0, lastUpdated: null },
      error: error instanceof Error ? error.message : 'Failed to get KEV stats',
    }
  }
})

ipcMain.handle(INTELLIGENCE_IPC_CHANNELS.SYNC_KEV, async (): Promise<SyncKevResponse> => {
  try {
    if (!kevService) {
      return { success: false, result: null, error: 'KEV service not initialized' }
    }

    const result = await kevService.syncFromCisa()

    // Notify renderer of sync completion
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('intelligence:kev-synced', result)
    }

    return { success: true, result }
  } catch (error) {
    return {
      success: false,
      result: null,
      error: error instanceof Error ? error.message : 'Failed to sync KEV catalog',
    }
  }
})

// EPSS Handlers

ipcMain.handle(
  INTELLIGENCE_IPC_CHANNELS.GET_EPSS_SCORE,
  async (_: IpcMainInvokeEvent, cveId: string): Promise<GetEpssScoreResponse> => {
    try {
      if (!epssService) {
        return { success: false, score: null, error: 'EPSS service not initialized' }
      }

      const score = await epssService.getEpssScore(cveId)
      return {
        success: true,
        score: score,
      }
    } catch (error) {
      return {
        success: false,
        score: null,
        error: error instanceof Error ? error.message : 'Failed to get EPSS score',
      }
    }
  },
)

ipcMain.handle(
  INTELLIGENCE_IPC_CHANNELS.GET_EPSS_SCORES,
  async (_: IpcMainInvokeEvent, cveIds: string[]): Promise<GetEpssScoresResponse> => {
    try {
      if (!epssService) {
        return { success: false, scores: {}, error: 'EPSS service not initialized' }
      }

      const scoreMap = await epssService.getEpssScores(cveIds)
      const scores: Record<string, EpssScore> = {}

      for (const [cveId, score] of scoreMap) {
        scores[cveId] = score
      }

      return { success: true, scores }
    } catch (error) {
      return {
        success: false,
        scores: {},
        error: error instanceof Error ? error.message : 'Failed to get EPSS scores',
      }
    }
  },
)

ipcMain.handle(
  INTELLIGENCE_IPC_CHANNELS.REFRESH_EPSS_SCORE,
  async (_: IpcMainInvokeEvent, cveId: string): Promise<RefreshEpssScoreResponse> => {
    try {
      if (!epssService) {
        return { success: false, score: null, error: 'EPSS service not initialized' }
      }

      const score = await epssService.refreshEpssScore(cveId)
      return {
        success: true,
        score: score,
      }
    } catch (error) {
      return {
        success: false,
        score: null,
        error: error instanceof Error ? error.message : 'Failed to refresh EPSS score',
      }
    }
  },
)

ipcMain.handle(INTELLIGENCE_IPC_CHANNELS.GET_EPSS_STATS, async (): Promise<GetEpssStatsResponse> => {
  try {
    if (!epssService) {
      return {
        success: false,
        stats: { cachedCount: 0, avgScore: 0, avgPercentile: 0 },
        error: 'EPSS service not initialized',
      }
    }

    const stats = epssService.getStats()
    return { success: true, stats }
  } catch (error) {
    return {
      success: false,
      stats: { cachedCount: 0, avgScore: 0, avgPercentile: 0 },
      error: error instanceof Error ? error.message : 'Failed to get EPSS stats',
    }
  }
})

ipcMain.handle(
  INTELLIGENCE_IPC_CHANNELS.CLEANUP_EPSS_CACHE,
  async (): Promise<{ success: boolean; cleanedCount: number; error?: string }> => {
    try {
      if (!epssService) {
        return { success: false, cleanedCount: 0, error: 'EPSS service not initialized' }
      }

      const cleanedCount = await epssService.cleanupCache()
      return { success: true, cleanedCount }
    } catch (error) {
      return {
        success: false,
        cleanedCount: 0,
        error: error instanceof Error ? error.message : 'Failed to cleanup EPSS cache',
      }
    }
  },
)

// ============================================================================
// Container Scanning IPC Handlers
// ============================================================================

const containerService = new ContainerService()

ipcMain.handle(
  CONTAINER_IPC_CHANNELS.CHECK_RUNTIME,
  async (_: IpcMainInvokeEvent, request: CheckRuntimeRequest): Promise<CheckRuntimeResponse> => {
    try {
      const info = await containerService.checkRuntime(request.runtime)
      return { success: true, runtime: info }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check container runtime',
      }
    }
  },
)

ipcMain.handle(
  CONTAINER_IPC_CHANNELS.PULL_IMAGE,
  async (_: IpcMainInvokeEvent, request: PullImageRequest): Promise<PullImageResponse> => {
    try {
      const result = await containerService.pullImage(request.imageRef, request.runtime, (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('container:scan-progress', { phase: 'pull', message: status })
        }
      })
      return { success: true, digest: result.digest }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pull image',
      }
    }
  },
)

ipcMain.handle(
  CONTAINER_IPC_CHANNELS.GET_MANIFEST,
  async (_: IpcMainInvokeEvent, request: GetManifestRequest): Promise<GetManifestResponse> => {
    try {
      const manifest = await containerService.getManifest(request.imageRef, request.runtime)
      return { success: true, manifest }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get manifest',
      }
    }
  },
)

ipcMain.handle(
  CONTAINER_IPC_CHANNELS.INSPECT_IMAGE,
  async (_: IpcMainInvokeEvent, request: InspectImageRequest): Promise<InspectImageResponse> => {
    try {
      const config = await containerService.inspectImage(request.imageRef, request.runtime)
      return {
        success: true,
        config: {
          os: config.os || 'linux',
          architecture: config.architecture || 'amd64',
          variant: config.variant,
          created: config.created,
          dockerVersion: config.dockerVersion,
          labels: config.labels,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to inspect image',
      }
    }
  },
)

ipcMain.handle(
  CONTAINER_IPC_CHANNELS.SCAN_IMAGE,
  async (_: IpcMainInvokeEvent, request: ScanImageRequest): Promise<ScanImageResponse> => {
    const startTime = Date.now()
    const warnings: string[] = []
    const errors: string[] = []

    try {
      // 1. Check runtime
      const runtimeInfo = await containerService.checkRuntime(request.runtime)
      if (!runtimeInfo.available) {
        return {
          success: false,
          error: `${request.runtime} runtime is not available. Please install ${request.runtime} to scan container images.`,
        }
      }

      // 2. Pull image
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('container:scan-progress', {
          phase: 'pull',
          message: `Pulling ${request.imageRef}...`,
        })
      }
      await containerService.pullImage(request.imageRef, request.runtime, (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('container:scan-progress', { phase: 'pull', message: status })
        }
      })

      // 3. Get manifest
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('container:scan-progress', {
          phase: 'manifest',
          message: 'Inspecting image manifest...',
        })
      }
      const manifest = await containerService.getManifest(request.imageRef, request.runtime)

      // 4. Inspect image config
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('container:scan-progress', {
          phase: 'inspect',
          message: 'Inspecting image configuration...',
        })
      }
      const inspectConfig = await containerService.inspectImage(request.imageRef, request.runtime)

      // 5. Extract packages from layers
      const maxLayers = request.maxLayers || 100
      const layersToProcess = manifest.layers.slice(0, maxLayers)

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('container:scan-progress', {
          phase: 'extract',
          message: `Extracting packages from ${layersToProcess.length} layers...`,
        })
      }

      const packages = await containerService.extractPackages(
        request.imageRef,
        request.runtime,
        layersToProcess.map((l) => l.digest),
        (phase) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('container:scan-progress', { phase: 'extract', message: phase })
          }
        },
      )

      // 6. Parse image reference
      const image = parseImageRef(request.imageRef)

      // 7. Build layers with packages
      const layers = layersToProcess.map((layer) => ({
        digest: layer.digest,
        size: layer.size,
        mediaType: layer.mediaType,
        packages: packages.filter((pkg) => pkg.layerDigest === layer.digest),
      }))

      // 8. Consolidate packages (deduplicate by manager:name:arch)
      const packageMap = new Map<string, (typeof packages)[0]>()
      for (const pkg of packages) {
        const key = `${pkg.manager}:${pkg.name}:${pkg.architecture || 'noarch'}`
        packageMap.set(key, pkg)
      }
      const consolidatedPackages = Array.from(packageMap.values())

      return {
        success: true,
        result: {
          image,
          imageDigest: manifest.config?.digest || '',
          manifestDigest: manifest.digest || '',
          platform: {
            os: inspectConfig.os || 'linux',
            architecture: inspectConfig.architecture || 'amd64',
            variant: inspectConfig.variant,
          },
          layers,
          packages: consolidatedPackages,
          stats: {
            totalLayers: manifest.layers.length,
            processedLayers: layersToProcess.length,
            totalPackages: packages.length,
            uniquePackages: consolidatedPackages.length,
            scanTimeMs: Date.now() - startTime,
          },
          warnings,
          errors,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan image',
      }
    }
  },
)

ipcMain.handle(
  CONTAINER_IPC_CHANNELS.EXTRACT_PACKAGES,
  async (_: IpcMainInvokeEvent, request: ExtractPackagesRequest): Promise<ExtractPackagesResponse> => {
    try {
      const packages = await containerService.extractPackages(
        request.imageRef,
        request.runtime,
        request.layerDigests,
        (phase) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('container:scan-progress', { phase: 'extract', message: phase })
          }
        },
      )
      return { success: true, packages }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract packages',
      }
    }
  },
)

/**
 * Parse image reference string
 */
function parseImageRef(ref: string) {
  let registry = 'docker.io'
  let repository = ref
  let tag = 'latest'
  let digest: string | undefined

  if (ref.includes('/')) {
    const parts = ref.split('/')
    if (parts[0].includes('.') || parts[0].includes(':')) {
      const shifted = parts.shift()
      if (shifted) registry = shifted
      repository = parts.join('/')
    }
  }

  if (repository.includes('@sha256:')) {
    const atIndex = repository.indexOf('@sha256:')
    digest = repository.substring(atIndex + 1)
    repository = repository.substring(0, atIndex)
  }

  if (!digest && repository.includes(':')) {
    const colonIndex = repository.lastIndexOf(':')
    tag = repository.substring(colonIndex + 1)
    repository = repository.substring(0, colonIndex)
  }

  const name = digest ? `${registry}/${repository}@${digest}` : `${registry}/${repository}:${tag}`

  return {
    name,
    registry,
    repository,
    tag: digest ? undefined : tag,
    digest,
    original: ref,
  }
}

// ============================================================================
// App Lifecycle Events
// ============================================================================

app.whenReady().then(async () => {
  await initializeDatabase()
  await initializeIntelligenceServices()
  createWindow()
  applicationMenu = setupMenu({ mainWindow, isDev: getIsDev() })

  // Start periodic rate limiter cleanup to prevent memory leaks
  startPeriodicCleanup()

  // Initialize auto-updater
  if (mainWindow) {
    initializeUpdater(mainWindow)
  }

  // Auto-start sync if --sync flag is provided
  if (process.argv.includes('--sync')) {
    console.log('Auto-starting NVD sync due to --sync flag')
    setTimeout(async () => {
      const { importNvdData, getAvailableNvdYears } = await import('./database/nvd/index.js')

      if (syncState.isSyncing) {
        console.log('Sync already in progress')
        return
      }

      syncState.isSyncing = true
      const years = getAvailableNvdYears(2021, 2026)

      importNvdData({
        years,
        onProgress: (progress) => {
          console.log(`[Sync] Year ${progress.currentYear || '?'}: ${progress.phase}`)
          if (mainWindow) {
            mainWindow.webContents.send('nvd-sync-progress', {
              year: progress.currentYear,
              status: progress.phase,
              totalYears: progress.years.total,
              completedYears: progress.years.completed,
              totalCVEs: progress.import.totalCVEs,
              processedCVEs: progress.import.importedCVEs,
            })
          }
        },
        onComplete: (result) => {
          syncState.isSyncing = false
          console.log(
            `[Sync] Complete! Imported ${result.importedCVEs} CVEs from ${result.yearsProcessed.length} years.`,
          )
          if (mainWindow) {
            mainWindow.webContents.send('nvd-sync-complete', { success: true, message: 'NVD sync completed' })
          }
        },
        onError: (error) => {
          syncState.isSyncing = false
          console.error('[Sync] Error:', error)
          if (mainWindow) {
            mainWindow.webContents.send('nvd-sync-error', {
              success: false,
              message: error.message,
              error: error.message,
            })
          }
        },
      }).catch((error) => {
        syncState.isSyncing = false
        console.error('[Sync] Error:', error)
        if (mainWindow) {
          mainWindow.webContents.send('nvd-sync-error', {
            success: false,
            message: error.message,
            error: error.message,
          })
        }
      })
    }, 2000) // Wait 2 seconds for UI to be ready
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      if (applicationMenu) {
        Menu.setApplicationMenu(applicationMenu)
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  stopPeriodicCleanup()
  if (database) {
    await database.close()
  }
})
