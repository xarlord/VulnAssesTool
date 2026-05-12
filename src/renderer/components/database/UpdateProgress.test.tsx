/**
 * Tests for UpdateProgress Component
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpdateProgress, UpdateProgressList } from './UpdateProgress'
import type { DownloadProgress } from '@/lib/database'

describe('UpdateProgress', () => {
  const baseProgress: DownloadProgress = {
    bytesDownloaded: 0,
    totalBytes: 0,
    percentage: 0,
    speedKBps: 0,
    etaSeconds: 0,
  }

  describe('rendering', () => {
    it('should render pending status', () => {
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="pending" progress={baseProgress} />)

      expect(screen.getByText('Test Update')).toBeInTheDocument()
      expect(screen.getByText('Scheduled')).toBeInTheDocument()
    })

    it('should render downloading status', () => {
      const downloadingProgress: DownloadProgress = {
        ...baseProgress,
        bytesDownloaded: 1024 * 1024 * 5,
        totalBytes: 1024 * 1024 * 10,
        percentage: 50,
        speedKBps: 1024,
        etaSeconds: 300,
      }

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={downloadingProgress}
          speed="1.00"
          eta="5m 0s"
          downloadedMB="5.00"
          totalMB="10.00"
        />,
      )

      expect(screen.getByText('Downloading...')).toBeInTheDocument()
      expect(screen.getByText('50.0%')).toBeInTheDocument()
    })

    it('should render verifying status', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="verifying"
          progress={{ ...baseProgress, percentage: 100 }}
        />,
      )

      expect(screen.getByText('Verifying...')).toBeInTheDocument()
    })

    it('should render completed status', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="completed"
          progress={{ ...baseProgress, percentage: 100 }}
        />,
      )

      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText(/Database update completed successfully/)).toBeInTheDocument()
    })

    it('should render failed status with error message', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="failed"
          progress={baseProgress}
          error="Network connection lost"
        />,
      )

      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Network connection lost')).toBeInTheDocument()
    })

    it('should render paused status', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="paused"
          progress={{ ...baseProgress, percentage: 25 }}
        />,
      )

      expect(screen.getByText('Paused')).toBeInTheDocument()
    })
  })

  describe('action buttons', () => {
    it('should show pause button when downloading', () => {
      const onPause = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={{ ...baseProgress, percentage: 50 }}
          onPause={onPause}
        />,
      )

      const pauseButton = screen.getByTitle('Pause download')
      expect(pauseButton).toBeInTheDocument()
    })

    it('should show resume button when paused', () => {
      const onResume = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="paused"
          progress={{ ...baseProgress, percentage: 25 }}
          onResume={onResume}
        />,
      )

      const resumeButton = screen.getByTitle('Resume download')
      expect(resumeButton).toBeInTheDocument()
    })

    it('should show retry button when failed', () => {
      const onRetry = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="failed"
          progress={baseProgress}
          error="Download failed"
          onRetry={onRetry}
        />,
      )

      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('should show cancel button when pending', () => {
      const onCancel = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="pending"
          progress={baseProgress}
          onCancel={onCancel}
        />,
      )

      const cancelButton = screen.getByTitle('Cancel')
      expect(cancelButton).toBeInTheDocument()
    })
  })

  describe('progress bar', () => {
    it('should not show progress bar for pending status', () => {
      const { container } = render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="pending" progress={baseProgress} />,
      )

      const progressBar = container.querySelector('[role="progressbar"]')
      expect(progressBar).not.toBeInTheDocument()
    })

    it('should show progress bar when downloading', () => {
      const { container } = render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={{ ...baseProgress, percentage: 50, totalBytes: 1024 * 1024 }}
        />,
      )

      const progressBar = container.querySelector('.bg-blue-600')
      expect(progressBar).toBeInTheDocument()
    })
  })

  describe('UpdateProgressList', () => {
    it('should render empty state when no updates', () => {
      render(<UpdateProgressList updates={[]} />)

      expect(screen.getByText('No active updates')).toBeInTheDocument()
    })

    it('should render multiple updates', () => {
      const updates = [
        {
          id: 'job1',
          name: 'Update 1',
          status: 'downloading' as const,
          progress: { ...baseProgress, percentage: 25 },
        },
        {
          id: 'job2',
          name: 'Update 2',
          status: 'pending' as const,
          progress: baseProgress,
        },
      ]

      render(<UpdateProgressList updates={updates} />)

      expect(screen.getByText('Update 1')).toBeInTheDocument()
      expect(screen.getByText('Update 2')).toBeInTheDocument()
    })

    it('should call pause handler for correct job', () => {
      const onPause = vi.fn()
      const updates = [
        {
          id: 'job1',
          name: 'Update 1',
          status: 'downloading' as const,
          progress: { ...baseProgress, percentage: 25 },
        },
        {
          id: 'job2',
          name: 'Update 2',
          status: 'downloading' as const,
          progress: { ...baseProgress, percentage: 50 },
        },
      ]

      render(<UpdateProgressList updates={updates} onPause={onPause} />)

      const pauseButtons = screen.getAllByTitle('Pause download')
      expect(pauseButtons).toHaveLength(2)
    })
  })
})
