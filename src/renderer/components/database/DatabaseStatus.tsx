/**
 * DatabaseStatus Component
 *
 * Displays current status of local NVD database with sync functionality.
 * Features:
 * - Database stats display (total CVEs, coverage by year, last sync, size)
 * - Sync status indicator (idle/syncing/paused/error)
 * - Manual sync controls ("Sync Recent", "Sync Full History")
 * - Sync progress modal with progress bar
 * - Estimated time remaining calculation
 * - Cancel/Pause buttons for sync
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { getPlatform } from '@/lib/platform'
import {
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  X,
  HardDrive,
  TrendingUp,
  BarChart3,
  History,
  Zap,
} from 'lucide-react'
import { SyncProgressModal } from './SyncProgressModal'

/**
 * Database statistics
 */
export interface DatabaseStats {
  totalCves: number
  lastUpdate: string | null
  dbSize: number
  version: number
}

/**
 * Coverage statistics by year
 */
export interface CoverageByYear {
  year: number
  count: number
}

/**
 * Detailed database statistics for display
 */
export interface DetailedDatabaseStats {
  totalCves: number
  lastUpdate: string | null
  dbSize: number
  version: number
  coverageByYear: CoverageByYear[]
  oldestCve: string | null
  newestCve: string | null
}

/**
 * Sync status
 */
export interface SyncStatus {
  isSyncing: boolean
  isPaused: boolean
  progress: number
  total: number
  currentYear: number | null
  currentFile: string | null
  error: string | null
  lastSync: string | null
  status: 'idle' | 'syncing' | 'paused' | 'error' | 'cancelled'
}

/**
 * Sync progress information for modal
 */
export interface SyncProgress {
  phase: 'initializing' | 'downloading' | 'importing' | 'indexing' | 'complete' | 'error' | 'cancelled'
  currentYear: number | null
  totalYears: number
  yearsCompleted: number
  cvesImported: number
  cvesSkipped: number
  cvesFailed: number
  percentComplete: number
  estimatedTimeRemainingSec: number
  currentBatch: number
  totalBatches: number
  startedAt: string
  lastUpdatedAt: string
  errors: SyncError[]
  downloadSpeed: number
}

/**
 * Sync error information
 */
export interface SyncError {
  timestamp: string
  cveId?: string
  year?: number
  message: string
  recoverable: boolean
}

/**
 * Props for DatabaseStatus component
 */
export interface DatabaseStatusProps {
  className?: string
  showDetailedStats?: boolean
  onSyncStart?: (type: 'recent' | 'full') => void
  onSyncCancel?: () => void
  onSyncPause?: () => void
  onSyncResume?: () => void
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Format duration in seconds to human readable string
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Calculating...'

  if (seconds < 60) {
    return `${Math.round(seconds)}s remaining`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${minutes}m ${secs}s remaining`
  } else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m remaining`
  }
}

/**
 * Format last sync time to relative string
 */
function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return 'Never'

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 7) {
    return date.toLocaleDateString()
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else {
    return 'Just now'
  }
}

/**
 * Check if database is stale (last sync > 7 days ago)
 */
function isStale(dateStr: string | null): boolean {
  if (!dateStr) return true

  const date = new Date(dateStr)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  return date < weekAgo
}

/**
 * Get current year
 */
const CURRENT_YEAR = new Date().getFullYear()

/**
 * DatabaseStatus Component
 */
