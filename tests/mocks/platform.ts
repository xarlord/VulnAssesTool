import { vi } from 'vitest'
import type { PlatformAPI } from '@/lib/platform'

const noopCleanup = () => {}

function createMockPlatform(): PlatformAPI {
  return {
    ping: vi.fn(() => Promise.resolve('pong')),
    getAppVersion: vi.fn(() => Promise.resolve('2.0.0-web')),
    getPlatform: vi.fn(() => Promise.resolve('win32')),
    openExternal: vi.fn(() => Promise.resolve(true)),
    onThemeChange: vi.fn(),
    getSystemTheme: vi.fn(() => Promise.resolve('light')),
    onMenuAction: vi.fn(() => noopCleanup),
    generatePDF: vi.fn(() => Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]))),

    database: {
      search: vi.fn(() => Promise.resolve({ success: true, results: [], totalResults: 0 })),
      getCve: vi.fn(() => Promise.resolve({ success: false, error: 'Not found' })),
      getCveFull: vi.fn(() => Promise.resolve({ success: false, error: 'Not found' })),
      getStats: vi.fn(() =>
        Promise.resolve({
          success: true,
          stats: { totalCves: 0, lastUpdate: null, dbSize: 0, version: 1 },
        }),
      ),
      getSyncStatus: vi.fn(() =>
        Promise.resolve({
          success: true,
          status: {
            isSyncing: false,
            progress: 0,
            total: 0,
            currentFile: null,
            error: null,
            lastSync: null,
          },
        }),
      ),
      startSync: vi.fn(() => Promise.resolve({ success: true })),
      getDetailedStats: vi.fn(() =>
        Promise.resolve({ success: true, stats: { totalCves: 0, lastSuccessfulSync: null } }),
      ),
      startDeltaSync: vi.fn(() =>
        Promise.resolve({
          success: true,
          addedCount: 0,
          modifiedCount: 0,
          deletedCount: 0,
        }),
      ),
      cancelSync: vi.fn(() => Promise.resolve({ success: true })),
      startBulkDownload: vi.fn(() => Promise.resolve({ success: true, downloadId: 'test-dl-id' })),
      setAutoSync: vi.fn(() => Promise.resolve({ success: true })),
      onSyncProgress: vi.fn(() => noopCleanup),
      onSyncComplete: vi.fn(() => noopCleanup),
      onSyncError: vi.fn(() => noopCleanup),
      onBulkDownloadProgress: vi.fn(() => noopCleanup),
      cpeSearch: vi.fn(() => Promise.resolve({ success: true, results: [] })),
      getSyncConfig: vi.fn(() => Promise.resolve({ success: true, config: {} })),
      updateSyncConfig: vi.fn(() => Promise.resolve({ success: true })),
      updateStorageConfig: vi.fn(() => Promise.resolve({ success: true })),
      updatePerformanceConfig: vi.fn(() => Promise.resolve({ success: true })),
      resetDatabase: vi.fn(() => Promise.resolve({ success: true })),
      rebuildIndexes: vi.fn(() => Promise.resolve({ success: true })),
      searchFts: vi.fn(() => Promise.resolve({ success: true, results: [] })),
      getFtsStats: vi.fn(() => Promise.resolve({ success: true, stats: {} })),
      getCacheStats: vi.fn(() => Promise.resolve({ success: true, stats: {} })),
      clearCache: vi.fn(() => Promise.resolve({ success: true })),
    },

    secureStorage: {
      isAvailable: vi.fn(() => Promise.resolve({ success: true, available: true })),
      setApiKey: vi.fn(() => Promise.resolve({ success: true })),
      getApiKey: vi.fn(() => Promise.resolve({ success: true, apiKey: null })),
      deleteApiKey: vi.fn(() => Promise.resolve({ success: true })),
      hasApiKey: vi.fn(() => Promise.resolve({ success: true, hasKey: false })),
      needsMigration: vi.fn(() => Promise.resolve({ success: true, needsMigration: false })),
      migrateKeys: vi.fn(() => Promise.resolve({ success: true, migratedCount: 0 })),
      getAllKeys: vi.fn(() => Promise.resolve({ success: true, keys: [] })),
    },

    backup: {
      initialize: vi.fn(() => Promise.resolve({ success: true })),
      shutdown: vi.fn(() => Promise.resolve({ success: true })),
      createBackup: vi.fn(() =>
        Promise.resolve({
          success: true,
          backup: {
            id: 'test-backup-id',
            timestamp: new Date().toISOString(),
            size: 1024,
            path: '/tmp/test-backup.db',
          },
        }),
      ),
      listBackups: vi.fn(() => Promise.resolve({ success: true, backups: [] })),
      restoreBackup: vi.fn(() => Promise.resolve({ success: true, backup: null })),
      deleteBackup: vi.fn(() => Promise.resolve({ success: true, backup: null })),
      verifyBackup: vi.fn(() => Promise.resolve({ success: true, integrity: 'valid' })),
      getConfig: vi.fn(() => Promise.resolve({ success: true, config: {} })),
      updateConfig: vi.fn(() => Promise.resolve({ success: true })),
      getStats: vi.fn(() => Promise.resolve({ success: true, stats: {} })),
    },

    intelligence: {
      checkKev: vi.fn(() => Promise.resolve({ success: true, isKev: false })),
      getKevDetails: vi.fn(() => Promise.resolve({ success: false, error: 'Not found' })),
      getKevStats: vi.fn(() => Promise.resolve({ success: true, stats: {} })),
      syncKev: vi.fn(() => Promise.resolve({ success: true, result: null })),
      getEpssScore: vi.fn(() => Promise.resolve({ success: true, score: null })),
      getEpssScores: vi.fn(() => Promise.resolve({ success: true, scores: [] })),
      refreshEpssScore: vi.fn(() => Promise.resolve({ success: true, score: null })),
      getEpssStats: vi.fn(() => Promise.resolve({ success: true, stats: {} })),
      cleanupEpssCache: vi.fn(() => Promise.resolve({ success: true, cleanedCount: 0 })),
      onKevSynced: vi.fn(() => noopCleanup),
    },

    container: {
      checkRuntime: vi.fn(() => Promise.resolve({ success: true, available: false })),
      pullImage: vi.fn(() => Promise.resolve({ success: true })),
      getManifest: vi.fn(() => Promise.resolve({ success: true, manifest: {} })),
      inspectImage: vi.fn(() => Promise.resolve({ success: true, image: {} })),
      scanImage: vi.fn(() => Promise.resolve({ success: true, vulnerabilities: [] })),
      extractPackages: vi.fn(() => Promise.resolve({ success: true, packages: [] })),
      onScanProgress: vi.fn(() => noopCleanup),
    },

    updater: {
      onUpdateAvailable: vi.fn(() => noopCleanup),
      onUpdateNotAvailable: vi.fn(() => noopCleanup),
      onUpdateDownloadProgress: vi.fn(() => noopCleanup),
      onUpdateDownloaded: vi.fn(() => noopCleanup),
      onUpdateError: vi.fn(() => noopCleanup),
      onCheckingForUpdate: vi.fn(() => noopCleanup),
    },
  }
}

export { createMockPlatform }
