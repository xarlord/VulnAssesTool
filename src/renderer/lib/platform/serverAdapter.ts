import type {
  PlatformAPI,
  DatabaseAPI,
  SecureStorageAPI,
  BackupAPI,
  IntelligenceAPI,
  ContainerPlatformAPI,
  UpdaterPlatformAPI,
} from './types'
import type {
  NvdSearchRequest,
  NvdSearchResponse,
  GetCveRequest,
  GetCveResponse,
  GetCveFullRequest,
  GetCveFullResponse,
  GetStatsResponse,
  SyncStatusResponse,
  StartSyncRequest,
  StartSyncResponse,
  GetDetailedStatsResponse,
  DeltaSyncResult,
  DeltaSyncProgress,
  BulkDownloadResult,
  BulkDownloadProgress,
  CPESearchRequest,
  CPESearchResponse,
  SyncConfigResponse,
  SyncConfigUpdate,
  ConfigUpdateResponse,
  StorageConfigUpdate,
  PerformanceConfigUpdate,
  FtsSearchResult,
  FtsStats,
  CacheStats,
  IsAvailableResponse,
  SetApiKeyResponse,
  GetApiKeyResponse,
  DeleteApiKeyResponse,
  HasApiKeyResponse,
  NeedsMigrationResponse,
  MigrateKeysResponse,
  GetAllKeysResponse,
  BackupResult,
  BackupInfo,
  BackupConfig,
  BackupStats,
  CheckKevResponse,
  GetKevDetailsResponse,
  GetKevStatsResponse,
  KevSyncResult,
  GetEpssScoreResponse,
  GetEpssScoresResponse,
  RefreshEpssScoreResponse,
  GetEpssStatsResponse,
  ContainerRuntime,
  CheckRuntimeResponse,
  PullImageRequest,
  PullImageResponse,
  GetManifestResponse,
  InspectImageResponse,
  ScanImageResponse,
  ContainerScanProgress,
  ExtractPackagesResponse,
  StartBulkDownloadRequest,
} from '@@/types/ipc'
import { apiGet, apiPost, apiPut, setAuthToken } from './httpClient'
import { wsClient } from './wsClient'

const noopCleanup = () => {}

