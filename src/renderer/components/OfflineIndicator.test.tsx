/**
 * Tests for OfflineIndicator Component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { OfflineIndicator, OfflineBanner } from './OfflineIndicator'
import { getOfflineQueue, resetOfflineQueue, type OfflineQueueEventListener } from '@/lib/services/OfflineQueue'

// Mock the OfflineQueue
vi.mock('@/lib/services/OfflineQueue', () => {
  const listeners: Set<OfflineQueueEventListener> = new Set()
  let isOnline = true
  let queueLength = 0

  const mockQueue = {
    getIsOnline: () => isOnline,
    getStats: () => ({
      isOnline,
      queueLength,
      byType: {
        'nvd-sync': 0,
        'vulnerability-scan': 0,
        'cve-lookup': queueLength,
        'cpe-search': 0,
        'project-save': 0,
        'settings-sync': 0,
        custom: 0,
      },
      oldestRequest: undefined,
      totalRetries: 0,
      atMaxRetries: 0,
    }),
    addEventListener: vi.fn((listener: OfflineQueueEventListener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    // Test helpers
    _setOnline: (online: boolean) => {
      isOnline = online
    },
    _setQueueLength: (length: number) => {
      queueLength = length
    },
    _emit: (event: Parameters<OfflineQueueEventListener>[0]) => {
      listeners.forEach((listener) => listener(event))
    },
    _reset: () => {
      listeners.clear()
      isOnline = true
      queueLength = 0
    },
  }

  return {
    getOfflineQueue: () => mockQueue,
    resetOfflineQueue: () => {
      mockQueue._reset()
    },
  }
})

describe('OfflineIndicator', () => {
  let mockQueue: ReturnType<typeof getOfflineQueue>

  beforeEach(() => {
    mockQueue = getOfflineQueue()
    mockQueue._reset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('online status', () => {
    it('should show online status when online', () => {
      mockQueue._setOnline(true)
      render(<OfflineIndicator />)

      expect(screen.getByText('Online')).toBeInTheDocument()
    })

    it('should show offline status when offline', () => {
      mockQueue._setOnline(false)
      render(<OfflineIndicator />)

      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('should respond to online event', async () => {
      mockQueue._setOnline(false)
      render(<OfflineIndicator />)

      expect(screen.getByText('Offline')).toBeInTheDocument()

      // Simulate going online
      await act(async () => {
        mockQueue._setOnline(true)
        mockQueue._emit({ type: 'online', isOnline: true, queueLength: 0 })
      })

      expect(screen.getByText('Online')).toBeInTheDocument()
    })

    it('should respond to offline event', async () => {
      mockQueue._setOnline(true)
      render(<OfflineIndicator />)

      expect(screen.getByText('Online')).toBeInTheDocument()

      // Simulate going offline
      await act(async () => {
        mockQueue._setOnline(false)
        mockQueue._emit({ type: 'offline', isOnline: false, queueLength: 0 })
      })

      expect(screen.getByText('Offline')).toBeInTheDocument()
    })
  })

  describe('queue info', () => {
    it('should show queue length when there are queued requests', async () => {
      mockQueue._setOnline(false)
      mockQueue._setQueueLength(5)
      render(<OfflineIndicator />)

      await act(async () => {
        mockQueue._emit({
          type: 'queue-changed',
          isOnline: false,
          queueLength: 5,
        })
      })

      expect(screen.getByText(/5 requests queued/)).toBeInTheDocument()
    })

    it('should show singular "request" for single queued item', async () => {
      mockQueue._setOnline(false)
      mockQueue._setQueueLength(1)
      render(<OfflineIndicator />)

      await act(async () => {
        mockQueue._emit({
          type: 'queue-changed',
          isOnline: false,
          queueLength: 1,
        })
      })

      expect(screen.getByText(/1 request queued/)).toBeInTheDocument()
    })

    it('should not show queue info when showQueueInfo is false', () => {
      mockQueue._setOnline(false)
      mockQueue._setQueueLength(5)
      render(<OfflineIndicator showQueueInfo={false} />)

      expect(screen.queryByText(/queued/)).not.toBeInTheDocument()
    })
  })

  describe('sync progress', () => {
    it('should show sync progress when syncing', async () => {
      render(<OfflineIndicator />)

      await act(async () => {
        mockQueue._emit({
          type: 'sync-started',
          isOnline: true,
          queueLength: 10,
          total: 10,
          processed: 0,
          progress: 0,
        })
      })

      expect(screen.getByText(/Syncing/)).toBeInTheDocument()
      expect(screen.getByText(/0%/)).toBeInTheDocument()
    })

    it('should update progress during sync', async () => {
      render(<OfflineIndicator />)

      await act(async () => {
        mockQueue._emit({
          type: 'sync-started',
          isOnline: true,
          queueLength: 10,
          total: 10,
          processed: 0,
          progress: 0,
        })
      })

      await act(async () => {
        mockQueue._emit({
          type: 'sync-progress',
          isOnline: true,
          queueLength: 5,
          total: 10,
          processed: 5,
          progress: 50,
        })
      })

      expect(screen.getByText(/50%/)).toBeInTheDocument()
      expect(screen.getByText(/5\/10/)).toBeInTheDocument()
    })

    it('should not show sync progress when showSyncProgress is false', async () => {
      render(<OfflineIndicator showSyncProgress={false} />)

      await act(async () => {
        mockQueue._emit({
          type: 'sync-started',
          isOnline: true,
          queueLength: 10,
          total: 10,
          processed: 0,
          progress: 0,
        })
      })

      // Should still show syncing text, but not the progress bar
      expect(screen.getByText(/Syncing/)).toBeInTheDocument()
      expect(screen.queryByText(/5\/10/)).not.toBeInTheDocument()
    })
  })

  describe('compact mode', () => {
    it('should show only icon in compact mode when online', () => {
      mockQueue._setOnline(true)
      render(<OfflineIndicator compact />)

      // Should not show "Online" text
      expect(screen.queryByText('Online')).not.toBeInTheDocument()
    })

    it('should show offline icon in compact mode', () => {
      mockQueue._setOnline(false)
      render(<OfflineIndicator compact />)

      // Should not show "Offline" text
      expect(screen.queryByText('Offline')).not.toBeInTheDocument()
    })

    it('should show badge for queued requests in compact mode', async () => {
      mockQueue._setOnline(false)
      mockQueue._setQueueLength(5)
      render(<OfflineIndicator compact />)

      await act(async () => {
        mockQueue._emit({
          type: 'queue-changed',
          isOnline: false,
          queueLength: 5,
        })
      })

      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('should show 9+ for more than 9 queued requests', async () => {
      mockQueue._setOnline(false)
      mockQueue._setQueueLength(15)
      render(<OfflineIndicator compact />)

      await act(async () => {
        mockQueue._emit({
          type: 'queue-changed',
          isOnline: false,
          queueLength: 15,
        })
      })

      expect(screen.getByText('9+')).toBeInTheDocument()
    })
  })

  describe('custom className', () => {
    it('should apply custom className', () => {
      render(<OfflineIndicator className="custom-class" />)
      const element = screen.getByText('Online').closest('div')
      expect(element).toHaveClass('custom-class')
    })
  })
})

describe('OfflineBanner', () => {
  let mockQueue: ReturnType<typeof getOfflineQueue>

  beforeEach(() => {
    mockQueue = getOfflineQueue()
    mockQueue._reset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('should not render when online and not syncing', () => {
    mockQueue._setOnline(true)
    render(<OfflineBanner />)

    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
  })

  it('should show banner when offline', async () => {
    mockQueue._setOnline(false)
    render(<OfflineBanner />)

    await act(async () => {
      mockQueue._emit({ type: 'offline', isOnline: false, queueLength: 0 })
    })

    expect(screen.getByText('You are offline')).toBeInTheDocument()
  })

  it('should show queued requests count in banner', async () => {
    mockQueue._setOnline(false)
    render(<OfflineBanner />)

    await act(async () => {
      mockQueue._emit({
        type: 'queue-changed',
        isOnline: false,
        queueLength: 3,
      })
    })

    expect(screen.getByText(/3 requests will sync/)).toBeInTheDocument()
  })

  it('should show sync progress when syncing', async () => {
    render(<OfflineBanner />)

    await act(async () => {
      mockQueue._emit({
        type: 'sync-started',
        isOnline: true,
        queueLength: 10,
        total: 10,
        processed: 0,
        progress: 0,
      })
    })

    expect(screen.getByText(/Syncing/)).toBeInTheDocument()
  })

  it('should hide banner after sync completes', async () => {
    render(<OfflineBanner />)

    // Start sync
    await act(async () => {
      mockQueue._emit({
        type: 'sync-started',
        isOnline: true,
        queueLength: 10,
        total: 10,
        processed: 0,
        progress: 0,
      })
    })

    expect(screen.getByText(/Syncing/)).toBeInTheDocument()

    // Complete sync
    await act(async () => {
      mockQueue._emit({
        type: 'sync-completed',
        isOnline: true,
        queueLength: 0,
        total: 10,
        processed: 10,
        progress: 100,
      })
    })

    // Banner should be hidden
    expect(screen.queryByText(/Syncing/)).not.toBeInTheDocument()
  })
})
