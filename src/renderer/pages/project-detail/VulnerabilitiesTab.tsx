import React from 'react'
import {
  AlertTriangle,
  Filter,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Search,
  Download,
} from 'lucide-react'
import { toast } from '@/components/Toaster'
import { FilterPresets, CvssRangeSlider, MultiSelectFilter } from '@/components/FilterPresets'
import { VirtualList } from '@/components/VirtualList'
import { KevBadge } from '@/components/vulnerabilities/KevBadge'
import { RiskScoreBadge } from '@/components/vulnerabilities/RiskScoreCell'
import { sortBySeverity, sortByCvssScore, sortByPublicationDate } from '@/lib/api/vulnMatcher'
import { exportVulnerabilitiesToCsv, downloadCsv, generateFilename, buildComponentMap } from '@/lib/export/csv'
import { formatVulnerabilityId } from '@/lib/utils/vulnIdFormat'
import {
  getSbomFilenamesForVulnerability,
  isNameOnlyMatch,
  isHighRiskVuln,
  hasAvailablePatch,
  isExploitedVuln,
  matchesVulnerabilitySearch,
} from './helpers'
import type { FilterPreset, Project, Vulnerability } from '@@/types'

interface VulnerabilitiesTabProps {
  project: Project
  projectId: string | undefined
  onViewVulnerability: (vuln: Vulnerability) => void
}

