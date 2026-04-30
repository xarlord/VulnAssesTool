/**
 * Platform API Interface
 *
 * Abstracts Electron IPC so the renderer can run with different backends.
 * The Electron adapter delegates to window.electronAPI.
 * The browser adapter provides stubs or web-based alternatives.
 */

/**
 * Full platform API exposed to the renderer
 */
export interface PlatformAPI {
  // Top-level convenience methods
  ping(): Promise<string>
  getAppVersion(): Promise<string>
  getPlatform(): Promise<string>
  openExternal(url: string): Promise<boolean>
  onThemeChange(callback: (theme: string) => void): void
  getSystemTheme(): Promise<string>
  onMenuAction(callback: (action: string) => void): () => void
  generatePDF(htmlContent: string): Promise<Uint8Array>

  // Namespaced APIs
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
  search(request: any): Promise<any>
  getCve(request: any): Promise<any>
  getCveFull(request: any): Promise<any>
  getStats(): Promise<any>
  getSyncStatus(): Promise<any>
  startSync(request?: any): Promise<any>
  getDetailedStats(): Promise<any>
  startDeltaSync(force?: boolean): Promise<any>
  cancelSync(): Promise<{ success: boolean }>
  startBulkDownload(request: any): Promise<any>
  setAutoSync(enabled: boolean, intervalHours: number): Promise<{ success: boolean }>
  onSyncProgress(callback: (progress: any) => void): () => void
  onSyncComplete(callback: (result: any) => void): () => void
  onSyncError(callback: (error: any) => void): () => void
  onBulkDownloadProgress(callback: (progress: any) => void): () => void
  cpeSearch(request: any): Promise<any>
  getSyncConfig(): Promise<any>
  updateSyncConfig(config: any): Promise<any>
  updateStorageConfig(config: any): Promise<any>
  updatePerformanceConfig(config: any): Promise<any>
  resetDatabase(): Promise<{ success: boolean; error?: string }>
  rebuildIndexes(): Promise<{ success: boolean; error?: string }>
  searchFts(query: string, limit?: number): Promise<any>
  getFtsStats(): Promise<any>
  getCacheStats(): Promise<any>
  clearCache(): Promise<{ success: boolean; error?: string }>
}

// ---------------------------------------------------------------------------
// Secure Storage API
// ---------------------------------------------------------------------------

export interface SecureStorageAPI {
  isAvailable(): Promise<any>
  setApiKey(request: { keyType: string; apiKey: string }): Promise<any>
  getApiKey(request: { keyType: string }): Promise<any>
  deleteApiKey(request: { keyType: string }): Promise<any>
  hasApiKey(request: { keyType: string }): Promise<any>
  needsMigration(): Promise<any>
  migrateKeys(): Promise<any>
  getAllKeys(): Promise<any>
}

// ---------------------------------------------------------------------------
// Backup API
// ---------------------------------------------------------------------------

export interface BackupAPI {
  initialize(): Promise<any>
  shutdown(): Promise<{ success: boolean }>
  createBackup(): Promise<any>
  listBackups(): Promise<any>
  restoreBackup(backupId: string): Promise<any>
  deleteBackup(backupId: string): Promise<any>
  verifyBackup(backupPath: string): Promise<any>
  getConfig(): Promise<any>
  updateConfig(config: any): Promise<any>
  getStats(): Promise<any>
}

// ---------------------------------------------------------------------------
// Intelligence API
// ---------------------------------------------------------------------------

export interface IntelligenceAPI {
  checkKev(cveId: string): Promise<any>
  getKevDetails(cveId: string): Promise<any>
  getKevStats(): Promise<any>
  syncKev(): Promise<any>
  getEpssScore(cveId: string): Promise<any>
  getEpssScores(cveIds: string[]): Promise<any>
  refreshEpssScore(cveId: string): Promise<any>
  getEpssStats(): Promise<any>
  cleanupEpssCache(): Promise<any>
  onKevSynced(callback: (result: any) => void): () => void
}

// ---------------------------------------------------------------------------
// Container API
// ---------------------------------------------------------------------------

export interface ContainerPlatformAPI {
  checkRuntime(runtime: string): Promise<any>
  pullImage(request: any): Promise<any>
  getManifest(request: any): Promise<any>
  inspectImage(request: any): Promise<any>
  scanImage(request: any): Promise<any>
  extractPackages(request: any): Promise<any>
  onScanProgress(callback: (progress: any) => void): () => void
}

// ---------------------------------------------------------------------------
// Updater API (event listeners)
// ---------------------------------------------------------------------------

export interface UpdaterPlatformAPI {
  onUpdateAvailable(callback: (info: any) => void): () => void
  onUpdateNotAvailable(callback: (info: any) => void): () => void
  onUpdateDownloadProgress(callback: (progress: any) => void): () => void
  onUpdateDownloaded(callback: (info: any) => void): () => void
  onUpdateError(callback: (error: any) => void): () => void
  onCheckingForUpdate(callback: () => void): () => void
}
