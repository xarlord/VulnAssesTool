import React from 'react'
import { Shield } from 'lucide-react'
import { toast } from '@/components/Toaster'
import { VirtualList } from '@/components/VirtualList'
import { FilterPresets } from '@/components/FilterPresets'
import { getSbomFilename, getVulnerabilitiesForComponent, hasComponentPatchAvailable } from './helpers'
import type { Component, FilterPreset, Project } from '@@/types'

interface ComponentsTabProps {
  project: Project
  onComponentClick: (component: Component) => void
}

export function ComponentsTab({ project, onComponentClick }: ComponentsTabProps) {
  const [componentSearch, setComponentSearch] = React.useState('')
  const [componentTypeFilter, setComponentTypeFilter] = React.useState<'all' | Component['type']>('all')
  const [componentVulnFilter, setComponentVulnFilter] = React.useState<'all' | 'vulnerable' | 'safe'>('all')
  const [componentLicenseFilter, setComponentLicenseFilter] = React.useState<string>('all')
  const [componentCoverageFilter, setComponentCoverageFilter] = React.useState<'all' | 'identified' | 'gap'>('all')
  const [componentPatchFilter, setComponentPatchFilter] = React.useState<'all' | 'available' | 'unavailable'>('all')
  const [componentSort, setComponentSort] = React.useState<'name' | 'version' | 'type'>('name')

  // Component-filter presets live in their own localStorage namespace, distinct from the
  // Vulnerabilities tab's `vuln-filter-presets-*` (FR-08.2).
  const presetStorageKey = `component-filter-presets-${project.id}`
  const [filterPresets, setFilterPresets] = React.useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem(presetStorageKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  React.useEffect(() => {
    try {
      localStorage.setItem(presetStorageKey, JSON.stringify(filterPresets))
    } catch {
      // Ignore localStorage errors
    }
  }, [filterPresets, presetStorageKey])

  // Capture the current component-filter selections into a preset payload.
  const getCurrentFilters = (): FilterPreset['filters'] => {
    const filters: FilterPreset['filters'] = {}
    if (componentTypeFilter !== 'all') {
      filters.componentType = [componentTypeFilter]
    }
    if (componentLicenseFilter !== 'all') {
      filters.license = [componentLicenseFilter]
    }
    if (componentVulnFilter !== 'all') {
      filters.hasVulnerabilities = componentVulnFilter === 'vulnerable'
    }
    if (componentPatchFilter !== 'all') {
      filters.hasPatch = componentPatchFilter === 'available'
    }
    return filters
  }

  const handleSavePreset = (name: string, filters: FilterPreset['filters']) => {
    setFilterPresets((prev) => [...prev, { id: Date.now().toString(), name, filters }])
    toast.success('Preset Saved', `Filter preset "${name}" has been saved.`)
  }

  const handleLoadPreset = (presetId: string) => {
    const preset = filterPresets.find((p) => p.id === presetId)
    if (!preset) return
    const { filters } = preset
    setComponentTypeFilter(
      filters.componentType && filters.componentType.length === 1 ? filters.componentType[0] : 'all',
    )
    setComponentLicenseFilter(filters.license && filters.license.length === 1 ? filters.license[0] : 'all')
    setComponentVulnFilter(
      filters.hasVulnerabilities === undefined ? 'all' : filters.hasVulnerabilities ? 'vulnerable' : 'safe',
    )
    setComponentPatchFilter(filters.hasPatch === undefined ? 'all' : filters.hasPatch ? 'available' : 'unavailable')
    toast.success('Preset Loaded', `Filter preset "${preset.name}" has been applied.`)
  }

  const handleDeletePreset = (presetId: string) => {
    setFilterPresets((prev) => prev.filter((p) => p.id !== presetId))
    toast.success('Preset Deleted', 'Filter preset has been deleted.')
  }

  // Extract unique licenses from components for filter dropdown
  const uniqueLicenses = React.useMemo(() => {
    const licenseSet = new Set<string>()
    const components = project.components || []
    components.forEach((component) => {
      component.licenses.forEach((license) => licenseSet.add(license))
    })
    return Array.from(licenseSet).sort()
  }, [project.components])

  return (
    <div className="mx-auto max-w-7xl mt-6 space-y-4">
      <h2 className="text-lg font-semibold">Components</h2>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">Components ({new Set(project.components.map((c) => c.id)).size})</h2>
          {project.components.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="text"
                placeholder="Search components..."
                aria-label="Search components"
                value={componentSearch}
                onChange={(e) => setComponentSearch(e.target.value)}
                className="w-48 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={componentTypeFilter}
                onChange={(e) => setComponentTypeFilter(e.target.value as 'all' | Component['type'])}
                aria-label="Filter by component type"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Types</option>
                <option value="library">Libraries</option>
                <option value="framework">Frameworks</option>
                <option value="application">Applications</option>
                <option value="container">Containers</option>
                <option value="other">Other</option>
              </select>
              <select
                value={componentVulnFilter}
                onChange={(e) => setComponentVulnFilter(e.target.value as 'all' | 'vulnerable' | 'safe')}
                aria-label="Filter by vulnerability status"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All</option>
                <option value="vulnerable">Has Vulnerabilities</option>
                <option value="safe">No Vulnerabilities</option>
              </select>
              <select
                value={componentCoverageFilter}
                onChange={(e) => setComponentCoverageFilter(e.target.value as 'all' | 'identified' | 'gap')}
                aria-label="Filter by coverage"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Coverage</option>
                <option value="identified">Identified</option>
                <option value="gap">Coverage Gap</option>
              </select>
              {uniqueLicenses.length > 0 && (
                <select
                  value={componentLicenseFilter}
                  onChange={(e) => setComponentLicenseFilter(e.target.value)}
                  aria-label="Filter by license"
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Licenses</option>
                  {uniqueLicenses.map((license) => (
                    <option key={license} value={license}>
                      {license}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={componentPatchFilter}
                onChange={(e) => setComponentPatchFilter(e.target.value as 'all' | 'available' | 'unavailable')}
                aria-label="Filter by patch availability"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Patch Status</option>
                <option value="available">Has Patch</option>
                <option value="unavailable">No Patch</option>
              </select>
              <select
                value={componentSort}
                onChange={(e) => setComponentSort(e.target.value as 'name' | 'version' | 'type')}
                aria-label="Sort components by"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="name">Sort: Name</option>
                <option value="version">Sort: Version</option>
                <option value="type">Sort: Type</option>
              </select>
              <FilterPresets
                presets={filterPresets}
                currentFilters={getCurrentFilters()}
                onSavePreset={handleSavePreset}
                onLoadPreset={handleLoadPreset}
                onDeletePreset={handleDeletePreset}
              />
            </div>
          )}
        </div>
        <div className="p-4">
          {project.components.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Shield className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No components found</p>
              <p className="text-sm text-muted-foreground">Upload an SBOM file to view components</p>
            </div>
          ) : (
            (() => {
              // Deduplicate components by ID first to ensure each unique component is shown only once
              // This handles cases where the same component might appear from multiple SBOMs
              const uniqueComponents = project.components.reduce(
                (acc, component) => {
                  if (!acc.find((c) => c.id === component.id)) {
                    acc.push(component)
                  }
                  return acc
                },
                [] as typeof project.components,
              )

              // Filter and sort components
              let filtered = uniqueComponents.filter((component) => {
                const matchesSearch =
                  !componentSearch ||
                  component.name.toLowerCase().includes(componentSearch.toLowerCase()) ||
                  component.version.toLowerCase().includes(componentSearch.toLowerCase())

                const matchesType = componentTypeFilter === 'all' || component.type === componentTypeFilter

                // Check if component has vulnerabilities by looking at project.vulnerabilities
                // This is more reliable than component.vulnerabilities which may not be synchronized
                const componentVulns = project.vulnerabilities.filter((v) =>
                  v.affectedComponents.includes(component.id),
                )
                const hasVulnerabilities = componentVulns.length > 0

                const matchesVuln =
                  componentVulnFilter === 'all' ||
                  (componentVulnFilter === 'vulnerable' && hasVulnerabilities) ||
                  (componentVulnFilter === 'safe' && !hasVulnerabilities)

                const matchesLicense =
                  componentLicenseFilter === 'all' || component.licenses.includes(componentLicenseFilter)

                const matchesCoverage =
                  componentCoverageFilter === 'all' ||
                  (componentCoverageFilter === 'gap' && component.coverage === 'gap') ||
                  (componentCoverageFilter === 'identified' && component.coverage !== 'gap')

                const patchAvailable = hasComponentPatchAvailable(component)
                const matchesPatch =
                  componentPatchFilter === 'all' ||
                  (componentPatchFilter === 'available' && patchAvailable) ||
                  (componentPatchFilter === 'unavailable' && !patchAvailable)

                return matchesSearch && matchesType && matchesVuln && matchesLicense && matchesCoverage && matchesPatch
              })

              // Sort components
              filtered = [...filtered].sort((a, b) => {
                if (componentSort === 'name') {
                  return a.name.localeCompare(b.name)
                } else if (componentSort === 'version') {
                  return a.version.localeCompare(b.version)
                } else {
                  return a.type.localeCompare(b.type)
                }
              })

              const displayComponents = filtered

              return (
                <>
                  {displayComponents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Shield className="mb-3 h-12 w-12 text-muted-foreground" />
                      <p className="text-muted-foreground">No components match your filters</p>
                      <button
                        onClick={() => {
                          setComponentSearch('')
                          setComponentTypeFilter('all')
                          setComponentVulnFilter('all')
                          setComponentLicenseFilter('all')
                          setComponentPatchFilter('all')
                        }}
                        className="mt-2 text-sm text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    <VirtualList
                      items={displayComponents}
                      itemKey="id"
                      renderItem={(component) => {
                        const sbomFilename = getSbomFilename(project, component.sbomFileId)
                        const componentVulns = getVulnerabilitiesForComponent(project, component.id)
                        return (
                          <div
                            key={component.id}
                            onClick={() => onComponentClick(component)}
                            className="flex items-center justify-between rounded-md border border-border bg-background p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onComponentClick(component)
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Shield
                                className={`h-5 w-5 ${
                                  componentVulns.length > 0 ? 'text-destructive' : 'text-muted-foreground'
                                }`}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{component.name}</span>
                                  {sbomFilename && (
                                    <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 border border-blue-500/20">
                                      Source: {sbomFilename}
                                    </span>
                                  )}
                                  {/* CPE Status Indicator */}
                                  {component.cpe && !component.hasMissingCpe ? (
                                    <span
                                      className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 border border-green-500/20"
                                      title={`CPE: ${component.cpe}`}
                                    >
                                      CPE Verified
                                    </span>
                                  ) : component.suggestedCpes && component.suggestedCpes.length > 0 ? (
                                    <span
                                      className="inline-flex items-center rounded-md bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600 border border-yellow-500/20"
                                      title={`${component.suggestedCpes.length} suggested CPEs available`}
                                    >
                                      CPE Estimated
                                    </span>
                                  ) : component.hasMissingCpe ? (
                                    <span
                                      className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 border border-red-500/20"
                                      title="No CPE available - vulnerability matching may be less accurate"
                                    >
                                      No CPE
                                    </span>
                                  ) : null}
                                  {/* Coverage gap: present but not reliably versioned */}
                                  {component.coverage === 'gap' && (
                                    <span
                                      className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 border border-amber-500/20"
                                      title={
                                        component.coverageNote ||
                                        'Coverage gap: present but not reliably versioned — matches need manual review'
                                      }
                                    >
                                      Coverage Gap
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                  <span>
                                    {component.version && component.version !== 'unknown' ? component.version : '—'}
                                  </span>
                                  <span>•</span>
                                  <span className="capitalize">{component.type}</span>
                                  {component.provenanceSources && component.provenanceSources.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="text-xs" title="How this component was catalogued">
                                        via {component.provenanceSources.join(', ')}
                                      </span>
                                    </>
                                  )}
                                  {component.purl && (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono text-xs">{component.purl}</span>
                                    </>
                                  )}
                                  {/* Show the actual CPE used for matching so accuracy can be assessed */}
                                  {component.cpe ? (
                                    <>
                                      <span>•</span>
                                      <span
                                        className="font-mono text-xs text-green-600"
                                        title="Matched CPE used for vulnerability scanning"
                                      >
                                        {component.cpe}
                                      </span>
                                    </>
                                  ) : component.suggestedCpes && component.suggestedCpes.length > 0 ? (
                                    <>
                                      <span>•</span>
                                      <span
                                        className="font-mono text-xs text-yellow-600"
                                        title={`Estimated CPE (${component.suggestedCpes[0]?.confidence} confidence); ${component.suggestedCpes.length} suggestion(s)`}
                                      >
                                        {component.suggestedCpes[0]?.cpe} (est. {component.suggestedCpes[0]?.confidence}
                                        )
                                      </span>
                                    </>
                                  ) : null}
                                  {componentVulns.length > 0 && (
                                    <span className="text-destructive font-medium">
                                      • {componentVulns.length} vulnerability
                                      {componentVulns.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {component.licenses.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>{component.licenses.join(', ')}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      }}
                      defaultItemHeight={80}
                      height="600px"
                      className="border-0"
                    />
                  )}
                </>
              )
            })()
          )}
        </div>
      </div>
    </div>
  )
}
