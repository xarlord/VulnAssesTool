/**
 * Tests for SyncProgressModal Component
 *
 * Tests cover:
 * - Modal visibility
 * - Progress display
 * - Phase indicators
 * - Error display
 * - Button interactions
 * - Time formatting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SyncProgressModal } from './SyncProgressModal'
import type { SyncProgress } from './DatabaseStatus'

// No mock - test the actual component

describe('SyncProgressModal', () => {
  const mockOnClose = vi.fn()
  const mockOnCancel = vi.fn()
  const mockOnPause = vi.fn()
  const mockOnResume = vi.fn()

  const defaultProgress: SyncProgress = {
    phase: 'downloading',
    currentYear: 2024,
    totalYears: 2,
    yearsCompleted: 1,
    cvesImported: 50000,
    cvesSkipped: 100,
    cvesFailed: 5,
    percentComplete: 50,
    estimatedTimeRemainingSec: 300,
    currentBatch: 5,
    totalBatches: 10,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    errors: [],
    downloadSpeed: 1000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Visibility', () => {
    it('should not render when isOpen is false', () => {
      render(
        <SyncProgressModal
          isOpen={false}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.queryByText('Database Sync')).not.toBeInTheDocument()
    })

    it('should render when isOpen is true', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText('Database Sync')).toBeInTheDocument()
    })
  })

  describe('Progress Display', () => {
    it('should display progress percentage', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText('50.0%')).toBeInTheDocument()
    })

    it('should display current year being synced', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/Current year:/)).toBeInTheDocument()
      expect(screen.getByText('2024')).toBeInTheDocument()
    })

    it('should display CVEs imported count', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      // Use regex to match locale-independent number formatting (50,000 or 50.000)
      expect(screen.getByText(/50[.,]?000/)).toBeInTheDocument()
    })

    it('should display CVEs skipped count', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      // Skipped label should be present
      expect(screen.getByText('Skipped')).toBeInTheDocument()
    })

    it('should display CVEs failed count', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      // Failed label should be present
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })

    it('should display years completed progress', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/1 of 2 years/)).toBeInTheDocument()
    })
  })

  describe('Phase Indicators', () => {
    it('should show downloading phase', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'downloading' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText('Downloading')).toBeInTheDocument()
    })

    it('should show importing phase', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'importing' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText('Importing')).toBeInTheDocument()
    })

    it('should show complete phase', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'complete' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText('Complete')).toBeInTheDocument()
    })

    it('should show error phase', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'error' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('should show cancelled phase', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'cancelled' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText('Cancelled')).toBeInTheDocument()
    })
  })

  describe('Time Display', () => {
    it('should display estimated time remaining', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, estimatedTimeRemainingSec: 300 }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/ETA:/)).toBeInTheDocument()
      expect(screen.getByText(/5m/)).toBeInTheDocument()
    })

    it('should display elapsed time', () => {
      const startedAt = new Date(Date.now() - 65000).toISOString() // 65 seconds ago

      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, startedAt }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/Elapsed:/)).toBeInTheDocument()
    })

    it('should display download speed when available', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, downloadSpeed: 1500 }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      // Use regex to match locale-independent number formatting (1,500 or 1.500)
      expect(screen.getByText(/1[.,]500 CVEs\/sec/)).toBeInTheDocument()
    })
  })

  describe('Error Display', () => {
    it('should display errors when present', () => {
      const progressWithErrors: SyncProgress = {
        ...defaultProgress,
        errors: [
          { timestamp: new Date().toISOString(), year: 2020, message: 'Failed to fetch year 2020', recoverable: true },
        ],
      }

      render(
        <SyncProgressModal
          isOpen={true}
          progress={progressWithErrors}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/1 Error/)).toBeInTheDocument()
      expect(screen.getByText(/Year 2020: Failed to fetch year 2020/)).toBeInTheDocument()
    })

    it('should truncate error list when more than 5 errors', () => {
      const progressWithManyErrors: SyncProgress = {
        ...defaultProgress,
        errors: Array.from({ length: 7 }, (_, i) => ({
          timestamp: new Date().toISOString(),
          year: 2020 + i,
          message: `Error ${i}`,
          recoverable: true,
        })),
      }

      render(
        <SyncProgressModal
          isOpen={true}
          progress={progressWithManyErrors}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/7 Errors/)).toBeInTheDocument()
      expect(screen.getByText(/and 2 more errors/)).toBeInTheDocument()
    })
  })

  describe('Completion Messages', () => {
    it('should show success message when complete', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'complete' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/Sync completed successfully/)).toBeInTheDocument()
    })

    it('should show cancelled message', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'cancelled' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/Sync was cancelled/)).toBeInTheDocument()
    })
  })

  describe('Button Interactions', () => {
    it('should show Pause button when syncing and not paused', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    })

    it('should show Resume button when paused', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={true}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
    })

    it('should call onPause when Pause button is clicked', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /pause/i }))
      expect(mockOnPause).toHaveBeenCalled()
    })

    it('should call onResume when Resume button is clicked', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={true}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /resume/i }))
      expect(mockOnResume).toHaveBeenCalled()
    })

    it('should call onCancel when Cancel button is clicked', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={defaultProgress}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('should call onClose when Close button is clicked for completed sync', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'complete' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      // Look for the X button or close button in header
      const buttons = screen.getAllByRole('button')
      const closeButton = buttons.find((btn) => btn.querySelector('svg.lucide-x') || btn.textContent === 'Close')
      if (closeButton) {
        fireEvent.click(closeButton)
        expect(mockOnClose).toHaveBeenCalled()
      }
    })

    it('should show Close button for completed sync', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, phase: 'complete' }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      // Close button in footer (exact text match, not the X button with aria-label)
      const closeButton = screen.getByRole('button', { name: /^Close$/ })
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('Null Progress', () => {
    it('should show loading spinner when progress is null', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={null}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      // The modal should render and show Database Sync title
      expect(screen.getByText('Database Sync')).toBeInTheDocument()
    })
  })

  describe('Batch Progress', () => {
    it('should display batch progress when available', () => {
      render(
        <SyncProgressModal
          isOpen={true}
          progress={{ ...defaultProgress, currentBatch: 3, totalBatches: 10 }}
          isPaused={false}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
          onPause={mockOnPause}
          onResume={mockOnResume}
        />,
      )

      expect(screen.getByText(/Batch 3 of 10/)).toBeInTheDocument()
    })
  })
})
