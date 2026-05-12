/**
 * BackupService - Automatic Database Backup Service
 *
 * Provides scheduled database backups with:
 * - Configurable schedule (daily/weekly/manual)
 * - Point-in-time recovery
 * - Backup rotation (keep last N backups)
 * - Integrity verification
 */

// In CommonJS, __dirname is available natively

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { existsSync, statSync } from 'fs'
import * as cron from 'node-cron'

export interface BackupConfig {
  enabled: boolean
  schedule: 'daily' | 'weekly' | 'manual'
  retentionCount: number // Number of backups to keep
  backupDir?: string // Custom backup directory
}

export interface BackupInfo {
  id: string
  filename: string
  path: string
  size: number
  createdAt: Date
  integrity: 'valid' | 'invalid' | 'unknown'
}

export interface BackupResult {
  success: boolean
  backup?: BackupInfo
  error?: string
}

const DEFAULT_CONFIG: BackupConfig = {
  enabled: true,
  schedule: 'daily',
  retentionCount: 5,
}

const DEFAULT_BACKUP_DIR = 'backups'

export class BackupService {
  private config: BackupConfig
  private backupDir: string
  private scheduledJob: cron.ScheduledTask | null = null
  private dbPath: string
  private getDbBuffer: () => Promise<Buffer>

  constructor(dbPath: string, getDbBuffer: () => Promise<Buffer>, config: Partial<BackupConfig> = {}) {
    this.dbPath = dbPath
    this.getDbBuffer = getDbBuffer
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Set backup directory
    const userDataPath = app.getPath('userData')
    this.backupDir = config.backupDir || path.join(userDataPath, DEFAULT_BACKUP_DIR)
  }

