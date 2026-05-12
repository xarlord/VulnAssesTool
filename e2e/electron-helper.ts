import { test as base, expect, Page } from '@playwright/test'
import { E2E_BASE_URL } from './shared-helpers'

// Server port (must match global-setup.ts)
const serverPort = parseInt(E2E_BASE_URL.split(':').pop() || '4173')

// Shared page instance - reused across tests
let _page: Page | null = null

/**
 * Mock Electron APIs in the browser
 * This allows us to test the UI without actually running Electron
 */
async function mockElectronAPIs(page: Page) {
  // Mock the electronAPI exposed by preload script
  await page.addInitScript(() => {
    // Mock IPC handlers
    const mockHandlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {
      ping: async () => 'pong',
      'app-version': async () => '2.0.0',
      'app-platform': async () => 'win32',
      'open-external': async (_: unknown, url: string) => {
        console.log('Opening external URL:', url)
        return true
      },
      // NVD mock handlers
      'nvd:search': async (_channel: unknown, params: Record<string, unknown>) => {
        const query = (params?.query || params?.keyword || '').toString().toLowerCase()
        const mockCves =
          ((window as unknown as Record<string, unknown>).__mockCves as Array<Record<string, unknown>>) || []
        const filtered = query
          ? mockCves.filter(
              (c) =>
                (c.id as string).toLowerCase().includes(query) ||
                (c.description as string).toLowerCase().includes(query),
            )
          : mockCves
        return {
          success: true,
          results: filtered.slice(0, (params?.limit as number) || 20),
          totalResults: filtered.length,
          startIndex: 0,
          resultsPerPage: Math.min(filtered.length, (params?.limit as number) || 20),
        }
      },
      'nvd:getCve': async (_channel: unknown, params: Record<string, unknown>) => {
        const cveId = (params?.id || params?.cveId || '').toString()
        const mockCves =
          ((window as unknown as Record<string, unknown>).__mockCves as Array<Record<string, unknown>>) || []
        const cve = mockCves.find((c) => c.id === cveId)
        return cve ? { success: true, cve } : { success: false, error: 'CVE not found' }
      },
      'nvd:getStats': async () => ({
        success: true,
        stats: {
          dbSize: 987000000,
          totalCves: 331567,
          totalCpes: 2500000,
          lastUpdate: '2025-01-15T00:00:00Z',
        },
      }),
      // OSV mock handlers
      'osv:query': async (_channel: unknown, _params: unknown) => ({
        success: true,
        results: [],
        totalResults: 0,
      }),
      'osv:getVulnerability': async (_channel: unknown, _params: unknown) => ({
        success: false,
        error: 'Not found',
      }),
    }

    // Mock store data - backed by localStorage for persistence across reloads
    const STORE_KEY = '__mock_store__'
    const defaultStore: Record<string, unknown> = {
      'settings.theme': 'system',
      'settings.onboardingCompleted': true,
    }
    const mockStore: Record<string, unknown> = (() => {
      try {
        const saved = localStorage.getItem(STORE_KEY)
        if (saved) return { ...defaultStore, ...JSON.parse(saved) }
      } catch {
        // localStorage unavailable — use defaults
      }
      return { ...defaultStore }
    })()

    // Event listeners storage
    const eventListeners: Map<string, Set<(...args: unknown[]) => void>> = new Map()

    // Helper to add event listener
    const addEventListener = (channel: string, callback: (...args: unknown[]) => void) => {
      if (!eventListeners.has(channel)) {
        eventListeners.set(channel, new Set())
      }
      eventListeners.get(channel)!.add(callback)
      console.log(`[Mock] Added listener for '${channel}'`)
    }

    // Helper to emit event
    const emitEvent = (channel: string, ...args: unknown[]) => {
      const listeners = eventListeners.get(channel)
      if (listeners) {
        listeners.forEach((cb) => cb(...args))
        console.log(`[Mock] Emitted '${channel}' to ${listeners.size} listeners`)
      }
    }

    // Create mock electronAPI
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      // Generic invoke method
      invoke: async (channel: string, ...args: unknown[]) => {
        console.log(`[Mock] invoke('${channel}')`, args)
        if (mockHandlers[channel]) {
          return mockHandlers[channel](...args)
        }
        console.warn(`[Mock] Unhandled invoke: ${channel}`)
        return undefined
      },

      // Store methods - persisted to localStorage
      store: {
        get: async (key: string) => {
          console.log(`[Mock] store.get('${key}')`)
          return mockStore[key]
        },
        set: async (key: string, value: unknown) => {
          console.log(`[Mock] store.set('${key}', ${JSON.stringify(value)})`)
          mockStore[key] = value
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
        },
        delete: async (key: string) => {
          console.log(`[Mock] store.delete('${key}')`)
          delete mockStore[key]
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
        },
      },

      // Secure storage methods
      secureStorage: {
        get: async (key: string) => {
          console.log(`[Mock] secureStorage.get('${key}')`)
          return null // No API keys in tests
        },
        set: async (key: string, _value: string) => {
          console.log(`[Mock] secureStorage.set('${key}')`)
          return true
        },
        delete: async (key: string) => {
          console.log(`[Mock] secureStorage.delete('${key}')`)
          return true
        },
        has: async (key: string) => {
          console.log(`[Mock] secureStorage.has('${key}')`)
          return false
        },
      },

      // Database status
      getDatabaseStatus: async () => ({
        exists: true,
        path: 'C:\\Users\\test\\AppData\\Roaming\\vuln-assess-tool\\nvd-data.db',
        size: 32768,
        lastUpdated: new Date().toISOString(),
      }),

      // Database methods - persisted to mockStore for cross-reload persistence
      database: {
        getStats: async () => ({
          success: true,
          stats: {
            dbSize: mockStore['database.size'] || 32768,
            totalCves: mockStore['database.cveCount'] || 0,
            totalCpes: mockStore['database.cpeCount'] || 0,
            lastUpdate: mockStore['database.lastSync'] || new Date().toISOString(),
          },
        }),
        getSyncConfig: async () => ({
          success: true,
          config: mockStore['database.syncConfig'] || { syncInterval: 'daily' },
        }),
        updateSyncConfig: async (config: { syncInterval?: string }) => {
          const existing = (mockStore['database.syncConfig'] as Record<string, unknown>) || {}
          mockStore['database.syncConfig'] = { ...existing, ...config }
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
          return { success: true }
        },
        updateStorageConfig: async (config: unknown) => {
          mockStore['database.storageConfig'] = config
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
          return { success: true }
        },
        updatePerformanceConfig: async (config: unknown) => {
          mockStore['database.performanceConfig'] = config
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
          return { success: true }
        },
        cpeSearch: async (params: { query: string; limit: number }) => ({
          success: true,
          results: [],
          totalCount: 0,
        }),
        reset: async () => ({ success: true }),
        rebuildIndexes: async () => ({ success: true }),
        sync: async () => ({ success: true }),
        onSyncProgress: async (_callback: (...args: unknown[]) => void) => {},
        search: async (params: Record<string, unknown>) => {
          const query = (params?.query || params?.keyword || '').toString().toLowerCase()
          const mockCves =
            ((window as unknown as Record<string, unknown>).__mockCves as Array<Record<string, unknown>>) || []
          const filtered = query
            ? mockCves.filter(
                (c) =>
                  (c.id as string).toLowerCase().includes(query) ||
                  (c.description as string).toLowerCase().includes(query),
              )
            : mockCves
          return {
            success: true,
            results: filtered.slice(0, (params?.limit as number) || 20),
            totalResults: filtered.length,
          }
        },
        getCve: async (params: Record<string, unknown>) => {
          const cveId = (params?.id || params?.cveId || '').toString()
          const mockCves =
            ((window as unknown as Record<string, unknown>).__mockCves as Array<Record<string, unknown>>) || []
          const cve = mockCves.find((c) => c.id === cveId)
          return cve ? { success: true, cve } : { success: false, error: 'CVE not found' }
        },
        getStats: async () => ({
          success: true,
          stats: {
            dbSize: 987000000,
            totalCves: 331567,
            totalCpes: 2500000,
            lastUpdate: '2025-01-15T00:00:00Z',
          },
        }),
      },

      // Platform info
      platform: 'win32',
      appVersion: '2.0.0',

      // Event listeners - use addEventListener helper
      onMenuAction: (callback: (action: string) => void) => addEventListener('menu-action', callback),
      onUpdateAvailable: (callback: () => void) => addEventListener('update-available', callback),
      onProgress: (callback: () => void) => addEventListener('progress', callback),
      onNvdSyncProgress: (callback: () => void) => addEventListener('nvd-sync-progress', callback),
      onNvdSyncComplete: (callback: () => void) => addEventListener('nvd-sync-complete', callback),

      // Remove listeners
      removeAllListeners: (channel: string) => {
        eventListeners.delete(channel)
        console.log(`[Mock] Removed all listeners for '${channel}'`)
      },

      // Expose emit for testing
      _emitEvent: emitEvent,
    }

    // Expose mock CVE data injection point for tests
    ;(window as unknown as Record<string, unknown>).__mockCves = []

    console.log('[Mock] Electron API mock installed')
  })
}

