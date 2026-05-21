/**
 * Platform Abstraction Layer
 *
 * Provides a singleton PlatformAPI backed by the Express server via HTTP+WebSocket.
 * Components import getPlatform() instead of making direct API calls.
 *
 * Usage:
 *   import { getPlatform } from '@/lib/platform'
 *   const result = await getPlatform().database.search(request)
 *
 * Initialization (called once in main.tsx):
 *   import { initPlatform } from '@/lib/platform'
 *   await initPlatform()
 */

import type { PlatformAPI } from './types'
import { createServerAdapter } from './serverAdapter'

export type {
  PlatformAPI,
  DatabaseAPI,
  SecureStorageAPI,
  BackupAPI,
  IntelligenceAPI,
  ContainerPlatformAPI,
  UpdaterPlatformAPI,
} from './types'

let platform: PlatformAPI | null = null
let platformInit: Promise<PlatformAPI> | null = null

export function initPlatform(): Promise<PlatformAPI> {
  if (platform) return Promise.resolve(platform)
  if (platformInit) return platformInit

  platformInit = createServerAdapter().then((p) => {
    platform = p
    return p
  })

  return platformInit
}

export function getPlatform(): PlatformAPI {
  if (!platform) throw new Error('Platform not initialized. Call await initPlatform() first.')
  return platform
}

export function isElectron(): boolean {
  return false
}