function createServerDatabase(): DatabaseAPI {
  return {
    search: (request: NvdSearchRequest) => apiPost<NvdSearchResponse>('/database/search', request),
    getCve: (request: GetCveRequest) => apiPost<GetCveResponse>('/database/cve', request),
    getCveFull: (request: GetCveFullRequest) => apiPost<GetCveFullResponse>('/database/cve/full', request),
    getStats: () => apiGet<GetStatsResponse>('/database/stats'),
    getSyncStatus: () => apiGet<SyncStatusResponse>('/database/sync/status'),
    startSync: (request?: StartSyncRequest) => apiPost<StartSyncResponse>('/database/sync/start', request),
    getDetailedStats: () => apiGet<GetDetailedStatsResponse>('/database/stats/detailed'),
    startDeltaSync: (force?: boolean) => apiPost<DeltaSyncResult>('/database/sync/delta', { force }),
    cancelSync: () => apiPost<{ success: boolean }>('/database/sync/cancel'),
    startBulkDownload: (request: StartBulkDownloadRequest) =>
      apiPost<BulkDownloadResult>('/database/sync/bulk', request),
    setAutoSync: (enabled: boolean, intervalHours: number) =>
      apiPost<{ success: boolean }>('/database/sync/auto', { enabled, intervalHours }),
    onSyncProgress: (cb: (progress: DeltaSyncProgress) => void) => {
      const handler = (data: unknown) => cb(data as DeltaSyncProgress)
      wsClient.on('sync-progress', handler)
      wsClient.on('delta-sync-progress', handler)
      return noopCleanup
    },
    onSyncComplete: (cb: (result: DeltaSyncResult) => void) => {
      const handler = (data: unknown) => cb(data as DeltaSyncResult)
      wsClient.on('sync-complete', handler)
      wsClient.on('delta-sync-complete', handler)
      return noopCleanup
    },
    onSyncError: (cb: (error: string) => void) => {
      const handler = (data: unknown) => cb(data as string)
      wsClient.on('sync-error', handler)
      wsClient.on('delta-sync-error', handler)
      return noopCleanup
    },
    onBulkDownloadProgress: (cb: (progress: BulkDownloadProgress) => void) => {
      const handler = (data: unknown) => cb(data as BulkDownloadProgress)
      wsClient.on('bulk-download-progress', handler)
      return noopCleanup
    },
    cpeSearch: (request: CPESearchRequest) => apiPost<CPESearchResponse>('/database/cpe/search', request),
    getSyncConfig: () => apiGet<SyncConfigResponse>('/database/config/sync'),
    updateSyncConfig: (config: SyncConfigUpdate) => apiPut<ConfigUpdateResponse>('/database/config/sync', config),
    updateStorageConfig: (config: StorageConfigUpdate) =>
      apiPut<ConfigUpdateResponse>('/database/config/storage', config),
    updatePerformanceConfig: (config: PerformanceConfigUpdate) =>
      apiPut<ConfigUpdateResponse>('/database/config/perf', config),
    resetDatabase: () => apiPost<{ success: boolean; error?: string }>('/database/reset'),
    rebuildIndexes: () => apiPost<{ success: boolean; error?: string }>('/database/rebuild'),
    searchFts: (query: string, limit?: number) =>
      apiPost<{ success: boolean; results?: FtsSearchResult[]; error?: string }>('/database/fts/search', {
        query,
        limit,
      }),
    getFtsStats: () => apiGet<{ success: boolean; stats?: FtsStats; error?: string }>('/database/fts/stats'),
    getCacheStats: () => apiGet<{ success: boolean; stats?: CacheStats; error?: string }>('/database/cache/stats'),
    clearCache: () => apiPost<{ success: boolean; error?: string }>('/database/cache/clear'),
  }
}

function createServerSecureStorage(): SecureStorageAPI {
  return {
    isAvailable: () => apiGet<IsAvailableResponse>('/storage/available'),
    setApiKey: (request) => apiPost<SetApiKeyResponse>('/storage/keys/set', request),
    getApiKey: (request) => apiPost<GetApiKeyResponse>('/storage/keys/get', request),
    deleteApiKey: (request) => apiPost<DeleteApiKeyResponse>('/storage/keys/delete', request),
    hasApiKey: (request) => apiPost<HasApiKeyResponse>('/storage/keys/has', request),
    needsMigration: () => apiGet<NeedsMigrationResponse>('/storage/migration'),
    migrateKeys: () => apiPost<MigrateKeysResponse>('/storage/migrate'),
    getAllKeys: () => apiGet<GetAllKeysResponse>('/storage/keys/all'),
  }
}

function createServerBackup(): BackupAPI {
  return {
    initialize: () => apiPost<{ success: boolean; error?: string }>('/backup/initialize'),
    shutdown: () => apiPost<{ success: boolean }>('/backup/shutdown'),
    createBackup: () => apiPost<BackupResult>('/backup/create'),
    listBackups: () => apiGet<{ success: boolean; backups?: BackupInfo[]; error?: string }>('/backup/list'),
    restoreBackup: (backupId) => apiPost<BackupResult>('/backup/restore', { backupId }),
    deleteBackup: (backupId) => apiPost<BackupResult>('/backup/delete', { backupId }),
    verifyBackup: (backupPath) =>
      apiPost<{ success: boolean; integrity?: 'valid' | 'invalid' | 'unknown'; error?: string }>('/backup/verify', {
        backupPath,
      }),
    getConfig: () => apiGet<{ success: boolean; config?: BackupConfig; error?: string }>('/backup/config'),
    updateConfig: (cfg) => apiPut<{ success: boolean; error?: string }>('/backup/config', cfg),
    getStats: () => apiGet<{ success: boolean; stats?: BackupStats; error?: string }>('/backup/stats'),
  }
}

