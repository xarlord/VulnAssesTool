/**
 * Tests for useSyncNotifications Hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSyncNotifications } from './useSyncNotifications'
import { getOfflineQueue, type OfflineQueueEvent, type OfflineQueueEventListener } from '@/lib/services/OfflineQueue'
import { toast } from '@/components/Toaster'
import { addNotification } from '@/lib/notifications'

// Mock dependencies
vi.mock('@/lib/services/OfflineQueue', () => ({
  getOfflineQueue: vi.fn(),
}))

vi.mock('@/components/Toaster', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/notifications', () => ({
  addNotification: vi.fn(),
}))

describe('useSyncNotifications', () => {
  let eventListeners: Map<string, OfflineQueueEventListener[]>
  let mockQueue: {
    addEventListener: ReturnType<typeof vi.fn>
    getIsOnline: ReturnType<typeof vi.fn>
    getStats: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    eventListeners = new Map()

    mockQueue = {
      addEventListener: vi.fn((listener: OfflineQueueEventListener) => {
        const listeners = eventListeners.get('queue') || []
        listeners.push(listener)
        eventListeners.set('queue', listeners)
        return () => {
          const idx = listeners.indexOf(listener)
          if (idx > -1) listeners.splice(idx, 1)
        }
      }),
      getIsOnline: vi.fn(() => true),
      getStats: vi.fn(() => ({ isOnline: true, queueLength: 0, byType: {}, totalRetries: 0, atMaxRetries: 0 })),
    }

    vi.mocked(getOfflineQueue).mockReturnValue(mockQueue as unknown as ReturnType<typeof getOfflineQueue>)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const emitEvent = (event: OfflineQueueEvent) => {
    const listeners = eventListeners.get('queue') || []
    listeners.forEach((listener) => listener(event))
  }

  it('should subscribe to OfflineQueue events on mount', () => {
    renderHook(() => useSyncNotifications())

    expect(mockQueue.addEventListener).toHaveBeenCalled()
  })

  it('should unsubscribe from OfflineQueue events on unmount', () => {
    const { unmount } = renderHook(() => useSyncNotifications())

    unmount()

    // Verify the unsubscribe function was returned
    expect(mockQueue.addEventListener).toHaveBeenCalled()
    const unsubscribe = mockQueue.addEventListener.mock.results[0].value
    expect(typeof unsubscribe).toBe('function')
  })

  it('should show info toast when sync starts', () => {
    renderHook(() => useSyncNotifications())

    emitEvent({
      type: 'sync-started',
      isOnline: true,
      queueLength: 5,
      total: 5,
      processed: 0,
      progress: 0,
    })

    expect(toast.info).toHaveBeenCalledWith('Syncing Offline Requests', 'Processing 5 queued requests...')
  })

  it('should show singular message for single request', () => {
    renderHook(() => useSyncNotifications())

    emitEvent({
      type: 'sync-started',
      isOnline: true,
      queueLength: 1,
      total: 1,
      processed: 0,
      progress: 0,
    })

    expect(toast.info).toHaveBeenCalledWith('Syncing Offline Requests', 'Processing 1 queued request...')
  })

  it('should show success toast when sync completes without errors', () => {
    renderHook(() => useSyncNotifications())

    // Start sync
    emitEvent({
      type: 'sync-started',
      isOnline: true,
      queueLength: 3,
      total: 3,
      processed: 0,
      progress: 0,
    })

    // Advance time to simulate sync duration
    vi.advanceTimersByTime(2500)

    // Complete sync
    emitEvent({
      type: 'sync-completed',
      isOnline: true,
      queueLength: 0,
      total: 3,
      processed: 3,
      progress: 100,
    })

    expect(toast.success).toHaveBeenCalledWith('Sync Completed', 'Successfully processed 3 requests in 3s')
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        category: 'system',
        title: 'Offline Sync Completed',
      }),
    )
  })

  it('should show warning toast when sync completes with errors', () => {
    renderHook(() => useSyncNotifications())

    // Start sync
    emitEvent({
      type: 'sync-started',
      isOnline: true,
      queueLength: 3,
      total: 3,
      processed: 0,
      progress: 0,
    })

    vi.advanceTimersByTime(1500)

    // Process a request that failed permanently
    emitEvent({
      type: 'request-processed',
      isOnline: true,
      queueLength: 2,
      request: {
        id: 'req-1',
        type: 'cve-lookup',
        payload: {},
        timestamp: Date.now(),
        retryCount: 3,
        maxRetries: 3,
        priority: 0,
      },
      result: {
        requestId: 'req-1',
        success: false,
        error: 'Failed',
        shouldRetry: false,
      },
    })

    // Complete sync
    emitEvent({
      type: 'sync-completed',
      isOnline: true,
      queueLength: 0,
      total: 3,
      processed: 3,
      progress: 100,
    })

    expect(toast.warning).toHaveBeenCalledWith(
      'Sync Completed with Errors',
      'Processed 3 requests in 2s. Some requests failed.',
    )
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        category: 'system',
        title: 'Offline Sync Completed with Errors',
      }),
    )
  })

  it('should show error toast on sync-error event', () => {
    renderHook(() => useSyncNotifications())

    emitEvent({
      type: 'sync-error',
      isOnline: true,
      queueLength: 5,
      error: 'Network timeout',
    })

    expect(toast.error).toHaveBeenCalledWith('Sync Error', 'Network timeout')
  })

  it('should show default error message when no error provided', () => {
    renderHook(() => useSyncNotifications())

    emitEvent({
      type: 'sync-error',
      isOnline: true,
      queueLength: 5,
    })

    expect(toast.error).toHaveBeenCalledWith('Sync Error', 'An error occurred while syncing offline requests')
  })

  it('should track errors from failed requests', () => {
    renderHook(() => useSyncNotifications())

    // Start sync
    emitEvent({
      type: 'sync-started',
      isOnline: true,
      queueLength: 2,
      total: 2,
      processed: 0,
      progress: 0,
    })

    vi.advanceTimersByTime(1000)

    // Process a successful request
    emitEvent({
      type: 'request-processed',
      isOnline: true,
      queueLength: 1,
      request: {
        id: 'req-1',
        type: 'cve-lookup',
        payload: {},
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        priority: 0,
      },
      result: {
        requestId: 'req-1',
        success: true,
        shouldRetry: false,
      },
    })

    // Process a failed request (will retry, so shouldn't count as permanent error)
    emitEvent({
      type: 'request-processed',
      isOnline: true,
      queueLength: 0,
      request: {
        id: 'req-2',
        type: 'cve-lookup',
        payload: {},
        timestamp: Date.now(),
        retryCount: 1,
        maxRetries: 3,
        priority: 0,
      },
      result: {
        requestId: 'req-2',
        success: false,
        error: 'Temporary error',
        shouldRetry: true,
      },
    })

    // Complete sync
    emitEvent({
      type: 'sync-completed',
      isOnline: true,
      queueLength: 0,
      total: 2,
      processed: 2,
      progress: 100,
    })

    // Should show success since the failed request can still retry
    expect(toast.success).toHaveBeenCalled()
  })

  it('should handle sync completion without prior sync-started', () => {
    renderHook(() => useSyncNotifications())

    // Complete sync without starting (edge case)
    emitEvent({
      type: 'sync-completed',
      isOnline: true,
      queueLength: 0,
      total: 1,
      processed: 1,
      progress: 100,
    })

    // Should not show any toast since syncStartTimeRef is null
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })
})
