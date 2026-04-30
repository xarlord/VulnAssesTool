/**
 * NVD Database Manager Component
 *
 * Provides UI for managing the local NVD database:
 * - View database statistics
 * - Trigger delta sync
 * - Configure auto sync
 * - Bulk download by year
 */

import React, { useEffect, useState, useCallback } from 'react'
import { getPlatform } from '@/lib/platform'
import {
  Database,
  RefreshCw,
  Download,
  Settings,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import type {
  NvdDetailedStats,
  DeltaSyncProgress,
  DeltaSyncResult,
  BulkDownloadProgress,
} from '../../../electron/types/database'

/**
 * NVD Database Manager Props
 */
interface NvdDatabaseManagerProps {
  className?: string
}

/**
 * Format duration in milliseconds to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
}

/**
 * NVD Database Manager Component
 */
export const NvdDatabaseManager: React.FC<NvdDatabaseManagerProps> = ({ className = '' }) => {
  const [stats, setStats] = useState<NvdDetailedStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<DeltaSyncProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<DeltaSyncResult | null>(null)

  // Auto sync settings
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [autoSyncInterval, setAutoSyncInterval] = useState(24)

  // Bulk download state
  const [showBulkDownload, setShowBulkDownload] = useState(false)
  const [startYear, setStartYear] = useState(2021)
  const [endYear, setEndYear] = useState(new Date().getFullYear())
  const [_bulkProgress, _setBulkProgress] = useState<BulkDownloadProgress | null>(null)

  /**
   * Load database statistics
   */
  const loadStats = useCallback(async () => {
    try {
      const response = await getPlatform().database.getDetailedStats()
      if (response.success && response.stats) {
        setStats(response.stats)
        setAutoSyncEnabled(response.stats.autoSyncEnabled)
        setAutoSyncInterval(response.stats.autoSyncIntervalHours)
      } else {
        setError(response.error || 'Failed to load statistics')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Start delta sync
   */
  const startDeltaSync = useCallback(
    async (force: boolean = false) => {
      setIsSyncing(true)
      setError(null)
      setLastResult(null)
      setSyncProgress({
        phase: 'checking',
        lastSyncAt: null,
        fetchingFrom: '',
        cvesFetched: 0,
        cvesProcessed: 0,
        cvesAdded: 0,
        cvesUpdated: 0,
        cvesSkipped: 0,
        percentage: 0,
        elapsedTimeMs: 0,
        estimatedTimeRemainingMs: 0,
        errors: [],
      })

      try {
        const result = await getPlatform().database.startDeltaSync(force)
        setLastResult(result)
        if (result.success) {
          await loadStats() // Refresh stats
        } else {
          setError(result.errors.join('; '))
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setIsSyncing(false)
        setSyncProgress(null)
      }
    },
    [loadStats],
  )

  /**
   * Cancel ongoing sync
   */
  const cancelSync = useCallback(async () => {
    try {
      await getPlatform().database.cancelSync()
      setIsSyncing(false)
      setSyncProgress(null)
    } catch (err) {
      setError(String(err))
    }
  }, [])

  /**
   * Update auto sync settings
   */
  const updateAutoSync = useCallback(async (enabled: boolean, interval: number) => {
    try {
      const result = await getPlatform().database.setAutoSync(enabled, interval)
      if (result.success) {
        setAutoSyncEnabled(enabled)
        setAutoSyncInterval(interval)
      }
    } catch (err) {
      setError(String(err))
    }
  }, [])

  /**
   * Start bulk download
   */
  const startBulkDownload = useCallback(async () => {
    setIsSyncing(true)
    setError(null)
    setShowBulkDownload(false)

    try {
      const result = await getPlatform().database.startBulkDownload({
        startYear,
        endYear,
      })

      if (result.success) {
        await loadStats()
      } else {
        setError(result.errors.join('; '))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSyncing(false)
    }
  }, [startYear, endYear, loadStats])

  // Load stats on mount
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Subscribe to sync progress events
  useEffect(() => {
    const unsubscribeProgress = getPlatform().database.onSyncProgress((progress: DeltaSyncProgress) => {
      setSyncProgress(progress)
    })

    const unsubscribeComplete = getPlatform().database.onSyncComplete((result: DeltaSyncResult) => {
      setLastResult(result)
      setIsSyncing(false)
      loadStats()
    })

    const unsubscribeError = getPlatform().database.onSyncError((err) => {
      setError(String(err))
      setIsSyncing(false)
    })

    return () => {
      unsubscribeProgress()
      unsubscribeComplete()
      unsubscribeError()
    }
  }, [loadStats])

  /**
   * Render phase badge
   */
  const renderPhaseBadge = (phase: string) => {
    const colors: Record<string, string> = {
      checking: 'bg-blue-100 text-blue-800',
      fetching: 'bg-yellow-100 text-yellow-800',
      importing: 'bg-purple-100 text-purple-800',
      complete: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    }

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[phase] || 'bg-gray-100 text-gray-800'}`}>
        {phase}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-destructive/50 hover:text-destructive">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Statistics Card */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Database className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Database Statistics</h3>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total CVEs</p>
            <p className="text-2xl font-bold">{stats?.totalCves.toLocaleString() || 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">CWE References</p>
            <p className="text-2xl font-bold">{stats?.totalCwe.toLocaleString() || 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">CPE Matches</p>
            <p className="text-2xl font-bold">{stats?.totalCpe.toLocaleString() || 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">References</p>
            <p className="text-2xl font-bold">{stats?.totalRefs.toLocaleString() || 0}</p>
          </div>
        </div>
        {stats?.lastSuccessfulSync && (
          <div className="border-t border-border p-4">
            <p className="text-sm text-muted-foreground">
              Last successful sync: {new Date(stats.lastSuccessfulSync).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Sync Progress Card */}
      {isSyncing && syncProgress && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            <h3 className="font-semibold">Sync in Progress</h3>
            {renderPhaseBadge(syncProgress.phase)}
          </div>
          <div className="p-4 space-y-3">
            {/* Progress Bar */}
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all duration-300"
                style={{ width: `${syncProgress.percentage}%` }}
              />
            </div>

            {/* Progress Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Fetched</p>
                <p className="font-medium">{syncProgress.cvesFetched}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Processed</p>
                <p className="font-medium">{syncProgress.cvesProcessed}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Added</p>
                <p className="font-medium text-green-600">{syncProgress.cvesAdded}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated</p>
                <p className="font-medium text-blue-600">{syncProgress.cvesUpdated}</p>
              </div>
            </div>

            {/* Time Info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Elapsed: {formatDuration(syncProgress.elapsedTimeMs)}</span>
              {syncProgress.estimatedTimeRemainingMs > 0 && (
                <span>ETA: {formatDuration(syncProgress.estimatedTimeRemainingMs)}</span>
              )}
            </div>

            {/* Cancel Button */}
            <button
              onClick={cancelSync}
              className="w-full py-2 px-4 rounded-lg border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
            >
              Cancel Sync
            </button>
          </div>
        </div>
      )}

      {/* Last Result Card */}
      {lastResult && !isSyncing && (
        <div className={`rounded-lg border ${lastResult.success ? 'border-green-500' : 'border-red-500'} bg-card`}>
          <div className="flex items-center gap-3 border-b border-border p-4">
            {lastResult.success ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <h3 className="font-semibold">{lastResult.success ? 'Sync Completed' : 'Sync Failed'}</h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">CVEs Added</p>
              <p className="font-medium text-green-600">{lastResult.cvesAdded}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CVEs Updated</p>
              <p className="font-medium text-blue-600">{lastResult.cvesUpdated}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CVEs Skipped</p>
              <p className="font-medium">{lastResult.cvesSkipped}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Duration</p>
              <p className="font-medium">{formatDuration(lastResult.durationMs)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sync Actions Card */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Sync Actions</h3>
        </div>
        <div className="p-4 space-y-4">
          {/* Delta Sync Button */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delta Sync</p>
              <p className="text-sm text-muted-foreground">Fetch only new and modified CVEs</p>
            </div>
            <button
              onClick={() => startDeltaSync(false)}
              disabled={isSyncing}
              className="flex items-center gap-2 py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync Now
            </button>
          </div>

          {/* Force Sync Button */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              <p className="font-medium">Force Full Sync</p>
              <p className="text-sm text-muted-foreground">Re-fetch last 7 days regardless of last sync</p>
            </div>
            <button
              onClick={() => startDeltaSync(true)}
              disabled={isSyncing}
              className="flex items-center gap-2 py-2 px-4 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Force Sync
            </button>
          </div>
        </div>
      </div>

      {/* Auto Sync Settings Card */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Auto Sync Settings</h3>
        </div>
        <div className="p-4 space-y-4">
          {/* Enable Auto Sync Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable Auto Sync</p>
              <p className="text-sm text-muted-foreground">Automatically sync database at regular intervals</p>
            </div>
            <button
              onClick={() => updateAutoSync(!autoSyncEnabled, autoSyncInterval)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                autoSyncEnabled ? 'bg-primary' : 'bg-secondary'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoSyncEnabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Sync Interval */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium">Sync Interval</p>
            </div>
            <select
              value={autoSyncInterval}
              onChange={(e) => updateAutoSync(autoSyncEnabled, Number(e.target.value))}
              disabled={!autoSyncEnabled}
              className="px-3 py-2 rounded-lg border border-border bg-background disabled:opacity-50"
            >
              <option value={6}>Every 6 hours</option>
              <option value={12}>Every 12 hours</option>
              <option value={24}>Daily</option>
              <option value={48}>Every 2 days</option>
              <option value={168}>Weekly</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Download Card */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Download className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Bulk Download</h3>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Download CVE data for specific years. This is useful for initial setup or adding historical data.
          </p>

          {!showBulkDownload ? (
            <button
              onClick={() => setShowBulkDownload(true)}
              disabled={isSyncing}
              className="w-full py-2 px-4 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Configure Bulk Download
            </button>
          ) : (
            <div className="space-y-4">
              {/* Year Range Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Year</label>
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background"
                  >
                    {Array.from({ length: 10 }, (_, i) => 2021 + i).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">End Year</label>
                  <select
                    value={endYear}
                    onChange={(e) => setEndYear(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background"
                  >
                    {Array.from({ length: 10 }, (_, i) => 2021 + i).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkDownload(false)}
                  className="flex-1 py-2 px-4 rounded-lg border border-border hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={startBulkDownload}
                  disabled={isSyncing || startYear > endYear}
                  className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSyncing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Downloading...
                    </span>
                  ) : (
                    'Start Download'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default NvdDatabaseManager
