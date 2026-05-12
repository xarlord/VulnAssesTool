/**
 * Electron API exposed via contextBridge in preload script
 *
 * This file augments the global Window interface with the electronAPI
 * that the preload script exposes. Import types from shared/types/ipc
 * so the renderer has full type safety at the IPC boundary.
 */

import type {
  BulkDownloadProgress,
  BulkDownloadResult,
  CheckKevResponse,
  CheckRuntimeResponse,
  ContainerRuntime,
  ContainerScanProgress,
  DeltaSyncProgress,
  DeltaSyncResult,
  ExtractPackagesResponse,
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
  ScanImageRequest,
  ScanImageResponse,
  SetApiKeyResponse,
  StartBulkDownloadRequest,
  StartSyncRequest,
  StartSyncResponse,
  SyncConfigResponse,
  SyncConfigUpdate,
  SyncStatusResponse,
  StorageConfigUpdate,
  UpdateAvailableEvent,
  UpdateDownloadedEvent,
  UpdateDownloadProgress,
  UpdateErrorEvent,
  UpdateNotAvailableEvent,
  BackupConfig,
  BackupInfo,
  BackupResult,
  BackupStats,
  CPESearchRequest,
  CPESearchResponse,
  FtsSearchResult,
  FtsStats,
  CacheStats,
} from '@@/types/ipc'

interface ElectronDatabaseAPI {
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
  updateSyncConfig(config: SyncConfigUpdate): Promise<{ success: boolean; error?: string }>
  updateStorageConfig(config: StorageConfigUpdate): Promise<{ success: boolean; error?: string }>
  updatePerformanceConfig(config: PerformanceConfigUpdate): Promise<{ success: boolean; error?: string }>
  resetDatabase(): Promise<{ success: boolean; error?: string }>
  rebuildIndexes(): Promise<{ success: boolean; error?: string }>
  searchFts(query: string, limit?: number): Promise<{ success: boolean; results?: FtsSearchResult[]; error?: string }>
  getFtsStats(): Promise<{ success: boolean; stats?: FtsStats; error?: string }>
  getCacheStats(): Promise<{ success: boolean; stats?: CacheStats; error?: string }>
  clearCache(): Promise<{ success: boolean; error?: string }>
}

interface ElectronSecureStorageAPI {
  isAvailable(): Promise<IsAvailableResponse>
  setApiKey(request: { keyType: string; apiKey: string }): Promise<SetApiKeyResponse>
  getApiKey(request: { keyType: string }): Promise<GetApiKeyResponse>
  deleteApiKey(request: { keyType: string }): Promise<DeleteApiKeyResponse>
  hasApiKey(request: { keyType: string }): Promise<HasApiKeyResponse>
  needsMigration(): Promise<NeedsMigrationResponse>
  migrateKeys(): Promise<MigrateKeysResponse>
  getAllKeys(): Promise<GetAllKeysResponse>
}

interface ElectronBackupAPI {
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

interface ElectronIntelligenceAPI {
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

interface ElectronContainerAPI {
  checkRuntime(runtime: ContainerRuntime): Promise<CheckRuntimeResponse>
  pullImage(request: PullImageRequest): Promise<PullImageResponse>
  getManifest(request: { imageRef: string; runtime: ContainerRuntime }): Promise<GetManifestResponse>
  inspectImage(request: { imageRef: string; runtime: ContainerRuntime }): Promise<InspectImageResponse>
  scanImage(request: ScanImageRequest): Promise<ScanImageResponse>
  extractPackages(request: {
    imageRef: string
    runtime: ContainerRuntime
    layerDigests: string[]
  }): Promise<ExtractPackagesResponse>
  onScanProgress(callback: (progress: ContainerScanProgress) => void): () => void
}

interface ElectronUpdaterAPI {
  onUpdateAvailable(callback: (info: UpdateAvailableEvent) => void): () => void
  onUpdateNotAvailable(callback: (info: UpdateNotAvailableEvent) => void): () => void
  onUpdateDownloadProgress(callback: (progress: UpdateDownloadProgress) => void): () => void
  onUpdateDownloaded(callback: (info: UpdateDownloadedEvent) => void): () => void
  onUpdateError(callback: (error: UpdateErrorEvent) => void): () => void
  onCheckingForUpdate(callback: () => void): () => void
}

interface ElectronAPI {
  ping(): Promise<'pong'>
  getAppVersion(): Promise<string>
  getPlatform(): Promise<string>
  openExternal(url: string): Promise<boolean>
  onThemeChange(callback: (theme: string) => void): void
  getSystemTheme(): Promise<string>
  onMenuAction(callback: (action: string) => void): () => void
  generatePDF(htmlContent: string): Promise<Uint8Array>
  secureStorage: ElectronSecureStorageAPI
  updater: ElectronUpdaterAPI
  database: ElectronDatabaseAPI
  backup: ElectronBackupAPI
  intelligence: ElectronIntelligenceAPI
  container: ElectronContainerAPI
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
