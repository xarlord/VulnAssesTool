/**
 * Event Diff Viewer
 * Shows before/after comparison for audit events
 */

import { useState } from 'react'
import type { AuditEvent } from '@/lib/audit'
import { Eye, EyeOff } from 'lucide-react'

interface EventDiffViewerProps {
  event: AuditEvent
  className?: string
}

export function EventDiffViewer({ event, className }: EventDiffViewerProps) {
  const [showFullState, setShowFullState] = useState(false)

  const hasStateChanges = event.previousState || event.newState

  function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2)
  }

  function renderDiff(): React.ReactNode {
    if (!hasStateChanges) {
      return <div className="text-sm text-gray-500 italic">No state change data available for this event</div>
    }

    return (
      <div className="grid grid-cols-2 gap-4">
        {/* Previous State */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            {event.actionType === 'CREATE' ? <span className="text-gray-500">N/A (Creation)</span> : <>Before</>}
          </h4>
          {event.previousState && event.actionType !== 'CREATE' ? (
            <pre className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-3 text-xs overflow-x-auto">
              {formatJson(event.previousState)}
            </pre>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-3 text-xs text-gray-500">
              No previous state
            </div>
          )}
        </div>

        {/* New State */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            {event.actionType === 'DELETE' ? <span className="text-gray-500">N/A (Deletion)</span> : <>After</>}
          </h4>
          {event.newState && event.actionType !== 'DELETE' ? (
            <pre className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-3 text-xs overflow-x-auto">
              {formatJson(event.newState)}
            </pre>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-3 text-xs text-gray-500">
              No new state
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`event-diff-viewer ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">State Changes</h3>
        <button
          onClick={() => setShowFullState(!showFullState)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
        >
          {showFullState ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showFullState ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {/* Collapsible content */}
      {showFullState ? (
        <div className="space-y-4">{renderDiff()}</div>
      ) : (
        <div className="text-sm text-gray-500">
          {hasStateChanges ? (
            <span className="italic">State changes available. Click "Show Details" to view.</span>
          ) : (
            <span className="italic">No state changes recorded for this event.</span>
          )}
        </div>
      )}

      {/* Metadata */}
      {event.metadata && Object.keys(event.metadata).length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <h4 className="text-sm font-semibold mb-2">Additional Metadata</h4>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {event.metadata.description && (
              <>
                <dt className="text-gray-600 dark:text-gray-400">Description</dt>
                <dd className="text-gray-900 dark:text-gray-100">{event.metadata.description}</dd>
              </>
            )}
            {event.metadata.isBulkOperation !== undefined && (
              <>
                <dt className="text-gray-600 dark:text-gray-400">Bulk Operation</dt>
                <dd className="text-gray-900 dark:text-gray-100">{event.metadata.isBulkOperation ? 'Yes' : 'No'}</dd>
              </>
            )}
            {event.metadata.bulkItemCount !== undefined && (
              <>
                <dt className="text-gray-600 dark:text-gray-400">Items Affected</dt>
                <dd className="text-gray-900 dark:text-gray-100">{event.metadata.bulkItemCount}</dd>
              </>
            )}
            {event.metadata.relatedEntityIds && event.metadata.relatedEntityIds.length > 0 && (
              <>
                <dt className="text-gray-600 dark:text-gray-400">Related Entities</dt>
                <dd className="text-gray-900 dark:text-gray-100">{event.metadata.relatedEntityIds.length} item(s)</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
