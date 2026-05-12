/**
 * Backup IPC Types
 *
 * Type definitions for backup-related IPC communication between
 * main and renderer processes.
 */

import type { BackupConfig, BackupInfo, BackupResult } from '../services/BackupService'

/**
 * Backup IPC channel names
 */
export const BACKUP_IPC_CHANNELS = {
  // Backup operations
  CREATE_BACKUP: 'backup:create',
  LIST_BACKUPS: 'backup:list',
  RESTORE_BACKUP: 'backup:restore',
  DELETE_BACKUP: 'backup:delete',
  VERIFY_BACKUP: 'backup:verify',

  // Configuration
  GET_CONFIG: 'backup:get-config',
  UPDATE_CONFIG: 'backup:update-config',

  // Statistics
  GET_STATS: 'backup:get-stats',

  // Service management
  INITIALIZE: 'backup:initialize',
  SHUTDOWN: 'backup:shutdown',
} as const

/**
 * Backup API exposed to renderer process
 */
export interface BackupAPI {
  /**
   * Create a new backup
   */
  createBackup(): Promise<BackupResult>

  /**
   * List all available backups
   */
  listBackups(): Promise<BackupInfo[]>

  /**
   * Restore from a specific backup
   */
  restoreBackup(backupId: string): Promise<BackupResult>

  /**
   * Delete a specific backup
   */
  deleteBackup(backupId: string): Promise<BackupResult>

  /**
   * Verify backup integrity
   */
  verifyBackup(backupPath: string): Promise<'valid' | 'invalid' | 'unknown'>

  /**
   * Get current backup configuration
   */
  getConfig(): Promise<BackupConfig>

  /**
   * Update backup configuration
   */
  updateConfig(config: Partial<BackupConfig>): Promise<void>

  /**
   * Get backup statistics
   */
  getStats(): Promise<{
    totalBackups: number
    totalSize: number
    oldestBackup?: Date
    newestBackup?: Date
    nextScheduledBackup?: Date
  }>

  /**
   * Initialize the backup service
   */
  initialize(): Promise<void>

  /**
   * Shutdown the backup service
   */
  shutdown(): Promise<void>
}

/**
 * Response type for list backups
 */
export interface ListBackupsResponse {
  success: boolean
  backups?: BackupInfo[]
  error?: string
}

/**
 * Response type for get stats
 */
export interface GetBackupStatsResponse {
  success: boolean
  stats?: {
    totalBackups: number
    totalSize: number
    oldestBackup?: Date
    newestBackup?: Date
    nextScheduledBackup?: Date
  }
  error?: string
}

/**
 * Response type for get config
 */
export interface GetBackupConfigResponse {
  success: boolean
  config?: BackupConfig
  error?: string
}

/**
 * Response type for verify backup
 */
export interface VerifyBackupResponse {
  success: boolean
  integrity?: 'valid' | 'invalid' | 'unknown'
  error?: string
}
