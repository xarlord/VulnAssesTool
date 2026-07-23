import React from 'react'
import { AlertTriangle, Filter, CheckCircle2, Copy, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { toast } from '@/components/Toaster'
import { FilterPresets, CvssRangeSlider, MultiSelectFilter } from '@/components/FilterPresets'
import { VirtualList } from '@/components/VirtualList'
import { KevBadge } from '@/components/vulnerabilities/KevBadge'
import { RiskScoreBadge } from '@/components/vulnerabilities/RiskScoreCell'
import { sortBySeverity } from '@/lib/api/vulnMatcher'
import { formatVulnerabilityId } from '@/lib/utils/vulnIdFormat'
import { getSbomFilenamesForVulnerability, isNameOnlyMatch, isHighRiskVuln } from './helpers'
import type { FilterPreset, Project, Vulnerability } from '@@/types'

interface VulnerabilitiesTabProps {
  project: Project
  projectId: string | undefined
  onViewVulnerability: (vuln: Vulnerability) => void
}

export function VulnerabilitiesTab({ project, projectId, onViewVulnerability }: VulnerabilitiesTabProps) {
  const [severityFilter, setSeverityFilter] = React.useState<'all' | Vulnerability['severity']>('all')
  const [copiedVulnId, setCopiedVulnId] = React.useState<string | null>(null)
  const [cvssRange, setCvssRange] = React.useState<[number, number]>([0, 10])
  const [sourceFilter, setSourceFilter] = React.useState<string[]>([])
  const [referenceTagFilter, setReferenceTagFilter] = React.useState<string[]>([])
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
      if (vuln.cvssScore) {
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

    return filters
  }

  // Handle copy vulnerability ID
  const handleCopyVulnId = async (vulnId: string) => {
    try {
      await navigator.clipboard.writeText(vulnId)
      setCopiedVulnId(vulnId)
      toast.success(`Copied ${vulnId} to clipboard`)
      setTimeout(() => setCopiedVulnId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

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
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as 'all' | Vulnerability['severity'])}
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
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {(sourceFilter.length > 0 ||
                  referenceTagFilter.length > 0 ||
                  cvssRange[0] !== 0 ||
                  cvssRange[1] !== 10) && <span>Advanced filters active</span>}
              </span>
              <button
                onClick={() => {
                  setCvssRange([0, 10])
                  setSourceFilter([])
                  setReferenceTagFilter([])
                }}
                className="text-sm text-primary hover:underline"
              >
                Clear Advanced Filters
              </button>
            </div>
          </div>
        )}
        <div className="p-4">
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
                className="font-medium text-primary hover:underline"
              >
                Reveal
              </button>
            </div>
          )}
          {hideNameOnlyMatches && nameOnlyNoise.keptHighRisk > 0 && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
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
                // Apply advanced filters
                filteredVulns = applyAdvancedFilters(filteredVulns)
                const sortedVulns = sortBySeverity(filteredVulns)

                // Group by severity
                const groupedVulns = {
                  critical: sortedVulns.filter((v) => v.severity === 'critical'),
                  high: sortedVulns.filter((v) => v.severity === 'high'),
                  medium: sortedVulns.filter((v) => v.severity === 'medium'),
                  low: sortedVulns.filter((v) => v.severity === 'low'),
                }

                const severityConfig = {
                  critical: {
                    label: 'Critical',
                    color: 'text-destructive',
                    bgColor: 'bg-destructive/10',
                    borderColor: 'border-destructive/30',
                  },
                  high: {
                    label: 'High',
                    color: 'text-orange-700 dark:text-orange-400',
                    bgColor: 'bg-orange-500/10',
                    borderColor: 'border-orange-500/30',
                  },
                  medium: {
                    label: 'Medium',
                    color: 'text-amber-700 dark:text-amber-400',
                    bgColor: 'bg-yellow-600/10',
                    borderColor: 'border-yellow-600/30',
                  },
                  low: {
                    label: 'Low',
                    color: 'text-blue-700 dark:text-blue-400',
                    bgColor: 'bg-blue-500/10',
                    borderColor: 'border-blue-500/30',
                  },
                }

                return sortedVulns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Filter className="mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">No vulnerabilities match the current filters</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your filter settings</p>
                    <button
                      onClick={() => {
                        setSeverityFilter('all')
                        setCvssRange([0, 10])
                        setSourceFilter([])
                        setReferenceTagFilter([])
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
                        const config = severityConfig[severity as keyof typeof severityConfig]
                        return (
                          <div key={severity} className={`rounded-lg border ${config.borderColor} ${config.bgColor}`}>
                            {/* Severity Header */}
                            <div
                              className={`flex items-center justify-between border-b ${config.borderColor} bg-background px-4 py-3`}
                            >
                              <div className="flex items-center gap-2">
                                <AlertTriangle className={`h-5 w-5 ${config.color}`} />
                                <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
                              </div>
                              <span className={`text-sm font-medium ${config.color}`}>
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
                                            className="text-sm text-primary hover:underline whitespace-nowrap"
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
