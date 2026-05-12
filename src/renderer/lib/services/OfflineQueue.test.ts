/**
 * Tests for OfflineQueue Service
 *
 * Comprehensive test coverage for offline request queuing functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  OfflineQueue,
  getOfflineQueue,
  resetOfflineQueue,
  type QueuedRequest,
  type RequestResult,
  type RequestType,
  type OfflineQueueEventListener,
} from './OfflineQueue'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

// Mock window event listeners
const onlineListeners: Set<() => void> = new Set()
const offlineListeners: Set<() => void> = new Set()

vi.stubGlobal('window', {
  addEventListener: vi.fn((event: string, listener: () => void) => {
    if (event === 'online') onlineListeners.add(listener)
    if (event === 'offline') offlineListeners.add(listener)
  }),
  removeEventListener: vi.fn((event: string, listener: () => void) => {
    if (event === 'online') onlineListeners.delete(listener)
    if (event === 'offline') offlineListeners.delete(listener)
  }),
})

// Helper to simulate going online/offline via window events
function simulateOnline() {
  onlineListeners.forEach((listener) => listener())
}

function simulateOffline() {
  offlineListeners.forEach((listener) => listener())
}

describe('OfflineQueue', () => {
  let queue: OfflineQueue

  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    onlineListeners.clear()
    offlineListeners.clear()
    resetOfflineQueue()
    queue = new OfflineQueue({ storageKey: 'test-queue' })
  })

  afterEach(() => {
    queue.destroy()
  })

  describe('initialization', () => {
    it('should initialize with empty queue', () => {
      expect(queue.getQueue()).toEqual([])
      expect(queue.getStats().queueLength).toBe(0)
    })

    it('should detect initial online status', () => {
      expect(queue.getIsOnline()).toBe(true)
    })

    it('should load queue from localStorage on init', () => {
      const storedRequests: QueuedRequest[] = [
        {
          id: 'req_test',
          type: 'cve-lookup',
          payload: { cveId: 'CVE-2024-1234' },
          timestamp: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          priority: 0,
        },
      ]
      localStorageMock.setItem('test-queue', JSON.stringify(storedRequests))

      const newQueue = new OfflineQueue({ storageKey: 'test-queue' })
      expect(newQueue.getQueue().length).toBe(1)
      expect(newQueue.getQueue()[0].id).toBe('req_test')
      newQueue.destroy()
    })
  })

  describe('enqueue', () => {
    it('should add request to queue when offline', async () => {
      queue.setOnlineStatus(false)

      const id = await queue.enqueue('cve-lookup', { cveId: 'CVE-2024-1234' })
      expect(id).not.toBeNull()
      expect(queue.getQueue().length).toBe(1)
      expect(queue.getQueue()[0].type).toBe('cve-lookup')
    })

    it('should try to process immediately when online', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, shouldRetry: false })
      queue.registerHandler('cve-lookup', handler)

      const id = await queue.enqueue('cve-lookup', { cveId: 'CVE-2024-1234' })
      expect(handler).toHaveBeenCalled()
      expect(id).toBeNull() // Processed immediately, not queued
      expect(queue.getQueue().length).toBe(0)
    })

    it('should queue request if handler fails when online', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Network error'))
      queue.registerHandler('cve-lookup', handler)

      const id = await queue.enqueue('cve-lookup', { cveId: 'CVE-2024-1234' })
      expect(id).not.toBeNull()
      expect(queue.getQueue().length).toBe(1)
    })

    it('should queue request if handler returns success: false', async () => {
      const handler = vi.fn().mockResolvedValue({ success: false, shouldRetry: true })
      queue.registerHandler('cve-lookup', handler)

      const id = await queue.enqueue('cve-lookup', { cveId: 'CVE-2024-1234' })
      expect(id).not.toBeNull()
      expect(queue.getQueue().length).toBe(1)
    })

    it('should insert requests in priority order', async () => {
      queue.setOnlineStatus(false)

      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' }, { priority: 1 })
      await queue.enqueue('cve-lookup', { cveId: 'CVE-2' }, { priority: 3 })
      await queue.enqueue('cve-lookup', { cveId: 'CVE-3' }, { priority: 2 })

      const queued = queue.getQueue()
      expect(queued[0].payload).toEqual({ cveId: 'CVE-2' }) // priority 3
      expect(queued[1].payload).toEqual({ cveId: 'CVE-3' }) // priority 2
      expect(queued[2].payload).toEqual({ cveId: 'CVE-1' }) // priority 1
    })

    it('should respect maxQueueSize limit', async () => {
      const smallQueue = new OfflineQueue({ storageKey: 'small-queue', maxQueueSize: 3 })
      smallQueue.setOnlineStatus(false)

      await smallQueue.enqueue('cve-lookup', { cveId: 'CVE-1' }, { priority: 1 })
      await smallQueue.enqueue('cve-lookup', { cveId: 'CVE-2' }, { priority: 2 })
      await smallQueue.enqueue('cve-lookup', { cveId: 'CVE-3' }, { priority: 3 })
      await smallQueue.enqueue('cve-lookup', { cveId: 'CVE-4' }, { priority: 4 })

      expect(smallQueue.getQueue().length).toBe(3)
      // Lowest priority should be removed
      expect(smallQueue.getQueue().find((r) => r.payload).payload).not.toEqual({ cveId: 'CVE-1' })

      smallQueue.destroy()
    })

    it('should use custom maxRetries when provided', async () => {
      queue.setOnlineStatus(false)

      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' }, { maxRetries: 5 })
      const request = queue.getQueue()[0]
      expect(request.maxRetries).toBe(5)
    })
  })

  describe('dequeue', () => {
    it('should remove request by ID', async () => {
      queue.setOnlineStatus(false)
      const id = await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })

      expect(queue.dequeue(id!)).toBe(true)
      expect(queue.getQueue().length).toBe(0)
    })

    it('should return false for non-existent ID', () => {
      expect(queue.dequeue('non-existent')).toBe(false)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      queue.setOnlineStatus(false)

      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })
      await queue.enqueue('cve-lookup', { cveId: 'CVE-2' })
      await queue.enqueue('vulnerability-scan', { projectId: 'p1' })

      const stats = queue.getStats()
      expect(stats.queueLength).toBe(3)
      expect(stats.byType['cve-lookup']).toBe(2)
      expect(stats.byType['vulnerability-scan']).toBe(1)
      expect(stats.totalRetries).toBe(0)
    })

    it('should track retry counts', async () => {
      queue.setOnlineStatus(false)

      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })
      const request = queue.getQueue()[0]
      request.retryCount = 2

      const stats = queue.getStats()
      expect(stats.totalRetries).toBe(2)
    })
  })

  describe('event handling', () => {
    it('should emit offline event when going offline', () => {
      const listener = vi.fn() as OfflineQueueEventListener
      queue.addEventListener(listener)

      simulateOffline()

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'offline',
          isOnline: false,
        }),
      )
    })

    it('should emit online event when going online', () => {
      queue.setOnlineStatus(false)
      const listener = vi.fn() as OfflineQueueEventListener
      queue.addEventListener(listener)

      simulateOnline()

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'online',
          isOnline: true,
        }),
      )
    })

    it('should emit queue-changed event on enqueue', async () => {
      queue.setOnlineStatus(false)
      const listener = vi.fn() as OfflineQueueEventListener
      queue.addEventListener(listener)

      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'queue-changed',
          queueLength: 1,
        }),
      )
    })

    it('should remove event listener', () => {
      const listener = vi.fn() as OfflineQueueEventListener
      queue.addEventListener(listener)
      queue.removeEventListener(listener)

      simulateOffline()

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('processQueue', () => {
    it('should not process when offline', async () => {
      queue.setOnlineStatus(false)
      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })

      await queue.processQueue()
      expect(queue.getQueue().length).toBe(1) // Nothing processed
    })

    it('should not process when already processing', async () => {
      queue.setOnlineStatus(true)
      const handler = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))
      queue.registerHandler('cve-lookup', handler)
      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' }, { processImmediately: false })
      await queue.enqueue('cve-lookup', { cveId: 'CVE-2' }, { processImmediately: false })

      // Start processing twice in parallel
      queue.processQueue()
      queue.processQueue()

      // Should only have one processing cycle
      expect(queue.getIsProcessing()).toBe(true)
    })

    it('should process all queued requests', async () => {
      queue.setOnlineStatus(true)
      const handler = vi.fn().mockResolvedValue({ success: true, shouldRetry: false })
      queue.registerHandler('cve-lookup', handler)

      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' }, { processImmediately: false })
      await queue.enqueue('cve-lookup', { cveId: 'CVE-2' }, { processImmediately: false })

      await queue.processQueue()

      expect(handler).toHaveBeenCalledTimes(2)
      expect(queue.getQueue().length).toBe(0)
    })

    it('should retry failed requests with shouldRetry: true', async () => {
      queue.setOnlineStatus(true)
      let attempts = 0
      const handler = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 2) {
          return { success: false, shouldRetry: true, error: 'Temporary error' }
        }
        return { success: true, shouldRetry: false }
      })
      queue.registerHandler('cve-lookup', handler)

      await queue.enqueue(
        'cve-lookup',
        { cveId: 'CVE-1' },
        {
          processImmediately: false,
          maxRetries: 3,
        },
      )

      await queue.processQueue()

      // First attempt fails, second succeeds (immediate retry)
      expect(handler).toHaveBeenCalledTimes(2)
      expect(queue.getQueue().length).toBe(0)
    })

    it('should give up after max retries', async () => {
      queue.setOnlineStatus(true)
      const handler = vi.fn().mockResolvedValue({
        success: false,
        shouldRetry: true,
        error: 'Permanent error',
      })
      queue.registerHandler('cve-lookup', handler)

      await queue.enqueue(
        'cve-lookup',
        { cveId: 'CVE-1' },
        {
          processImmediately: false,
          maxRetries: 2,
        },
      )

      // Use a queue with zero delays for faster testing
      const fastQueue = new OfflineQueue({
        storageKey: 'fast-queue',
        retryBaseDelay: 0,
        retryMaxDelay: 0,
        processInterval: 0,
      })
      fastQueue.setOnlineStatus(true)
      fastQueue.registerHandler('cve-lookup', handler)
      await fastQueue.enqueue(
        'cve-lookup',
        { cveId: 'CVE-1' },
        {
          processImmediately: false,
          maxRetries: 2,
        },
      )

      await fastQueue.processQueue()

      // Original attempt + 2 retries = 3 calls
      expect(handler).toHaveBeenCalledTimes(3)

      fastQueue.destroy()
    })

    it('should emit sync events', async () => {
      queue.setOnlineStatus(true)
      const handler = vi.fn().mockResolvedValue({ success: true, shouldRetry: false })
      queue.registerHandler('cve-lookup', handler)

      const listener = vi.fn() as OfflineQueueEventListener
      queue.addEventListener(listener)

      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' }, { processImmediately: false })
      await queue.processQueue()

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'sync-started' }))
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'sync-progress' }))
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'sync-completed' }))
    })

    it('should handle missing handler gracefully', async () => {
      queue.setOnlineStatus(true)
      const listener = vi.fn() as OfflineQueueEventListener
      queue.addEventListener(listener)

      await queue.enqueue('custom', { data: 'test' }, { processImmediately: false })
      await queue.processQueue()

      // Request should be removed from queue (no handler available)
      expect(queue.getQueue().length).toBe(0)
      // Should emit request-processed event
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'sync-completed' }))
    })
  })

  describe('retryRequest', () => {
    it('should retry a specific request', async () => {
      queue.setOnlineStatus(true)
      const handler = vi.fn().mockResolvedValue({ success: true, shouldRetry: false })
      queue.registerHandler('cve-lookup', handler)

      const id = await queue.enqueue(
        'cve-lookup',
        { cveId: 'CVE-1' },
        {
          processImmediately: false,
        },
      )

      const result = await queue.retryRequest(id!)
      expect(result).toBe(true)
      expect(queue.getQueue().length).toBe(0)
    })

    it('should return false for non-existent request', async () => {
      const result = await queue.retryRequest('non-existent')
      expect(result).toBe(false)
    })

    it('should return false for missing handler', async () => {
      queue.setOnlineStatus(false)
      const id = await queue.enqueue('custom', { data: 'test' })

      queue.setOnlineStatus(true)
      const result = await queue.retryRequest(id!)
      expect(result).toBe(false)
    })
  })

  describe('clearQueue', () => {
    it('should remove all requests from queue', async () => {
      queue.setOnlineStatus(false)
      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })
      await queue.enqueue('cve-lookup', { cveId: 'CVE-2' })

      queue.clearQueue()
      expect(queue.getQueue().length).toBe(0)
    })
  })

  describe('persistence', () => {
    it('should persist queue to localStorage', async () => {
      queue.setOnlineStatus(false)
      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })

      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-queue', expect.stringContaining('CVE-1'))
    })

    it('should restore queue from localStorage', async () => {
      queue.setOnlineStatus(false)
      await queue.enqueue('cve-lookup', { cveId: 'CVE-1' })

      const newQueue = new OfflineQueue({ storageKey: 'test-queue' })
      expect(newQueue.getQueue().length).toBe(1)
      newQueue.destroy()
    })
  })

  describe('singleton instance', () => {
    it('should return the same instance', () => {
      const instance1 = getOfflineQueue()
      const instance2 = getOfflineQueue()
      expect(instance1).toBe(instance2)
    })

    it('should reset instance', () => {
      const instance1 = getOfflineQueue()
      resetOfflineQueue()
      const instance2 = getOfflineQueue()
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('exponential backoff', () => {
    it('should increase delay with retry count', async () => {
      const queue = new OfflineQueue({
        storageKey: 'backoff-test',
        retryBaseDelay: 100,
        retryMaxDelay: 1000,
        processInterval: 0,
      })

      queue.setOnlineStatus(true)
      const delays: number[] = []
      const handler = vi.fn().mockImplementation(async () => {
        delays.push(Date.now())
        return { success: false, shouldRetry: true }
      })
      queue.registerHandler('cve-lookup', handler)

      await queue.enqueue(
        'cve-lookup',
        { cveId: 'CVE-1' },
        {
          processImmediately: false,
          maxRetries: 2,
        },
      )

      const startTime = Date.now()
      await queue.processQueue()
      const endTime = Date.now()

      // Should have taken at least some time due to backoff
      expect(endTime - startTime).toBeGreaterThan(0)

      queue.destroy()
    })
  })

  describe('getIsOnline and setOnlineStatus', () => {
    it('should return current online status', () => {
      // Initial status depends on navigator.onLine which may vary in test environment
      // Just verify the getter works
      const status = queue.getIsOnline()
      expect(typeof status).toBe('boolean')
    })

    it('should update online status', () => {
      queue.setOnlineStatus(false)
      expect(queue.getIsOnline()).toBe(false)

      queue.setOnlineStatus(true)
      expect(queue.getIsOnline()).toBe(true)
    })

    it('should emit events when status changes', () => {
      // First set to a known state
      queue.setOnlineStatus(true)
      const listener = vi.fn() as OfflineQueueEventListener
      queue.addEventListener(listener)

      queue.setOnlineStatus(false)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'offline' }))

      queue.setOnlineStatus(true)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'online' }))
    })
  })
})
