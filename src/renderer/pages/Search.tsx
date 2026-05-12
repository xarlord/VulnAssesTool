import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search as SearchIcon,
  Shield,
  AlertTriangle,
  Package,
  X,
  Database,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react'
import { getPlatform } from '@/lib/platform'
import { useProjects } from '@/store/useStore'
import {
  buildSearchIndex,
  searchIndex,
  groupSearchResults,
  getSearchResultCounts,
  isValidSearchQuery,
  getSearchSuggestions,
} from '@/lib/search'
import { VirtualList } from '@/components/VirtualList'
import { isFtsAvailable } from '@/lib/database/nvdDbFts'
import { EmptyState } from '@/components/EmptyState'
import { NvdCveDetailModal } from '@/components/NvdCveDetailModal'
import type { CveResult, NvdSearchRequest, NvdSearchResponse } from '@@/types'

// Type definitions for Electron API
type NvdSearchType = 'cve-id' | 'cpe' | 'text'

interface DatabaseAPI {
  search(request: NvdSearchRequest): Promise<NvdSearchResponse>
  startDeltaSync(force?: boolean): Promise<DeltaSyncResult>
  cancelSync(): Promise<{ success: boolean }>
  getDetailedStats(): Promise<GetDetailedStatsResponse>
  onSyncProgress(callback: (progress: DeltaSyncProgress) => void): () => void
  onSyncComplete(callback: (result: DeltaSyncResult) => void): () => void
  onSyncError(callback: (error: string) => void): () => void
}

interface DeltaSyncProgress {
  phase: 'checking' | 'fetching' | 'importing' | 'complete' | 'error' | 'cancelled'
  lastSyncAt: string | null
  fetchingFrom: string
  cvesFetched: number
  cvesProcessed: number
  cvesAdded: number
  cvesUpdated: number
  cvesSkipped: number
  percentage: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  errors: string[]
}

interface DeltaSyncResult {
  success: boolean
  cvesFetched: number
  cvesAdded: number
  cvesUpdated: number
  cvesSkipped: number
  cvesFailed: number
  durationMs: number
  syncedAt: string
  errors: string[]
}

interface NvdDetailedStats {
  totalCves: number
  totalCwe: number
  totalCpe: number
  totalRefs: number
  oldestCve: string | null
  newestCve: string | null
  lastSuccessfulSync: string | null
  autoSyncEnabled: boolean
  autoSyncIntervalHours: number
}

interface GetDetailedStatsResponse {
  success: boolean
  stats: NvdDetailedStats | null
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      database: DatabaseAPI
    }
  }
}

type SearchMode = 'projects' | 'nvd'
type NvdSearchMode = 'fts' | 'standard'

