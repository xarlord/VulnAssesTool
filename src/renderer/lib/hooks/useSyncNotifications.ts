/**
 * useSyncNotifications Hook
 *
 * Integrates OfflineQueue sync events with the toast notification system.
 * Shows toast notifications when:
 * - Sync starts (info)
 * - Sync completes successfully (success)
 * - Sync encounters errors (error)
 *
 * @module useSyncNotifications
 */

import { useEffect, useRef } from 'react'
import { getOfflineQueue, type OfflineQueueEvent } from '@/lib/services/OfflineQueue'
import { toast } from '@/components/Toaster'
import { addNotification } from '@/lib/notifications'

/**
 * Hook that listens to OfflineQueue sync events and shows notifications
 */
export function useSyncNotifications() {
  const syncStartTimeRef = useRef<number | null>(null)
  const hadErrorsRef = useRef(false)

  useEffect(() => {
    const queue = getOfflineQueue()

    const unsubscribe = queue.addEventListener((event: OfflineQueueEvent) => {
      switch (event.type) {
        case 'sync-started':
          syncStartTimeRef.current = Date.now()
          hadErrorsRef.current = false
          toast.info(
            'Syncing Offline Requests',
            `Processing ${event.total} queued request${event.total !== 1 ? 's' : ''}...`,
          )
          break

        case 'sync-completed':
          if (syncStartTimeRef.current) {
            const duration = Math.round((Date.now() - syncStartTimeRef.current) / 1000)
            const processed = event.processed || 0

            if (hadErrorsRef.current) {
              toast.warning(
                'Sync Completed with Errors',
                `Processed ${processed} request${processed !== 1 ? 's' : ''} in ${duration}s. Some requests failed.`,
              )
              // Also add to notification center for persistence
              addNotification({
                type: 'warning',
                category: 'system',
                title: 'Offline Sync Completed with Errors',
                message: `Processed ${processed} request${processed !== 1 ? 's' : ''} in ${duration}s. Some requests failed and were not retried.`,
              })
            } else {
              toast.success(
                'Sync Completed',
                `Successfully processed ${processed} request${processed !== 1 ? 's' : ''} in ${duration}s`,
              )
              // Also add to notification center for persistence
              addNotification({
                type: 'success',
                category: 'system',
                title: 'Offline Sync Completed',
                message: `Successfully processed ${processed} queued request${processed !== 1 ? 's' : ''} in ${duration}s.`,
              })
            }
            syncStartTimeRef.current = null
          }
          break

        case 'sync-error':
          hadErrorsRef.current = true
          toast.error('Sync Error', event.error || 'An error occurred while syncing offline requests')
          break

        case 'request-processed':
          // Track if any request failed
          if (event.result && !event.result.success && !event.result.shouldRetry) {
            hadErrorsRef.current = true
          }
          break
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return null
}
