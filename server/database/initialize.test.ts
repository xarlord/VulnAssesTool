import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { config, initializePaths } from '../config'
import { getEpssService, resetEpssService } from '../services/intelligence/EpssService'
import { getKevService, resetKevService } from '../services/intelligence/KevService'

// Regression guard for a production wiring bug. initialize.ts primes the intelligence singletons at
// startup so the routes — which reach them via the no-arg getKevService()/getEpssService() — work.
// The EPSS priming was originally missing, so every /api/intelligence/epss/* call threw
// "EpssService not initialized" in production. The intelligence route tests could not catch it
// because they prime both singletons themselves; this test drives the REAL initializeDatabase() and
// asserts the no-arg getters resolve afterwards. WHY it can fail on regression: remove the
// getEpssService(rawDb) line from initialize.ts and the EPSS assertion throws again.

let dataDir: string
let closeDatabase: () => Promise<void>

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'vat-init-'))
  config.DATA_DIR = dataDir
  config.NODE_ENV = 'development'
  // config-derived paths (DB_PATH, BACKUP_DIR, …) are recomputed from DATA_DIR here, before the
  // module that reads them is imported.
  initializePaths()

  // KevService.initialize() fetches the CISA KEV feed fire-and-forget; keep the test fully offline.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in test'))),
  )

  const initModule = await import('./initialize.js')
  closeDatabase = initModule.closeDatabase
  await initModule.initializeDatabase()
})

afterAll(async () => {
  if (closeDatabase) await closeDatabase()
  resetEpssService()
  resetKevService()
  vi.unstubAllGlobals()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('initializeDatabase — intelligence service wiring', () => {
  it('primes the EPSS singleton so the routes’ no-arg getEpssService() resolves', () => {
    // Before the fix this threw "EpssService not initialized. Call getEpssService(db) first."
    expect(() => getEpssService()).not.toThrow()
  })

  it('primes the KEV singleton so the routes’ no-arg getKevService() resolves', () => {
    expect(() => getKevService()).not.toThrow()
  })
})
