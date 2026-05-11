/**
 * Platform API Interface
 *
 * Abstracts Electron IPC so the renderer can run with different backends.
 * The Electron adapter delegates to window.electronAPI.
 * The browser adapter provides stubs or web-based alternatives.
 */

import type {
  BulkDownloadProgress,
  BulkDownloadResult,
  CacheStats,
  CheckKevResponse,
  CheckRuntimeResponse,
  ConfigUpdateResponse,
  ContainerRuntime,
  ContainerScanProgress,
  DeltaSyncProgress,
  DeltaSyncResult,
  ExtractPackagesResponse,
  FtsSearchResult,
  FtsStats,
  GetCveFullRequest,
  GetCveFullResponse,
  GetCveRequest,
  GetCveResponse,
  GetDetailedStatsResponse,
  GetEpssScoreResponse,
  GetEpssScoresResponse,
  GetEpssStatsResponse,
  GetKevDetailsResponse,
  GetKevStatsResponse,
  GetManifestResponse,
  GetStatsResponse,
  InspectImageResponse,
  IsAvailableResponse,
  DeleteApiKeyResponse,
  GetAllKeysResponse,
  GetApiKeyResponse,
  HasApiKeyResponse,
  KevSyncResult,
  MigrateKeysResponse,
  NeedsMigrationResponse,
  NvdSearchRequest,
  NvdSearchResponse,
  PerformanceConfigUpdate,
  PullImageRequest,
  PullImageResponse,
  RefreshEpssScoreResponse,
  ScanImageResponse,
  SetApiKeyResponse,
  StartBulkDownloadRequest,
  StartSyncRequest,
  StartSyncResponse,
  SyncConfigResponse,
  SyncConfigUpdate,
  SyncStatusResponse,
  UpdateAvailableEvent,
  UpdateDownloadedEvent,
  UpdateDownloadProgress,
  UpdateErrorEvent,
  UpdateNotAvailableEvent,
  BackupConfig,
  BackupInfo,
  BackupResult,
  BackupStats,
  StorageConfigUpdate,
  CPESearchRequest,
  CPESearchResponse,
} from '@@/types/ipc'

export interface PlatformAPI {
  ping(): Promise<string>
  getAppVersion(): Promise<string>
  getPlatform(): Promise<string>
  openExternal(url: string): Promise<boolean>
  onThemeChange(callback: (theme: string) => void): void
  getSystemTheme(): Promise<string>
  onMenuAction(callback: (action: string) => void): () => void
  generatePDF(htmlContent: string): Promise<Uint8Array>

  database: DatabaseAPI
  secureStorage: SecureStorageAPI
  backup: BackupAPI
  intelligence: IntelligenceAPI
  container: ContainerPlatformAPI
  updater: UpdaterPlatformAPI
}

// ---------------------------------------------------------------------------
// Database API
// ---------------------------------------------------------------------------

export interface DatabaseAPI {
  search(request: NvdSearchRequest): Promise<NvdSearchResponse>
  getCve(request: GetCveRequest): Promise<GetCveResponse>
  getCveFull(request: GetCveFullRequest): Promise<GetCveFullResponse>
  getStats(): Promise<GetStatsResponse>
  getSyncStatus(): Promise<SyncStatusResponse>
  startSync(request?: StartSyncRequest): Promise<StartSyncResponse>
  getDetailedStats(): Promise<GetDetailedStatsResponse>
  startDeltaSync(force?: boolean): Promise<DeltaSyncResult>
  cancelSync(): Promise<{ success: boolean }>
  startBulkDownload(request: StartBulkDownloadRequest): Promise<BulkDownloadResult>
  setAutoSync(enabled: boolean, intervalHours: number): Promise<{ success: boolean }>
  onSyncProgress(callback: (progress: DeltaSyncProgress) => void): () => void
  onSyncComplete(callback: (result: DeltaSyncResult) => void): () => void
  onSyncError(callback: (error: string) => void): () => void
  onBulkDownloadProgress(callback: (progress: BulkDownloadProgress) => void): () => void
  cpeSearch(request: CPESearchRequest): Promise<CPESearchResponse>
  getSyncConfig(): Promise<SyncConfigResponse>
  updateSyncConfig(config: SyncConfigUpdate): Promise<ConfigUpdateResponse>
  updateStorageConfig(config: StorageConfigUpdate): Promise<ConfigUpdateResponse>
  updatePerformanceConfig(config: PerformanceConfigUpdate): Promise<ConfigUpdateResponse>
  resetDatabase(): Promise<{ success: boolean; error?: string }>
  rebuildIndexes(): Promise<{ success: boolean; error?: string }>
  searchFts(query: string, limit?: number): Promise<{ success: boolean; results?: FtsSearchResult[]; error?: string }>
  getFtsStats(): Promise<{ success: boolean; stats?: FtsStats; error?: string }>
  getCacheStats(): Promise<{ success: boolean; stats?: CacheStats; error?: string }>
  clearCache(): Promise<{ success: boolean; error?: string }>
}

// ---------------------------------------------------------------------------
// Secure Storage API
// ---------------------------------------------------------------------------

