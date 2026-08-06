/**
 * NVD Database Population Module
 * Exports all NVD-related functionality for downloading,
 * parsing, and importing CVE data.
 */

export { RateLimiter, createNvdRateLimiter } from './rateLimiter.js'
export type { RateLimiterOptions } from './rateLimiter.js'

// NVD population is consolidated onto the REST API v2 path (NvdApiV2Client → NvdDataImporter).
// The former feed-file downloader, stream parser, and separate bulk database were retired (B1).
export { NvdImportManager, importNvdData, getAvailableNvdYears } from './nvdImportManager.js'
export type { NvdImportOptions, NvdImportProgress, NvdImportResult } from './nvdImportManager.js'

// NVD API v2 Client for bulk downloads
export {
  NvdApiV2Client,
  NvdApiError,
  createNvdApiV2Client,
  createTestNvdApiV2Client,
  getAvailableYearsForDownload,
  getRecentYearsForDownload,
} from './nvdApiV2Client.js'
export type {
  NvdCveV2,
  NvdApiResponseV2,
  NvdDownloadProgress,
  NvdYearFetchOptions,
  NvdDateRangeFetchOptions,
  NvdDeltaFetchOptions,
  NvdFetchResult,
  NvdBulkFetchOptions,
  NvdBulkDownloadProgress,
  NvdBulkFetchResult,
} from './nvdApiV2Client.js'

// Bulk Download Manager
export { BulkDownloadManager, createBulkDownloadManager } from './bulkDownloadManager.js'
export type {
  DownloadStatus,
  BulkDownloadProgress,
  BulkDownloadOptions,
  BulkDownloadResult,
} from './bulkDownloadManager.js'

// NVD Data Importer
export { NvdDataImporter, createNvdDataImporter } from './nvdDataImporter.js'
export type { ImportProgress, ImportOptions, ImportResult } from './nvdDataImporter.js'

// NVD Delta Sync
export { NvdDeltaSync, createNvdDeltaSync } from './nvdDeltaSync.js'
export type {
  SyncStatus,
  DeltaSyncOptions,
  DeltaSyncProgress,
  DeltaSyncResult,
  SchedulerOptions,
} from './nvdDeltaSync.js'

// Re-export existing types
export type { CVE, CPEMatch, Reference } from '../types.js'