  /**
   * Initialize the backup service
   */
  async initialize(): Promise<void> {
    // Ensure backup directory exists
    await this.ensureBackupDir()

    // Start scheduled backups if enabled
    if (this.config.enabled && this.config.schedule !== 'manual') {
      this.startScheduledBackups()
    }

    console.log('[BackupService] Initialized with config:', this.config)
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDir(): Promise<void> {
    if (!existsSync(this.backupDir)) {
      await fs.mkdir(this.backupDir, { recursive: true })
      console.log('[BackupService] Created backup directory:', this.backupDir)
    }
  }

  /**
   * Start scheduled backups based on config
   */
  private startScheduledBackups(): void {
    // Stop any existing job
    this.stopScheduledBackups()

    let cronExpression: string

    switch (this.config.schedule) {
      case 'daily':
        // Run daily at 2 AM
        cronExpression = '0 2 * * *'
        break
      case 'weekly':
        // Run weekly on Sunday at 2 AM
        cronExpression = '0 2 * * 0'
        break
      default:
        return
    }

    this.scheduledJob = cron.schedule(cronExpression, async () => {
      console.log('[BackupService] Running scheduled backup...')
      const result = await this.createBackup()
      if (result.success) {
        console.log('[BackupService] Scheduled backup completed:', result.backup?.filename)
      } else {
        console.error('[BackupService] Scheduled backup failed:', result.error)
      }
    })

    console.log('[BackupService] Scheduled backups started:', this.config.schedule)
  }

  /**
   * Stop scheduled backups
   */
  private stopScheduledBackups(): void {
    if (this.scheduledJob) {
      this.scheduledJob.stop()
      this.scheduledJob = null
    }
  }

  /**
   * Create a new backup
   */
  async createBackup(): Promise<BackupResult> {
    try {
      await this.ensureBackupDir()

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupId = `backup-${timestamp}`
      const filename = `${backupId}.db`
      const backupPath = path.join(this.backupDir, filename)

      // Get database buffer
      const dbBuffer = await this.getDbBuffer()

      // Write backup
      await fs.writeFile(backupPath, dbBuffer)

      // Verify backup integrity
      const integrity = await this.verifyBackupIntegrity(backupPath)

      // Clean up old backups
      await this.cleanupOldBackups()

      const backupInfo: BackupInfo = {
        id: backupId,
        filename,
        path: backupPath,
        size: dbBuffer.length,
        createdAt: new Date(),
        integrity,
      }

      console.log('[BackupService] Backup created:', filename)

      return { success: true, backup: backupInfo }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[BackupService] Backup failed:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Restore from a backup
   */
  async restoreBackup(backupId: string): Promise<BackupResult> {
    try {
      const backups = await this.listBackups()
      const backup = backups.find((b) => b.id === backupId)

      if (!backup) {
        return { success: false, error: 'Backup not found' }
      }

      if (backup.integrity === 'invalid') {
        return { success: false, error: 'Backup integrity check failed' }
      }

      // Read backup file
      const backupBuffer = await fs.readFile(backup.path)

      // Create a backup of current database before restore
      const currentDbExists = existsSync(this.dbPath)
      if (currentDbExists) {
        const preRestoreBackupPath = `${this.dbPath}.pre-restore-${Date.now()}`
        await fs.copyFile(this.dbPath, preRestoreBackupPath)
        console.log('[BackupService] Created pre-restore backup:', preRestoreBackupPath)
      }

      // Restore backup
      await fs.writeFile(this.dbPath, backupBuffer)

      console.log('[BackupService] Database restored from:', backup.filename)

      return { success: true, backup }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[BackupService] Restore failed:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      await this.ensureBackupDir()

      const files = await fs.readdir(this.backupDir)
      const backupFiles = files.filter((f) => f.endsWith('.db') && f.startsWith('backup-'))

      const backups: BackupInfo[] = []

      for (const filename of backupFiles) {
        const backupPath = path.join(this.backupDir, filename)
        const stats = statSync(backupPath)

        // Extract timestamp from filename
        const id = filename.replace('.db', '')

        backups.push({
          id,
          filename,
          path: backupPath,
          size: stats.size,
          createdAt: stats.birthtime,
          integrity: 'unknown', // Will be verified on demand
        })
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      return backups
    } catch (error) {
      console.error('[BackupService] Failed to list backups:', error)
      return []
    }
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupId: string): Promise<BackupResult> {
    try {
      const backups = await this.listBackups()
      const backup = backups.find((b) => b.id === backupId)

      if (!backup) {
        return { success: false, error: 'Backup not found' }
      }

      await fs.unlink(backup.path)
      console.log('[BackupService] Backup deleted:', backup.filename)

      return { success: true, backup }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackupIntegrity(backupPath: string): Promise<'valid' | 'invalid' | 'unknown'> {
    try {
      // Check file exists and has content
      if (!existsSync(backupPath)) {
        return 'invalid'
      }

      const stats = statSync(backupPath)
      if (stats.size === 0) {
        return 'invalid'
      }

      // Read first 16 bytes to check SQLite header
      const fd = await fs.open(backupPath, 'r')
      const buffer = Buffer.alloc(16)
      await fd.read(buffer, 0, 16, 0)
      await fd.close()

      // SQLite database header starts with "SQLite format 3\000"
      const header = buffer.toString('ascii', 0, 16)
      if (header.startsWith('SQLite format 3')) {
        return 'valid'
      }

      return 'invalid'
    } catch (error) {
      console.error('[BackupService] Integrity check failed:', error)
      return 'unknown'
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups()

      if (backups.length > this.config.retentionCount) {
        const toDelete = backups.slice(this.config.retentionCount)

        for (const backup of toDelete) {
          await fs.unlink(backup.path)
          console.log('[BackupService] Deleted old backup:', backup.filename)
        }
      }
    } catch (error) {
      console.error('[BackupService] Cleanup failed:', error)
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BackupConfig>): void {
    const wasEnabled = this.config.enabled
    const scheduleChanged = this.config.schedule !== newConfig.schedule

    this.config = { ...this.config, ...newConfig }

    // Handle schedule changes
    if (this.config.enabled && (scheduleChanged || !wasEnabled)) {
      this.startScheduledBackups()
    } else if (!this.config.enabled) {
      this.stopScheduledBackups()
    }

    console.log('[BackupService] Config updated:', this.config)
  }

  /**
   * Get current configuration
   */
  getConfig(): BackupConfig {
    return { ...this.config }
  }

  /**
   * Get backup statistics
   */
  async getStats(): Promise<{
    totalBackups: number
    totalSize: number
    oldestBackup?: Date
    newestBackup?: Date
    nextScheduledBackup?: Date
  }> {
    const backups = await this.listBackups()

    const stats = {
      totalBackups: backups.length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0),
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].createdAt : undefined,
      newestBackup: backups.length > 0 ? backups[0].createdAt : undefined,
      nextScheduledBackup: this.getNextScheduledTime(),
    }

    return stats
  }

  /**
   * Get next scheduled backup time
   */
  private getNextScheduledTime(): Date | undefined {
    if (!this.config.enabled || this.config.schedule === 'manual') {
      return undefined
    }

    // Calculate next run time based on schedule
    const now = new Date()

    switch (this.config.schedule) {
      case 'daily': {
        // Next 2 AM
        const next = new Date(now)
        next.setHours(2, 0, 0, 0)
        if (next <= now) {
          next.setDate(next.getDate() + 1)
        }
        return next
      }
      case 'weekly': {
        // Next Sunday 2 AM
        const next = new Date(now)
        next.setHours(2, 0, 0, 0)
        const daysUntilSunday = (7 - now.getDay()) % 7 || 7
        next.setDate(next.getDate() + daysUntilSunday)
        return next
      }
      default:
        return undefined
    }
  }

  /**
   * Shutdown the backup service
   */
  shutdown(): void {
    this.stopScheduledBackups()
    console.log('[BackupService] Shutdown complete')
  }
}

// Singleton instance
let backupServiceInstance: BackupService | null = null

/**
 * Initialize the backup service
 */
export function initializeBackupService(
  dbPath: string,
  getDbBuffer: () => Promise<Buffer>,
  config?: Partial<BackupConfig>,
): BackupService {
  if (backupServiceInstance) {
    backupServiceInstance.shutdown()
  }

  backupServiceInstance = new BackupService(dbPath, getDbBuffer, config)
  return backupServiceInstance
}

/**
 * Get the backup service instance
 */
export function getBackupService(): BackupService | null {
  return backupServiceInstance
}
