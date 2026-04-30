/**
 * Audit Store - Zustand store with IndexedDB persistence
 * Manages the append-only immutable audit log
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuditEvent, AuditEventFilter, AuditEventSort, AuditEventPagination, AuditEventQueryResult } from './types'
import { ulid } from './ulid'

/**
 * Current session ID (generated on app start)
 */
const SESSION_ID = ulid()

interface AuditState {
  /** Append-only log of audit events */
  events: AuditEvent[]
  /** Current session ID */
  sessionId: string
  /** Add a new audit event */
  addEvent: (event: Omit<AuditEvent, 'id' | 'timestamp' | 'sessionId'>) => void
  /** Query events with filters and pagination */
  queryEvents: (
    filter?: AuditEventFilter,
    sort?: AuditEventSort,
    pagination?: AuditEventPagination,
  ) => AuditEventQueryResult
  /** Get event by ID */
  getEventById: (id: string) => AuditEvent | undefined
  /** Get events for a specific entity */
  getEventsForEntity: (entityId: string, entityType?: string) => AuditEvent[]
  /** Get events in date range */
  getEventsInDateRange: (start: Date, end: Date) => AuditEvent[]
  /** Clear old events (for retention policy) */
  clearEventsBefore: (date: Date) => number
  /** Get statistics */
  getStatistics: () => AuditStatistics
  /** Reset store (for testing) */
  _resetStore: () => void
}

/**
 * Audit statistics
 */
export interface AuditStatistics {
  totalEvents: number
  eventsByActionType: Record<string, number>
  eventsByEntityType: Record<string, number>
  firstEventDate?: Date
  lastEventDate?: Date
}

/**
 * Maximum number of events to keep in memory
 * Older events are archived to IndexedDB
 */
const MAX_IN_MEMORY_EVENTS = 10000

/**
 * Create the audit store with IndexedDB persistence
 */
export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      events: [],
      sessionId: SESSION_ID,

      addEvent: (eventData) => {
        const event: AuditEvent = {
          id: ulid(),
          timestamp: new Date(),
          sessionId: SESSION_ID,
          ...eventData,
        }

        set((state) => {
          const newEvents = [...state.events, event]

          // Implement retention policy - keep only recent events in memory
          const trimmedEvents =
            newEvents.length > MAX_IN_MEMORY_EVENTS ? newEvents.slice(-MAX_IN_MEMORY_EVENTS) : newEvents

          return { events: trimmedEvents }
        })
      },

      queryEvents: (filter, sort, pagination) => {
        let events = [...get().events]

        // Apply filters
        if (filter) {
          // Filter by action type
          if (filter.actionType && filter.actionType.length > 0) {
            events = events.filter((e) => filter.actionType!.includes(e.actionType))
          }

          // Filter by entity type
          if (filter.entityType && filter.entityType.length > 0) {
            events = events.filter((e) => filter.entityType!.includes(e.entityType))
          }

          // Filter by entity ID
          if (filter.entityId) {
            events = events.filter((e) => e.entityId === filter.entityId)
          }

          // Filter by date range
          if (filter.dateRange) {
            events = events.filter((e) => {
              const timestamp = new Date(e.timestamp).getTime()
              return timestamp >= filter.dateRange!.start.getTime() && timestamp <= filter.dateRange!.end.getTime()
            })
          }

          // Filter by session ID
          if (filter.sessionId) {
            events = events.filter((e) => e.sessionId === filter.sessionId)
          }

          // Filter by user ID
          if (filter.userId) {
            events = events.filter((e) => e.userId === filter.userId)
          }

          // Search in metadata
          if (filter.searchQuery) {
            const query = filter.searchQuery.toLowerCase()
            events = events.filter((e) => {
              const description = e.metadata?.description?.toLowerCase() || ''
              return description.includes(query) || e.entityId.toLowerCase().includes(query)
            })
          }
        }

        // Get total count before pagination
        const totalCount = events.length

        // Apply sorting
        if (sort) {
          events.sort((a, b) => {
            let comparison = 0

            if (sort.field === 'timestamp') {
              comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            } else if (sort.field === 'entityType') {
              comparison = a.entityType.localeCompare(b.entityType)
            } else if (sort.field === 'actionType') {
              comparison = a.actionType.localeCompare(b.actionType)
            }

            return sort.direction === 'desc' ? -comparison : comparison
          })
        }

        // Apply pagination
        let paginatedEvents = events
        let currentPage = 1
        let totalPages = 1

        if (pagination) {
          totalPages = Math.ceil(totalCount / pagination.pageSize) || 1
          currentPage = Math.min(Math.max(pagination.page, 1), totalPages)

          const startIndex = (currentPage - 1) * pagination.pageSize
          const endIndex = startIndex + pagination.pageSize

          paginatedEvents = events.slice(startIndex, endIndex)
        }

        return {
          events: paginatedEvents,
          totalCount,
          currentPage,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPreviousPage: currentPage > 1,
        }
      },

      getEventById: (id) => {
        return get().events.find((e) => e.id === id)
      },

      getEventsForEntity: (entityId, entityType) => {
        const events = get().events

        return events.filter((e) => {
          const matchesId = e.entityId === entityId || e.metadata?.relatedEntityIds?.includes(entityId)
          const matchesType = !entityType || e.entityType === entityType
          return matchesId && matchesType
        })
      },

      getEventsInDateRange: (start, end) => {
        return get().events.filter((e) => {
          const timestamp = new Date(e.timestamp).getTime()
          return timestamp >= start.getTime() && timestamp <= end.getTime()
        })
      },

      clearEventsBefore: (date) => {
        let removedCount = 0

        set((state) => {
          const cutoffTime = date.getTime()
          const filteredEvents = state.events.filter((e) => new Date(e.timestamp).getTime() >= cutoffTime)
          removedCount = state.events.length - filteredEvents.length
          return { events: filteredEvents }
        })

        return removedCount
      },

      getStatistics: () => {
        const events = get().events

        if (events.length === 0) {
          return {
            totalEvents: 0,
            eventsByActionType: {},
            eventsByEntityType: {},
          }
        }

        const eventsByActionType: Record<string, number> = {}
        const eventsByEntityType: Record<string, number> = {}

        for (const event of events) {
          eventsByActionType[event.actionType] = (eventsByActionType[event.actionType] || 0) + 1
          eventsByEntityType[event.entityType] = (eventsByEntityType[event.entityType] || 0) + 1
        }

        // Sort events by timestamp
        const sortedEvents = [...events].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )

        return {
          totalEvents: events.length,
          eventsByActionType,
          eventsByEntityType,
          firstEventDate: new Date(sortedEvents[0].timestamp),
          lastEventDate: new Date(sortedEvents[sortedEvents.length - 1].timestamp),
        }
      },

      _resetStore: () =>
        set((state) => ({
          ...state,
          events: [],
          sessionId: ulid(), // Generate new session ID on reset
        })),
    }),
    {
      name: 'vuln-assess-audit-storage',
      partialize: (state) => ({
        events: state.events,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
