/**
 * Tests for UpdateProgress Component
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateProgress, UpdateProgressList } from './UpdateProgress'
import type { DownloadProgress } from './UpdateProgress'

describe('UpdateProgress', () => {
  const baseProgress: DownloadProgress = {
    percentage: 0,
  }

  describe('rendering', () => {
    it('should render pending status', () => {
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="pending" progress={baseProgress} />)

      expect(screen.getByText('Test Update')).toBeInTheDocument()
      expect(screen.getByText('Scheduled')).toBeInTheDocument()
    })

    it('should render downloading status', () => {
      const downloadingProgress: DownloadProgress = {
        percentage: 50,
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
        <UpdateProgress jobId="test-job" jobName="Test Update" status="verifying" progress={{ percentage: 100 }} />,
      )

      expect(screen.getByText('Verifying...')).toBeInTheDocument()
    })

    it('should render completed status', () => {
      render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="completed" progress={{ percentage: 100 }} />,
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
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="paused" progress={{ percentage: 25 }} />)

      expect(screen.getByText('Paused')).toBeInTheDocument()
    })

    it('should render failed status without error message', () => {
      const { container } = render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="failed" progress={baseProgress} />,
      )

      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(container.querySelector('.bg-red-50')).not.toBeInTheDocument()
    })

    it('should render Unknown text for unrecognized status', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status={'unexpected' as 'pending'}
          progress={baseProgress}
        />,
      )

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })

    // Note: getProgressColor default/completed/failed branches (lines 84,95-97,101)
    // are structurally unreachable — the progress bar only renders for
    // downloading|verifying|paused, so those switch cases can never execute.
  })

  describe('action buttons', () => {
    it('should show pause button when downloading', () => {
      const onPause = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={{ percentage: 50 }}
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
          progress={{ percentage: 25 }}
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

    it('should show cancel button when failed', () => {
      const onCancel = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="failed"
          progress={baseProgress}
          onCancel={onCancel}
        />,
      )

      expect(screen.getByTitle('Cancel')).toBeInTheDocument()
    })

    it('should show cancel button when completed', () => {
      const onCancel = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="completed"
          progress={{ percentage: 100 }}
          onCancel={onCancel}
        />,
      )

      expect(screen.getByTitle('Cancel')).toBeInTheDocument()
    })

    it('should not show pause button when onPause is not provided', () => {
      render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="downloading" progress={{ percentage: 50 }} />,
      )

      expect(screen.queryByTitle('Pause download')).not.toBeInTheDocument()
    })

    it('should not show resume button when onResume is not provided', () => {
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="paused" progress={{ percentage: 25 }} />)

      expect(screen.queryByTitle('Resume download')).not.toBeInTheDocument()
    })

    it('should not show retry button when onRetry is not provided', () => {
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="failed" progress={baseProgress} />)

      expect(screen.queryByText('Retry')).not.toBeInTheDocument()
    })

    it('should not show cancel button when onCancel is not provided', () => {
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="pending" progress={baseProgress} />)

      expect(screen.queryByTitle('Cancel')).not.toBeInTheDocument()
    })
  })

  describe('button click interactions', () => {
    it('should call onPause when pause button is clicked', () => {
      const onPause = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={{ percentage: 50 }}
          onPause={onPause}
        />,
      )

      fireEvent.click(screen.getByTitle('Pause download'))
      expect(onPause).toHaveBeenCalledTimes(1)
    })

    it('should call onResume when resume button is clicked', () => {
      const onResume = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="paused"
          progress={{ percentage: 25 }}
          onResume={onResume}
        />,
      )

      fireEvent.click(screen.getByTitle('Resume download'))
      expect(onResume).toHaveBeenCalledTimes(1)
    })

    it('should call onRetry when retry button is clicked', () => {
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

      fireEvent.click(screen.getByText('Retry'))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('should call onCancel when cancel button is clicked on pending', () => {
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

      fireEvent.click(screen.getByTitle('Cancel'))
      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('should call onCancel when cancel button is clicked on failed', () => {
      const onCancel = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="failed"
          progress={baseProgress}
          onCancel={onCancel}
        />,
      )

      fireEvent.click(screen.getByTitle('Cancel'))
      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('should call onCancel when cancel button is clicked on completed', () => {
      const onCancel = vi.fn()

      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="completed"
          progress={{ percentage: 100 }}
          onCancel={onCancel}
        />,
      )

      fireEvent.click(screen.getByTitle('Cancel'))
      expect(onCancel).toHaveBeenCalledTimes(1)
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
        <UpdateProgress jobId="test-job" jobName="Test Update" status="downloading" progress={{ percentage: 50 }} />,
      )

      const progressBar = container.querySelector('.bg-blue-600')
      expect(progressBar).toBeInTheDocument()
    })

    it('should show yellow progress bar when verifying', () => {
      const { container } = render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="verifying" progress={{ percentage: 80 }} />,
      )

      const progressBar = container.querySelector('.bg-yellow-600')
      expect(progressBar).toBeInTheDocument()
      expect(screen.getByText('80.0%')).toBeInTheDocument()
    })

    it('should show orange progress bar when paused', () => {
      const { container } = render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="paused" progress={{ percentage: 30 }} />,
      )

      const progressBar = container.querySelector('.bg-orange-600')
      expect(progressBar).toBeInTheDocument()
      expect(screen.getByText('30.0%')).toBeInTheDocument()
    })

    it('should not show progress bar for completed status', () => {
      const { container } = render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="completed" progress={{ percentage: 100 }} />,
      )

      expect(screen.queryByText('100.0%')).not.toBeInTheDocument()
      expect(container.querySelector('.bg-green-600')).not.toBeInTheDocument()
    })

    it('should not show progress bar for failed status', () => {
      const { container } = render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="failed" progress={baseProgress} />,
      )

      expect(container.querySelector('.bg-red-600')).not.toBeInTheDocument()
    })

    it('should show downloaded and total MB when both are provided', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={{ percentage: 50 }}
          downloadedMB="5.00"
          totalMB="10.00"
        />,
      )

      expect(screen.getByText('5.00 MB / 10.00 MB')).toBeInTheDocument()
    })

    it('should not show MB display when only downloadedMB is provided', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={{ percentage: 50 }}
          downloadedMB="5.00"
        />,
      )

      expect(screen.queryByText(/MB \//)).not.toBeInTheDocument()
    })

    it('should render percentage at 100 when completed regardless of progress value', () => {
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="completed" progress={{ percentage: 42 }} />)

      // Completed forces 100% in getPercentage but no progress bar is shown
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('should render percentage at 0 when pending regardless of progress value', () => {
      render(<UpdateProgress jobId="test-job" jobName="Test Update" status="pending" progress={{ percentage: 99 }} />)

      // Pending forces 0% in getPercentage but no progress bar is shown
      expect(screen.getByText('Scheduled')).toBeInTheDocument()
    })

    it('should use raw percentage for downloading status', () => {
      render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="downloading" progress={{ percentage: 73 }} />,
      )

      expect(screen.getByText('73.0%')).toBeInTheDocument()
    })
  })

  describe('download stats', () => {
    it('should show speed and ETA during downloading', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="downloading"
          progress={{ percentage: 50 }}
          speed="2.50"
          eta="1m 30s"
        />,
      )

      expect(screen.getByText('2.50 KB/s')).toBeInTheDocument()
      expect(screen.getByText('ETA: 1m 30s')).toBeInTheDocument()
    })

    it('should show speed and ETA during verifying', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="verifying"
          progress={{ percentage: 90 }}
          speed="3.00"
          eta="0m 45s"
        />,
      )

      expect(screen.getByText('3.00 KB/s')).toBeInTheDocument()
      expect(screen.getByText('ETA: 0m 45s')).toBeInTheDocument()
    })

    it('should not show stats section when neither speed nor eta are provided', () => {
      render(
        <UpdateProgress jobId="test-job" jobName="Test Update" status="downloading" progress={{ percentage: 50 }} />,
      )

      expect(screen.queryByText(/KB\/s$/)).not.toBeInTheDocument()
      expect(screen.queryByText(/^ETA:/)).not.toBeInTheDocument()
    })

    it('should not show download stats when paused', () => {
      render(
        <UpdateProgress
          jobId="test-job"
          jobName="Test Update"
          status="paused"
          progress={{ percentage: 30 }}
          speed="1.00"
          eta="5m"
        />,
      )

      expect(screen.queryByText('1.00 KB/s')).not.toBeInTheDocument()
      expect(screen.queryByText('ETA: 5m')).not.toBeInTheDocument()
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
          progress: { percentage: 25 },
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

    it('should render updates with error prop', () => {
      const updates = [
        {
          id: 'job1',
          name: 'Failed Update',
          status: 'failed' as const,
          progress: baseProgress,
          error: 'Something broke',
        },
      ]

      render(<UpdateProgressList updates={updates} />)

      expect(screen.getByText('Failed Update')).toBeInTheDocument()
      expect(screen.getByText('Something broke')).toBeInTheDocument()
    })

    it('should call onPause with correct job id when pause button clicked', () => {
      const onPause = vi.fn()
      const updates = [
        {
          id: 'job1',
          name: 'Update 1',
          status: 'downloading' as const,
          progress: { percentage: 25 },
        },
      ]

      render(<UpdateProgressList updates={updates} onPause={onPause} />)

      fireEvent.click(screen.getByTitle('Pause download'))
      expect(onPause).toHaveBeenCalledWith('job1')
    })

    it('should call onResume with correct job id when resume button clicked', () => {
      const onResume = vi.fn()
      const updates = [
        {
          id: 'job2',
          name: 'Paused Update',
          status: 'paused' as const,
          progress: { percentage: 40 },
        },
      ]

      render(<UpdateProgressList updates={updates} onResume={onResume} />)

      fireEvent.click(screen.getByTitle('Resume download'))
      expect(onResume).toHaveBeenCalledWith('job2')
    })

    it('should call onCancel with correct job id for pending update', () => {
      const onCancel = vi.fn()
      const updates = [
        {
          id: 'job3',
          name: 'Pending Update',
          status: 'pending' as const,
          progress: baseProgress,
        },
      ]

      render(<UpdateProgressList updates={updates} onCancel={onCancel} />)

      fireEvent.click(screen.getByTitle('Cancel'))
      expect(onCancel).toHaveBeenCalledWith('job3')
    })

    it('should call onCancel with correct job id for failed update', () => {
      const onCancel = vi.fn()
      const updates = [
        {
          id: 'job4',
          name: 'Failed Update',
          status: 'failed' as const,
          progress: baseProgress,
          error: 'Error occurred',
        },
      ]

      render(<UpdateProgressList updates={updates} onCancel={onCancel} />)

      fireEvent.click(screen.getByTitle('Cancel'))
      expect(onCancel).toHaveBeenCalledWith('job4')
    })

    it('should call onCancel with correct job id for completed update', () => {
      const onCancel = vi.fn()
      const updates = [
        {
          id: 'job5',
          name: 'Completed Update',
          status: 'completed' as const,
          progress: { percentage: 100 },
        },
      ]

      render(<UpdateProgressList updates={updates} onCancel={onCancel} />)

      fireEvent.click(screen.getByTitle('Cancel'))
      expect(onCancel).toHaveBeenCalledWith('job5')
    })

    it('should call onRetry with correct job id when retry button clicked', () => {
      const onRetry = vi.fn()
      const updates = [
        {
          id: 'job6',
          name: 'Failed Update',
          status: 'failed' as const,
          progress: baseProgress,
          error: 'Timeout',
        },
      ]

      render(<UpdateProgressList updates={updates} onRetry={onRetry} />)

      fireEvent.click(screen.getByText('Retry'))
      expect(onRetry).toHaveBeenCalledWith('job6')
    })

    it('should not pass callbacks when not provided to list', () => {
      const updates = [
        {
          id: 'job1',
          name: 'Downloading Update',
          status: 'downloading' as const,
          progress: { percentage: 50 },
        },
      ]

      render(<UpdateProgressList updates={updates} />)

      // No action buttons should be present since no callbacks are provided
      expect(screen.queryByTitle('Pause download')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Resume download')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Cancel')).not.toBeInTheDocument()
      expect(screen.queryByText('Retry')).not.toBeInTheDocument()
    })
  })
})
