/**
 * Browser Platform Adapter
 *
 * Provides safe stubs for all PlatformAPI methods so the renderer can load
 * in a plain browser environment without Electron. Electron-only features
 * (container scanning, PDF generation, etc.) return graceful errors.
 *
 * Future enhancement: replace database stubs with sql.js + IndexedDB
 * for a fully functional browser demo.
 */

import type {
  PlatformAPI,
  DatabaseAPI,
  SecureStorageAPI,
  BackupAPI,
  IntelligenceAPI,
  ContainerPlatformAPI,
  UpdaterPlatformAPI,
} from './types'

const NOT_AVAILABLE = 'This feature requires the desktop application'

/** Helper: returns a rejected promise for unavailable features */
function unavailable<T>(feature: string): Promise<T> {
  return Promise.resolve({ success: false, error: `${feature} is not available in browser mode` } as T)
}

/** No-op cleanup function */
const noopCleanup = () => {}

function createBrowserDatabase(): DatabaseAPI {
  return {
    search: () => unavailable('Database'),
    getCve: () => unavailable('Database'),
    getCveFull: () => unavailable('Database'),
    getStats: () => unavailable('Database'),
    getSyncStatus: () => unavailable('Database'),
    startSync: () => unavailable('Database'),
    getDetailedStats: () => unavailable('Database'),
    startDeltaSync: () => unavailable('Database'),
    cancelSync: () => Promise.resolve({ success: true }),
    startBulkDownload: () => unavailable('Database'),
    setAutoSync: () => unavailable('Database'),
    onSyncProgress: () => noopCleanup,
    onSyncComplete: () => noopCleanup,
    onSyncError: () => noopCleanup,
    onBulkDownloadProgress: () => noopCleanup,
    cpeSearch: () => unavailable('Database'),
    getSyncConfig: () => unavailable('Database'),
    updateSyncConfig: () => unavailable('Database'),
    updateStorageConfig: () => unavailable('Database'),
    updatePerformanceConfig: () => unavailable('Database'),
    resetDatabase: () => Promise.resolve({ success: false, error: NOT_AVAILABLE }),
    rebuildIndexes: () => Promise.resolve({ success: false, error: NOT_AVAILABLE }),
    searchFts: () => unavailable('FTS Search'),
    getFtsStats: () => unavailable('FTS Search'),
    getCacheStats: () => unavailable('Cache'),
    clearCache: () => Promise.resolve({ success: false, error: NOT_AVAILABLE }),
  }
}

function createBrowserSecureStorage(): SecureStorageAPI {
  // Use localStorage as a fallback for API keys in browser mode
  const getFromStorage = (key: string): string | null => {
    try {
      return localStorage.getItem(`vat-api-key-${key}`)
    } catch {
      return null
    }
  }
  const setInStorage = (key: string, value: string): boolean => {
    try {
      localStorage.setItem(`vat-api-key-${key}`, value)
      return true
    } catch {
      return false
    }
  }
  const removeFromStorage = (key: string): boolean => {
    try {
      localStorage.removeItem(`vat-api-key-${key}`)
      return true
    } catch {
      return false
    }
  }

  return {
    isAvailable: () => Promise.resolve({ success: true, isAvailable: true }),
    setApiKey: (req) => {
      const ok = setInStorage(req.keyType, req.apiKey)
      return Promise.resolve({ success: ok, error: ok ? undefined : 'Failed to store key' })
    },
    getApiKey: (req) => {
      const apiKey = getFromStorage(req.keyType)
      return Promise.resolve({ success: true, apiKey })
    },
    deleteApiKey: (req) => {
      const ok = removeFromStorage(req.keyType)
      return Promise.resolve({ success: ok })
    },
    hasApiKey: (req) => {
      const has = getFromStorage(req.keyType) !== null
      return Promise.resolve({ success: true, hasKey: has })
    },
    needsMigration: () => Promise.resolve({ success: true, needsMigration: false }),
    migrateKeys: () => Promise.resolve({ success: true, migrated: [], failed: [] }),
    getAllKeys: () => {
      const keys: Record<string, string | null> = { nvd: null, osv: null, github: null }
      for (const k of ['nvd', 'osv', 'github']) keys[k] = getFromStorage(k)
      return Promise.resolve({ success: true, keys })
    },
  }
}

