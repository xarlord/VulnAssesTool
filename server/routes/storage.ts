import { Router } from 'express'
import {
  createApiKeyStorage,
  isSafeStorageAvailable,
  needsMigration,
  migratePlaintextKeys,
} from '../services/storage/index.js'
import {
  validateSetApiKeyRequest,
  validateGetApiKeyRequest,
  validateDeleteApiKeyRequest,
  validateHasApiKeyRequest,
  sanitizeErrorMessage,
} from '../database/ipcRequestValidator.js'
import type {
  SetApiKeyRequest,
  GetApiKeyRequest,
  DeleteApiKeyRequest,
  HasApiKeyRequest,
  IsAvailableResponse,
  SetApiKeyResponse,
  GetApiKeyResponse,
  DeleteApiKeyResponse,
  HasApiKeyResponse,
  NeedsMigrationResponse,
  MigrateKeysResponse,
  GetAllKeysResponse,
} from '../types/storage.js'

const router = Router()

router.get('/available', async (_req, res) => {
  try {
    const response: IsAvailableResponse = {
      success: true,
      isAvailable: isSafeStorageAvailable(),
    }
    res.json(response)
  } catch {
    res.json({ success: false, isAvailable: false })
  }
})

router.post('/keys/set', async (req, res) => {
  try {
    const validatedRequest = validateSetApiKeyRequest(req.body as SetApiKeyRequest)
    const storage = createApiKeyStorage(validatedRequest.keyType)
    const success = await storage.setApiKey(validatedRequest.apiKey)
    const response: SetApiKeyResponse = {
      success,
      error: success ? undefined : 'Failed to store API key securely',
    }
    res.json(response)
  } catch (error) {
    res.json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/keys/get', async (req, res) => {
  try {
    const validatedRequest = validateGetApiKeyRequest(req.body as GetApiKeyRequest)
    const storage = createApiKeyStorage(validatedRequest.keyType)
    const apiKey = await storage.getApiKey()
    const response: GetApiKeyResponse = { success: true, apiKey }
    res.json(response)
  } catch (error) {
    res.json({ success: false, apiKey: null, error: sanitizeErrorMessage(error) })
  }
})

router.post('/keys/delete', async (req, res) => {
  try {
    const validatedRequest = validateDeleteApiKeyRequest(req.body as DeleteApiKeyRequest)
    const storage = createApiKeyStorage(validatedRequest.keyType)
    const success = await storage.deleteApiKey()
    const response: DeleteApiKeyResponse = {
      success,
      error: success ? undefined : 'Failed to delete API key',
    }
    res.json(response)
  } catch (error) {
    res.json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/keys/has', async (req, res) => {
  try {
    const validatedRequest = validateHasApiKeyRequest(req.body as HasApiKeyRequest)
    const storage = createApiKeyStorage(validatedRequest.keyType)
    const hasKey = await storage.hasApiKey()
    const response: HasApiKeyResponse = { success: true, hasKey }
    res.json(response)
  } catch (error) {
    res.json({ success: false, hasKey: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/migration', async (_req, res) => {
  try {
    const needsMigrate = await needsMigration()
    const response: NeedsMigrationResponse = {
      success: true,
      needsMigration: needsMigrate,
    }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      needsMigration: false,
      error: error instanceof Error ? error.message : 'Failed to check migration status',
    })
  }
})

router.post('/migrate', async (_req, res) => {
  try {
    const result = await migratePlaintextKeys()
    const response: MigrateKeysResponse = {
      success: result.success,
      migrated: result.migrated,
      failed: result.failed,
    }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      migrated: [],
      failed: [],
      error: error instanceof Error ? error.message : 'Failed to migrate keys',
    })
  }
})

router.get('/keys/all', async (_req, res) => {
  try {
    const nvdStorage = createApiKeyStorage('nvd')
    const osvStorage = createApiKeyStorage('osv')
    const githubStorage = createApiKeyStorage('github')

    const keys = {
      nvd: await nvdStorage.getApiKey(),
      osv: await osvStorage.getApiKey(),
      github: await githubStorage.getApiKey(),
    }

    const response: GetAllKeysResponse = { success: true, keys }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      keys: { nvd: null, osv: null, github: null },
      error: error instanceof Error ? error.message : 'Failed to retrieve API keys',
    })
  }
})

export { router as storageRoutes }