export const DatabaseStatus: React.FC<DatabaseStatusProps> = ({
  className = '',
  showDetailedStats = false,
  onSyncStart,
  onSyncCancel,
  onSyncPause,
  onSyncResume,
}) => {
  // State
  const [stats, setStats] = useState<DetailedDatabaseStats | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)

  /**
   * Load database stats and sync status
   */
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Get basic stats
      const statsResponse = await getPlatform().database.getStats()
      if (statsResponse.success && statsResponse.stats) {
        // Try to get detailed stats for coverage by year
        const coverageByYear: CoverageByYear[] = []
        let oldestCve: string | null = null
        let newestCve: string | null = null

        try {
          const detailedResponse = await getPlatform().database.getDetailedStats()
          if (detailedResponse.success && detailedResponse.stats) {
            oldestCve = detailedResponse.stats.oldestCve
            newestCve = detailedResponse.stats.newestCve
          }
        } catch {
          // Detailed stats not available, use basic stats only
        }

        setStats({
          totalCves: statsResponse.stats.totalCves,
          lastUpdate: statsResponse.stats.lastUpdate,
          dbSize: statsResponse.stats.dbSize,
          version: statsResponse.stats.version,
          coverageByYear,
          oldestCve,
          newestCve,
        })
      }

      // Get sync status
      const syncResponse = await getPlatform().database.getSyncStatus()
      if (syncResponse.success && syncResponse.status) {
        setSyncStatus(syncResponse.status)
        setSyncing(syncResponse.status.isSyncing)

        if (syncResponse.status.isSyncing) {
          setShowSyncModal(true)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database status')
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Start sync - recent years only (last 2 years)
   */
  const startSyncRecent = useCallback(async () => {
    try {
      setError(null)
      setSyncing(true)
      setShowSyncModal(true)

      const years = [CURRENT_YEAR - 1, CURRENT_YEAR]

      const response = await getPlatform().database.startSync({ years })

      if (!response.success) {
        setError(response.error || 'Failed to start sync')
        setSyncing(false)
        setShowSyncModal(false)
      }

      onSyncStart?.('recent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync')
      setSyncing(false)
      setShowSyncModal(false)
    }
  }, [onSyncStart])

  /**
   * Start full history sync (1999 to present)
   */
  const startSyncFull = useCallback(async () => {
    try {
      setError(null)
      setSyncing(true)
      setShowSyncModal(true)

      // Generate years from 1999 to current year
      const years: number[] = []
      for (let year = 1999; year <= CURRENT_YEAR; year++) {
        years.push(year)
      }

      const response = await getPlatform().database.startSync({ years })

      if (!response.success) {
        setError(response.error || 'Failed to start sync')
        setSyncing(false)
        setShowSyncModal(false)
      }

      onSyncStart?.('full')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync')
      setSyncing(false)
      setShowSyncModal(false)
    }
  }, [onSyncStart])

  /**
   * Cancel sync
   */
  const cancelSync = useCallback(async () => {
    try {
      await getPlatform().database.cancelSync()
      setSyncing(false)
      setShowSyncModal(false)
      onSyncCancel?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel sync')
    }
  }, [onSyncCancel])

  /**
   * Pause sync
   */
  const pauseSync = useCallback(() => {
    onSyncPause?.()
    // Note: Pause functionality would be implemented in the sync service
  }, [onSyncPause])

  /**
   * Resume sync
   */
  const resumeSync = useCallback(() => {
    onSyncResume?.()
    // Note: Resume functionality would be implemented in the sync service
  }, [onSyncResume])

  /**
   * Close sync modal
   */
  const closeSyncModal = useCallback(() => {
    if (!syncing) {
      setShowSyncModal(false)
      setSyncProgress(null)
    }
  }, [syncing])

  // Load data on mount and set up event listeners
  useEffect(() => {
    loadData()

    // Set up sync event listeners
    const unsubscribeProgress = getPlatform().database.onSyncProgress((rawProgress) => {
      setSyncing(true)

      // Coerce to Record for safe dynamic field access (callback may carry
      // DeltaSyncProgress or BulkDownloadProgress fields depending on sync type)
      const progress = rawProgress as unknown as Record<string, unknown>

      // Map the progress data to our interface
      setSyncProgress({
        phase: (progress.phase as string) || 'downloading',
        currentYear: (progress.currentYear as number | null) ?? (progress.year as number | null) ?? null,
        totalYears: (progress.totalYears as number) || 1,
        yearsCompleted: (progress.yearsCompleted as number) || 0,
        cvesImported: (progress.cvesImported as number) ?? (progress.cvesProcessed as number) ?? 0,
        cvesSkipped: (progress.cvesSkipped as number) || 0,
        cvesFailed: (progress.cvesFailed as number) || 0,
        percentComplete: (progress.percentComplete as number) ?? (progress.percentage as number) ?? 0,
        estimatedTimeRemainingSec:
          (progress.estimatedTimeRemainingSec as number) ??
          Math.ceil(((progress.estimatedTimeRemainingMs as number) || 0) / 1000),
        currentBatch: (progress.currentBatch as number) || 0,
        totalBatches: (progress.totalBatches as number) || 0,
        startedAt: (progress.startedAt as string) || new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        errors: (progress.errors as string[]) || [],
        downloadSpeed: (progress.downloadSpeed as number) || 0,
      })

      if (!showSyncModal) {
        setShowSyncModal(true)
      }
    })

    const unsubscribeComplete = getPlatform().database.onSyncComplete(() => {
      setSyncing(false)
      setSyncProgress((prev) => (prev ? { ...prev, phase: 'complete', percentComplete: 100 } : null))
      loadData() // Reload stats

      // Auto-close modal after 2 seconds
      setTimeout(() => {
        setShowSyncModal(false)
        setSyncProgress(null)
      }, 2000)
    })

    const unsubscribeError = getPlatform().database.onSyncError((err: string) => {
      setSyncing(false)
      setError(err || 'Sync failed')

      setSyncProgress((prev) =>
        prev
          ? {
              ...prev,
              phase: 'error',
              errors: [
                ...prev.errors,
                {
                  timestamp: new Date().toISOString(),
                  message: err.error || err.message || 'Unknown error',
                  recoverable: true,
                },
              ],
            }
          : null,
      )
    })

    return () => {
      unsubscribeProgress()
      unsubscribeComplete()
      unsubscribeError()
    }
  }, [loadData, showSyncModal])

  // Calculate status indicator
  const statusIndicator = useMemo(() => {
    if (syncStatus?.status === 'error' || error) {
      return { icon: AlertCircle, color: 'text-orange-500', label: 'Error' }
    }
    if (syncing || syncStatus?.isSyncing) {
      return { icon: RefreshCw, color: 'text-blue-500', label: 'Syncing', animate: true }
    }
    if (syncStatus?.status === 'paused' || syncStatus?.isPaused) {
      return { icon: Pause, color: 'text-yellow-500', label: 'Paused' }
    }
    if (isStale(stats?.lastUpdate || null)) {
      return { icon: AlertCircle, color: 'text-orange-500', label: 'Stale' }
    }
    return { icon: CheckCircle2, color: 'text-green-500', label: 'Up to date' }
  }, [syncStatus, syncing, error, stats?.lastUpdate])

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Loading database status...</span>
      </div>
    )
  }

  // Error state (with no stats)
  if (error && !stats) {
    return (
      <div className={`flex items-center gap-2 text-sm text-destructive ${className}`}>
        <AlertCircle className="h-4 w-4" />
        <span>{error}</span>
        <button onClick={loadData} className="text-xs text-primary hover:underline ml-2">
          Retry
        </button>
      </div>
    )
  }

  const StatusIcon = statusIndicator.icon

  return (
    <>
      <div className={`space-y-4 ${className}`}>
        {/* Main Stats Panel */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">NVD Database</h3>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon
                className={`h-4 w-4 ${statusIndicator.color} ${statusIndicator.animate ? 'animate-spin' : ''}`}
              />
              <span className={`text-sm ${statusIndicator.color}`}>{statusIndicator.label}</span>
            </div>
          </div>

          <div className="p-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total CVEs</p>
                  <p className="text-lg font-semibold">{stats?.totalCves.toLocaleString() || 0}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <HardDrive className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Database Size</p>
                  <p className="text-lg font-semibold">{formatBytes(stats?.dbSize || 0)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Clock className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Sync</p>
                  <p className="text-sm font-medium">{formatLastSync(stats?.lastUpdate || null)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p className="text-lg font-semibold">v{stats?.version || 1}</p>
                </div>
              </div>
            </div>

            {/* Sync Progress Bar (when syncing) */}
            {syncing && syncProgress && (
              <div className="mb-4 p-3 rounded-lg bg-muted">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {syncProgress.currentYear ? `Syncing year ${syncProgress.currentYear}` : 'Syncing...'}
                  </span>
                  <span className="text-sm text-muted-foreground">{syncProgress.percentComplete.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary rounded-full h-2 transition-all duration-300"
                    style={{ width: `${syncProgress.percentComplete}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>{syncProgress.cvesImported.toLocaleString()} CVEs imported</span>
                  <span>{formatTimeRemaining(syncProgress.estimatedTimeRemainingSec)}</span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ml-auto text-destructive/50 hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Manual Sync Controls */}
            <div className="flex flex-wrap gap-2">
              {syncing ? (
                <>
                  {syncStatus?.isPaused ? (
                    <button
                      onClick={resumeSync}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Play className="h-4 w-4" />
                      Resume Sync
                    </button>
                  ) : (
                    <button
                      onClick={pauseSync}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </button>
                  )}
                  <button
                    onClick={cancelSync}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Cancel Sync
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startSyncRecent}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Zap className="h-4 w-4" />
                    Sync Recent
                  </button>
                  <button
                    onClick={startSyncFull}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
                  >
                    <History className="h-4 w-4" />
                    Sync Full History
                  </button>
                </>
              )}
              <button
                onClick={loadData}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors ml-auto"
                title="Refresh status"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Detailed Stats (optional) */}
        {showDetailedStats && stats && (
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Coverage Details</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Oldest CVE</p>
                  <p className="text-sm font-medium">
                    {stats.oldestCve ? new Date(stats.oldestCve).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Newest CVE</p>
                  <p className="text-sm font-medium">
                    {stats.newestCve ? new Date(stats.newestCve).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sync Progress Modal */}
      <SyncProgressModal
        isOpen={showSyncModal}
        progress={syncProgress}
        isPaused={syncStatus?.isPaused || false}
        onClose={closeSyncModal}
        onCancel={cancelSync}
        onPause={pauseSync}
        onResume={resumeSync}
      />
    </>
  )
}

export { DatabaseStatus }
