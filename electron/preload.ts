import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  DB_IPC_CHANNELS,
  type DatabaseAPI,
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
  type GetDetailedStatsResponse,
  type DeltaSyncProgress,
  type DeltaSyncResult,
  type BulkDownloadProgress,
  type BulkDownloadResult,
  type StartBulkDownloadRequest,
  type CPESearchRequest,
  type CPESearchResponse,
} from './types/database'
import { STORAGE_IPC_CHANNELS, type StorageAPI } from './types/storage'
import type {
  UpdateDownloadProgress,
  UpdateAvailableEvent,
  UpdateNotAvailableEvent,
  UpdateDownloadedEvent,
  UpdateErrorEvent,
} from './types/updater'
import { type BackupAPI } from './types/backup'
import {
  INTELLIGENCE_IPC_CHANNELS,
  type IntelligenceAPI,
  type EpssScore,
  type KevSyncResult,
} from './types/intelligence'
import { CONTAINER_IPC_CHANNELS, type ContainerAPI, type ContainerRuntime } from './types/container'

// Define IPC channel names for backup (also need to match main.ts handlers)
const BACKUP_IPC_CHANNELS_PRELOAD = {
  INITIALIZE: 'backup:initialize',
  SHUTDOWN: 'backup:shutdown',
  CREATE_BACKUP: 'backup:create',
  LIST_BACKUPS: 'backup:list',
  RESTORE_BACKUP: 'backup:restore',
  DELETE_BACKUP: 'backup:delete',
  VERIFY_BACKUP: 'backup:verify',
  GET_CONFIG: 'backup:get-config',
  UPDATE_CONFIG: 'backup:update-config',
  GET_STATS: 'backup:get-stats',
} as const

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  getPlatform: () => ipcRenderer.invoke('app-platform'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onThemeChange: (callback: (theme: string) => void) => {
    ipcRenderer.on('theme-changed', (_event, theme) => callback(theme))
  },
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),

  // Menu action listeners
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu-action', listener)

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('menu-action', listener)
    }
  },

  // PDF generation via Electron main process
  generatePDF: (htmlContent: string): Promise<Uint8Array> => {
    return ipcRenderer.invoke('generatePdf', htmlContent)
  },

  // ============================================================================
  // Secure Storage API
  // ============================================================================

  /**
   * Secure Storage API for API keys
   */
  secureStorage: {
    /**
     * Check if secure storage is available
     */
    isAvailable: () => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.IS_AVAILABLE),

    /**
     * Store an API key securely
     */
    setApiKey: (request: { keyType: 'nvd' | 'osv' | 'github'; apiKey: string }) => {
      return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.SET_API_KEY, request)
    },

    /**
     * Retrieve an API key
     */
    getApiKey: (request: { keyType: 'nvd' | 'osv' | 'github' }) => {
      return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.GET_API_KEY, request)
    },

    /**
     * Delete an API key
     */
    deleteApiKey: (request: { keyType: 'nvd' | 'osv' | 'github' }) => {
      return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.DELETE_API_KEY, request)
    },

    /**
     * Check if a key exists
     */
    hasApiKey: (request: { keyType: 'nvd' | 'osv' | 'github' }) => {
      return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.HAS_API_KEY, request)
    },

    /**
     * Check if migration is needed
     */
    needsMigration: () => {
      return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.NEEDS_MIGRATION)
    },

    /**
     * Migrate plaintext keys to secure storage
     */
    migrateKeys: () => {
      return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.MIGRATE_KEYS)
    },

    /**
     * Get all stored API keys
     */
    getAllKeys: () => {
      return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.GET_ALL_KEYS)
    },
  } as StorageAPI,

  // ============================================================================
  // Auto-Updater API
  // ============================================================================

  /**
   * Auto-Updater event listeners
   */
  updater: {
    onUpdateAvailable: (callback: (info: UpdateAvailableEvent) => void) => {
      const listener = (_event: IpcRendererEvent, info: UpdateAvailableEvent) => callback(info)
      ipcRenderer.on('update-available', listener)
      return () => {
        ipcRenderer.removeListener('update-available', listener)
      }
    },
    onUpdateNotAvailable: (callback: (info: UpdateNotAvailableEvent) => void) => {
      const listener = (_event: IpcRendererEvent, info: UpdateNotAvailableEvent) => callback(info)
      ipcRenderer.on('update-not-available', listener)
      return () => {
        ipcRenderer.removeListener('update-not-available', listener)
      }
    },
    onUpdateDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => {
      const listener = (_event: IpcRendererEvent, progress: UpdateDownloadProgress) => callback(progress)
      ipcRenderer.on('update-download-progress', listener)
      return () => {
        ipcRenderer.removeListener('update-download-progress', listener)
      }
    },
    onUpdateDownloaded: (callback: (info: UpdateDownloadedEvent) => void) => {
      const listener = (_event: IpcRendererEvent, info: UpdateDownloadedEvent) => callback(info)
      ipcRenderer.on('update-downloaded', listener)
      return () => {
        ipcRenderer.removeListener('update-downloaded', listener)
      }
    },
    onUpdateError: (callback: (error: UpdateErrorEvent) => void) => {
      const listener = (_event: IpcRendererEvent, error: UpdateErrorEvent) => callback(error)
      ipcRenderer.on('update-error', listener)
      return () => {
        ipcRenderer.removeListener('update-error', listener)
      }
    },
    onCheckingForUpdate: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('update-checking', listener)
      return () => {
        ipcRenderer.removeListener('update-checking', listener)
      }
    },
  },

  // ============================================================================
  // Database API
  // ============================================================================

  /**
   * Database API for NVD vulnerability database operations
   */
  database: {
    /**
     * Search the NVD database
     */
    search: (request: NvdSearchRequest): Promise<NvdSearchResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.SEARCH, request)
    },

    /**
     * Get a specific CVE by ID
     */
    getCve: (request: GetCveRequest): Promise<GetCveResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.GET_CVE, request)
    },

    /**
     * Get full CVE details including CPE matches, CWE references, and references
     */
    getCveFull: (request: GetCveFullRequest): Promise<GetCveFullResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.GET_CVE_FULL, request)
    },

    /**
     * Get database statistics
     */
    getStats: (): Promise<GetStatsResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.GET_STATS)
    },

    /**
     * Get current sync status
     */
    getSyncStatus: (): Promise<SyncStatusResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.GET_SYNC_STATUS)
    },

    /**
     * Start NVD data synchronization
     */
    startSync: (request?: StartSyncRequest): Promise<StartSyncResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.START_SYNC, request)
    },

    /**
     * Get detailed NVD statistics
     */
    getDetailedStats: (): Promise<GetDetailedStatsResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.GET_DETAILED_STATS)
    },

    /**
     * Start delta sync (incremental updates)
     */
    startDeltaSync: (force: boolean = false): Promise<DeltaSyncResult> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.START_DELTA_SYNC, force)
    },

    /**
     * Cancel ongoing sync
     */
    cancelSync: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.CANCEL_SYNC)
    },

    /**
     * Start bulk download for years
     */
    startBulkDownload: (request: StartBulkDownloadRequest): Promise<BulkDownloadResult> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.START_BULK_DOWNLOAD, request)
    },

    /**
     * Set auto sync configuration
     */
    setAutoSync: (enabled: boolean, intervalHours: number): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.SET_AUTO_SYNC, enabled, intervalHours)
    },

    /**
     * Listen to sync progress updates
     */
    onSyncProgress: (callback: (progress: DeltaSyncProgress) => void) => {
      const listener = (_event: IpcRendererEvent, data: { type: string; progress: DeltaSyncProgress }) => {
        callback(data.progress)
      }
      ipcRenderer.on('nvd:sync-progress', listener)
      return () => {
        ipcRenderer.removeListener('nvd:sync-progress', listener)
      }
    },

    /**
     * Listen to sync completion
     */
    onSyncComplete: (callback: (result: DeltaSyncResult) => void) => {
      const listener = (_event: IpcRendererEvent, data: { type: string; result: DeltaSyncResult }) => {
        callback(data.result)
      }
      ipcRenderer.on('nvd:sync-complete', listener)
      return () => {
        ipcRenderer.removeListener('nvd:sync-complete', listener)
      }
    },

    /**
     * Listen to sync errors
     */
    onSyncError: (callback: (error: string) => void) => {
      const listener = (_event: IpcRendererEvent, data: { type: string; error: string }) => {
        callback(data.error)
      }
      ipcRenderer.on('nvd:sync-error', listener)
      return () => {
        ipcRenderer.removeListener('nvd:sync-error', listener)
      }
    },

    /**
     * Listen to bulk download progress
     */
    onBulkDownloadProgress: (callback: (progress: BulkDownloadProgress) => void) => {
      const listener = (_event: IpcRendererEvent, progress: BulkDownloadProgress) => {
        callback(progress)
      }
      ipcRenderer.on('nvd:bulk-download-progress', listener)
      return () => {
        ipcRenderer.removeListener('nvd:bulk-download-progress', listener)
      }
    },

    /**
     * Search for CPEs matching product name or tokens
     */
    cpeSearch: (request: CPESearchRequest): Promise<CPESearchResponse> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.CPE_SEARCH, request)
    },

    /**
     * Get sync configuration
     */
    getSyncConfig: (): Promise<{ success: boolean; config?: { syncInterval?: string }; error?: string }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.GET_SYNC_CONFIG)
    },

    /**
     * Update sync configuration
     */
    updateSyncConfig: (config: { syncInterval?: string }): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.UPDATE_SYNC_CONFIG, config)
    },

    /**
     * Update storage configuration
     */
    updateStorageConfig: (config: {
      maxSizeMB?: number
      pruneOldCves?: boolean
      pruneOlderThanYear?: number
    }): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.UPDATE_STORAGE_CONFIG, config)
    },

    /**
     * Update performance configuration
     */
    updatePerformanceConfig: (config: {
      searchResultLimit?: number
      enableSearchCache?: boolean
      cacheSizeMB?: number
      cacheTTLMinutes?: number
    }): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.UPDATE_PERFORMANCE_CONFIG, config)
    },

    /**
     * Reset database to empty state
     */
    resetDatabase: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.RESET_DATABASE)
    },

    /**
     * Rebuild database indexes
     */
    rebuildIndexes: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(DB_IPC_CHANNELS.REBUILD_INDEXES)
    },

    // FTS Search
    searchFts: (query: string, limit?: number): Promise<{ success: boolean; results?: any[]; error?: string }> => {
      return ipcRenderer.invoke('db:search-fts', query, limit)
    },

    getFtsStats: (): Promise<{ success: boolean; stats?: any; error?: string }> => {
      return ipcRenderer.invoke('db:fts-stats')
    },

    // Cache management
    getCacheStats: (): Promise<{ success: boolean; stats?: any; error?: string }> => {
      return ipcRenderer.invoke('db:cache-stats')
    },

    clearCache: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('db:cache-clear')
    },
  } as DatabaseAPI,

  // ============================================================================
  // Backup API
  // ============================================================================

  /**
   * Backup API for database backup management
   */
  backup: {
    /**
     * Initialize the backup service
     */
    initialize: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.INITIALIZE)
    },

    /**
     * Shutdown the backup service
     */
    shutdown: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.SHUTDOWN)
    },

    /**
     * Create a new backup
     */
    createBackup: (): Promise<{ success: boolean; backup?: any; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.CREATE_BACKUP)
    },

    /**
     * List all available backups
     */
    listBackups: (): Promise<{ success: boolean; backups?: any[]; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.LIST_BACKUPS)
    },

    /**
     * Restore from a specific backup
     */
    restoreBackup: (backupId: string): Promise<{ success: boolean; backup?: any; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.RESTORE_BACKUP, backupId)
    },

    /**
     * Delete a specific backup
     */
    deleteBackup: (backupId: string): Promise<{ success: boolean; backup?: any; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.DELETE_BACKUP, backupId)
    },

    /**
     * Verify backup integrity
     */
    verifyBackup: (
      backupPath: string,
    ): Promise<{ success: boolean; integrity?: 'valid' | 'invalid' | 'unknown'; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.VERIFY_BACKUP, backupPath)
    },

    /**
     * Get current backup configuration
     */
    getConfig: (): Promise<{ success: boolean; config?: any; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.GET_CONFIG)
    },

    /**
     * Update backup configuration
     */
    updateConfig: (config: any): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.UPDATE_CONFIG, config)
    },

    /**
     * Get backup statistics
     */
    getStats: (): Promise<{ success: boolean; stats?: any; error?: string }> => {
      return ipcRenderer.invoke(BACKUP_IPC_CHANNELS_PRELOAD.GET_STATS)
    },
  } as BackupAPI,

  // ============================================================================
  // Intelligence API (KEV & EPSS)
  // ============================================================================

  /**
   * Intelligence API for exploit intelligence (KEV catalog and EPSS scores)
   */
  intelligence: {
    // KEV operations
    checkKev: (cveId: string): Promise<{ success: boolean; isKev: boolean; error?: string }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.CHECK_KEV, cveId)
    },

    getKevDetails: (cveId: string): Promise<{ success: boolean; entry: any | null; error?: string }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.GET_KEV_DETAILS, cveId)
    },

    getKevStats: (): Promise<{
      success: boolean
      stats: { total: number; ransomwareRelated: number; lastUpdated: string | null }
      error?: string
    }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.GET_KEV_STATS)
    },

    syncKev: (): Promise<{ success: boolean; result: KevSyncResult | null; error?: string }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.SYNC_KEV)
    },

    // EPSS operations
    getEpssScore: (cveId: string): Promise<{ success: boolean; score: EpssScore | null; error?: string }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.GET_EPSS_SCORE, cveId)
    },

    getEpssScores: (
      cveIds: string[],
    ): Promise<{ success: boolean; scores: Record<string, EpssScore>; error?: string }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.GET_EPSS_SCORES, cveIds)
    },

    refreshEpssScore: (cveId: string): Promise<{ success: boolean; score: EpssScore | null; error?: string }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.REFRESH_EPSS_SCORE, cveId)
    },

    getEpssStats: (): Promise<{
      success: boolean
      stats: { cachedCount: number; avgScore: number; avgPercentile: number }
      error?: string
    }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.GET_EPSS_STATS)
    },

    cleanupEpssCache: (): Promise<{ success: boolean; cleanedCount: number; error?: string }> => {
      return ipcRenderer.invoke(INTELLIGENCE_IPC_CHANNELS.CLEANUP_EPSS_CACHE)
    },

    // Event listeners
    onKevSynced: (callback: (result: KevSyncResult) => void) => {
      const listener = (_event: IpcRendererEvent, result: KevSyncResult) => callback(result)
      ipcRenderer.on('intelligence:kev-synced', listener)
      return () => {
        ipcRenderer.removeListener('intelligence:kev-synced', listener)
      }
    },
  } as IntelligenceAPI,

  // ============================================================================
  // Container Scanning API
  // ============================================================================

  /**
   * Container API for scanning Docker/Podman images
   */
  container: {
    /**
     * Check if a container runtime is available
     */
    checkRuntime: (runtime: ContainerRuntime) => {
      return ipcRenderer.invoke(CONTAINER_IPC_CHANNELS.CHECK_RUNTIME, { runtime })
    },

    /**
     * Pull a container image
     */
    pullImage: (request: { imageRef: string; runtime: ContainerRuntime; platform?: string }) => {
      return ipcRenderer.invoke(CONTAINER_IPC_CHANNELS.PULL_IMAGE, request)
    },

    /**
     * Get image manifest
     */
    getManifest: (request: { imageRef: string; runtime: ContainerRuntime }) => {
      return ipcRenderer.invoke(CONTAINER_IPC_CHANNELS.GET_MANIFEST, request)
    },

    /**
     * Inspect image configuration
     */
    inspectImage: (request: { imageRef: string; runtime: ContainerRuntime }) => {
      return ipcRenderer.invoke(CONTAINER_IPC_CHANNELS.INSPECT_IMAGE, request)
    },

    /**
     * Full image scan (pull + manifest + inspect + package extraction)
     */
    scanImage: (request: { imageRef: string; runtime: ContainerRuntime; platform?: string; maxLayers?: number }) => {
      return ipcRenderer.invoke(CONTAINER_IPC_CHANNELS.SCAN_IMAGE, request)
    },

    /**
     * Extract packages from specific layers
     */
    extractPackages: (request: { imageRef: string; runtime: ContainerRuntime; layerDigests: string[] }) => {
      return ipcRenderer.invoke(CONTAINER_IPC_CHANNELS.EXTRACT_PACKAGES, request)
    },

    /**
     * Listen to scan progress events
     */
    onScanProgress: (callback: (progress: { phase: string; message: string; percent?: number }) => void) => {
      const listener = (_event: IpcRendererEvent, progress: { phase: string; message: string; percent?: number }) =>
        callback(progress)
      ipcRenderer.on('container:scan-progress', listener)
      return () => {
        ipcRenderer.removeListener('container:scan-progress', listener)
      }
    },
  } as ContainerAPI,
})

