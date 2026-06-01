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
import { EmptyState } from '@/components/ui/EmptyState'
import { NvdCveDetailModal } from '@/components/NvdCveDetailModal'
import { AppHeader } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CveResult, NvdSearchRequest } from '@@/types'

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

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<DeltaSyncProgress | null>(null)
  const [syncResult, setSyncResult] = useState<DeltaSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [nvdStats, setNvdStats] = useState<NvdDetailedStats | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const searchIndexData = useMemo(() => {
    return buildSearchIndex(projects)
  }, [projects])

  const searchResults = useMemo(() => {
    if (searchMode !== 'projects' || !isValidSearchQuery(debouncedQuery)) {
      return []
    }
    return searchIndex(searchIndexData, debouncedQuery)
  }, [searchIndexData, debouncedQuery, searchMode])

  const groupedResults = useMemo(() => {
    return groupSearchResults(searchResults)
  }, [searchResults])

  const counts = useMemo(() => {
    return getSearchResultCounts(searchResults)
  }, [searchResults])

  const suggestions = useMemo(() => {
    return getSearchSuggestions(searchIndexData, debouncedQuery, 5)
  }, [searchIndexData, debouncedQuery])

  useEffect(() => {
    const checkFtsAvailability = async () => {
      const available = await isFtsAvailable()
      setFtsAvailable(available)
      if (available) {
        setNvdSearchMode('fts')
      }
    }
    checkFtsAvailability()
  }, [])

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
  }, [])

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

  useEffect(() => {
    if (searchMode === 'nvd') {
      fetchNvdStats()
    }
  }, [searchMode, fetchNvdStats])

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

  const handleCancelSync = async () => {
    if (!getPlatform()?.database?.cancelSync) return
    await getPlatform().database.cancelSync()
    setIsSyncing(false)
    setSyncProgress(null)
  }

  const formatTimeRemaining = (ms: number): string => {
    if (ms <= 0) return ''
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s remaining`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s remaining`
  }

  useEffect(() => {
    const performNvdSearch = async () => {
      if (searchMode === 'nvd' && debouncedQuery && isValidSearchQuery(debouncedQuery)) {
        setNvdLoading(true)
        setNvdError('')

        try {
          if (!getPlatform()?.database) {
            setNvdError('Database API not available. Please make sure you are running in Electron.')
            setNvdResults([])
            setNvdLoading(false)
            return
          }

          let searchType: NvdSearchType = 'text'
          const trimmedQuery = debouncedQuery.trim()

          if (/^CVE-\d{4}-\d{4,7}$/i.test(trimmedQuery)) {
            searchType = 'cve-id'
          } else if (trimmedQuery.toLowerCase().startsWith('cpe:')) {
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
        setNvdError('')
        setNvdResults([])
        setNvdLoading(false)
      }
    }

    performNvdSearch()
  }, [debouncedQuery, searchMode])

  const handleResultClick = (result: (typeof searchResults)[0]) => {
    if (result.type === 'project') {
      navigate(`/project/${result.projectId}`)
    } else if (result.type === 'component' || result.type === 'vulnerability') {
      navigate(`/project/${result.projectId}`)
    }
  }

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

  const handleClear = () => {
    setQuery('')
    setSelectedIndex(-1)
    setNvdResults([])
    setNvdError('')
    setSyncResult(null)
    setSyncError(null)
  }

  const handleNvdResultClick = (cveId: string) => {
    setSelectedCveId(cveId)
    setShowCveModal(true)
  }

  const handleCloseCveModal = () => {
    setShowCveModal(false)
    setSelectedCveId(null)
  }

  const handleTabChange = (value: string) => {
    const mode = value as SearchMode
    setSearchMode(mode)
    setSelectedIndex(-1)
    setNvdError('')
    if (mode === 'projects') {
      setNvdResults([])
    }
  }

  const ResultIcon = ({ type, severity }: { type: string; severity?: string }) => {
    if (type === 'vulnerability' || severity) {
      let colorClass = 'text-muted-foreground'
      if (severity === 'critical' || severity === 'CRITICAL') colorClass = 'text-destructive'
      else if (severity === 'high' || severity === 'HIGH') colorClass = 'text-orange-600'
      else if (severity === 'medium' || severity === 'MEDIUM') colorClass = 'text-amber-600'
      else if (severity === 'low' || severity === 'LOW') colorClass = 'text-blue-600'

      return <AlertTriangle className={`h-4 w-4 ${colorClass}`} />
    }
    switch (type) {
      case 'project':
        return <Shield className="h-4 w-4 text-primary" />
      case 'component':
        return <Package className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  const getSeverityBadgeClasses = (severity: string): string => {
    const s = severity?.toLowerCase()
    switch (s) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100'
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100'
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100'
    }
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Search" />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-6 space-y-6">
          <Tabs value={searchMode} onValueChange={handleTabChange}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="projects" className="gap-2 px-4">
                <Shield className="h-4 w-4" />
                Project Search
              </TabsTrigger>
              <TabsTrigger value="nvd" className="gap-2 px-4">
                <Database className="h-4 w-4" />
                NVD Database
                {ftsAvailable && (
                  <Badge variant="secondary" className="ml-1 bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0">
                    FTS
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {searchMode === 'nvd' && (
            <Card className="bg-card">
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                {nvdStats && !isSyncing && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{nvdStats.totalCves.toLocaleString()}</span> CVEs in
                    database
                    {nvdStats.lastSuccessfulSync && (
                      <span className="ml-2 text-xs">
                        &middot; Last sync: {new Date(nvdStats.lastSuccessfulSync).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {isSyncing && syncProgress ? (
                  <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-orange-600" />
                    <div className="flex flex-col text-xs text-orange-800">
                      <span>
                        {syncProgress.phase === 'checking' && 'Checking for updates...'}
                        {syncProgress.phase === 'fetching' && `Fetching: ${syncProgress.cvesFetched} CVEs`}
                        {syncProgress.phase === 'importing' && `Importing: ${syncProgress.cvesProcessed} CVEs`}
                      </span>
                      {syncProgress.phase === 'checking' ? (
                        <div className="mt-1 h-1 w-20 overflow-hidden rounded bg-orange-200">
                          <div className="h-full w-full animate-pulse bg-orange-600" />
                        </div>
                      ) : (
                        <span className="font-semibold">
                          {syncProgress.percentage > 0 ? `${Math.round(syncProgress.percentage)}%` : '...'}
                          {syncProgress.estimatedTimeRemainingMs > 0 &&
                            ` - ${formatTimeRemaining(syncProgress.estimatedTimeRemainingMs)}`}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="ml-1 h-6 w-6" onClick={handleCancelSync}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : syncResult && !syncError ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700">
                      <Check className="h-3 w-3" />
                      Synced {syncResult.cvesAdded + syncResult.cvesUpdated} CVEs
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSyncResult(null)
                        handleStartSync()
                      }}
                      className="gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sync Again
                    </Button>
                  </div>
                ) : syncError ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700">
                      <AlertCircle className="h-3 w-3" />
                      {syncError}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSyncError(null)
                        handleStartSync()
                      }}
                      className="gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <Button
                    data-testid="nvd-sync-button"
                    variant="outline"
                    size="sm"
                    onClick={handleStartSync}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync NVD Data
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
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
                  : 'Search NVD by CVE ID (CVE-YYYY-NNNN) or CPE text...'
              }
              className="h-11 pl-10 pr-10 text-base"
              autoFocus
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {searchMode === 'projects' &&
            query &&
            isValidSearchQuery(debouncedQuery) &&
            suggestions.length > 0 &&
            searchResults.length === 0 && (
              <Card>
                <CardContent className="p-2">
                  <p className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Suggestions
                  </p>
                  <div className="space-y-0.5">
                    {suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        className="w-full justify-start text-sm font-normal h-8 px-3"
                        onClick={() => setQuery(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {debouncedQuery && isValidSearchQuery(debouncedQuery) ? (
            <>
              {searchMode === 'projects' &&
                (searchResults.length > 0 ? (
                  <div className="space-y-6">
                    <p className="text-sm text-muted-foreground">
                      Found <span className="font-semibold text-foreground">{counts.total}</span> result
                      {counts.total !== 1 ? 's' : ''} &middot; {counts.projects} projects, {counts.components}{' '}
                      components, {counts.vulnerabilities} vulnerabilities
                    </p>

                    {groupedResults.projects.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Projects
                        </h3>
                        <div className="space-y-2">
                          {groupedResults.projects.map((result) => (
                            <Card
                              key={result.id}
                              className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                                selectedIndex === searchResults.indexOf(result) ? 'ring-2 ring-ring' : ''
                              }`}
                              onClick={() => handleResultClick(result)}
                            >
                              <CardContent className="flex items-start gap-3 p-4">
                                <ResultIcon type={result.type} />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium leading-tight">{result.title}</p>
                                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                                    {result.description}
                                  </p>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {groupedResults.components.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Components
                        </h3>
                        <div className="space-y-2">
                          {groupedResults.components.map((result) => (
                            <Card
                              key={result.id}
                              className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                                selectedIndex === searchResults.indexOf(result) ? 'ring-2 ring-ring' : ''
                              }`}
                              onClick={() => handleResultClick(result)}
                            >
                              <CardContent className="flex items-start gap-3 p-4">
                                <ResultIcon type={result.type} />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium leading-tight">{result.title}</p>
                                  <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>
                                  <p className="mt-0.5 text-xs text-muted-foreground/70">in {result.projectName}</p>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {groupedResults.vulnerabilities.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Vulnerabilities
                        </h3>
                        <div className="space-y-2">
                          {groupedResults.vulnerabilities.map((result) => (
                            <Card
                              key={result.id}
                              className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                                selectedIndex === searchResults.indexOf(result) ? 'ring-2 ring-ring' : ''
                              }`}
                              onClick={() => handleResultClick(result)}
                            >
                              <CardContent className="flex items-start gap-3 p-4">
                                <ResultIcon type={result.type} />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium leading-tight">{result.title}</p>
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                    {result.description}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground/70">in {result.projectName}</p>
                                </div>
                              </CardContent>
                            </Card>
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
                    action={
                      <Button variant="outline" onClick={handleClear}>
                        Clear search
                      </Button>
                    }
                  />
                ))}

              {searchMode === 'nvd' && (
                <>
                  {nvdError ? (
                    <EmptyState
                      icon={Database}
                      title="NVD Database Search"
                      description={nvdError}
                      action={
                        <Button variant="outline" onClick={() => setSearchMode('projects')}>
                          Switch to Project Search
                        </Button>
                      }
                    />
                  ) : nvdLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
                        <p className="mt-4 text-sm text-muted-foreground">Searching NVD database...</p>
                      </div>
                    </div>
                  ) : nvdResults.length > 0 ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Found <span className="font-semibold text-foreground">{nvdResults.length}</span> result
                        {nvdResults.length !== 1 ? 's' : ''} in NVD database
                      </p>
                      <VirtualList
                        items={nvdResults}
                        itemKey="id"
                        renderItem={(vuln) => (
                          <Card
                            data-testid="nvd-result"
                            className="cursor-pointer transition-colors hover:bg-accent/50"
                            onClick={() => handleNvdResultClick(vuln.cveId)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <ResultIcon type="vulnerability" severity={vuln.severity} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{vuln.id}</span>
                                    {vuln.cvssScore && (
                                      <Badge variant="outline" className="font-mono text-xs">
                                        CVSS {vuln.cvssScore.toFixed(1)}
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className={getSeverityBadgeClasses(vuln.severity)}>
                                      {vuln.severity || 'UNKNOWN'}
                                    </Badge>
                                  </div>
                                  {vuln.description && (
                                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                      {vuln.description}
                                    </p>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    {vuln.publishedAt && (
                                      <span>Published: {new Date(vuln.publishedAt).toLocaleDateString()}</span>
                                    )}
                                    {vuln.source && <span>Source: {vuln.source}</span>}
                                  </div>
                                  <p className="mt-2 text-xs text-primary">Click to view details</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                        defaultItemHeight={150}
                        height="600px"
                        className="space-y-2"
                      />
                    </div>
                  ) : (
                    <EmptyState
                      icon={Database}
                      title="Search NVD Database"
                      description="Search the NVD database by CVE ID (e.g., CVE-2024-1234) or keywords. Results appear from your local database."
                      action={
                        <Button variant="outline" onClick={() => setSearchMode('projects')}>
                          Switch to Project Search
                        </Button>
                      }
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

          {!debouncedQuery && (
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {searchMode === 'projects' ? 'Search Tips' : 'NVD Search Tips'}
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {searchMode === 'projects' ? (
                    <>
                      <li>&middot; Search is case-insensitive</li>
                      <li>&middot; Matches project names, component names, vulnerability IDs, and descriptions</li>
                      <li>&middot; Use arrow keys to navigate results</li>
                      <li>&middot; Press Enter to open selected result</li>
                      <li>&middot; Press Escape to clear search</li>
                    </>
                  ) : (
                    <>
                      <li>&middot; Search by CVE ID: CVE-2024-1234</li>
                      <li>&middot; Search by CPE text: cpe:2.3:a:vendor:product:*</li>
                      <li>&middot; Search by component name: apache, nginx, openssl</li>
                      <li>&middot; Results come from your local NVD database (offline)</li>
                    </>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {selectedCveId && <NvdCveDetailModal cveId={selectedCveId} open={showCveModal} onClose={handleCloseCveModal} />}
    </div>
  )
}