function createServerIntelligence(): IntelligenceAPI {
  return {
    checkKev: (cveId) => apiPost<CheckKevResponse>('/intelligence/kev/check', { cveId }),
    getKevDetails: (cveId) => apiPost<GetKevDetailsResponse>('/intelligence/kev/details', { cveId }),
    getKevStats: () => apiGet<GetKevStatsResponse>('/intelligence/kev/stats'),
    syncKev: () =>
      apiPost<{ success: boolean; result: KevSyncResult | null; error?: string }>('/intelligence/kev/sync'),
    getEpssScore: (cveId) => apiPost<GetEpssScoreResponse>('/intelligence/epss/score', { cveId }),
    getEpssScores: (cveIds) => apiPost<GetEpssScoresResponse>('/intelligence/epss/scores', { cveIds }),
    refreshEpssScore: (cveId) => apiPost<RefreshEpssScoreResponse>('/intelligence/epss/refresh', { cveId }),
    getEpssStats: () => apiGet<GetEpssStatsResponse>('/intelligence/epss/stats'),
    cleanupEpssCache: () =>
      apiPost<{ success: boolean; cleanedCount: number; error?: string }>('/intelligence/epss/cleanup'),
    onKevSynced: (cb) => {
      const handler = (data: unknown) => cb(data as KevSyncResult)
      wsClient.on('kev-synced', handler)
      return noopCleanup
    },
  }
}

function createServerContainer(): ContainerPlatformAPI {
  return {
    checkRuntime: (runtime: ContainerRuntime) => apiPost<CheckRuntimeResponse>('/container/check-runtime', { runtime }),
    pullImage: (request: PullImageRequest) => apiPost<PullImageResponse>('/container/pull', request),
    getManifest: (request) => apiPost<GetManifestResponse>('/container/manifest', request),
    inspectImage: (request) => apiPost<InspectImageResponse>('/container/inspect', request),
    scanImage: (request) => apiPost<ScanImageResponse>('/container/scan', request),
    extractPackages: (request) => apiPost<ExtractPackagesResponse>('/container/extract', request),
    onScanProgress: (cb) => {
      const handler = (data: unknown) => cb(data as ContainerScanProgress)
      wsClient.on('scan-progress', handler)
      return noopCleanup
    },
  }
}

function createServerUpdater(): UpdaterPlatformAPI {
  return {
    onUpdateAvailable: () => noopCleanup,
    onUpdateNotAvailable: () => noopCleanup,
    onUpdateDownloadProgress: () => noopCleanup,
    onUpdateDownloaded: () => noopCleanup,
    onUpdateError: () => noopCleanup,
    onCheckingForUpdate: () => noopCleanup,
  }
}

export async function createServerAdapter(): Promise<PlatformAPI> {
  try {
    const response = await apiGet<{ success: boolean; token: string }>('/handshake')
    if (response.success && response.token) {
      setAuthToken(response.token)
    }
  } catch {
    // handshake failed — continue without token (dev mode may skip auth)
  }

  wsClient.connect()

  return {
    ping: () => apiGet<string>('/health').then(() => 'pong'),
    getAppVersion: () => Promise.resolve('2.0.0-web'),
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
    generatePDF: async (htmlContent: string): Promise<Uint8Array> => {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })

      const parser = new DOMParser()
      const docEl = parser.parseFromString(htmlContent, 'text/html')
      const bodyText = docEl.body?.innerText || htmlContent

      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 15
      const maxWidth = pageWidth - margin * 2
      const lines = doc.splitTextToSize(bodyText, maxWidth)

      let y = margin
      const pageHeight = doc.internal.pageSize.getHeight()
      for (const line of lines) {
        if (y + 7 > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 7
      }

      const arrayBuffer = doc.output('arraybuffer')
      return new Uint8Array(arrayBuffer)
    },

    database: createServerDatabase(),
    secureStorage: createServerSecureStorage(),
    backup: createServerBackup(),
    intelligence: createServerIntelligence(),
    container: createServerContainer(),
    updater: createServerUpdater(),
  }
}
