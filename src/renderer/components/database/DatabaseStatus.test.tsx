/**
 * Tests for DatabaseStatus Component
 *
 * Tests cover:
 * - Loading states
 * - Error handling
 * - Stats display
 * - Sync controls
 * - Progress tracking
 * - Modal interactions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DatabaseStatus } from './DatabaseStatus'

// Mock the SyncProgressModal
vi.mock('./SyncProgressModal', () => ({
  SyncProgressModal: ({ isOpen, progress, onCancel, onPause, onResume, onClose, isPaused }: any) => {
    if (!isOpen) return null
    return (
      <div data-testid="sync-progress-modal">
        <span data-testid="modal-phase">{progress?.phase || 'none'}</span>
        <span data-testid="modal-percent">{progress?.percentComplete || 0}</span>
        {isPaused ? (
          <button data-testid="resume-button" onClick={onResume}>
            Resume
          </button>
        ) : (
          <button data-testid="pause-button" onClick={onPause}>
            Pause
          </button>
        )}
        <button data-testid="cancel-button" onClick={onCancel}>
          Cancel
        </button>
        <button data-testid="close-button" onClick={onClose}>
          Close
        </button>
      </div>
    )
  },
}))

describe('DatabaseStatus', () => {
  // Store original window object
  const originalElectronAPI = (window as any).electronAPI

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset and configure window.electronAPI.database mocks
    ;(window as any).electronAPI = {
      database: {
        getStats: vi.fn().mockResolvedValue({
          success: true,
          stats: {
            totalCves: 150000,
            lastUpdate: new Date().toISOString(),
            dbSize: 50000000,
            version: 1,
          },
        }),
        getSyncStatus: vi.fn().mockResolvedValue({
          success: true,
          status: {
            isSyncing: false,
            isPaused: false,
            progress: 0,
            total: 0,
            currentYear: null,
            currentFile: null,
            error: null,
            lastSync: new Date().toISOString(),
            status: 'idle',
          },
        }),
        getDetailedStats: vi.fn().mockResolvedValue({
          success: true,
          stats: {
            totalCves: 150000,
            totalCwe: 5000,
            totalCpe: 100000,
            totalRefs: 200000,
            oldestCve: '1999-01-01',
            newestCve: '2024-12-31',
            lastSuccessfulSync: new Date().toISOString(),
            autoSyncEnabled: false,
            autoSyncIntervalHours: 24,
          },
        }),
        startSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'Sync started',
        }),
        cancelSync: vi.fn().mockResolvedValue({ success: true }),
        onSyncProgress: vi.fn(() => vi.fn()),
        onSyncComplete: vi.fn(() => vi.fn()),
        onSyncError: vi.fn(() => vi.fn()),
      },
    }
  })

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
  })

  describe('Loading States', () => {
    it('should show loading state initially', async () => {
      // Mock a delayed response to catch loading state
      let resolveStats: (value: any) => void
      const statsPromise = new Promise((resolve) => {
        resolveStats = resolve
      })
      ;(window as any).electronAPI.database.getStats = vi.fn(() => statsPromise)
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn(() =>
        Promise.resolve({
          success: true,
          status: {
            isSyncing: false,
            progress: 0,
            total: 0,
            currentYear: null,
            currentFile: null,
            error: null,
            lastSync: null,
            status: 'idle',
            isPaused: false,
          },
        }),
      )

      render(<DatabaseStatus />)

      // Should show loading initially
      expect(screen.getByText(/loading database status/i)).toBeInTheDocument()

      // Resolve the promise to allow component to proceed
      resolveStats!({
        success: true,
        stats: { totalCves: 150000, lastUpdate: new Date().toISOString(), dbSize: 50000000, version: 1 },
      })

      // Wait for loading to complete
      await screen.findByText('NVD Database', {}, { timeout: 3000 })
      expect(screen.queryByText(/loading database status/i)).not.toBeInTheDocument()
    })
  })

  describe('Stats Display', () => {
    it('should display database metadata when loaded', async () => {
      render(<DatabaseStatus />)

      // Wait for component to finish loading
      await screen.findByText('NVD Database', {}, { timeout: 3000 })

      // Check for stats display
      expect(screen.getByText(/Total CVEs/i)).toBeInTheDocument()
      // Check for the formatted number with comma
      expect(screen.getByRole('heading', { name: /NVD Database/i })).toBeInTheDocument()
    })

    it('should display database size', async () => {
      render(<DatabaseStatus />)

      await screen.findByText('NVD Database', {}, { timeout: 3000 })

      expect(screen.getByText(/Database Size/i)).toBeInTheDocument()
      // Check for size text (formatting may vary)
    })

    it('should display last sync time', async () => {
      render(<DatabaseStatus />)

      await screen.findByText('NVD Database', {}, { timeout: 3000 })

      expect(screen.getByText(/Last Sync/i)).toBeInTheDocument()
      expect(screen.getByText(/Just now/i)).toBeInTheDocument()
    })

    it('should display version number', async () => {
      render(<DatabaseStatus />)

      await screen.findByText('NVD Database', {}, { timeout: 3000 })

      expect(screen.getByText(/Version/i)).toBeInTheDocument()
      // Version is displayed in the stats grid
    })

    it('should show detailed stats when enabled', async () => {
      render(<DatabaseStatus showDetailedStats />)

      await screen.findByText('Coverage Details', {}, { timeout: 3000 })
    })
  })

  describe('Sync Status Indicators', () => {
    it('should show up-to-date status for recent sync', async () => {
      render(<DatabaseStatus />)

      await screen.findByText('Up to date', {}, { timeout: 3000 })
    })

    it('should show stale warning for old database', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 10) // 10 days ago

      ;(window as any).electronAPI.database.getStats = vi.fn().mockResolvedValue({
        success: true,
        stats: { totalCves: 150000, lastUpdate: oldDate.toISOString(), dbSize: 50000000, version: 1 },
      })
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: false,
          isPaused: false,
          progress: 0,
          total: 0,
          currentYear: null,
          currentFile: null,
          error: null,
          lastSync: oldDate.toISOString(),
          status: 'idle',
        },
      })

      render(<DatabaseStatus />)

      await screen.findByText('Stale', {}, { timeout: 3000 })
    })

    it('should show syncing status when sync is in progress', async () => {
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: true,
          isPaused: false,
          progress: 50,
          total: 100,
          currentYear: 2024,
          currentFile: null,
          error: null,
          lastSync: null,
          status: 'syncing',
        },
      })

      render(<DatabaseStatus />)

      await screen.findByText('Syncing', {}, { timeout: 3000 })
    })
  })

  describe('Error Handling', () => {
    it('should show error state when database fails to load', async () => {
      ;(window as any).electronAPI.database.getStats = vi.fn().mockRejectedValue(new Error('Database error'))

      render(<DatabaseStatus />)

      await screen.findByText(/database error/i, {}, { timeout: 3000 })
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('should retry loading when retry button is clicked', async () => {
      ;(window as any).electronAPI.database.getStats = vi
        .fn()
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValue({
          success: true,
          stats: { totalCves: 150000, lastUpdate: new Date().toISOString(), dbSize: 50000000, version: 1 },
        })

      render(<DatabaseStatus />)

      await screen.findByText(/database error/i, {}, { timeout: 3000 })

      fireEvent.click(screen.getByText('Retry'))

      await screen.findByText('NVD Database', {}, { timeout: 3000 })
    })
  })

  describe('Time Formatting', () => {
    it('should format recent sync time correctly (hours ago)', async () => {
      const recentDate = new Date()
      recentDate.setHours(recentDate.getHours() - 2)

      ;(window as any).electronAPI.database.getStats = vi.fn().mockResolvedValue({
        success: true,
        stats: { totalCves: 150000, lastUpdate: recentDate.toISOString(), dbSize: 50000000, version: 1 },
      })
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: false,
          isPaused: false,
          progress: 0,
          total: 0,
          currentYear: null,
          currentFile: null,
          error: null,
          lastSync: recentDate.toISOString(),
          status: 'idle',
        },
      })

      render(<DatabaseStatus />)

      await screen.findByText(/2 hours ago/i, {}, { timeout: 3000 })
    })

    it('should show "Just now" for very recent sync', async () => {
      const now = new Date()

      ;(window as any).electronAPI.database.getStats = vi.fn().mockResolvedValue({
        success: true,
        stats: { totalCves: 150000, lastUpdate: now.toISOString(), dbSize: 50000000, version: 1 },
      })
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: false,
          isPaused: false,
          progress: 0,
          total: 0,
          currentYear: null,
          currentFile: null,
          error: null,
          lastSync: now.toISOString(),
          status: 'idle',
        },
      })

      render(<DatabaseStatus />)

      await screen.findByText(/Just now/i, {}, { timeout: 3000 })
    })

    it('should show "Never" for database that has never been synced', async () => {
      ;(window as any).electronAPI.database.getStats = vi.fn().mockResolvedValue({
        success: true,
        stats: { totalCves: 0, lastUpdate: null, dbSize: 0, version: 1 },
      })
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: false,
          isPaused: false,
          progress: 0,
          total: 0,
          currentYear: null,
          currentFile: null,
          error: null,
          lastSync: null,
          status: 'idle',
        },
      })

      render(<DatabaseStatus />)

      await screen.findByText('NVD Database', {}, { timeout: 3000 })
      expect(screen.getByText(/Never/i)).toBeInTheDocument()
    })

    it('should format days ago correctly', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 3)

      ;(window as any).electronAPI.database.getStats = vi.fn().mockResolvedValue({
        success: true,
        stats: { totalCves: 150000, lastUpdate: oldDate.toISOString(), dbSize: 50000000, version: 1 },
      })
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: false,
          isPaused: false,
          progress: 0,
          total: 0,
          currentYear: null,
          currentFile: null,
          error: null,
          lastSync: oldDate.toISOString(),
          status: 'idle',
        },
      })

      render(<DatabaseStatus />)

      await screen.findByText(/3 days ago/i, {}, { timeout: 3000 })
    })
  })

  describe('Sync Controls', () => {
    it('should render Sync Recent button', async () => {
      render(<DatabaseStatus />)

      await screen.findByText('Sync Recent', {}, { timeout: 3000 })
    })

    it('should render Sync Full History button', async () => {
      render(<DatabaseStatus />)

      await screen.findByText('Sync Full History', {}, { timeout: 3000 })
    })

    it('should call startSync with recent years when Sync Recent is clicked', async () => {
      const currentYear = new Date().getFullYear()
      const onSyncStart = vi.fn()

      const { container } = render(<DatabaseStatus onSyncStart={onSyncStart} />)

      await screen.findByText('Sync Recent', {}, { timeout: 3000 })
      fireEvent.click(screen.getByText('Sync Recent'))

      await waitFor(
        () => {
          expect((window as any).electronAPI.database.startSync).toHaveBeenCalledWith({
            years: [currentYear - 1, currentYear],
          })
          expect(onSyncStart).toHaveBeenCalledWith('recent')
        },
        { container },
      )
    })

    it('should call startSync with all years when Sync Full History is clicked', async () => {
      const currentYear = new Date().getFullYear()
      const expectedYears: number[] = []
      for (let year = 1999; year <= currentYear; year++) {
        expectedYears.push(year)
      }
      const onSyncStart = vi.fn()

      const { container } = render(<DatabaseStatus onSyncStart={onSyncStart} />)

      await screen.findByText('Sync Full History', {}, { timeout: 3000 })
      fireEvent.click(screen.getByText('Sync Full History'))

      await waitFor(
        () => {
          expect((window as any).electronAPI.database.startSync).toHaveBeenCalledWith({
            years: expectedYears,
          })
          expect(onSyncStart).toHaveBeenCalledWith('full')
        },
        { container },
      )
    })

    it('should show Cancel button when syncing', async () => {
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: true,
          isPaused: false,
          progress: 50,
          total: 100,
          currentYear: 2024,
          currentFile: null,
          error: null,
          lastSync: null,
          status: 'syncing',
        },
      })

      render(<DatabaseStatus />)

      await screen.findByText('Cancel Sync', {}, { timeout: 3000 })
    })

    it('should call cancelSync when Cancel is clicked', async () => {
      const onSyncCancel = vi.fn()

      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: true,
          isPaused: false,
          progress: 50,
          total: 100,
          currentYear: 2024,
          currentFile: null,
          error: null,
          lastSync: null,
          status: 'syncing',
        },
      })

      render(<DatabaseStatus onSyncCancel={onSyncCancel} />)

      await screen.findByText('Cancel Sync', {}, { timeout: 3000 })
      fireEvent.click(screen.getByText('Cancel Sync'))

      expect((window as any).electronAPI.database.cancelSync).toHaveBeenCalled()
    })
  })

  describe('Progress Tracking', () => {
    it('should show progress bar when syncing', async () => {
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: true,
          isPaused: false,
          progress: 50,
          total: 100,
          currentYear: 2024,
          currentFile: null,
          error: null,
          lastSync: null,
          status: 'syncing',
        },
      })

      // Set up progress callback
      let progressCallback: any
      ;(window as any).electronAPI.database.onSyncProgress = vi.fn((cb) => {
        progressCallback = cb
        return vi.fn()
      })

      const { container } = render(<DatabaseStatus />)

      await screen.findByText('Syncing', {}, { timeout: 3000 })

      // Simulate progress event
      progressCallback({
        phase: 'downloading',
        currentYear: 2024,
        totalYears: 2,
        yearsCompleted: 1,
        cvesImported: 50000,
        cvesSkipped: 100,
        cvesFailed: 5,
        percentComplete: 50,
        estimatedTimeRemainingSec: 300,
      })

      await waitFor(
        () => {
          // Use regex to match locale-independent number formatting (50,000 or 50.000)
          expect(screen.getByText(/50[.,]?000 CVEs imported/i)).toBeInTheDocument()
        },
        { container },
      )
    })
  })

  describe('Custom Styling', () => {
    it('should apply custom className', async () => {
      ;(window as any).electronAPI.database.getStats = vi.fn().mockResolvedValue({
        success: true,
        stats: { totalCves: 150000, lastUpdate: new Date().toISOString(), dbSize: 50000000, version: 1 },
      })
      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: false,
          isPaused: false,
          progress: 0,
          total: 0,
          currentYear: null,
          currentFile: null,
          error: null,
          lastSync: new Date().toISOString(),
          status: 'idle',
        },
      })

      const { container } = render(<DatabaseStatus className="custom-class" />)

      await screen.findByText('NVD Database', {}, { timeout: 3000 })
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
    })
  })

  describe('Callback Props', () => {
    it('should call onSyncStart when sync starts', async () => {
      const onSyncStart = vi.fn()

      const { container } = render(<DatabaseStatus onSyncStart={onSyncStart} />)

      await screen.findByText('Sync Recent', {}, { timeout: 3000 })
      fireEvent.click(screen.getByText('Sync Recent'))

      await waitFor(
        () => {
          expect(onSyncStart).toHaveBeenCalledWith('recent')
        },
        { container },
      )
    })

    it('should call onSyncCancel when sync is cancelled', async () => {
      const onSyncCancel = vi.fn()

      ;(window as any).electronAPI.database.getSyncStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          isSyncing: true,
          isPaused: false,
          progress: 50,
          total: 100,
          currentYear: 2024,
          currentFile: null,
          error: null,
          lastSync: null,
          status: 'syncing',
        },
      })

      const { container } = render(<DatabaseStatus onSyncCancel={onSyncCancel} />)

      await screen.findByText('Cancel Sync', {}, { timeout: 3000 })
      fireEvent.click(screen.getByText('Cancel Sync'))

      await waitFor(
        () => {
          expect(onSyncCancel).toHaveBeenCalled()
        },
        { container },
      )
    })
  })
})
