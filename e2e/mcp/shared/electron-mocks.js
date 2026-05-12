(function() {
    // Mock IPC handlers
    const mockHandlers = {
      ping: async () => 'pong',
      'app-version': async () => '2.0.0',
      'app-platform': async () => 'win32',
      'open-external': async (_, url) => {
        console.log('Opening external URL:', url)
        return true
      },
      // NVD mock handlers
      'nvd:search': async (_channel, params) => {
        const query = (params?.query || params?.keyword || '').toString().toLowerCase()
        const mockCves =
          (window.__mockCves) || []
        const filtered = query
          ? mockCves.filter(
              (c) =>
                (c.id).toLowerCase().includes(query) ||
                (c.description).toLowerCase().includes(query),
            )
          : mockCves
        return {
          success: true,
          results: filtered.slice(0, (params?.limit) || 20),
          totalResults: filtered.length,
          startIndex: 0,
          resultsPerPage: Math.min(filtered.length, (params?.limit) || 20),
        }
      },
      'nvd:getCve': async (_channel, params) => {
        const cveId = (params?.id || params?.cveId || '').toString()
        const mockCves =
          (window.__mockCves) || []
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
      'osv:query': async (_channel, _params) => ({
        success: true,
        results: [],
        totalResults: 0,
      }),
      'osv:getVulnerability': async (_channel, _params) => ({
        success: false,
        error: 'Not found',
      }),
    }

    // Mock store data - backed by localStorage for persistence across reloads
    const STORE_KEY = '__mock_store__'
    const defaultStore = {
      'settings.theme': 'system',
      'settings.onboardingCompleted': true,
    }
    const mockStore = (() => {
      try {
        const saved = localStorage.getItem(STORE_KEY)
        if (saved) return { ...defaultStore, ...JSON.parse(saved) }
      } catch {
        // localStorage unavailable — use defaults
      }
      return { ...defaultStore }
    })()

    // Event listeners storage
    const eventListeners = new Map()

    // Helper to add event listener
    const addEventListener = (channel, callback) => {
      if (!eventListeners.has(channel)) {
        eventListeners.set(channel, new Set())
      }
      eventListeners.get(channel).add(callback)
      console.log(`[Mock] Added listener for '${channel}'`)
    }

    // Helper to emit event
    const emitEvent = (channel, ...args) => {
      const listeners = eventListeners.get(channel)
      if (listeners) {
        listeners.forEach((cb) => cb(...args))
        console.log(`[Mock] Emitted '${channel}' to ${listeners.size} listeners`)
      }
    }

    // Create mock electronAPI
    window.electronAPI = {
      // Generic invoke method
      invoke: async (channel, ...args) => {
        console.log(`[Mock] invoke('${channel}')`, args)
        if (mockHandlers[channel]) {
          return mockHandlers[channel](...args)
        }
        console.warn(`[Mock] Unhandled invoke: ${channel}`)
        return undefined
      },

      // Store methods - persisted to localStorage
      store: {
        get: async (key) => {
          console.log(`[Mock] store.get('${key}')`)
          return mockStore[key]
        },
        set: async (key, value) => {
          console.log(`[Mock] store.set('${key}', ${JSON.stringify(value)})`)
          mockStore[key] = value
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
        },
        delete: async (key) => {
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
        get: async (key) => {
          console.log(`[Mock] secureStorage.get('${key}')`)
          return null // No API keys in tests
        },
        set: async (key, _value) => {
          console.log(`[Mock] secureStorage.set('${key}')`)
          return true
        },
        delete: async (key) => {
          console.log(`[Mock] secureStorage.delete('${key}')`)
          return true
        },
        has: async (key) => {
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
        updateSyncConfig: async (config) => {
          const existing = mockStore['database.syncConfig'] || {}
          mockStore['database.syncConfig'] = { ...existing, ...config }
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
          return { success: true }
        },
        updateStorageConfig: async (config) => {
          mockStore['database.storageConfig'] = config
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
          return { success: true }
        },
        updatePerformanceConfig: async (config) => {
          mockStore['database.performanceConfig'] = config
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(mockStore))
          } catch {
            // localStorage quota exceeded — acceptable in tests
          }
          return { success: true }
        },
        cpeSearch: async (params) => ({
          success: true,
          results: [],
          totalCount: 0,
        }),
        reset: async () => ({ success: true }),
        rebuildIndexes: async () => ({ success: true }),
        sync: async () => ({ success: true }),
        onSyncProgress: (_callback) => () => {},
        onSyncComplete: (_callback) => () => {},
        onSyncError: (_callback) => () => {},
        getDetailedStats: async () => ({
          success: true,
          stats: {
            dbSize: 987000000,
            totalCves: 331567,
            totalCpes: 2500000,
            lastUpdate: '2025-01-15T00:00:00Z',
          },
        }),
        startDeltaSync: async (_force) => ({ success: true }),
        cancelSync: async () => ({ success: true }),
        search: async (params) => {
          const query = (params?.query || params?.keyword || '').toString().toLowerCase()
          const mockCves =
            (window.__mockCves) || []
          const filtered = query
            ? mockCves.filter(
                (c) =>
                  (c.id).toLowerCase().includes(query) ||
                  (c.description).toLowerCase().includes(query),
              )
            : mockCves
          return {
            success: true,
            results: filtered.slice(0, (params?.limit) || 20),
            totalResults: filtered.length,
          }
        },
        getCve: async (params) => {
          const cveId = (params?.id || params?.cveId || '').toString()
          const mockCves =
            (window.__mockCves) || []
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
      onMenuAction: (callback) => addEventListener('menu-action', callback),
      onUpdateAvailable: (callback) => addEventListener('update-available', callback),
      onProgress: (callback) => addEventListener('progress', callback),
      onNvdSyncProgress: (callback) => addEventListener('nvd-sync-progress', callback),
      onNvdSyncComplete: (callback) => addEventListener('nvd-sync-complete', callback),

      // Remove listeners
      removeAllListeners: (channel) => {
        eventListeners.delete(channel)
        console.log(`[Mock] Removed all listeners for '${channel}'`)
      },

      // Expose emit for testing
      _emitEvent: emitEvent,
    }

    // Expose mock CVE data injection point for tests
    window.__mockCves = []

    console.log('[Mock] Electron API mock installed')
})()