export function VulnerabilitiesTab({ project, projectId, onViewVulnerability }: VulnerabilitiesTabProps) {
  const [severityFilter, setSeverityFilter] = React.useState<'all' | Vulnerability['severity']>('all')
  const [vulnSearch, setVulnSearch] = React.useState('')
  const [sortField, setSortField] = React.useState<'severity' | 'cvss' | 'date'>('severity')
  const [selectedVulnIds, setSelectedVulnIds] = React.useState<Set<string>>(new Set())
  const [copiedVulnId, setCopiedVulnId] = React.useState<string | null>(null)
  const copiedVulnIdTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [cvssRange, setCvssRange] = React.useState<[number, number]>([0, 10])
  const [sourceFilter, setSourceFilter] = React.useState<string[]>([])
  const [referenceTagFilter, setReferenceTagFilter] = React.useState<string[]>([])
  const [patchFilter, setPatchFilter] = React.useState<'all' | 'available' | 'unavailable'>('all')
  const [exploitFilter, setExploitFilter] = React.useState<'all' | 'exploited' | 'not-exploited'>('all')
  const [expandedVulns, setExpandedVulns] = React.useState<Set<string>>(new Set())
  const [filterPresets, setFilterPresets] = React.useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem(`vuln-filter-presets-${projectId}`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false)
  // Hide low-confidence (name-only) matches on unversioned/gap components by default — the dominant
  // noise source. Protected high-risk findings are never hidden (see isHighRiskVuln).
  const [hideNameOnlyMatches, setHideNameOnlyMatches] = React.useState(true)

  // Persist filter presets to localStorage when they change
  React.useEffect(() => {
    try {
      localStorage.setItem(`vuln-filter-presets-${projectId}`, JSON.stringify(filterPresets))
    } catch {
      // Ignore localStorage errors
    }
  }, [filterPresets, projectId])

  // Count name-only matches so the Vulnerabilities tab never silently drops findings: it shows how
  // many low-confidence matches the default hide-toggle suppressed and how many high-risk findings
  // were kept visible despite low confidence.
  const nameOnlyNoise = React.useMemo(() => {
    const vulns = project.vulnerabilities ?? []
    let hidden = 0
    let keptHighRisk = 0
    for (const vuln of vulns) {
      if (!isNameOnlyMatch(vuln)) continue
      if (isHighRiskVuln(vuln)) keptHighRisk++
      else hidden++
    }
    const gapComponents = (project.components ?? []).filter((c) => c.coverage === 'gap').length
    return { hidden, keptHighRisk, gapComponents }
  }, [project.vulnerabilities, project.components])

  // Helper function to apply all filters
  const applyAdvancedFilters = (vulns: Vulnerability[]): Vulnerability[] => {
    return vulns.filter((vuln) => {
      // Hide low-confidence name-only matches (default on) — except protected high-risk findings,
      // which stay visible so an exploited CVE on a gap component is never silently suppressed.
      if (hideNameOnlyMatches && isNameOnlyMatch(vuln) && !isHighRiskVuln(vuln)) {
        return false
      }

      // CVSS score range filter
      if (vuln.cvssScore !== undefined) {
        const [min, max] = cvssRange
        if (vuln.cvssScore < min || vuln.cvssScore > max) {
          return false
        }
      }

      // Source filter
      if (sourceFilter.length > 0 && !sourceFilter.includes(vuln.source)) {
        return false
      }

      // Reference tag filter
      if (referenceTagFilter.length > 0) {
        const vulnTags = new Set((vuln.references ?? []).flatMap((ref) => (ref.tags ?? []).map((t) => t.toLowerCase())))
        if (!referenceTagFilter.some((tag) => vulnTags.has(tag.toLowerCase()))) {
          return false
        }
      }

      // Patch availability filter — checks the actual patchInfo/patchedVersions data, not just
      // reference tags, so "Has Patch" reliably hides vulns that have no real fix yet.
      if (patchFilter !== 'all') {
        const patched = hasAvailablePatch(vuln)
        if (patchFilter === 'available' && !patched) return false
        if (patchFilter === 'unavailable' && patched) return false
      }

      // Exploit status filter — checks KEV/exploitStatus, so "Exploited" only ever shows
      // known-exploited vulnerabilities, not anything merely tagged with an "exploit" reference.
      if (exploitFilter !== 'all') {
        const exploited = isExploitedVuln(vuln)
        if (exploitFilter === 'exploited' && !exploited) return false
        if (exploitFilter === 'not-exploited' && exploited) return false
      }

      return true
    })
  }

  // Save filter preset
  const handleSavePreset = (name: string, filters: FilterPreset['filters']) => {
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name,
      filters,
    }
    setFilterPresets([...filterPresets, newPreset])
    toast.success('Preset Saved', `Filter preset "${name}" has been saved.`)
  }

  // Load filter preset
  const handleLoadPreset = (presetId: string) => {
    const preset = filterPresets.find((p) => p.id === presetId)
    if (!preset) return

    const { filters } = preset

    // Apply filters to state
    if (filters.severity) {
      setSeverityFilter(filters.severity.length === 1 ? filters.severity[0] : 'all')
    }

    if (filters.cvssRange) {
      setCvssRange(filters.cvssRange)
    }

    if (filters.source) {
      setSourceFilter(filters.source)
    }

    if (filters.hasPatch !== undefined) {
      setPatchFilter(filters.hasPatch ? 'available' : 'unavailable')
    }

    if (filters.exploited !== undefined) {
      setExploitFilter(filters.exploited ? 'exploited' : 'not-exploited')
    }

    toast.success('Preset Loaded', `Filter preset "${preset.name}" has been applied.`)
  }

  // Delete filter preset
  const handleDeletePreset = (presetId: string) => {
    setFilterPresets(filterPresets.filter((p) => p.id !== presetId))
    toast.success('Preset Deleted', 'Filter preset has been deleted.')
  }

  // Get current filters for saving
  const getCurrentFilters = (): FilterPreset['filters'] => {
    const filters: FilterPreset['filters'] = {}

    if (severityFilter !== 'all') {
      filters.severity = [severityFilter]
    }

    if (cvssRange[0] !== 0 || cvssRange[1] !== 10) {
      filters.cvssRange = cvssRange
    }

    if (sourceFilter.length > 0) {
      filters.source = sourceFilter as Vulnerability['source'][]
    }

    if (patchFilter !== 'all') {
      filters.hasPatch = patchFilter === 'available'
    }

    if (exploitFilter !== 'all') {
      filters.exploited = exploitFilter === 'exploited'
    }

    return filters
  }

  // Toggle a vulnerability's membership in the bulk-select set (FR-04.1).
  const toggleVulnSelected = (vulnId: string) => {
    setSelectedVulnIds((prev) => {
      const next = new Set(prev)
      if (next.has(vulnId)) {
        next.delete(vulnId)
      } else {
        next.add(vulnId)
      }
      return next
    })
  }

  // Export only the selected vulnerabilities as CSV — the one bulk "operation" delivered here.
  // Reuses the existing, tested CSV pipeline; the export is scoped strictly to the selection.
  const handleExportSelected = () => {
    const selected = project.vulnerabilities.filter((v) => selectedVulnIds.has(v.id))
    if (selected.length === 0) return
    const csv = exportVulnerabilitiesToCsv(selected, buildComponentMap(selected))
    downloadCsv(csv, generateFilename(project.name, 'csv', 'vulnerabilities'))
    toast.success(
      'Export Complete',
      `Exported ${selected.length} selected vulnerabilit${selected.length === 1 ? 'y' : 'ies'} to CSV.`,
    )
  }

  // Handle copy vulnerability ID
  const handleCopyVulnId = async (vulnId: string) => {
    try {
      await navigator.clipboard.writeText(vulnId)
      setCopiedVulnId(vulnId)
      toast.success(`Copied ${vulnId} to clipboard`)
      if (copiedVulnIdTimerRef.current) clearTimeout(copiedVulnIdTimerRef.current)
      copiedVulnIdTimerRef.current = setTimeout(() => setCopiedVulnId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

  // Clear any pending "Copied" reset on unmount so it never fires setState after unmount.
  React.useEffect(() => {
    return () => {
      if (copiedVulnIdTimerRef.current) clearTimeout(copiedVulnIdTimerRef.current)
    }
  }, [])

  return (
    <div className="mx-auto max-w-7xl mt-6 space-y-4">
      <h2 className="text-lg font-semibold">Vulnerabilities</h2>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">Vulnerabilities ({project.vulnerabilities.length})</h2>
          {project.vulnerabilities.length > 0 && (
            <div className="flex items-center gap-2">
              <FilterPresets
                presets={filterPresets}
                currentFilters={getCurrentFilters()}
                onSavePreset={handleSavePreset}
                onLoadPreset={handleLoadPreset}
                onDeletePreset={handleDeletePreset}
              />
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                <Filter className="h-4 w-4" />
                Advanced Filters
                {showAdvancedFilters ? <CheckCircle2 className="h-4 w-4" /> : null}
              </button>
              <label
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm"
                title="Hide low-confidence name-only matches on unversioned components (KEV / high-risk findings are always shown)"
              >
                <input
                  type="checkbox"
                  checked={hideNameOnlyMatches}
                  onChange={(e) => setHideNameOnlyMatches(e.target.checked)}
                  aria-label="Hide low-confidence name-only matches"
                />
                Hide low-confidence
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={vulnSearch}
                  onChange={(e) => setVulnSearch(e.target.value)}
                  placeholder="Search by CVE ID or keyword..."
                  aria-label="Search vulnerabilities"
                  className="w-56 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as 'severity' | 'cvss' | 'date')}
                aria-label="Sort by"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="severity">Sort: Severity</option>
                <option value="cvss">Sort: CVSS Score</option>
                <option value="date">Sort: Publication Date</option>
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as 'all' | Vulnerability['severity'])}
                aria-label="Filter by severity"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          )}
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="border-b border-border bg-muted/30 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <CvssRangeSlider value={cvssRange} onChange={setCvssRange} />
              <MultiSelectFilter
                label="Source"
                options={[
                  { value: 'nvd', label: 'NVD' },
                  { value: 'osv', label: 'OSV' },
                  { value: 'both', label: 'Both' },
                ]}
                selected={sourceFilter}
                onChange={setSourceFilter}
              />
              <MultiSelectFilter
                label="Reference Tags"
                options={[
                  { value: 'exploit', label: 'Exploit' },
                  { value: 'patch', label: 'Patch Available' },
                  { value: 'vendor advisory', label: 'Vendor Advisory' },
                  { value: 'third party advisory', label: 'Third Party Advisory' },
                  { value: 'mitigation', label: 'Mitigation' },
                  { value: 'release notes', label: 'Release Notes' },
                ]}
                selected={referenceTagFilter}
                onChange={setReferenceTagFilter}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="patch-availability-filter">
                  Patch Availability
                </label>
                <select
                  id="patch-availability-filter"
                  value={patchFilter}
                  onChange={(e) => setPatchFilter(e.target.value as 'all' | 'available' | 'unavailable')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All</option>
                  <option value="available">Has Patch</option>
                  <option value="unavailable">No Patch</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="exploit-status-filter">
                  Exploit Status
                </label>
                <select
                  id="exploit-status-filter"
                  value={exploitFilter}
                  onChange={(e) => setExploitFilter(e.target.value as 'all' | 'exploited' | 'not-exploited')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All</option>
                  <option value="exploited">Exploited (KEV)</option>
                  <option value="not-exploited">Not Exploited</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {(sourceFilter.length > 0 ||
                  referenceTagFilter.length > 0 ||
                  cvssRange[0] !== 0 ||
                  cvssRange[1] !== 10 ||
                  patchFilter !== 'all' ||
                  exploitFilter !== 'all') && <span>Advanced filters active</span>}
              </span>
              <button
                onClick={() => {
                  setCvssRange([0, 10])
                  setSourceFilter([])
                  setReferenceTagFilter([])
                  setPatchFilter('all')
                  setExploitFilter('all')
                }}
                className="text-sm text-primary hover:underline"
              >
                Clear Advanced Filters
              </button>
            </div>
          </div>
        )}
        <div className="p-4">
          {/* Bulk-select action bar (FR-04.1) — appears only once vulnerabilities are checked. */}
          {selectedVulnIds.size > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
              <span className="font-medium">{selectedVulnIds.size} selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedVulnIds(new Set())}
                  className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:underline"
                >
                  Clear
                </button>
                <button
                  onClick={handleExportSelected}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  Export Selected ({selectedVulnIds.size})
                </button>
              </div>
            </div>
          )}
          {/* Never let gap components read as "clean": surface what the hide-toggle suppressed. */}
          {hideNameOnlyMatches && nameOnlyNoise.hidden > 0 && (
            <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {nameOnlyNoise.gapComponents} component{nameOnlyNoise.gapComponents === 1 ? '' : 's'} with coverage gaps
              </span>{' '}
              have {nameOnlyNoise.hidden} low-confidence (name-only) match
              {nameOnlyNoise.hidden === 1 ? '' : 'es'} hidden.{' '}
              <button
                onClick={() => setHideNameOnlyMatches(false)}
                // text-foreground, not text-primary: text-primary on this amber-tinted
                // background composited to only 2.79:1 in dark mode, below WCAG AA 4.5:1
                // (NFR-04.5). Always-on underline keeps it identifiable as a link.
                className="font-medium text-foreground underline hover:no-underline"
              >
                Reveal
              </button>
            </div>
          )}
          {hideNameOnlyMatches && nameOnlyNoise.keptHighRisk > 0 && (
            // Tint + border mark this as a warning; text uses foreground (not text-destructive)
            // — text-destructive on bg-destructive/10 composited to only 3.64:1 in dark mode,
            // below WCAG AA 4.5:1 (NFR-04.5). Same fix pattern as the severity headers above.
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground">
              {nameOnlyNoise.keptHighRisk} high-risk finding
              {nameOnlyNoise.keptHighRisk === 1 ? '' : 's'} kept visible despite low match confidence (KEV / high EPSS /
              critical or high severity).
            </div>
          )}
          {project.vulnerabilities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertTriangle className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No vulnerabilities found</p>
              <p className="text-sm text-muted-foreground">Run a vulnerability scan to check for security issues</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Filter by exact severity (not minimum severity)
                let filteredVulns =
                  severityFilter === 'all'
                    ? project.vulnerabilities
                    : project.vulnerabilities.filter((v) => v.severity === severityFilter)
                // Apply advanced filters, then the free-text search box (FR-04.1)
                filteredVulns = applyAdvancedFilters(filteredVulns)
                filteredVulns = filteredVulns.filter((v) => matchesVulnerabilitySearch(v, vulnSearch))

                // Grouping + styling depend on the selected sort field (FR-04.1). Severity keeps the
                // existing four-group split (default, unchanged output); CVSS / publication-date
                // collapse into a single flat, neutrally-styled section whose row order reflects the
                // chosen sort.
                // `color` tints the (decorative) icon; `textColor` styles the actual heading/count
                // text — kept separate because plain text-destructive on this header's
                // bg-background composites to only 4.19:1 in dark mode, below WCAG AA's 4.5:1
                // (NFR-04.5), while the other three severities' `dark:` variants already clear
                // it. Text falls back to foreground (icon still carries the color cue) rather
                // than picking a new ad hoc red, matching the Sidebar active-nav-item fix
                // (560d9fd: keep the tint/accent, switch the text to foreground).
                type SectionStyle = {
                  label: string
                  color: string
                  textColor: string
                  bgColor: string
                  borderColor: string
                }
                let groupedVulns: Record<string, Vulnerability[]>
                let severityConfig: Record<string, SectionStyle>
                if (sortField === 'cvss' || sortField === 'date') {
                  const flat =
                    sortField === 'cvss' ? sortByCvssScore(filteredVulns) : sortByPublicationDate(filteredVulns)
                  groupedVulns = { all: flat }
                  severityConfig = {
                    all: {
                      label:
                        sortField === 'cvss'
                          ? 'All vulnerabilities (highest CVSS first)'
                          : 'All vulnerabilities (newest first)',
                      color: 'text-foreground',
                      textColor: 'text-foreground',
                      bgColor: 'bg-muted/30',
                      borderColor: 'border-border',
                    },
                  }
                } else {
                  const sortedVulns = sortBySeverity(filteredVulns)
                  groupedVulns = {
                    critical: sortedVulns.filter((v) => v.severity === 'critical'),
                    high: sortedVulns.filter((v) => v.severity === 'high'),
                    medium: sortedVulns.filter((v) => v.severity === 'medium'),
                    low: sortedVulns.filter((v) => v.severity === 'low'),
                  }
                  severityConfig = {
                    critical: {
                      label: 'Critical',
                      color: 'text-destructive',
                      textColor: 'text-foreground',
                      bgColor: 'bg-destructive/10',
                      borderColor: 'border-destructive/30',
                    },
                    high: {
                      label: 'High',
                      color: 'text-orange-700 dark:text-orange-400',
                      textColor: 'text-orange-700 dark:text-orange-400',
                      bgColor: 'bg-orange-500/10',
                      borderColor: 'border-orange-500/30',
                    },
                    medium: {
                      label: 'Medium',
                      color: 'text-amber-700 dark:text-amber-400',
                      textColor: 'text-amber-700 dark:text-amber-400',
                      bgColor: 'bg-yellow-600/10',
                      borderColor: 'border-yellow-600/30',
                    },
                    low: {
                      label: 'Low',
                      color: 'text-blue-700 dark:text-blue-400',
                      textColor: 'text-blue-700 dark:text-blue-400',
                      bgColor: 'bg-blue-500/10',
                      borderColor: 'border-blue-500/30',
                    },
                  }
                }

                const totalShown = Object.values(groupedVulns).reduce((count, arr) => count + arr.length, 0)

                return totalShown === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Filter className="mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">No vulnerabilities match the current filters</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your filter settings</p>
                    <button
                      onClick={() => {
                        setSeverityFilter('all')
                        setVulnSearch('')
                        setCvssRange([0, 10])
                        setSourceFilter([])
                        setReferenceTagFilter([])
                        setPatchFilter('all')
                        setExploitFilter('all')
                      }}
                      className="mt-2 text-sm text-primary hover:underline"
                    >
                      Clear all filters
                    </button>
                  </div>
                ) : (
                  <>
                    {Object.entries(groupedVulns)
                      .filter(([, vulns]) => vulns.length > 0)
                      .map(([severity, vulns]) => {
                        const config = severityConfig[severity]
                        return (
                          <div key={severity} className={`rounded-lg border ${config.borderColor} ${config.bgColor}`}>
                            {/* Severity Header */}
                            <div
                              className={`flex items-center justify-between border-b ${config.borderColor} bg-background px-4 py-3`}
                            >
                              <div className="flex items-center gap-2">
                                <AlertTriangle className={`h-5 w-5 ${config.color}`} />
                                <h3 className={`font-semibold ${config.textColor}`}>{config.label}</h3>
                              </div>
                              <span className={`text-sm font-medium ${config.textColor}`}>
                                {vulns.length} {vulns.length === 1 ? 'vulnerability' : 'vulnerabilities'}
                              </span>
                            </div>

                            {/* Vulnerabilities in this severity group */}
                            <VirtualList
                              items={vulns}
                              itemKey="id"
                              renderItem={(vuln) => {
                                const { primaryId, aliases } = formatVulnerabilityId(vuln)
                                const sbomFilenames = getSbomFilenamesForVulnerability(project, vuln)
                                const isExpanded = expandedVulns.has(vuln.id)
                                const hasDetails = (vuln.cwes?.length ?? 0) > 0 || (vuln.references?.length ?? 0) > 0
                                const refTags = new Set(
                                  (vuln.references ?? []).flatMap((ref) =>
                                    (ref.tags ?? []).map((t) => t.toLowerCase()),
                                  ),
                                )
                                const hasExploitRef = refTags.has('exploit')
                                const hasPatchRef = refTags.has('patch') || refTags.has('vendor advisory')
                                const hasMitigationRef = refTags.has('mitigation')
                                return (
                                  <>
                                    <div className="bg-background hover:bg-muted/50 transition-colors">
                                      <div className="flex flex-col md:flex-row md:items-center justify-between p-3 gap-2">
                                        <div className="flex items-start md:items-center gap-3 min-w-0 flex-1">
                                          <input
                                            type="checkbox"
                                            checked={selectedVulnIds.has(vuln.id)}
                                            onChange={() => toggleVulnSelected(vuln.id)}
                                            aria-label={`Select ${primaryId}`}
                                            className="shrink-0 mt-1 md:mt-0 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                                          />
                                          <button
                                            onClick={() => {
                                              setExpandedVulns((prev) => {
                                                const next = new Set(prev)
                                                if (next.has(vuln.id)) {
                                                  next.delete(vuln.id)
                                                } else {
                                                  next.add(vuln.id)
                                                }
                                                return next
                                              })
                                            }}
                                            className="shrink-0 mt-0.5 md:mt-0"
                                            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                                          >
                                            {isExpanded ? (
                                              <ChevronDown className={`h-4 w-4 ${config.color}`} />
                                            ) : (
                                              <ChevronRight className={`h-4 w-4 ${config.color}`} />
                                            )}
                                          </button>
                                          <div className="min-w-0 flex-1">
                                            <div className="font-medium flex flex-wrap items-center gap-1.5 md:gap-2">
                                              {primaryId}
                                              <KevBadge
                                                isKev={vuln.isKev ?? false}
                                                knownRansomwareUse={vuln.kevDetails?.knownRansomwareUse}
                                                compact
                                              />
                                              {vuln.riskScore !== undefined && (
                                                <RiskScoreBadge
                                                  isKev={vuln.isKev ?? false}
                                                  epssPercentile={vuln.epssPercentile ?? null}
                                                  severity={
                                                    vuln.severity.toUpperCase() as
                                                      | 'CRITICAL'
                                                      | 'HIGH'
                                                      | 'MEDIUM'
                                                      | 'LOW'
                                                      | 'NONE'
                                                  }
                                                />
                                              )}
                                              {vuln.cwes?.map((cwe) => (
                                                <span
                                                  key={cwe}
                                                  className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                                >
                                                  {cwe}
                                                </span>
                                              ))}
                                              {hasExploitRef && (
                                                <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                                  Exploit
                                                </span>
                                              )}
                                              {hasPatchRef && (
                                                <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                                  Patch
                                                </span>
                                              )}
                                              {hasMitigationRef && (
                                                <span className="inline-flex items-center rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300">
                                                  Mitigation
                                                </span>
                                              )}
                                              {aliases.length > 0 && (
                                                <span className="text-xs text-muted-foreground font-normal truncate max-w-[120px] md:max-w-none">
                                                  (aka: {aliases.slice(0, 2).join(', ')}
                                                  {aliases.length > 2 ? ` +${aliases.length - 2}` : ''})
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                                              <span className="whitespace-nowrap">
                                                {vuln.sources
                                                  ? vuln.sources.map((s) => s.toUpperCase()).join(' + ')
                                                  : vuln.source.toUpperCase()}
                                              </span>
                                              {vuln.cvssScore && (
                                                <span className="whitespace-nowrap">CVSS: {vuln.cvssScore}</span>
                                              )}
                                              {sbomFilenames.length > 0 && (
                                                <span className="whitespace-nowrap hidden sm:inline">
                                                  From: {sbomFilenames.slice(0, 1).join(', ')}
                                                  {sbomFilenames.length > 1 ? ` +${sbomFilenames.length - 1}` : ''}
                                                </span>
                                              )}
                                              {vuln.affectedComponents.length > 0 && (
                                                <span className="whitespace-nowrap hidden sm:inline">
                                                  {vuln.affectedComponents.length} component
                                                  {vuln.affectedComponents.length > 1 ? 's' : ''}
                                                </span>
                                              )}
                                              {(vuln.references?.length ?? 0) > 0 && (
                                                <span className="whitespace-nowrap">
                                                  {vuln.references?.length} ref
                                                  {(vuln.references?.length ?? 0) > 1 ? 's' : ''}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                          <button
                                            onClick={() => handleCopyVulnId(primaryId)}
                                            className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-xs font-medium hover:bg-secondary/80 transition-colors"
                                            aria-label={`Copy ${primaryId} to clipboard`}
                                          >
                                            <Copy className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">
                                              {copiedVulnId === primaryId ? 'Copied' : 'Copy'}
                                            </span>
                                          </button>
                                          <button
                                            onClick={() => onViewVulnerability(vuln)}
                                            // text-foreground, not text-primary: text-primary on
                                            // bg-background composites to only 3.53:1 in dark mode,
                                            // below WCAG AA 4.5:1 (NFR-04.5). Always-on underline
                                            // (not just hover) keeps it identifiable as a link
                                            // without relying on color alone.
                                            className="text-sm text-foreground underline hover:no-underline whitespace-nowrap"
                                          >
                                            View Details
                                          </button>
                                        </div>
                                      </div>
                                      {isExpanded && hasDetails && (
                                        <div className="border-t border-border px-4 pb-3 pt-2 ml-7 md:ml-11 space-y-2">
                                          {vuln.cwes && vuln.cwes.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span className="text-xs font-medium text-muted-foreground">CWE:</span>
                                              {vuln.cwes.map((cwe) => (
                                                <a
                                                  key={cwe}
                                                  href={`https://cwe.mitre.org/data/definitions/${cwe.replace('CWE-', '')}.html`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                                                >
                                                  {cwe}
                                                  <ExternalLink className="h-2.5 w-2.5" />
                                                </a>
                                              ))}
                                            </div>
                                          )}
                                          {vuln.references && vuln.references.length > 0 && (
                                            <div>
                                              <span className="text-xs font-medium text-muted-foreground">
                                                References:
                                              </span>
                                              <div className="mt-1 space-y-1">
                                                {vuln.references.slice(0, 5).map((ref, idx) => {
                                                  const tagColors = (ref.tags ?? []).map((t) => {
                                                    const lower = t.toLowerCase()
                                                    if (lower === 'exploit')
                                                      return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                                                    if (lower === 'patch')
                                                      return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                                                    if (lower === 'vendor advisory')
                                                      return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                                                    if (lower === 'mitigation')
                                                      return 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20'
                                                    if (lower === 'third party advisory')
                                                      return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                                                    return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40'
                                                  })
                                                  return (
                                                    <div key={idx} className="flex items-start gap-1.5 text-xs">
                                                      <a
                                                        href={ref.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary hover:underline truncate max-w-[400px]"
                                                      >
                                                        {ref.url.length > 80
                                                          ? ref.url.substring(0, 80) + '...'
                                                          : ref.url}
                                                      </a>
                                                      {ref.tags && ref.tags.length > 0 && (
                                                        <div className="flex gap-1 shrink-0 flex-wrap">
                                                          {ref.tags.map((tag, tagIdx) => (
                                                            <span
                                                              key={tagIdx}
                                                              className={`rounded px-1 py-0.5 text-[9px] font-medium ${tagColors[tagIdx] ?? tagColors[0] ?? ''}`}
                                                            >
                                                              {tag}
                                                            </span>
                                                          ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  )
                                                })}
                                                {vuln.references.length > 5 && (
                                                  <span className="text-xs text-muted-foreground">
                                                    +{vuln.references.length - 5} more references
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )
                              }}
                              defaultItemHeight={100}
                              height={vulns.length < 7 ? vulns.length * 100 : 400}
                              className="divide-y divide-border border-0"
                            />
                          </div>
                        )
                      })}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