/**
 * Get or create a page from the browser
 */
async function getPage(): Promise<Page> {
  // If we have a cached page, check if it's still valid
  if (_page) {
    try {
      await _page.evaluate(() => true) // Simple health check
      return _page
    } catch {
      // Page is no longer valid
      _page = null
    }
  }

  // This shouldn't happen with proper fixtures, but just in case
  throw new Error('Page not initialized. Use the page fixture from test.extend().')
}

/**
 * Inject mock CVE data into the browser for NVD search tests
 */
export async function injectMockCves(page: Page, cves: Array<Record<string, unknown>>): Promise<void> {
  await page.evaluate((data) => {
    ;(window as unknown as Record<string, unknown>).__mockCves = data
  }, cves)
}

/**
 * Browser-based test fixtures for E2E testing
 *
 * Uses browser (Chromium) instead of Electron to avoid Playwright/Electron compatibility issues.
 * Electron APIs are mocked via addInitScript.
 */
export const test = base.extend({
  // Page fixture with Electron API mocks
  page: async ({ page }, use) => {
    // Install Electron API mocks before navigating
    await mockElectronAPIs(page)

    // Navigate to the preview server
    await page.goto(`http://127.0.0.1:${serverPort}/`, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    })

    // Wait for React to render
    await page.waitForSelector('#root:not(:empty)', { timeout: 15000 }).catch(() => {
      console.log('Warning: #root may be empty')
    })

    // Give React time to fully render
    await page.waitForTimeout(500)

    _page = page
    await use(page)
    // Don't close here - browser context handles cleanup
  },
})

/**
 * Reset app state between tests
 */
export async function resetAppState(page: Page) {
  try {
    // Clear storage
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
      window.dispatchEvent(new Event('storage'))
    })

    // Small delay for storage events to propagate
    await page.waitForTimeout(100)

    // Navigate to root (fresh start)
    await page.goto(`http://127.0.0.1:${serverPort}/`, { timeout: 15000, waitUntil: 'domcontentloaded' })

    // Wait for React to re-render
    await page.waitForTimeout(300)

    // Wait for the page to be interactive
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Ignore networkidle timeout - page may still be loading non-critical resources
    })
  } catch (error) {
    console.log('Warning: Error resetting app state:', error)
    _page = null
  }
}

/**
 * No-op cleanup for browser-based testing
 */
export async function cleanupElectron() {
  _page = null
}

/**
 * No-op relaunch for browser-based testing
 */
export async function relaunchElectron() {
  _page = null
}

export { expect }