export function Search() {
  const navigate = useNavigate()
  const projects = useProjects()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searchMode, setSearchMode] = useState<SearchMode>('projects')
  const [nvdResults, setNvdResults] = useState<CveResult[]>([])
  const [nvdLoading, setNvdLoading] = useState(false)
  const [nvdError, setNvdError] = useState('')
  const [, setNvdSearchMode] = useState<NvdSearchMode>('fts')
  const [ftsAvailable, setFtsAvailable] = useState(false)
  const [selectedCveId, setSelectedCveId] = useState<string | null>(null)
  const [showCveModal, setShowCveModal] = useState(false)

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<DeltaSyncProgress | null>(null)
  const [syncResult, setSyncResult] = useState<DeltaSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [nvdStats, setNvdStats] = useState<NvdDetailedStats | null>(null)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    })

    return () => clearTimeout(timer)
  }, [query])

  // Build search index for project search
  const searchIndexData = useMemo(() => {
    return buildSearchIndex(projects)
  }, [projects])

  // Perform project search
  const searchResults = useMemo(() => {
    if (searchMode !== 'projects' || !isValidSearchQuery(debouncedQuery)) {
      return []
    }
    return searchIndex(searchIndexData, debouncedQuery)
  }, [searchIndexData, debouncedQuery, searchMode])

  // Group project results
  const groupedResults = useMemo(() => {
    return groupSearchResults(searchResults)
  }, [searchResults])

  // Get counts
  const counts = useMemo(() => {
    return getSearchResultCounts(searchResults)
  }, [searchResults])

  // Get suggestions
  const suggestions = useMemo(() => {
    return getSearchSuggestions(searchIndexData, debouncedQuery, 5)
  }, [searchIndexData, debouncedQuery])

  // Check FTS availability on mount
  useEffect(() => {
    const checkFtsAvailability = async () => {
      const available = await isFtsAvailable()
      setFtsAvailable(available)
      // Set default search type based on availability
      if (available) {
        setNvdSearchMode('fts')
      }
    }
    checkFtsAvailability()
  }, [])

  // Setup sync progress listeners
  useEffect(() => {
    if (!getPlatform()?.database) return

    const cleanupProgress = getPlatform().database.onSyncProgress((progress) => {
      setSyncProgress(progress)
      setIsSyncing(progress.phase !== 'complete' && progress.phase !== 'error' && progress.phase !== 'cancelled')
    })

    const cleanupComplete = getPlatform().database.onSyncComplete((result) => {
      setSyncResult(result)
      setIsSyncing(false)
      setSyncProgress(null)
      // Refresh stats after sync
      fetchNvdStats()
    })

    const cleanupError = getPlatform().database.onSyncError((error) => {
      setSyncError(error?.error || String(error))
      setIsSyncing(false)
      setSyncProgress(null)
    })

    return () => {
      cleanupProgress()
      cleanupComplete()
      cleanupError()
    }
  }, [])

  // Fetch NVD stats
  const fetchNvdStats = useCallback(async () => {
    if (!getPlatform()?.database?.getDetailedStats) return
    try {
      const response = await getPlatform().database.getDetailedStats()
      if (response.success && response.stats) {
        setNvdStats(response.stats)
      }
    } catch (error) {
      console.error('[NVD Stats] Error:', error)
    }
  }, [])

  // Fetch stats when switching to NVD mode
  useEffect(() => {
    if (searchMode === 'nvd') {
      fetchNvdStats()
    }
  }, [searchMode, fetchNvdStats])

  // Start sync
  const handleStartSync = async () => {
    if (!getPlatform()?.database?.startDeltaSync) return

    setSyncError(null)
    setSyncResult(null)
    setIsSyncing(true)
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
      await getPlatform().database.startDeltaSync(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed')
      setIsSyncing(false)
      setSyncProgress(null)
    }
  }

  // Cancel sync
  const handleCancelSync = async () => {
    if (!getPlatform()?.database?.cancelSync) return
    await getPlatform().database.cancelSync()
    setIsSyncing(false)
    setSyncProgress(null)
  }

  // Format time remaining
  const formatTimeRemaining = (ms: number): string => {
    if (ms <= 0) return ''
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s remaining`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s remaining`
  }

  // NVD Database search using IPC
  useEffect(() => {
    const performNvdSearch = async () => {
      if (searchMode === 'nvd' && debouncedQuery && isValidSearchQuery(debouncedQuery)) {
        setNvdLoading(true)
        setNvdError('')

        try {
          // Check if Electron API is available
          if (!getPlatform()?.database) {
            setNvdError('Database API not available. Please make sure you are running in Electron.')
            setNvdResults([])
            setNvdLoading(false)
            return
          }

          // Detect search type based on query format
          let searchType: NvdSearchType = 'text'
          const trimmedQuery = debouncedQuery.trim()

          // CVE ID format: CVE-YYYY-NNNNN (complete CVE ID only - requires 4-7 digits after the year)
          // Partial CVE IDs (like CVE-2024-123) should be treated as text searches
          if (/^CVE-\d{4}-\d{4,7}$/i.test(trimmedQuery)) {
            searchType = 'cve-id'
          }
          // CPE format starts with cpe:
          else if (trimmedQuery.toLowerCase().startsWith('cpe:')) {
            searchType = 'cpe'
          }

          const request: NvdSearchRequest = {
            type: searchType,
            query: trimmedQuery,
            limit: 50,
          }

          console.log('[NVD Search] Searching:', request)
          const response = await getPlatform().database.search(request)

          if (response.success) {
            setNvdResults(response.results)
            console.log('[NVD Search] Found:', response.results.length, 'results')
          } else {
            setNvdError(response.error || 'Search failed')
            setNvdResults([])
          }
        } catch (error) {
          console.error('[NVD Search] Error:', error)
          setNvdError(error instanceof Error ? error.message : 'An unexpected error occurred')
          setNvdResults([])
        } finally {
          setNvdLoading(false)
        }
      } else {
        // Clear results when not in NVD mode or query is empty
        setNvdError('')
        setNvdResults([])
        setNvdLoading(false)
      }
    }

    performNvdSearch()
  }, [debouncedQuery, searchMode])

  // Handle navigation to result
  const handleResultClick = (result: (typeof searchResults)[0]) => {
    if (result.type === 'project') {
      navigate(`/project/${result.projectId}`)
    } else if (result.type === 'component' || result.type === 'vulnerability') {
      navigate(`/project/${result.projectId}`)
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const results = searchMode === 'projects' ? searchResults : nvdResults
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      if (searchMode === 'projects') {
        handleResultClick(searchResults[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setQuery('')
      setSelectedIndex(-1)
    }
  }

  // Clear search
  const handleClear = () => {
    setQuery('')
    setSelectedIndex(-1)
    setNvdResults([])
    setNvdError('')
    setSyncResult(null)
    setSyncError(null)
  }

  // Handle NVD result click
  const handleNvdResultClick = (cveId: string) => {
    setSelectedCveId(cveId)
    setShowCveModal(true)
  }

  // Close CVE modal
  const handleCloseCveModal = () => {
    setShowCveModal(false)
    setSelectedCveId(null)
  }

  const ResultIcon = ({ type, severity }: { type: string; severity?: string }) => {
    if (type === 'vulnerability' || severity) {
      let colorClass = 'text-muted-foreground'
      if (severity === 'critical' || severity === 'CRITICAL') colorClass = 'text-destructive'
      else if (severity === 'high' || severity === 'HIGH') colorClass = 'text-orange-700 dark:text-orange-400'
      else if (severity === 'medium' || severity === 'MEDIUM') colorClass = 'text-amber-700 dark:text-amber-400'
      else if (severity === 'low' || severity === 'LOW') colorClass = 'text-blue-700 dark:text-blue-400'

      return <AlertTriangle className={`h-5 w-5 ${colorClass}`} />
    }
    switch (type) {
      case 'project':
        return <Shield className="h-5 w-5 text-primary" />
      case 'component':
        return <Package className="h-5 w-5 text-blue-500" />
      default:
        return null
    }
  }

  const getSeverityColor = (severity: string) => {
    const s = severity?.toLowerCase()
    switch (s) {
      case 'critical':
        return 'text-destructive'
      case 'high':
        return 'text-orange-700 dark:text-orange-400'
      case 'medium':
        return 'text-amber-700 dark:text-amber-400'
      case 'low':
        return 'text-blue-700 dark:text-blue-400'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold">Search</h1>
          <p className="text-sm text-muted-foreground">Search across all projects, components, and vulnerabilities</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Search Mode Toggle */}
          <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-1">
            <button
              onClick={() => {
                setSearchMode('projects')
                setNvdResults([])
                setSelectedIndex(-1)
                setNvdError('')
              }}
              className={`flex items-center gap-2 rounded-md px-4 py-2 min-h-[44px] text-sm font-medium transition-colors ${
                searchMode === 'projects'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Shield className="h-4 w-4" />
              Project Search
            </button>
            <button
              onClick={() => {
                setSearchMode('nvd')
                setSelectedIndex(-1)
                setNvdError('')
              }}
              className={`flex items-center gap-2 rounded-md px-4 py-2 min-h-[44px] text-sm font-medium transition-colors ${
                searchMode === 'nvd'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Database className="h-4 w-4" />
              NVD Database
              {ftsAvailable && (
                <span className="ml-1 rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-600">FTS Enabled</span>
              )}
            </button>
          </div>

          {/* Sync Button - Only show in NVD mode */}
          {searchMode === 'nvd' && (
            <div className="flex items-center gap-3">
              {/* Stats Display */}
              {nvdStats && !isSyncing && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{nvdStats.totalCves.toLocaleString()}</span> CVEs in
                  database
                  {nvdStats.lastSuccessfulSync && (
                    <span className="ml-2">
                      • Last sync: {new Date(nvdStats.lastSuccessfulSync).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}

              {/* Sync Button */}
              {isSyncing && syncProgress ? (
                <button
                  onClick={handleCancelSync}
                  className="flex items-center gap-2 rounded-lg border-2 border-orange-400 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 transition-all"
                >
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <div className="flex flex-col items-start">
                    <span className="text-xs">
                      {syncProgress.phase === 'checking' && 'Checking for updates...'}
                      {syncProgress.phase === 'fetching' && `Fetching: ${syncProgress.cvesFetched} CVEs`}
                      {syncProgress.phase === 'importing' && `Importing: ${syncProgress.cvesProcessed} CVEs`}
                    </span>
                    {syncProgress.phase === 'checking' ? (
                      <div className="w-24 h-1 bg-orange-200 rounded overflow-hidden mt-1">
                        <div className="h-full bg-orange-600 animate-pulse" style={{ width: '100%' }} />
                      </div>
                    ) : (
                      <span className="text-xs font-bold">
                        {syncProgress.percentage > 0 ? `${Math.round(syncProgress.percentage)}%` : '...'}
                        {syncProgress.estimatedTimeRemainingMs > 0 &&
                          ` - ${formatTimeRemaining(syncProgress.estimatedTimeRemainingMs)}`}
                      </span>
                    )}
                  </div>
                  <X className="h-4 w-4 ml-2" />
                </button>
              ) : syncResult && !syncError ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-green-400 bg-green-50 px-3 py-1.5 text-sm text-green-700">
                    <Check className="h-4 w-4" />
                    <span>Synced {syncResult.cvesAdded + syncResult.cvesUpdated} CVEs</span>
                  </div>
                  <button
                    onClick={() => {
                      setSyncResult(null)
                      handleStartSync()
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Sync Again
                  </button>
                </div>
              ) : syncError ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-red-400 bg-red-50 px-3 py-1.5 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <span>{syncError}</span>
                  </div>
                  <button
                    onClick={() => {
                      setSyncError(null)
                      handleStartSync()
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                </div>
              ) : (
                <button
                  data-testid="nvd-sync-button"
                  onClick={handleStartSync}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Sync NVD Data
                </button>
              )}
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              data-testid="nvd-search-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedIndex(-1)
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                searchMode === 'projects'
                  ? 'Search projects, components, vulnerabilities...'
                  : 'Search NVD database by CVE ID (CVE-YYYY-NNNN) or CPE text...'
              }
              className="w-full rounded-lg border border-border bg-background pl-12 pr-12 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {query && (
              <button
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Suggestions - only for project search */}
          {searchMode === 'projects' &&
            query &&
            isValidSearchQuery(debouncedQuery) &&
            suggestions.length > 0 &&
            searchResults.length === 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm text-muted-foreground mb-2">Suggestions</div>
                <div className="space-y-1">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => setQuery(suggestion)}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* Results */}
          {debouncedQuery && isValidSearchQuery(debouncedQuery) ? (
            <>
              {searchMode === 'projects' &&
                (searchResults.length > 0 ? (
                  <div className="space-y-6">
                    {/* Result Counts */}
                    <div className="text-sm text-muted-foreground">
                      Found {counts.total} result{counts.total !== 1 ? 's' : ''} ({counts.projects} projects,{' '}
                      {counts.components} components, {counts.vulnerabilities} vulnerabilities)
                    </div>

                    {/* Projects Section */}
                    {groupedResults.projects.length > 0 && (
                      <div>
                        <h2 className="mb-3 text-lg font-semibold">Projects</h2>
                        <div className="space-y-2">
                          {groupedResults.projects.map((result) => (
                            <div
                              key={result.id}
                              onClick={() => handleResultClick(result)}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors ${
                                selectedIndex === searchResults.indexOf(result) ? 'ring-2 ring-ring' : ''
                              }`}
                            >
                              <ResultIcon type={result.type} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{result.title}</div>
                                <div className="mt-1 text-sm text-muted-foreground line-clamp-1">
                                  {result.description}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Components Section */}
                    {groupedResults.components.length > 0 && (
                      <div>
                        <h2 className="mb-3 text-lg font-semibold">Components</h2>
                        <div className="space-y-2">
                          {groupedResults.components.map((result) => (
                            <div
                              key={result.id}
                              onClick={() => handleResultClick(result)}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors ${
                                selectedIndex === searchResults.indexOf(result) ? 'ring-2 ring-ring' : ''
                              }`}
                            >
                              <ResultIcon type={result.type} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{result.title}</div>
                                <div className="mt-1 text-sm text-muted-foreground">{result.description}</div>
                                <div className="mt-1 text-xs text-muted-foreground">in {result.projectName}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Vulnerabilities Section */}
                    {groupedResults.vulnerabilities.length > 0 && (
                      <div>
                        <h2 className="mb-3 text-lg font-semibold">Vulnerabilities</h2>
                        <div className="space-y-2">
                          {groupedResults.vulnerabilities.map((result) => (
                            <div
                              key={result.id}
                              onClick={() => handleResultClick(result)}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors ${
                                selectedIndex === searchResults.indexOf(result) ? 'ring-2 ring-ring' : ''
                              }`}
                            >
                              <ResultIcon type={result.type} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{result.title}</div>
                                <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                  {result.description}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">in {result.projectName}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={SearchIcon}
                    title="No results found"
                    description={`No matches found for "${debouncedQuery}" in your projects`}
                    action={{
                      label: 'Clear search',
                      onClick: handleClear,
                    }}
                  />
                ))}

              {/* NVD Results */}
              {searchMode === 'nvd' && (
                <>
                  {nvdError ? (
                    <EmptyState
                      icon={Database}
                      title="NVD Database Search"
                      description={nvdError}
                      action={{
                        label: 'Switch to Project Search',
                        onClick: () => setSearchMode('projects'),
                      }}
                    />
                  ) : nvdLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
                        <p className="mt-4 text-sm text-muted-foreground">Searching NVD database...</p>
                      </div>
                    </div>
                  ) : nvdResults.length > 0 ? (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        Found {nvdResults.length} result{nvdResults.length !== 1 ? 's' : ''} in NVD database
                      </div>
                      <VirtualList
                        items={nvdResults}
                        itemKey="id"
                        renderItem={(vuln) => (
                          <div
                            data-testid="nvd-result"
                            onClick={() => handleNvdResultClick(vuln.id)}
                            className={`rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors cursor-pointer`}
                          >
                            <div className="flex items-start gap-3">
                              <ResultIcon type="vulnerability" severity={vuln.severity} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{vuln.id}</span>
                                  {vuln.cvssScore && (
                                    <span
                                      className={`text-xs rounded px-1.5 py-0.5 font-medium ${getSeverityColor(vuln.severity)}`}
                                    >
                                      CVSS {vuln.cvssScore.toFixed(1)}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs uppercase rounded px-1.5 py-0.5 font-medium ${getSeverityColor(vuln.severity)}`}
                                  >
                                    {vuln.severity || 'UNKNOWN'}
                                  </span>
                                </div>
                                {vuln.description && (
                                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{vuln.description}</p>
                                )}
                                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                                  {vuln.publishedAt && (
                                    <span>Published: {new Date(vuln.publishedAt).toLocaleDateString()}</span>
                                  )}
                                  {vuln.source && <span>Source: {vuln.source}</span>}
                                </div>
                                <div className="mt-2 text-xs text-blue-500">Click to view details</div>
                              </div>
                            </div>
                          </div>
                        )}
                        defaultItemHeight={150}
                        height="600px"
                        className="space-y-3 border-0"
                      />
                    </div>
                  ) : (
                    <EmptyState
                      icon={Database}
                      title="Search NVD Database"
                      description="Search the NVD database by CVE ID (e.g., CVE-2024-1234) or keywords. Results appear from your local database."
                      action={{
                        label: 'Switch to Project Search',
                        onClick: () => setSearchMode('projects'),
                      }}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <EmptyState
              icon={SearchIcon}
              title="Start searching"
              description={
                searchMode === 'projects'
                  ? 'Enter a search term to find projects, components, and vulnerabilities'
                  : 'Enter a CVE ID (e.g., CVE-2024-1234) or CPE text to search the NVD database'
              }
            />
          )}

          {/* Search Tips */}
          {!debouncedQuery && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h3 className="mb-2 font-medium">
                {searchMode === 'projects' ? 'Project Search Tips' : 'NVD Database Search Tips'}
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {searchMode === 'projects' ? (
                  <>
                    <li>• Search is case-insensitive</li>
                    <li>• Matches project names, component names, vulnerability IDs, and descriptions</li>
                    <li>• Use arrow keys to navigate results</li>
                    <li>• Press Enter to open selected result</li>
                    <li>• Press Escape to clear search</li>
                  </>
                ) : (
                  <>
                    <li>• Search by CVE ID: CVE-2024-1234</li>
                    <li>• Search by CPE text: cpe:2.3:a:vendor:product:*</li>
                    <li>• Search by component name: apache, nginx, openssl</li>
                    <li>• Results come from your local NVD database (offline)</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </main>

      {/* CVE Detail Modal */}
      {selectedCveId && <NvdCveDetailModal cveId={selectedCveId} open={showCveModal} onClose={handleCloseCveModal} />}
    </div>
  )
}
