import type {
  PlatformAPI,
  DatabaseAPI,
  SecureStorageAPI,
  BackupAPI,
  IntelligenceAPI,
  ContainerPlatformAPI,
  SbomGenerationAPI,
  SbomGenerateResult,
  SbomEngineStatus,
  SbomGenerateProgress,
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
  CheckKevBatchResponse,
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
import { apiGet, apiPost, apiPut, apiPostForm, setAuthToken } from './httpClient'
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
      const offA = wsClient.on('sync-progress', handler)
      const offB = wsClient.on('delta-sync-progress', handler)
      return () => {
        offA()
        offB()
      }
    },
    onSyncComplete: (cb: (result: DeltaSyncResult) => void) => {
      const handler = (data: unknown) => cb(data as DeltaSyncResult)
      const offA = wsClient.on('sync-complete', handler)
      const offB = wsClient.on('delta-sync-complete', handler)
      return () => {
        offA()
        offB()
      }
    },
    onSyncError: (cb: (error: string) => void) => {
      const handler = (data: unknown) => cb(data as string)
      const offA = wsClient.on('sync-error', handler)
      const offB = wsClient.on('delta-sync-error', handler)
      return () => {
        offA()
        offB()
      }
    },
    onBulkDownloadProgress: (cb: (progress: BulkDownloadProgress) => void) => {
      const handler = (data: unknown) => cb(data as BulkDownloadProgress)
      return wsClient.on('bulk-download-progress', handler)
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
    checkKevBatch: (cveIds) => apiPost<CheckKevBatchResponse>('/intelligence/kev/checks', { cveIds }),
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
      return wsClient.on('kev-synced', handler)
    },
  }
}

// Pulling, `docker save`-ing and unpacking a multi-layer image (e.g. nginx on
// Debian) takes well over the default 30s request deadline, so these endpoints
// get a generous timeout to avoid a premature client-side abort.
const CONTAINER_JOB_TIMEOUT_MS = 10 * 60 * 1000

function createServerContainer(): ContainerPlatformAPI {
  return {
    checkRuntime: (runtime: ContainerRuntime) => apiPost<CheckRuntimeResponse>('/container/check-runtime', { runtime }),
    pullImage: (request: PullImageRequest) =>
      apiPost<PullImageResponse>('/container/pull', request, { timeoutMs: CONTAINER_JOB_TIMEOUT_MS }),
    getManifest: (request) => apiPost<GetManifestResponse>('/container/manifest', request),
    inspectImage: (request) => apiPost<InspectImageResponse>('/container/inspect', request),
    scanImage: (request) =>
      apiPost<ScanImageResponse>('/container/scan', request, { timeoutMs: CONTAINER_JOB_TIMEOUT_MS }),
    extractPackages: (request) =>
      apiPost<ExtractPackagesResponse>('/container/extract', request, { timeoutMs: CONTAINER_JOB_TIMEOUT_MS }),
    onScanProgress: (cb) => {
      const handler = (data: unknown) => cb(data as ContainerScanProgress)
      return wsClient.on('scan-progress', handler)
    },
  }
}

// Syft scans of large images/artifacts run for minutes; don't abort them at
// the default 30s request deadline.
const SBOM_JOB_TIMEOUT_MS = 15 * 60 * 1000

function createServerSbom(): SbomGenerationAPI {
  return {
    getEngineStatus: () => apiGet<SbomEngineStatus>('/sbom/engine-status'),
    generateFromFile: (file: File) => {
      const form = new FormData()
      form.append('artifact', file)
      return apiPostForm<SbomGenerateResult>('/sbom/generate', form)
    },
    generateFromImage: (imageRef: string) =>
      apiPost<SbomGenerateResult>('/sbom/generate', { imageRef }, { timeoutMs: SBOM_JOB_TIMEOUT_MS }),
    generateFromPath: (localPath: string) =>
      apiPost<SbomGenerateResult>('/sbom/generate', { localPath }, { timeoutMs: SBOM_JOB_TIMEOUT_MS }),
    onGenerateProgress: (cb) => {
      const handler = (data: unknown) => cb(data as SbomGenerateProgress)
      return wsClient.on('sbom-generate-progress', handler)
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
  } catch (error) {
    // In dev the server may skip auth, but elsewhere a failed handshake means every authenticated
    // call fails with an opaque 401/403 — log it so the real cause is visible, not inferred.
    console.error('[Auth] Handshake failed; subsequent API calls may be unauthenticated:', error)
  }

  wsClient.connect()

  return {
    ping: () => apiGet<{ status: string; db: boolean; uptime: number; version: string }>('/health').then(() => 'pong'),
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

    database: createServerDatabase(),
    secureStorage: createServerSecureStorage(),
    backup: createServerBackup(),
    intelligence: createServerIntelligence(),
    container: createServerContainer(),
    sbom: createServerSbom(),
    updater: createServerUpdater(),
  }
}
