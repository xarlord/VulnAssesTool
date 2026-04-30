import { expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.location.href for axios compatibility
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
  },
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
} as any

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any

// Console methods
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
}

// Mock window.electronAPI for tests that use Electron APIs
global.window = {
  ...global.window,
  electronAPI: {
    database: {
      getStats: vi.fn(() =>
        Promise.resolve({ success: true, stats: { totalCves: 0, lastUpdate: null, dbSize: 0, version: 1 } }),
      ),
      getSyncStatus: vi.fn(() =>
        Promise.resolve({
          success: true,
          status: { isSyncing: false, progress: 0, total: 0, currentFile: null, error: null, lastSync: null },
        }),
      ),
      startSync: vi.fn(() => Promise.resolve({ success: true })),
      onSyncProgress: vi.fn(() => vi.fn()),
      onSyncComplete: vi.fn(() => vi.fn()),
      onSyncError: vi.fn(() => vi.fn()),
      getMetadata: vi.fn(),
    },
  },
  // Add window.addEventListener mock
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as any

// Mock axios to prevent window.location.href access issues
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  AxiosError: class AxiosError extends Error {
    constructor(message: string, code?: string) {
      super(message)
      this.name = 'AxiosError'
      ;(this as any).code = code
    }
  },
}))

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
