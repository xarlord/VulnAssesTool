/**
 * Platform Abstraction Layer
 *
 * Provides a singleton PlatformAPI that abstracts Electron IPC.
 * Components import getPlatform() instead of reaching for window.electronAPI.
 *
 * Usage:
 *   import { getPlatform } from '@/lib/platform'
 *   const result = await getPlatform().database.search(request)
 *
 * Initialization (called once in main.tsx):
 *   import { initPlatform } from '@/lib/platform'
 *   initPlatform()
 */

import type { PlatformAPI } from './types'
import { createElectronAdapter } from './electronAdapter'
import { createBrowserAdapter } from './browserAdapter'

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

/**
 * Initialize the platform adapter.
 * Called once at app startup before any component renders.
 */
export function initPlatform(): PlatformAPI {
  if (platform) return platform

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI
  platform = isElectron ? createElectronAdapter() : createBrowserAdapter()

  return platform
}

/**
 * Get the current platform adapter.
 * Automatically initializes if not yet called.
 */
export function getPlatform(): PlatformAPI {
  if (!platform) return initPlatform()
  return platform
}

/**
 * Check if running inside Electron
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI
}
