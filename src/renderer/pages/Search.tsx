import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  getSavedSearches,
  saveSearch,
  deleteSavedSearch,
  type SavedSearch,
} from '@/lib/search'
import { SavedSearches } from '@/components/SavedSearches'
import { VirtualList } from '@/components/VirtualList'
import { isFtsAvailable } from '@/lib/database/nvdDbFts'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { NvdCveDetailModal } from '@/components/NvdCveDetailModal'
import { getSeverityTextClass } from '@/lib/severity'
import type { Severity } from '@/lib/severity'
import type { CveResult, NvdSearchRequest } from '@@/types'

/**
 * Boolean search operators and example queries shown in the search tips. These are query
 * SYNTAX the user literally types (and literal example strings), not translatable prose —
 * so they stay as data rather than going through t().
 */
const SEARCH_OPERATORS = ['AND', 'OR', 'NOT'] as const
const SEARCH_EXAMPLES = ['log4j NOT test', '"remote code execution"'] as const

// Type definitions for Electron API
type NvdSearchType = 'cve-id' | 'cpe' | 'text'

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

type SearchMode = 'projects' | 'nvd'
type NvdSearchMode = 'fts' | 'standard'

export function Search() {
  const { t } = useTranslation('search')
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

  // Saved global-search queries (FR-08.1). Persisted in localStorage via lib/search.
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => getSavedSearches())

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
    }, 300)

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
      setSyncError(typeof error === 'string' ? error : String(error))
      setIsSyncing(false)
      setSyncProgress(null)
    })

    return () => {
      cleanupProgress()
      cleanupComplete()
      cleanupError()
    }
    // Intentional mount-only setup; fetchNvdStats is a stable useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setSyncError(error instanceof Error ? error.message : t('errors.syncFailed'))
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
    if (seconds < 60) return t('sync.secondsRemaining', { seconds })
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return t('sync.minutesRemaining', { minutes, seconds: remainingSeconds })
  }

  // NVD Database search using IPC
  useEffect(() => {
    // Guards against a slow earlier query overwriting the results of a newer one.
    let ignore = false

    const performNvdSearch = async () => {
      if (searchMode === 'nvd' && debouncedQuery && isValidSearchQuery(debouncedQuery)) {
        setNvdLoading(true)
        setNvdError('')

        try {
          // Check if Electron API is available
          if (!getPlatform()?.database) {
            if (!ignore) {
              setNvdError(t('errors.databaseUnavailable'))
              setNvdResults([])
              setNvdLoading(false)
            }
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
          if (ignore) return

          if (response.success) {
            setNvdResults(response.results)
            console.log('[NVD Search] Found:', response.results.length, 'results')
          } else {
            setNvdError(response.error || t('errors.searchFailed'))
            setNvdResults([])
          }
        } catch (error) {
          if (ignore) return
          console.error('[NVD Search] Error:', error)
          setNvdError(error instanceof Error ? error.message : t('errors.unexpectedError'))
          setNvdResults([])
        } finally {
          if (!ignore) setNvdLoading(false)
        }
      } else {
        // Clear results when not in NVD mode or query is empty
        if (!ignore) {
          setNvdError('')
          setNvdResults([])
          setNvdLoading(false)
        }
      }
    }

    performNvdSearch()

    return () => {
      ignore = true
    }
  }, [debouncedQuery, searchMode, t])

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

  // Saved-search handlers (FR-08.1). saveSearch throws on empty input; the SavedSearches
  // button already gates on a non-empty query, so a throw here is unexpected — log and ignore.
  const handleSaveSearch = (name: string) => {
    try {
      setSavedSearches(saveSearch(name, query))
    } catch (error) {
      console.error('Failed to save search:', error)
    }
  }

  const handleLoadSearch = (savedQuery: string) => {
    setSearchMode('projects')
    setQuery(savedQuery)
    setSelectedIndex(-1)
  }

  const handleDeleteSearch = (id: string) => {
    setSavedSearches(deleteSavedSearch(id))
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

  // NVD severities arrive uppercase (CveResult['severity']); the shared helper's
  // Severity union is lowercase, so normalize (and fall back to 'none' for
  // unrecognized/missing values) before looking up the color class.
  const normalizeSeverity = (severity?: string): Severity => {
    const s = severity?.toLowerCase()
    if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low' || s === 'none') return s
    return 'none'
  }

  const ResultIcon = ({ type, severity }: { type: string; severity?: string }) => {
    if (type === 'vulnerability' || severity) {
      return <AlertTriangle className={`h-5 w-5 ${getSeverityTextClass(normalizeSeverity(severity))}`} />
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

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="space-y-6">
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
              {t('modeToggle.projectSearch')}
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
              {t('modeToggle.nvdDatabase')}
              {ftsAvailable && (
                <span className="ml-1 rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-600">
                  {t('modeToggle.ftsEnabled')}
                </span>
              )}
            </button>
          </div>

          {/* Sync Button - Only show in NVD mode */}
          {searchMode === 'nvd' && (
            <div className="flex items-center gap-3">
              {/* Stats Display */}
              {nvdStats && !isSyncing && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{nvdStats.totalCves.toLocaleString()}</span>{' '}
                  {t('sync.cvesInDatabase')}
                  {nvdStats.lastSuccessfulSync && (
                    <span className="ml-2">
                      {t('sync.lastSync')} {new Date(nvdStats.lastSuccessfulSync).toLocaleDateString()}
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
                      {syncProgress.phase === 'checking' && t('sync.checkingForUpdates')}
                      {syncProgress.phase === 'fetching' && t('sync.fetching', { count: syncProgress.cvesFetched })}
                      {syncProgress.phase === 'importing' && t('sync.importing', { count: syncProgress.cvesProcessed })}
                    </span>
                    {syncProgress.phase === 'checking' ? (
                      <div className="w-24 h-1 bg-orange-200 rounded overflow-hidden mt-1">
                        <div className="h-full bg-orange-600 animate-pulse" style={{ width: '100%' }} />
                      </div>
                    ) : (
                      <span className="text-xs font-bold">
                        {syncProgress.percentage > 0
                          ? t('sync.percentValue', { percent: Math.round(syncProgress.percentage) })
                          : t('sync.percentPending')}
                        {syncProgress.estimatedTimeRemainingMs > 0 &&
                          t('sync.timeRemainingSuffix', {
                            time: formatTimeRemaining(syncProgress.estimatedTimeRemainingMs),
                          })}
                      </span>
                    )}
                  </div>
                  <X className="h-4 w-4 ml-2" />
                </button>
              ) : syncResult && !syncError ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-green-400 bg-green-50 px-3 py-1.5 text-sm text-green-700">
                    <Check className="h-4 w-4" />
                    <span>{t('sync.synced', { count: syncResult.cvesAdded + syncResult.cvesUpdated })}</span>
                  </div>
                  <button
                    onClick={() => {
                      setSyncResult(null)
                      handleStartSync()
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('sync.syncAgain')}
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
                    {t('common:actions.retry')}
                  </button>
                </div>
              ) : (
                <button
                  data-testid="nvd-sync-button"
                  onClick={handleStartSync}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('sync.syncNvdData')}
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
                searchMode === 'projects' ? t('searchInput.projectsPlaceholder') : t('searchInput.nvdPlaceholder')
              }
              className="w-full rounded-lg border border-border bg-background pl-12 pr-12 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {query && (
              <button
                onClick={handleClear}
                aria-label={t('searchInput.clearSearch')}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Saved searches - only for global project search (FR-08.1) */}
          {searchMode === 'projects' && (
            <SavedSearches
              searches={savedSearches}
              currentQuery={query}
              onSave={handleSaveSearch}
              onLoad={handleLoadSearch}
              onDelete={handleDeleteSearch}
            />
          )}

          {/* Suggestions - only for project search */}
          {searchMode === 'projects' &&
            query &&
            isValidSearchQuery(debouncedQuery) &&
            suggestions.length > 0 &&
            searchResults.length === 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm text-muted-foreground mb-2">{t('suggestions.heading')}</div>
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
                      {t('results.summary', {
                        count: counts.total,
                        projects: counts.projects,
                        components: counts.components,
                        vulnerabilities: counts.vulnerabilities,
                      })}
                    </div>

                    {/* Projects Section */}
                    {groupedResults.projects.length > 0 && (
                      <div>
                        <h2 className="mb-3 text-lg font-semibold">{t('results.projectsHeading')}</h2>
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
                        <h2 className="mb-3 text-lg font-semibold">{t('results.componentsHeading')}</h2>
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
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {t('results.inProject', { projectName: result.projectName })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Vulnerabilities Section */}
                    {groupedResults.vulnerabilities.length > 0 && (
                      <div>
                        <h2 className="mb-3 text-lg font-semibold">{t('results.vulnerabilitiesHeading')}</h2>
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
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {t('results.inProject', { projectName: result.projectName })}
                                </div>
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
                    title={t('results.noResultsFound')}
                    description={t('results.noResultsDescription', { query: debouncedQuery })}
                    action={{
                      label: t('searchInput.clearSearch'),
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
                      title={t('emptyStates.nvdErrorTitle')}
                      description={nvdError}
                      action={{
                        label: t('emptyStates.switchToProjectSearch'),
                        onClick: () => setSearchMode('projects'),
                      }}
                    />
                  ) : nvdLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
                        <p className="mt-4 text-sm text-muted-foreground">{t('emptyStates.searchingNvd')}</p>
                      </div>
                    </div>
                  ) : nvdResults.length > 0 ? (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        {t('results.nvdSummary', { count: nvdResults.length })}
                      </div>
                      <VirtualList
                        items={nvdResults}
                        itemKey="id"
                        renderItem={(vuln) => (
                          <div
                            data-testid="nvd-result"
                            onClick={() => handleNvdResultClick(vuln.cveId)}
                            className={`rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors cursor-pointer`}
                          >
                            <div className="flex items-start gap-3">
                              <ResultIcon type="vulnerability" severity={vuln.severity} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{vuln.id}</span>
                                  {vuln.cvssScore && (
                                    <span
                                      className={`text-xs rounded px-1.5 py-0.5 font-medium ${getSeverityTextClass(normalizeSeverity(vuln.severity))}`}
                                    >
                                      {t('results.cvssScore', { score: vuln.cvssScore.toFixed(1) })}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs uppercase rounded px-1.5 py-0.5 font-medium ${getSeverityTextClass(normalizeSeverity(vuln.severity))}`}
                                  >
                                    {vuln.severity || t('results.unknownSeverity')}
                                  </span>
                                </div>
                                {vuln.description && (
                                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{vuln.description}</p>
                                )}
                                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                                  {vuln.publishedAt && (
                                    <span>
                                      {t('results.published', {
                                        date: new Date(vuln.publishedAt).toLocaleDateString(),
                                      })}
                                    </span>
                                  )}
                                  {vuln.source && <span>{t('results.source', { source: vuln.source })}</span>}
                                </div>
                                <div className="mt-2 text-xs text-blue-500">{t('results.clickToViewDetails')}</div>
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
                      title={t('emptyStates.nvdNoResultsTitle')}
                      description={t('emptyStates.nvdNoResultsDescription')}
                      action={{
                        label: t('emptyStates.switchToProjectSearch'),
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
              title={t('emptyStates.startSearchingTitle')}
              description={
                searchMode === 'projects' ? t('emptyStates.startSearchingProjects') : t('emptyStates.startSearchingNvd')
              }
            />
          )}

          {/* Search Tips */}
          {!debouncedQuery && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h3 className="mb-2 font-medium">
                {searchMode === 'projects' ? t('tips.project.heading') : t('tips.nvd.heading')}
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {searchMode === 'projects' ? (
                  <>
                    <li>{t('tips.project.caseInsensitive')}</li>
                    <li>{t('tips.project.matches')}</li>
                    <li>
                      {t('tips.project.combineTermsPrefix')}
                      <strong>{SEARCH_OPERATORS[0]}</strong> / <strong>{SEARCH_OPERATORS[1]}</strong> /{' '}
                      <strong>{SEARCH_OPERATORS[2]}</strong>
                      {t('tips.project.combineTermsSuffix')}
                      <code>{SEARCH_EXAMPLES[0]}</code>, <code>{SEARCH_EXAMPLES[1]}</code>
                    </li>
                    <li>{t('tips.project.saveSearch')}</li>
                    <li>{t('tips.project.arrowKeys')}</li>
                    <li>{t('tips.project.pressEnter')}</li>
                    <li>{t('tips.project.pressEscape')}</li>
                  </>
                ) : (
                  <>
                    <li>{t('tips.nvd.byCveId')}</li>
                    <li>{t('tips.nvd.byCpeText')}</li>
                    <li>{t('tips.nvd.byComponentName')}</li>
                    <li>{t('tips.nvd.offline')}</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* CVE Detail Modal */}
      {selectedCveId && <NvdCveDetailModal cveId={selectedCveId} open={showCveModal} onClose={handleCloseCveModal} />}
    </div>
  )
}
