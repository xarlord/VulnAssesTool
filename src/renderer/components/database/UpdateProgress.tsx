/**
 * UpdateProgress Component
 * Shows download progress for database updates with detailed stats
 */

import React from 'react'
import { Download, Pause, Play, X, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import type { DownloadProgress } from '@/lib/database'

export interface UpdateProgressProps {
  jobId: string
  jobName: string
  status: 'pending' | 'downloading' | 'verifying' | 'completed' | 'failed' | 'paused'
  progress: DownloadProgress
  speed?: string
  eta?: string
  downloadedMB?: string
  totalMB?: string
  error?: string
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  onRetry?: () => void
}

export function UpdateProgress({
  jobName,
  status,
  progress,
  speed,
  eta,
  downloadedMB,
  totalMB,
  error,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: UpdateProgressProps) {
  const getPercentage = () => {
    if (status === 'completed') return 100
    if (status === 'pending') return 0
    return progress.percentage
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'downloading':
        return <Download className="h-5 w-5 animate-pulse text-blue-600 dark:text-blue-400" />
      case 'verifying':
        return <CheckCircle2 className="h-5 w-5 animate-pulse text-yellow-600 dark:text-yellow-400" />
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
      case 'paused':
        return <Pause className="h-5 w-5 text-orange-600 dark:text-orange-400" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return 'Scheduled'
      case 'downloading':
        return 'Downloading...'
      case 'verifying':
        return 'Verifying...'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      case 'paused':
        return 'Paused'
      default:
        return 'Unknown'
    }
  }

  const getProgressColor = () => {
    switch (status) {
      case 'downloading':
        return 'bg-blue-600 dark:bg-blue-500'
      case 'verifying':
        return 'bg-yellow-600 dark:bg-yellow-500'
      case 'completed':
        return 'bg-green-600 dark:bg-green-500'
      case 'failed':
        return 'bg-red-600 dark:bg-red-500'
      case 'paused':
        return 'bg-orange-600 dark:bg-orange-500'
      default:
        return 'bg-gray-600 dark:bg-gray-500'
    }
  }

  const percentage = getPercentage()

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{jobName}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{getStatusText()}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {status === 'downloading' && onPause && (
            <button
              onClick={onPause}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Pause download"
            >
              <Pause className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
          {status === 'paused' && onResume && (
            <button
              onClick={onResume}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Resume download"
            >
              <Play className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
          {status === 'failed' && onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          )}
          {(status === 'pending' || status === 'failed' || status === 'completed') && onCancel && (
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Cancel"
            >
              <X className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(status === 'downloading' || status === 'verifying' || status === 'paused') && (
        <div className="space-y-2">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor()} transition-all duration-300`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>{percentage.toFixed(1)}%</span>
            {downloadedMB && totalMB && (
              <span>
                {downloadedMB} MB / {totalMB} MB
              </span>
            )}
          </div>
        </div>
      )}

      {/* Download Stats */}
      {(status === 'downloading' || status === 'verifying') && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {speed && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Download className="h-4 w-4" />
              <span>{speed} KB/s</span>
            </div>
          )}
          {eta && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>ETA: {eta}</span>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {status === 'failed' && error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Completed Message */}
      {status === 'completed' && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <p className="text-sm text-green-800 dark:text-green-200">Database update completed successfully!</p>
        </div>
      )}
    </div>
  )
}

export interface UpdateProgressListProps {
  updates: Array<{
    id: string
    name: string
    status: UpdateProgressProps['status']
    progress: DownloadProgress
    error?: string
  }>
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onCancel?: (id: string) => void
  onRetry?: (id: string) => void
}

export function UpdateProgressList({ updates, onPause, onResume, onCancel, onRetry }: UpdateProgressListProps) {
  if (updates.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <Download className="h-12 w-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400">No active updates</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {updates.map((update) => (
        <UpdateProgress
          key={update.id}
          jobId={update.id}
          jobName={update.name}
          status={update.status}
          progress={update.progress}
          error={update.error}
          onPause={onPause ? () => onPause(update.id) : undefined}
          onResume={onResume ? () => onResume(update.id) : undefined}
          onCancel={onCancel ? () => onCancel(update.id) : undefined}
          onRetry={onRetry ? () => onRetry(update.id) : undefined}
        />
      ))}
    </div>
  )
}
