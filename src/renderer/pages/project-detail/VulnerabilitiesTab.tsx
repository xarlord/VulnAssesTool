import React from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('vulnerabilitiesTab')
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
    toast.success(t('toast.presetSaved.title'), t('toast.presetSaved.message', { name }))
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

    toast.success(t('toast.presetLoaded.title'), t('toast.presetLoaded.message', { name: preset.name }))
  }

  // Delete filter preset
  const handleDeletePreset = (presetId: string) => {
    setFilterPresets(filterPresets.filter((p) => p.id !== presetId))
    toast.success(t('toast.presetDeleted.title'), t('toast.presetDeleted.message'))
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
    toast.success(t('toast.exportComplete.title'), t('toast.exportComplete.message', { count: selected.length }))
  }

  // Handle copy vulnerability ID
  const handleCopyVulnId = async (vulnId: string) => {
    try {
      await navigator.clipboard.writeText(vulnId)
      setCopiedVulnId(vulnId)
      toast.success(t('toast.copied', { id: vulnId }))
      if (copiedVulnIdTimerRef.current) clearTimeout(copiedVulnIdTimerRef.current)
      copiedVulnIdTimerRef.current = setTimeout(() => setCopiedVulnId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error(t('toast.copyFailed'))
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
      <h2 className="text-lg font-semibold">{t('heading')}</h2>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">{t('header.title', { count: project.vulnerabilities.length })}</h2>
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
                {t('toolbar.advancedFilters')}
                {showAdvancedFilters ? <CheckCircle2 className="h-4 w-4" /> : null}
              </button>
              <label
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm"
                title={t('toolbar.hideNameOnlyMatches.title')}
              >
                <input
                  type="checkbox"
                  checked={hideNameOnlyMatches}
                  onChange={(e) => setHideNameOnlyMatches(e.target.checked)}
                  aria-label={t('toolbar.hideNameOnlyMatches.ariaLabel')}
                />
                {t('toolbar.hideNameOnlyMatches.label')}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={vulnSearch}
                  onChange={(e) => setVulnSearch(e.target.value)}
                  placeholder={t('toolbar.search.placeholder')}
                  aria-label={t('toolbar.search.ariaLabel')}
                  className="w-56 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as 'severity' | 'cvss' | 'date')}
                aria-label={t('toolbar.sort.ariaLabel')}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="severity">{t('toolbar.sort.severity')}</option>
                <option value="cvss">{t('toolbar.sort.cvss')}</option>
                <option value="date">{t('toolbar.sort.date')}</option>
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as 'all' | Vulnerability['severity'])}
                aria-label={t('toolbar.severityFilter.ariaLabel')}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">{t('toolbar.severityFilter.all')}</option>
                <option value="critical">{t('toolbar.severityFilter.critical')}</option>
                <option value="high">{t('toolbar.severityFilter.high')}</option>
                <option value="medium">{t('toolbar.severityFilter.medium')}</option>
                <option value="low">{t('toolbar.severityFilter.low')}</option>
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
                label={t('advancedPanel.source.label')}
                options={[
                  { value: 'nvd', label: t('advancedPanel.source.nvd') },
                  { value: 'osv', label: t('advancedPanel.source.osv') },
                  { value: 'both', label: t('advancedPanel.source.both') },
                ]}
                selected={sourceFilter}
                onChange={setSourceFilter}
              />
              <MultiSelectFilter
                label={t('advancedPanel.referenceTags.label')}
                options={[
                  { value: 'exploit', label: t('advancedPanel.referenceTags.exploit') },
                  { value: 'patch', label: t('advancedPanel.referenceTags.patch') },
                  { value: 'vendor advisory', label: t('advancedPanel.referenceTags.vendorAdvisory') },
                  { value: 'third party advisory', label: t('advancedPanel.referenceTags.thirdPartyAdvisory') },
                  { value: 'mitigation', label: t('advancedPanel.referenceTags.mitigation') },
                  { value: 'release notes', label: t('advancedPanel.referenceTags.releaseNotes') },
                ]}
                selected={referenceTagFilter}
                onChange={setReferenceTagFilter}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="patch-availability-filter">
                  {t('advancedPanel.patchAvailability.label')}
                </label>
                <select
                  id="patch-availability-filter"
                  value={patchFilter}
                  onChange={(e) => setPatchFilter(e.target.value as 'all' | 'available' | 'unavailable')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">{t('advancedPanel.patchAvailability.all')}</option>
                  <option value="available">{t('advancedPanel.patchAvailability.available')}</option>
                  <option value="unavailable">{t('advancedPanel.patchAvailability.unavailable')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="exploit-status-filter">
                  {t('advancedPanel.exploitStatus.label')}
                </label>
                <select
                  id="exploit-status-filter"
                  value={exploitFilter}
                  onChange={(e) => setExploitFilter(e.target.value as 'all' | 'exploited' | 'not-exploited')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">{t('advancedPanel.exploitStatus.all')}</option>
                  <option value="exploited">{t('advancedPanel.exploitStatus.exploited')}</option>
                  <option value="not-exploited">{t('advancedPanel.exploitStatus.notExploited')}</option>
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
                  exploitFilter !== 'all') && <span>{t('advancedPanel.active')}</span>}
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
                {t('advancedPanel.clear')}
              </button>
            </div>
          </div>
        )}
        <div className="p-4">
          {/* Bulk-select action bar (FR-04.1) — appears only once vulnerabilities are checked. */}
          {selectedVulnIds.size > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
              <span className="font-medium">{t('bulkActions.selectedCount', { count: selectedVulnIds.size })}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedVulnIds(new Set())}
                  className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:underline"
                >
                  {t('bulkActions.clear')}
                </button>
                <button
                  onClick={handleExportSelected}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  {t('bulkActions.exportSelected', { count: selectedVulnIds.size })}
                </button>
              </div>
            </div>
          )}
          {/* Never let gap components read as "clean": surface what the hide-toggle suppressed. */}
          {hideNameOnlyMatches && nameOnlyNoise.hidden > 0 && (
            <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {t('noise.gapComponentsCount', { count: nameOnlyNoise.gapComponents })}
              </span>{' '}
              {t('noise.hiddenCount', { count: nameOnlyNoise.hidden })}{' '}
              <button
                onClick={() => setHideNameOnlyMatches(false)}
                // text-foreground, not text-primary: text-primary on this amber-tinted
                // background composited to only 2.79:1 in dark mode, below WCAG AA 4.5:1
                // (NFR-04.5). Always-on underline keeps it identifiable as a link.
                className="font-medium text-foreground underline hover:no-underline"
              >
                {t('noise.reveal')}
              </button>
            </div>
          )}
          {hideNameOnlyMatches && nameOnlyNoise.keptHighRisk > 0 && (
            // Tint + border mark this as a warning; text uses foreground (not text-destructive)
            // — text-destructive on bg-destructive/10 composited to only 3.64:1 in dark mode,
            // below WCAG AA 4.5:1 (NFR-04.5). Same fix pattern as the severity headers above.
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground">
              {t('noise.keptHighRiskCount', { count: nameOnlyNoise.keptHighRisk })}
            </div>
          )}
          {project.vulnerabilities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertTriangle className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{t('empty.title')}</p>
              <p className="text-sm text-muted-foreground">{t('empty.subtitle')}</p>
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
                      label: sortField === 'cvss' ? t('group.label.allByCvss') : t('group.label.allByDate'),
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
                      label: t('group.label.critical'),
                      color: 'text-destructive',
                      textColor: 'text-foreground',
                      bgColor: 'bg-destructive/10',
                      borderColor: 'border-destructive/30',
                    },
                    high: {
                      label: t('group.label.high'),
                      color: 'text-orange-700 dark:text-orange-400',
                      textColor: 'text-orange-700 dark:text-orange-400',
                      bgColor: 'bg-orange-500/10',
                      borderColor: 'border-orange-500/30',
                    },
                    medium: {
                      label: t('group.label.medium'),
                      color: 'text-amber-700 dark:text-amber-400',
                      textColor: 'text-amber-700 dark:text-amber-400',
                      bgColor: 'bg-yellow-600/10',
                      borderColor: 'border-yellow-600/30',
                    },
                    low: {
                      label: t('group.label.low'),
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
                    <p className="text-muted-foreground">{t('noResults.title')}</p>
                    <p className="text-sm text-muted-foreground">{t('noResults.subtitle')}</p>
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
                      {t('noResults.clearAll')}
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
                                {t('group.count', { count: vulns.length })}
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
                                            aria-label={t('row.selectAriaLabel', { id: primaryId })}
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
                                            aria-label={isExpanded ? t('row.collapseDetails') : t('row.expandDetails')}
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
                                                  {t('row.badges.exploit')}
                                                </span>
                                              )}
                                              {hasPatchRef && (
                                                <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                                  {t('row.badges.patch')}
                                                </span>
                                              )}
                                              {hasMitigationRef && (
                                                <span className="inline-flex items-center rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300">
                                                  {t('row.badges.mitigation')}
                                                </span>
                                              )}
                                              {aliases.length > 0 && (
                                                <span className="text-xs text-muted-foreground font-normal truncate max-w-[120px] md:max-w-none">
                                                  {t('row.akaPrefix')}
                                                  {aliases.slice(0, 2).join(', ')}
                                                  {aliases.length > 2 ? ` +${aliases.length - 2}` : ''}
                                                  {t('row.akaSuffix')}
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
                                                <span className="whitespace-nowrap">
                                                  {t('row.cvss', { score: vuln.cvssScore })}
                                                </span>
                                              )}
                                              {sbomFilenames.length > 0 && (
                                                <span className="whitespace-nowrap hidden sm:inline">
                                                  {t('row.fromPrefix')}
                                                  {sbomFilenames.slice(0, 1).join(', ')}
                                                  {sbomFilenames.length > 1 ? ` +${sbomFilenames.length - 1}` : ''}
                                                </span>
                                              )}
                                              {vuln.affectedComponents.length > 0 && (
                                                <span className="whitespace-nowrap hidden sm:inline">
                                                  {t('row.affectedComponents', {
                                                    count: vuln.affectedComponents.length,
                                                  })}
                                                </span>
                                              )}
                                              {(vuln.references?.length ?? 0) > 0 && (
                                                <span className="whitespace-nowrap">
                                                  {t('row.referenceCount', { count: vuln.references?.length ?? 0 })}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                          <button
                                            onClick={() => handleCopyVulnId(primaryId)}
                                            className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-xs font-medium hover:bg-secondary/80 transition-colors"
                                            aria-label={t('row.copyAriaLabel', { id: primaryId })}
                                          >
                                            <Copy className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">
                                              {copiedVulnId === primaryId ? t('row.copied') : t('row.copy')}
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
                                            {t('row.viewDetails')}
                                          </button>
                                        </div>
                                      </div>
                                      {isExpanded && hasDetails && (
                                        <div className="border-t border-border px-4 pb-3 pt-2 ml-7 md:ml-11 space-y-2">
                                          {vuln.cwes && vuln.cwes.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span className="text-xs font-medium text-muted-foreground">
                                                {t('details.cwe')}
                                              </span>
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
                                                {t('details.references')}
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
                                                    {t('details.moreReferences', { count: vuln.references.length - 5 })}
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