// ============================================================================
// Error Interceptor — Renderer Side
// ============================================================================

// Patch console.error to forward to main process
const _origConsoleError = console.error
console.error = (...args: unknown[]) => {
  _origConsoleError.apply(console, args)
  try {
    const message = args.map((a) => (a instanceof Error ? a.message + '\n' + a.stack : String(a))).join(' ')
    if (!message.includes('[Mock]') && !message.includes('CSP directive')) {
      ipcRenderer
        .invoke('error-interceptor:report', {
          timestamp: new Date().toISOString(),
          source: 'renderer' as const,
          level: 'error' as const,
          message,
          stack: args.find((a) => a instanceof Error)?.stack,
        })
        .catch(() => {})
    }
  } catch {}
}

// Patch console.warn
const _origConsoleWarn = console.warn
console.warn = (...args: unknown[]) => {
  _origConsoleWarn.apply(console, args)
  try {
    const message = args.map((a) => String(a)).join(' ')
    if (!message.includes('[Mock]')) {
      ipcRenderer
        .invoke('error-interceptor:report', {
          timestamp: new Date().toISOString(),
          source: 'renderer' as const,
          level: 'warn' as const,
          message,
        })
        .catch(() => {})
    }
  } catch {}
}

// Catch unhandled errors
window.onerror = (message, source, lineno, colno, error) => {
  try {
    ipcRenderer
      .invoke('error-interceptor:report', {
        timestamp: new Date().toISOString(),
        source: 'renderer' as const,
        level: 'error' as const,
        message: String(message),
        stack: error?.stack || `${source}:${lineno}:${colno}`,
      })
      .catch(() => {})
  } catch {}
}

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event.reason
    ipcRenderer
      .invoke('error-interceptor:report', {
        timestamp: new Date().toISOString(),
        source: 'renderer' as const,
        level: 'error' as const,
        message: `Unhandled Rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
        stack: reason instanceof Error ? reason.stack : undefined,
      })
      .catch(() => {})
  } catch {}
})

// Type augmentation for TypeScript
declare global {
  interface Window {
    electronAPI: {
      ping(): Promise<'pong'>
      getAppVersion(): Promise<string>
      getPlatform(): Promise<string>
      openExternal(url: string): Promise<boolean>
      onThemeChange(callback: (theme: string) => void): void
      getSystemTheme(): Promise<string>
      onMenuAction(callback: (action: string) => void): () => void
      generatePDF(htmlContent: string): Promise<Uint8Array>
      secureStorage: StorageAPI
      updater: {
        onUpdateAvailable(callback: (info: UpdateAvailableEvent) => void): () => void
        onUpdateNotAvailable(callback: (info: UpdateNotAvailableEvent) => void): () => void
        onUpdateDownloadProgress(callback: (progress: UpdateDownloadProgress) => void): () => void
        onUpdateDownloaded(callback: (info: UpdateDownloadedEvent) => void): () => void
        onUpdateError(callback: (error: UpdateErrorEvent) => void): () => void
        onCheckingForUpdate(callback: () => void): () => void
      }
      database: DatabaseAPI
      backup: BackupAPI
      intelligence: IntelligenceAPI
      container: ContainerAPI
    }
  }
}
