import { Router } from 'express'
import { getBackupService } from '../services/BackupService.js'
import { closeDatabase, initializeDatabase } from '../database/initialize.js'
import { broadcast } from '../websocket.js'
import type { BackupConfig, BackupResult } from '../services/BackupService.js'
import type {
  ListBackupsResponse,
  GetBackupStatsResponse,
  GetBackupConfigResponse,
  VerifyBackupResponse,
} from '../types/backup.js'

const router = Router()

router.post('/initialize', async (_req, res) => {
  try {
    const service = getBackupService()
    if (service) {
      await service.initialize()
    }
    res.json({ success: true })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize backup service',
    })
  }
})

router.post('/shutdown', async (_req, res) => {
  try {
    const service = getBackupService()
    if (service) {
      service.shutdown()
    }
    res.json({ success: true })
  } catch {
    res.json({ success: false })
  }
})

router.post('/create', async (_req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      res.json({ success: false, error: 'Backup service not initialized' })
      return
    }

    const result = (await service.createBackup()) as BackupResult
    broadcast('backup-created', result)
    res.json(result)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create backup',
    })
  }
})

router.get('/list', async (_req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      res.json({ success: false, backups: [], error: 'Backup service not initialized' })
      return
    }

    const backups = await service.listBackups()
    const response: ListBackupsResponse = { success: true, backups }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      backups: [],
      error: error instanceof Error ? error.message : 'Failed to list backups',
    })
  }
})

router.post('/restore', async (req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      res.json({ success: false, error: 'Backup service not initialized' })
      return
    }

    const backupId = req.body.backupId as string

    // Close the live DB connection (and the services that share it) before the restore
    // overwrites the file on disk, then rebuild everything against the restored file.
    // Writing the DB file under an open connection risks a Windows file-lock failure and
    // leaves the app's connections pointing at stale/torn state.
    // Close the live DB, restore, then ALWAYS rebuild against the (restored or original)
    // file. Capture any close/restore failure so a later reinit failure can't mask it (a
    // throw in a bare `finally` discards the in-flight exception), and so a failed close
    // still triggers a reinit rather than leaving the DB permanently closed.
    let restoreError: unknown
    let result: BackupResult | undefined
    try {
      await closeDatabase()
      result = (await service.restoreBackup(backupId)) as BackupResult
    } catch (error) {
      restoreError = error
    }

    try {
      await initializeDatabase()
    } catch (reinitError) {
      throw restoreError ?? reinitError
    }

    if (restoreError) throw restoreError
    if (!result) throw new Error('Restore returned no result')

    broadcast('backup-restored', result)
    res.json(result)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore backup',
    })
  }
})

router.post('/delete', async (req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      res.json({ success: false, error: 'Backup service not initialized' })
      return
    }

    const backupId = req.body.backupId as string
    const result = (await service.deleteBackup(backupId)) as BackupResult
    broadcast('backup-deleted', { backupId, result })
    res.json(result)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete backup',
    })
  }
})

router.post('/verify', async (req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      const response: VerifyBackupResponse = {
        success: false,
        integrity: 'unknown',
        error: 'Backup service not initialized',
      }
      res.json(response)
      return
    }

    // Accept either field. verifyBackup resolves a backupId to its file (like /restore and
    // /delete) and falls back to treating the value as a path.
    const backupIdOrPath = (req.body.backupId ?? req.body.backupPath) as string
    const integrity = await service.verifyBackup(backupIdOrPath)
    const response: VerifyBackupResponse = { success: true, integrity }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      integrity: 'unknown',
      error: error instanceof Error ? error.message : 'Failed to verify backup',
    })
  }
})

router.get('/config', async (_req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      const response: GetBackupConfigResponse = {
        success: true,
        config: { enabled: true, schedule: 'daily', retentionCount: 5 },
      }
      res.json(response)
      return
    }

    const config = service.getConfig()
    const response: GetBackupConfigResponse = { success: true, config }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get backup config',
    })
  }
})

router.put('/config', async (req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      res.json({ success: false, error: 'Backup service not initialized' })
      return
    }

    const config = req.body as Partial<BackupConfig>
    service.updateConfig(config)
    broadcast('backup-config-updated', config)
    res.json({ success: true })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update backup config',
    })
  }
})

router.get('/stats', async (_req, res) => {
  try {
    const service = getBackupService()
    if (!service) {
      const response: GetBackupStatsResponse = {
        success: false,
        stats: { totalBackups: 0, totalSize: 0 },
        error: 'Backup service not initialized',
      }
      res.json(response)
      return
    }

    const stats = await service.getStats()
    const response: GetBackupStatsResponse = { success: true, stats }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      stats: { totalBackups: 0, totalSize: 0 },
      error: error instanceof Error ? error.message : 'Failed to get backup stats',
    })
  }
})

export { router as backupRoutes }
