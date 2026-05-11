/**
 * SyncProgressModal Component
 *
 * Displays sync progress in a modal with:
 * - Progress bar with percentage
 * - Current year being synced
 * - CVEs imported/skipped/failed counts
 * - Estimated time remaining
 * - Cancel and Pause buttons
 * - Error display if sync fails
 */

import React, { useMemo } from 'react'
import {
  X,
  Download,
  Pause,
  Play,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Database,
  Calendar,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import type { SyncProgress, SyncError } from './DatabaseStatus'

/**
 * Props for SyncProgressModal component
 */
export interface SyncProgressModalProps {
  isOpen: boolean
  progress: SyncProgress | null
  isPaused: boolean
  onClose: () => void
  onCancel: () => void
  onPause: () => void
  onResume: () => void
}

/**
 * Format duration in seconds to human readable string
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Calculating...'

  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${minutes}m ${secs}s`
  } else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }
}

/**
 * Format elapsed time from start
 */
function formatElapsedTime(startedAt: string): string {
  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const elapsedMs = now - start

  if (elapsedMs < 1000) return 'Just started'
  if (elapsedMs < 60000) return `${Math.floor(elapsedMs / 1000)}s`

  const minutes = Math.floor(elapsedMs / 60000)
  const seconds = Math.floor((elapsedMs % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

/**
 * Get phase display information
 */
function getPhaseInfo(phase: SyncProgress['phase']): {
  label: string
  icon: typeof Download
  color: string
  bgColor: string
} {
  switch (phase) {
    case 'initializing':
      return { label: 'Initializing', icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
    case 'downloading':
      return { label: 'Downloading', icon: Download, color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
    case 'importing':
      return { label: 'Importing', icon: Database, color: 'text-purple-500', bgColor: 'bg-purple-500/10' }
    case 'indexing':
      return { label: 'Indexing', icon: TrendingUp, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
    case 'complete':
      return { label: 'Complete', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500/10' }
    case 'error':
      return { label: 'Error', icon: AlertCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' }
    case 'cancelled':
      return { label: 'Cancelled', icon: AlertTriangle, color: 'text-orange-500', bgColor: 'bg-orange-500/10' }
    default:
      return { label: 'Unknown', icon: Clock, color: 'text-gray-500', bgColor: 'bg-gray-500/10' }
  }
}

/**
 * SyncProgressModal Component
 */
export const SyncProgressModal: React.FC<SyncProgressModalProps> = ({
  isOpen,
  progress,
  isPaused,
  onClose,
  onCancel,
  onPause,
  onResume,
}) => {
  // Get phase information
  const phaseInfo = useMemo(() => {
    if (!progress) {
      return { label: 'Starting...', icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
    }
    return getPhaseInfo(progress.phase)
  }, [progress?.phase])

  // Calculate if sync is in progress
  const isInProgress = progress && !['complete', 'error', 'cancelled'].includes(progress.phase)

  // Don't render if not open
  if (!isOpen) {
    return null
  }

  const PhaseIcon = phaseInfo.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={isInProgress ? undefined : onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card rounded-lg shadow-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${phaseInfo.bgColor}`}>
              <PhaseIcon
                className={`h-5 w-5 ${phaseInfo.color} ${progress?.phase === 'initializing' || progress?.phase === 'downloading' ? 'animate-spin' : ''}`}
              />
            </div>
            <div>
              <h3 className="font-semibold">Database Sync</h3>
              <p className={`text-sm ${phaseInfo.color}`}>{phaseInfo.label}</p>
            </div>
          </div>
          {!isInProgress && (
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 hover:bg-muted rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {progress ? (
            <>
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{progress.percentComplete.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      progress.phase === 'error'
                        ? 'bg-red-500'
                        : progress.phase === 'cancelled'
                          ? 'bg-orange-500'
                          : progress.phase === 'complete'
                            ? 'bg-green-500'
                            : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(100, progress.percentComplete)}%` }}
                  />
                </div>
              </div>

              {/* Current Year */}
              {progress.currentYear && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Current year:</span>
                  <span className="font-medium">{progress.currentYear}</span>
                  <span className="text-muted-foreground">
                    ({progress.yearsCompleted} of {progress.totalYears} years)
                  </span>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-green-500/10 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Imported</p>
                  <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {progress.cvesImported.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-yellow-500/10 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Skipped</p>
                  <p className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
                    {progress.cvesSkipped.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Failed</p>
                  <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                    {progress.cvesFailed.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Time Information */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Elapsed: {formatElapsedTime(progress.startedAt)}</span>
                </div>
                {isInProgress && progress.estimatedTimeRemainingSec > 0 && (
                  <span className="text-muted-foreground">
                    ETA: {formatTimeRemaining(progress.estimatedTimeRemainingSec)}
                  </span>
                )}
              </div>

              {/* Download Speed */}
              {progress.downloadSpeed > 0 && isInProgress && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span>Speed: {progress.downloadSpeed.toLocaleString()} CVEs/sec</span>
                </div>
              )}

              {/* Batch Progress */}
              {progress.totalBatches > 0 && isInProgress && (
                <div className="text-sm text-muted-foreground">
                  Batch {progress.currentBatch} of {progress.totalBatches}
                </div>
              )}

              {/* Errors */}
              {progress.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">
                      {progress.errors.length} Error{progress.errors.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {progress.errors.slice(0, 5).map((error: SyncError, index: number) => (
                      <p key={index} className="text-xs text-red-600 dark:text-red-400">
                        {error.year ? `Year ${error.year}: ` : ''}
                        {error.message}
                      </p>
                    ))}
                    {progress.errors.length > 5 && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        ...and {progress.errors.length - 5} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Complete Message */}
              {progress.phase === 'complete' && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        Sync completed successfully!
                      </p>
                      <p className="text-xs text-green-600/70 dark:text-green-400/70">
                        Imported {progress.cvesImported.toLocaleString()} CVEs
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Cancelled Message */}
              {progress.phase === 'cancelled' && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Sync was cancelled</p>
                      <p className="text-xs text-orange-600/70 dark:text-orange-400/70">
                        Imported {progress.cvesImported.toLocaleString()} CVEs before cancellation
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-muted/50">
          {isInProgress && (
            <>
              {isPaused ? (
                <button
                  onClick={onResume}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-background transition-colors"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
              )}
              <button
                onClick={onCancel}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </>
          )}
          {!isInProgress && progress && (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export { SyncProgressModal }
