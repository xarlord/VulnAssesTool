/**
 * BackupService Tests
 *
 * Tests for automatic database backup functionality including:
 * - Backup creation and restoration
 * - Scheduled backups
 * - Retention policy
 * - Integrity verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { BackupService, BackupConfig, initializeBackupService, getBackupService } from './BackupService'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}))

// Mock node-cron
vi.mock('node-cron', () => ({
  schedule: vi.fn(() => ({
    stop: vi.fn(),
  })),
}))

// Create a valid SQLite header for testing (using hex to avoid octal escape issues)
const VALID_SQLITE_HEADER = Buffer.from([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
])
const INVALID_BUFFER = Buffer.from('not a sqlite database')

describe('BackupService', () => {
  let tempDir: string
  let dbPath: string
  let backupDir: string
  let service: BackupService

  beforeEach(async () => {
    // Create temp directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'))
    dbPath = path.join(tempDir, 'test.db')
    backupDir = path.join(tempDir, 'backups')

    // Create a test database file with valid SQLite header
    const dbBuffer = Buffer.concat([VALID_SQLITE_HEADER, Buffer.alloc(100, 0)])
    await fs.writeFile(dbPath, dbBuffer)

    // Create service
    const getDbBuffer = async () => {
      return fs.readFile(dbPath)
    }

    service = new BackupService(dbPath, getDbBuffer, {
      enabled: false, // Disable scheduled backups for tests
      schedule: 'manual',
      retentionCount: 3,
      backupDir,
    })
  })

  afterEach(async () => {
    // Cleanup
    service?.shutdown()
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('initialization', () => {
    it('should initialize and create backup directory', async () => {
      await service.initialize()

      const dirExists = await fs.stat(backupDir).catch(() => null)
      expect(dirExists).toBeTruthy()
    })

    it('should use default config when not provided', () => {
      const getDbBuffer = async () => Buffer.from('test')
      const defaultService = new BackupService(dbPath, getDbBuffer)

      const config = defaultService.getConfig()
      expect(config.enabled).toBe(true)
      expect(config.schedule).toBe('daily')
      expect(config.retentionCount).toBe(5)
    })
  })

  describe('createBackup', () => {
    it('should create a backup successfully', async () => {
      await service.initialize()

      const result = await service.createBackup()

      expect(result.success).toBe(true)
      expect(result.backup).toBeDefined()
      expect(result.backup?.filename).toMatch(/^backup-.*\.db$/)
      expect(result.backup?.size).toBeGreaterThan(0)
      expect(result.backup?.integrity).toBe('valid')
    })

    it('should create backup file in backup directory', async () => {
      await service.initialize()

      const result = await service.createBackup()
      expect(result.success).toBe(true)

      const files = await fs.readdir(backupDir)
      expect(files.some((f) => f.startsWith('backup-') && f.endsWith('.db'))).toBe(true)
    })

    it('should return error when database read fails', async () => {
      // Create service with failing getDbBuffer
      const failingService = new BackupService(
        dbPath,
        async () => {
          throw new Error('Read failed')
        },
        { backupDir },
      )

      await failingService.initialize()
      const result = await failingService.createBackup()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Read failed')
    })
  })

  describe('listBackups', () => {
    it('should list backups sorted by date (newest first)', async () => {
      await service.initialize()

      // Create multiple backups
      await service.createBackup()
      await new Promise((r) => setTimeout(r, 10)) // Small delay
      await service.createBackup()
      await new Promise((r) => setTimeout(r, 10))
      await service.createBackup()

      const backups = await service.listBackups()

      expect(backups.length).toBe(3)
      // Verify sorted by date (newest first)
      expect(backups[0].createdAt.getTime()).toBeGreaterThanOrEqual(backups[1].createdAt.getTime())
      expect(backups[1].createdAt.getTime()).toBeGreaterThanOrEqual(backups[2].createdAt.getTime())
    })

    it('should return empty array when no backups exist', async () => {
      await service.initialize()

      const backups = await service.listBackups()
      expect(backups).toEqual([])
    })

    it('should only list .db files starting with backup-', async () => {
      await service.initialize()

      // Create a backup
      await service.createBackup()

      // Create a non-backup file
      await fs.writeFile(path.join(backupDir, 'other.db'), 'test')
      await fs.writeFile(path.join(backupDir, 'backup-readme.txt'), 'test')

      const backups = await service.listBackups()
      expect(backups.length).toBe(1)
    })
  })

  describe('restoreBackup', () => {
    it('should restore from a valid backup', async () => {
      await service.initialize()

      // Create backup
      const createResult = await service.createBackup()
      expect(createResult.success).toBe(true)

      // Modify the database
      await fs.writeFile(dbPath, Buffer.from('modified'))

      // Restore
      const restoreResult = await service.restoreBackup(createResult.backup!.id)

      expect(restoreResult.success).toBe(true)

      // Verify restored content
      const restoredContent = await fs.readFile(dbPath)
      expect(restoredContent.slice(0, 16).toString()).toBe(VALID_SQLITE_HEADER.slice(0, 16).toString())
    })

    it('should return error for non-existent backup', async () => {
      await service.initialize()

      const result = await service.restoreBackup('non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should create pre-restore backup of current database', async () => {
      await service.initialize()

      // Create backup
      const createResult = await service.createBackup()

      // Restore
      await service.restoreBackup(createResult.backup!.id)

      // Check for pre-restore backup file
      const dbDir = path.dirname(dbPath)
      const files = await fs.readdir(dbDir)
      expect(files.some((f) => f.includes('pre-restore'))).toBe(true)
    })
  })

  describe('deleteBackup', () => {
    it('should delete a backup successfully', async () => {
      await service.initialize()

      // Create backup
      const createResult = await service.createBackup()
      expect(createResult.success).toBe(true)

      // Delete it
      const deleteResult = await service.deleteBackup(createResult.backup!.id)
      expect(deleteResult.success).toBe(true)

      // Verify it's gone
      const backups = await service.listBackups()
      expect(backups.find((b) => b.id === createResult.backup!.id)).toBeUndefined()
    })

    it('should return error for non-existent backup', async () => {
      await service.initialize()

      const result = await service.deleteBackup('non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('verifyBackupIntegrity', () => {
    it('should return valid for file with SQLite header', async () => {
      await service.initialize()

      const backupPath = path.join(backupDir, 'test-valid.db')
      await fs.writeFile(backupPath, Buffer.concat([VALID_SQLITE_HEADER, Buffer.alloc(100, 0)]))

      const result = await service.verifyBackupIntegrity(backupPath)
      expect(result).toBe('valid')
    })

    it('should return invalid for file without SQLite header', async () => {
      await service.initialize()

      const backupPath = path.join(backupDir, 'test-invalid.db')
      await fs.writeFile(backupPath, INVALID_BUFFER)

      const result = await service.verifyBackupIntegrity(backupPath)
      expect(result).toBe('invalid')
    })

    it('should return invalid for empty file', async () => {
      await service.initialize()

      const backupPath = path.join(backupDir, 'test-empty.db')
      await fs.writeFile(backupPath, Buffer.alloc(0))

      const result = await service.verifyBackupIntegrity(backupPath)
      expect(result).toBe('invalid')
    })

    it('should return invalid for non-existent file', async () => {
      await service.initialize()

      const result = await service.verifyBackupIntegrity('/non/existent/path.db')
      expect(result).toBe('invalid')
    })
  })

  describe('retention policy', () => {
    it('should delete old backups when exceeding retention count', async () => {
      const getDbBuffer = async () => fs.readFile(dbPath)
      const retentionService = new BackupService(dbPath, getDbBuffer, {
        enabled: false,
        schedule: 'manual',
        retentionCount: 2,
        backupDir,
      })

      await retentionService.initialize()

      // Create 4 backups (retention is 2)
      await retentionService.createBackup()
      await new Promise((r) => setTimeout(r, 10))
      await retentionService.createBackup()
      await new Promise((r) => setTimeout(r, 10))
      await retentionService.createBackup()
      await new Promise((r) => setTimeout(r, 10))
      await retentionService.createBackup()

      const backups = await retentionService.listBackups()

      // Should only have 2 backups (newest ones)
      expect(backups.length).toBe(2)

      retentionService.shutdown()
    })
  })

  describe('configuration', () => {
    it('should update configuration', () => {
      service.updateConfig({ retentionCount: 10 })
      const config = service.getConfig()

      expect(config.retentionCount).toBe(10)
    })

    it('should return a copy of configuration', () => {
      const config1 = service.getConfig()
      const config2 = service.getConfig()

      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('statistics', () => {
    it('should return backup statistics', async () => {
      await service.initialize()

      // Create some backups
      await service.createBackup()
      await service.createBackup()

      const stats = await service.getStats()

      expect(stats.totalBackups).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)
      expect(stats.oldestBackup).toBeInstanceOf(Date)
      expect(stats.newestBackup).toBeInstanceOf(Date)
    })

    it('should return zero stats when no backups', async () => {
      await service.initialize()

      const stats = await service.getStats()

      expect(stats.totalBackups).toBe(0)
      expect(stats.totalSize).toBe(0)
      expect(stats.oldestBackup).toBeUndefined()
      expect(stats.newestBackup).toBeUndefined()
    })
  })

  describe('shutdown', () => {
    it('should stop scheduled backups on shutdown', () => {
      service.shutdown()
      // No error should be thrown
    })
  })
})

describe('BackupService singleton', () => {
  it('should create and retrieve singleton instance', () => {
    const getDbBuffer = async () => Buffer.from('test')
    const service = initializeBackupService('/test/path.db', getDbBuffer)

    expect(service).toBeInstanceOf(BackupService)
    expect(getBackupService()).toBe(service)

    // Cleanup
    service.shutdown()
  })

  it('should replace existing instance when initializing again', () => {
    const getDbBuffer = async () => Buffer.from('test')
    const service1 = initializeBackupService('/test/path1.db', getDbBuffer)
    const service2 = initializeBackupService('/test/path2.db', getDbBuffer)

    expect(getBackupService()).toBe(service2)
    expect(getBackupService()).not.toBe(service1)

    // Cleanup
    service2.shutdown()
  })
})
