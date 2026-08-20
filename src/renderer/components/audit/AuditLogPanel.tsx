/**
 * Audit Log Panel
 * Displays audit events with filtering and pagination
 */

import { useState, useEffect } from 'react'
import { useAuditStore } from '@/lib/audit'
import type { AuditEvent, AuditEventFilter, AuditEventSort } from '@/lib/audit'
import { exportAuditLogs } from '@/lib/audit/auditExporters'
import { formatDistanceToNow } from 'date-fns'
import {
  Activity,
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  FileJson,
  FileSpreadsheet,
  FileText,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AuditLogPanelProps {
  className?: string
  entityId?: string
  entityType?: string
}

export function AuditLogPanel({ className, entityId, entityType }: AuditLogPanelProps) {
  const { t } = useTranslation('auditLogPanel')
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [sort, setSort] = useState<AuditEventSort>({
    field: 'timestamp',
    direction: 'desc',
  })

  // Filter states
  const [actionTypeFilter, setActionTypeFilter] = useState<string[]>([])
  const [entityTypeFilter, setEntityTypeFilter] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7days' | '30days' | '90days'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const actionTypes = ['CREATE', 'UPDATE', 'DELETE', 'SCAN', 'EXPORT', 'SETTINGS_CHANGE', 'BULK_OPERATION']
  const entityTypes = ['project', 'sbom', 'vulnerability', 'component', 'settings', 'profile', 'notification']
  const dateRanges = [
    { value: 'all' as const, label: t('filters.dateRange.all') },
    { value: '7days' as const, label: t('filters.dateRange.last7Days') },
    { value: '30days' as const, label: t('filters.dateRange.last30Days') },
    { value: '90days' as const, label: t('filters.dateRange.last90Days') },
  ]

  // Resolve the selected preset into a concrete {start, end} window (undefined = all time),
  // shared by the on-screen query and the export menu so both stay consistent.
  function resolveDateRange(): { start: Date; end: Date } | undefined {
    if (dateRangeFilter === 'all') return undefined
    const days = parseInt(dateRangeFilter.replace('days', ''), 10)
    const end = new Date()
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    return { start, end }
  }

  // Action type colors
  const getActionColor = (actionType: string) => {
    const colors: Record<string, string> = {
      CREATE: 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400',
      UPDATE: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400',
      DELETE: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400',
      SCAN: 'text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400',
      EXPORT: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950 dark:text-cyan-400',
      SETTINGS_CHANGE: 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400',
      BULK_OPERATION: 'text-pink-600 bg-pink-50 dark:bg-pink-950 dark:text-pink-400',
    }
    return colors[actionType] || 'text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400'
  }

  // Load events
  useEffect(() => {
    loadEvents()
  }, [currentPage, sort, actionTypeFilter, entityTypeFilter, searchQuery, dateRangeFilter])

  function loadEvents() {
    const filter: AuditEventFilter = {}

    if (entityId) filter.entityId = entityId
    if (entityType) filter.entityType = [entityType as any]
    if (actionTypeFilter.length > 0) filter.actionType = actionTypeFilter as any
    if (entityTypeFilter.length > 0) filter.entityType = entityTypeFilter as any
    if (searchQuery) filter.searchQuery = searchQuery
    const dateRange = resolveDateRange()
    if (dateRange) filter.dateRange = dateRange

    const result = useAuditStore
      .getState()
      .queryEvents(Object.keys(filter).length > 0 ? filter : undefined, sort, { page: currentPage, pageSize })

    setEvents(result.events)
    setTotalCount(result.totalCount)
  }

  function buildCurrentFilter(): AuditEventFilter | undefined {
    const filter: AuditEventFilter = {}
    if (entityId) filter.entityId = entityId
    if (entityType) filter.entityType = [entityType as any]
    if (actionTypeFilter.length > 0) filter.actionType = actionTypeFilter as any
    if (entityTypeFilter.length > 0) filter.entityType = [...(filter.entityType || []), ...entityTypeFilter] as any
    if (searchQuery) filter.searchQuery = searchQuery
    const dateRange = resolveDateRange()
    if (dateRange) filter.dateRange = dateRange
    return Object.keys(filter).length > 0 ? filter : undefined
  }

  function toggleActionType(actionType: string) {
    setActionTypeFilter((prev) =>
      prev.includes(actionType) ? prev.filter((t) => t !== actionType) : [...prev, actionType],
    )
    setCurrentPage(1)
  }

  function toggleEntityType(type: string) {
    setEntityTypeFilter((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))
    setCurrentPage(1)
  }

  function handleSort(field: AuditEventSort['field']) {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className={`audit-log-panel ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">{t('header.title')}</h2>
          <span className="text-sm text-muted-foreground">{t('header.eventCount', { count: totalCount })}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Filter className="w-4 h-4" />
            {t('header.filtersButton')}
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download className="w-4 h-4" />
              {t('common:actions.export')}
            </button>

            {showExportMenu && (
              <div className="absolute right-0 z-10 mt-1 w-48 bg-white dark:bg-gray-800 border rounded-md shadow-lg">
                <button
                  onClick={() => {
                    void exportAuditLogs({ format: 'csv', filter: buildCurrentFilter() })
                    setShowExportMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  {t('export.csv')}
                </button>
                <button
                  onClick={() => {
                    void exportAuditLogs({ format: 'json', filter: buildCurrentFilter() })
                    setShowExportMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <FileJson className="w-4 h-4 text-blue-600" />
                  {t('export.json')}
                </button>
                <button
                  onClick={() => {
                    void exportAuditLogs({ format: 'pdf', filter: buildCurrentFilter() })
                    setShowExportMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <FileText className="w-4 h-4 text-red-600" />
                  {t('export.pdf')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 mb-4 border rounded-md bg-gray-50 dark:bg-gray-900">
          {/* Search */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">{t('filters.search.label')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder={t('filters.search.placeholder')}
                className="w-full pl-10 pr-3 py-2 border rounded-md"
              />
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">{t('filters.dateRange.label')}</label>
            <div className="flex flex-wrap gap-2">
              {dateRanges.map((range) => (
                <button
                  key={range.value}
                  onClick={() => {
                    setDateRangeFilter(range.value)
                    setCurrentPage(1)
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    dateRangeFilter === range.value
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Type Filter */}
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">{t('filters.actionType.label')}</label>
            <div className="flex flex-wrap gap-2">
              {actionTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleActionType(type)}
                  className={`px-2 py-1 text-xs rounded ${
                    actionTypeFilter.includes(type)
                      ? getActionColor(type)
                      : 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Entity Type Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('filters.entityType.label')}</label>
            <div className="flex flex-wrap gap-2">
              {entityTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleEntityType(type)}
                  className={`px-2 py-1 text-xs rounded capitalize ${
                    entityTypeFilter.includes(type)
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="border rounded-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b">
            <tr>
              <th
                onClick={() => handleSort('timestamp')}
                className="px-4 py-2 text-left text-sm font-medium cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {t('table.columns.timestamp')}
                {sort.field === 'timestamp' &&
                  (sort.direction === 'asc' ? (
                    <ChevronUp className="inline w-4 h-4" />
                  ) : (
                    <ChevronDown className="inline w-4 h-4" />
                  ))}
              </th>
              <th
                onClick={() => handleSort('actionType')}
                className="px-4 py-2 text-left text-sm font-medium cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {t('table.columns.action')}
                {sort.field === 'actionType' &&
                  (sort.direction === 'asc' ? (
                    <ChevronUp className="inline w-4 h-4" />
                  ) : (
                    <ChevronDown className="inline w-4 h-4" />
                  ))}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">{t('table.columns.entity')}</th>
              <th className="px-4 py-2 text-left text-sm font-medium">{t('table.columns.description')}</th>
              <th className="px-4 py-2 text-left text-sm font-medium">{t('table.columns.session')}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {t('table.noEvents')}
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="px-4 py-2 text-sm">
                    <div>{new Date(event.timestamp).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 text-xs rounded font-medium ${getActionColor(event.actionType)}`}>
                      {event.actionType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="font-medium capitalize">{event.entityType}</div>
                    <div className="text-xs text-muted-foreground font-mono">{event.entityId.substring(0, 12)}...</div>
                  </td>
                  <td className="px-4 py-2 text-sm max-w-md truncate">{event.metadata?.description || '-'}</td>
                  <td className="px-4 py-2 text-sm font-mono text-xs text-muted-foreground">
                    {event.sessionId.substring(0, 8)}...
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            {t('pagination.showing', {
              start: (currentPage - 1) * pageSize + 1,
              end: Math.min(currentPage * pageSize, totalCount),
              total: totalCount,
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('pagination.first')}
            </button>
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('pagination.previous')}
            </button>
            <span className="px-3 py-1 text-sm">
              {t('pagination.page', { current: currentPage, total: totalPages })}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('pagination.next')}
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('pagination.last')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