export interface SecureStorageAPI {
  isAvailable(): Promise<IsAvailableResponse>
  setApiKey(request: { keyType: string; apiKey: string }): Promise<SetApiKeyResponse>
  getApiKey(request: { keyType: string }): Promise<GetApiKeyResponse>
  deleteApiKey(request: { keyType: string }): Promise<DeleteApiKeyResponse>
  hasApiKey(request: { keyType: string }): Promise<HasApiKeyResponse>
  needsMigration(): Promise<NeedsMigrationResponse>
  migrateKeys(): Promise<MigrateKeysResponse>
  getAllKeys(): Promise<GetAllKeysResponse>
}

// ---------------------------------------------------------------------------
// Backup API
// ---------------------------------------------------------------------------

export interface BackupAPI {
  initialize(): Promise<{ success: boolean; error?: string }>
  shutdown(): Promise<{ success: boolean }>
  createBackup(): Promise<BackupResult>
  listBackups(): Promise<{ success: boolean; backups?: BackupInfo[]; error?: string }>
  restoreBackup(backupId: string): Promise<BackupResult>
  deleteBackup(backupId: string): Promise<BackupResult>
  verifyBackup(
    backupPath: string,
  ): Promise<{ success: boolean; integrity?: 'valid' | 'invalid' | 'unknown'; error?: string }>
  getConfig(): Promise<{ success: boolean; config?: BackupConfig; error?: string }>
  updateConfig(config: Partial<BackupConfig>): Promise<{ success: boolean; error?: string }>
  getStats(): Promise<{ success: boolean; stats?: BackupStats; error?: string }>
}

// ---------------------------------------------------------------------------
// Intelligence API
// ---------------------------------------------------------------------------

export interface IntelligenceAPI {
  checkKev(cveId: string): Promise<CheckKevResponse>
  getKevDetails(cveId: string): Promise<GetKevDetailsResponse>
  getKevStats(): Promise<GetKevStatsResponse>
  syncKev(): Promise<{ success: boolean; result: KevSyncResult | null; error?: string }>
  getEpssScore(cveId: string): Promise<GetEpssScoreResponse>
  getEpssScores(cveIds: string[]): Promise<GetEpssScoresResponse>
  refreshEpssScore(cveId: string): Promise<RefreshEpssScoreResponse>
  getEpssStats(): Promise<GetEpssStatsResponse>
  cleanupEpssCache(): Promise<{ success: boolean; cleanedCount: number; error?: string }>
  onKevSynced(callback: (result: KevSyncResult) => void): () => void
}

// ---------------------------------------------------------------------------
// Container API
// ---------------------------------------------------------------------------

export interface ContainerPlatformAPI {
  checkRuntime(runtime: ContainerRuntime): Promise<CheckRuntimeResponse>
  pullImage(request: PullImageRequest): Promise<PullImageResponse>
  getManifest(request: { imageRef: string; runtime: ContainerRuntime }): Promise<GetManifestResponse>
  inspectImage(request: { imageRef: string; runtime: ContainerRuntime }): Promise<InspectImageResponse>
  scanImage(request: {
    imageRef: string
    runtime: ContainerRuntime
    platform?: string
    maxLayers?: number
  }): Promise<ScanImageResponse>
  extractPackages(request: {
    imageRef: string
    runtime: ContainerRuntime
    layerDigests: string[]
  }): Promise<ExtractPackagesResponse>
  onScanProgress(callback: (progress: ContainerScanProgress) => void): () => void
}

// ---------------------------------------------------------------------------
// Updater API (event listeners)
// ---------------------------------------------------------------------------

export interface UpdaterPlatformAPI {
  onUpdateAvailable(callback: (info: UpdateAvailableEvent) => void): () => void
  onUpdateNotAvailable(callback: (info: UpdateNotAvailableEvent) => void): () => void
  onUpdateDownloadProgress(callback: (progress: UpdateDownloadProgress) => void): () => void
  onUpdateDownloaded(callback: (info: UpdateDownloadedEvent) => void): () => void
  onUpdateError(callback: (error: UpdateErrorEvent) => void): () => void
  onCheckingForUpdate(callback: () => void): () => void
}

// Re-export IPC types for renderer consumers
export type {
  BulkDownloadProgress,
  BulkDownloadResult,
  CacheStats,
  CheckKevResponse,
  CheckRuntimeResponse,
  ConfigUpdateResponse,
  ContainerPackage,
  ContainerRuntime,
  ContainerScanProgress,
  CveFullDetails,
  DeltaSyncProgress,
  DeltaSyncResult,
  EpssScore,
  EpssStats,
  ExtractPackagesResponse,
  FtsSearchResult,
  FtsStats,
  GetCveFullRequest,
  GetCveFullResponse,
  GetCveRequest,
  GetCveResponse,
  GetDetailedStatsResponse,
  GetEpssScoreResponse,
  GetEpssScoresResponse,
  GetEpssStatsResponse,
  GetKevDetailsResponse,
  GetKevStatsResponse,
  GetManifestResponse,
  GetStatsResponse,
  InspectImageResponse,
  SyncStatusResponse,
  StartSyncResponse,
  StartBulkDownloadRequest,
  UpdateAvailableEvent,
  UpdateDownloadedEvent,
  UpdateDownloadProgress,
  UpdateErrorEvent,
  UpdateNotAvailableEvent,
  BackupInfo,
  BackupResult,
  BackupStats,
  KevSyncResult,
  PullImageRequest,
  PullImageResponse,
  ScanImageResponse,
  SyncConfigResponse,
} from '@@/types/ipc'
