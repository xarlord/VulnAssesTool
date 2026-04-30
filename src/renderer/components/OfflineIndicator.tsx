/**
 * OfflineIndicator Component
 *
 * Displays the current online/offline status and queue information.
 * Shows a visual indicator when offline and displays the number of
 * pending requests in the queue.
 *
 * @module OfflineIndicator
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw, CheckCircle } from 'lucide-react'
import { getOfflineQueue, type OfflineQueueEvent, type QueueStats } from '@/lib/services/OfflineQueue'

/**
 * Props for the OfflineIndicator component
 */
export interface OfflineIndicatorProps {
  /** Whether to show detailed queue info (default: true) */
  showQueueInfo?: boolean
  /** Whether to show sync progress (default: true) */
  showSyncProgress?: boolean
  /** Custom class name */
  className?: string
  /** Compact mode - icon only */
  compact?: boolean
}

/**
 * Sync progress state
 */
interface SyncProgress {
  isSyncing: boolean
  progress: number
  total: number
  processed: number
}

/**
 * OfflineIndicator component shows online/offline status and queue information
 */
export function OfflineIndicator({
  showQueueInfo = true,
  showSyncProgress = true,
  className = '',
  compact = false,
}: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true)
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    isSyncing: false,
    progress: 0,
    total: 0,
    processed: 0,
  })

  // Update queue stats
  const updateStats = useCallback(() => {
    const queue = getOfflineQueue()
    setIsOnline(queue.getIsOnline())
    setQueueStats(queue.getStats())
  }, [])

  useEffect(() => {
    const queue = getOfflineQueue()

    // Initial state
    updateStats()

    // Subscribe to queue events
    const unsubscribe = queue.addEventListener((event: OfflineQueueEvent) => {
      switch (event.type) {
        case 'online':
          setIsOnline(true)
          break
        case 'offline':
          setIsOnline(false)
          break
        case 'queue-changed':
        case 'sync-completed':
          updateStats()
          break
        case 'sync-started':
          setSyncProgress({
            isSyncing: true,
            progress: 0,
            total: event.total || 0,
            processed: 0,
          })
          break
        case 'sync-progress':
          setSyncProgress((prev) => ({
            ...prev,
            progress: event.progress || 0,
            processed: event.processed || 0,
          }))
          break
        case 'sync-error':
          setSyncProgress((prev) => ({
            ...prev,
            isSyncing: false,
          }))
          break
      }
    })

    return () => {
      unsubscribe()
    }
  }, [updateStats])

  // Reset sync progress when complete
  useEffect(() => {
    if (syncProgress.progress === 100) {
      const timer = setTimeout(() => {
        setSyncProgress({
          isSyncing: false,
          progress: 0,
          total: 0,
          processed: 0,
        })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [syncProgress.progress])

  const queueLength = queueStats?.queueLength || 0

  // Compact mode - just show icon with badge
  if (compact) {
    return (
      <div
        className={`flex items-center gap-1 ${className}`}
        title={isOnline ? 'Online' : `Offline - ${queueLength} requests queued`}
      >
        {syncProgress.isSyncing ? (
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        ) : isOnline ? (
          <Wifi className="h-4 w-4 text-green-500" />
        ) : (
          <div className="relative">
            <WifiOff className="h-4 w-4 text-destructive" />
            {queueLength > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {queueLength > 9 ? '9+' : queueLength}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  // Full mode with status text and queue info
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
        isOnline
          ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
          : 'border-destructive/30 bg-destructive/10 text-destructive'
      } ${className}`}
    >
      {/* Status Icon */}
      {syncProgress.isSyncing ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : isOnline ? (
        <Cloud className="h-4 w-4" />
      ) : (
        <CloudOff className="h-4 w-4" />
      )}

      {/* Status Text */}
      <span className="font-medium">
        {syncProgress.isSyncing ? `Syncing... ${syncProgress.progress}%` : isOnline ? 'Online' : 'Offline'}
      </span>

      {/* Queue Info */}
      {showQueueInfo && queueLength > 0 && !syncProgress.isSyncing && (
        <span className="text-xs opacity-75">
          ({queueLength} {queueLength === 1 ? 'request' : 'requests'} queued)
        </span>
      )}

      {/* Sync Progress Bar */}
      {showSyncProgress && syncProgress.isSyncing && (
        <div className="ml-2 flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-background/50">
            <div
              className="h-full rounded-full bg-current transition-all duration-300"
              style={{ width: `${syncProgress.progress}%` }}
            />
          </div>
          <span className="text-xs opacity-75">
            {syncProgress.processed}/{syncProgress.total}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * OfflineBanner - A more prominent banner for offline status
 * Shows at the top of the screen when offline
 */
export function OfflineBanner({ className = '' }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(true)
  const [queueLength, setQueueLength] = useState(0)
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    isSyncing: false,
    progress: 0,
    total: 0,
    processed: 0,
  })

  useEffect(() => {
    const queue = getOfflineQueue()
    setIsOnline(queue.getIsOnline())

    const unsubscribe = queue.addEventListener((event: OfflineQueueEvent) => {
      switch (event.type) {
        case 'online':
          setIsOnline(true)
          break
        case 'offline':
          setIsOnline(false)
          break
        case 'queue-changed':
          setQueueLength(event.queueLength)
          break
        case 'sync-started':
          setSyncProgress({
            isSyncing: true,
            progress: 0,
            total: event.total || 0,
            processed: 0,
          })
          break
        case 'sync-progress':
          setSyncProgress((prev) => ({
            ...prev,
            progress: event.progress || 0,
            processed: event.processed || 0,
          }))
          break
        case 'sync-completed':
          setSyncProgress({
            isSyncing: false,
            progress: 100,
            total: 0,
            processed: 0,
          })
          setQueueLength(0)
          break
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Don't show banner when online and not syncing
  if (isOnline && !syncProgress.isSyncing) {
    return null
  }

  return (
    <div
      className={`flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium ${
        syncProgress.isSyncing ? 'bg-primary text-primary-foreground' : 'bg-amber-500 text-amber-950'
      } ${className}`}
    >
      {syncProgress.isSyncing ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>
            Syncing {syncProgress.processed}/{syncProgress.total} requests...
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-primary-foreground/20">
            <div
              className="h-full rounded-full bg-primary-foreground transition-all duration-300"
              style={{ width: `${syncProgress.progress}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You are offline</span>
          {queueLength > 0 && (
            <span className="opacity-75">
              • {queueLength} {queueLength === 1 ? 'request' : 'requests'} will sync when back online
            </span>
          )}
        </>
      )}
    </div>
  )
}

export default OfflineIndicator
