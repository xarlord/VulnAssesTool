/**
 * Integration-test harness for the Express API (NFR-08).
 *
 * Builds the real app via createApp() so supertest exercises routing + middleware + handlers,
 * but points DATA_DIR at a throwaway temp directory and runs in dev mode so auth is skipped and
 * nothing touches the developer's real ~/.vulnassesstool data.
 *
 * IMPORTANT: several route modules capture config-derived paths (e.g. PROJECTS_DIR) at import
 * time, so DATA_DIR must be set BEFORE app.js is imported. Call createTestApp() from beforeAll
 * (each test file gets a fresh module registry under Vitest isolation) and it dynamically
 * imports app.js only after config is configured.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Express } from 'express'
import { config, initializePaths } from '../config.js'

export interface TestAppContext {
  app: Express
  dataDir: string
}

export async function createTestApp(): Promise<TestAppContext> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'vat-itest-'))
  config.DATA_DIR = dataDir
  config.NODE_ENV = 'development' // isDev() -> auth middleware is skipped
  initializePaths()

  const { createApp } = await import('../app.js')
  return { app: createApp(), dataDir }
}
