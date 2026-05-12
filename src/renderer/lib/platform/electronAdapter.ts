/**
 * Electron Platform Adapter
 *
 * Delegates all PlatformAPI calls to window.electronAPI (the preload bridge).
 * This is the production adapter used when running inside Electron.
 */

import type { PlatformAPI } from './types'

export function createElectronAdapter(): PlatformAPI {
  const api = window.electronAPI
  if (!api) throw new Error('window.electronAPI is not available')

  return {
    // Top-level
    ping: () => api.ping(),
    getAppVersion: () => api.getAppVersion(),
    getPlatform: () => api.getPlatform(),
    openExternal: (url) => api.openExternal(url),
    onThemeChange: (cb) => api.onThemeChange(cb),
    getSystemTheme: () => api.getSystemTheme(),
    onMenuAction: (cb) => api.onMenuAction(cb),
    generatePDF: (html) => api.generatePDF(html),

    // Namespaced — direct pass-through since the shapes match
    database: api.database,
    secureStorage: api.secureStorage,
    backup: api.backup,
    intelligence: api.intelligence,
    container: api.container,
    updater: api.updater,
  }
}