function createBrowserBackup(): BackupAPI {
  return {
    initialize: () => unavailable('Backup'),
    shutdown: () => Promise.resolve({ success: true }),
    createBackup: () => unavailable('Backup'),
    listBackups: () => Promise.resolve({ success: true, backups: [] }),
    restoreBackup: () => unavailable('Backup'),
    deleteBackup: () => unavailable('Backup'),
    verifyBackup: () => unavailable('Backup'),
    getConfig: () =>
      Promise.resolve({ success: true, config: { enabled: false, schedule: 'manual', retentionCount: 5 } }),
    updateConfig: () => unavailable('Backup'),
    getStats: () => Promise.resolve({ success: true, stats: { totalBackups: 0, totalSize: 0 } }),
  }
}

function createBrowserIntelligence(): IntelligenceAPI {
  return {
    checkKev: () => unavailable('Intelligence'),
    getKevDetails: () => unavailable('Intelligence'),
    getKevStats: () => Promise.resolve({ success: true, stats: { total: 0, ransomwareRelated: 0, lastUpdated: null } }),
    syncKev: () => unavailable('Intelligence'),
    getEpssScore: () => unavailable('Intelligence'),
    getEpssScores: () => Promise.resolve({ success: true, scores: {} }),
    refreshEpssScore: () => unavailable('Intelligence'),
    getEpssStats: () => Promise.resolve({ success: true, stats: { cachedCount: 0, avgScore: 0, avgPercentile: 0 } }),
    cleanupEpssCache: () => Promise.resolve({ success: true, cleanedCount: 0 }),
    onKevSynced: () => noopCleanup,
  }
}

function createBrowserContainer(): ContainerPlatformAPI {
  return {
    checkRuntime: () =>
      Promise.resolve({ success: false, error: 'Container scanning requires the desktop application' }),
    pullImage: () => unavailable('Container scanning'),
    getManifest: () => unavailable('Container scanning'),
    inspectImage: () => unavailable('Container scanning'),
    scanImage: () => unavailable('Container scanning'),
    extractPackages: () => unavailable('Container scanning'),
    onScanProgress: () => noopCleanup,
  }
}

function createBrowserUpdater(): UpdaterPlatformAPI {
  return {
    onUpdateAvailable: () => noopCleanup,
    onUpdateNotAvailable: () => noopCleanup,
    onUpdateDownloadProgress: () => noopCleanup,
    onUpdateDownloaded: () => noopCleanup,
    onUpdateError: () => noopCleanup,
    onCheckingForUpdate: () => noopCleanup,
  }
}

export function createBrowserAdapter(): PlatformAPI {
  return {
    ping: () => Promise.resolve('pong'),
    getAppVersion: () => Promise.resolve('2.0.0-browser'),
    getPlatform: () =>
      Promise.resolve(
        navigator.platform.toLowerCase().includes('win')
          ? 'win32'
          : navigator.platform.toLowerCase().includes('mac')
            ? 'darwin'
            : 'linux',
      ),
    openExternal: (url: string) => {
      window.open(url, '_blank')
      return Promise.resolve(true)
    },
    onThemeChange: (cb) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
    },
    getSystemTheme: () => Promise.resolve(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    onMenuAction: () => noopCleanup,
    generatePDF: () => {
      throw new Error('PDF generation requires the desktop application')
    },

    database: createBrowserDatabase(),
    secureStorage: createBrowserSecureStorage(),
    backup: createBrowserBackup(),
    intelligence: createBrowserIntelligence(),
    container: createBrowserContainer(),
    updater: createBrowserUpdater(),
  }
}
