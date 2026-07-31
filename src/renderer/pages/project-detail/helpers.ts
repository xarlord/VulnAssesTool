import type { Project, Vulnerability } from '@@/types'
import type { ReportData } from '@/lib/services/reports/types'

/**
 * Pure lookups shared across the ProjectDetail tabs. They take the project
 * explicitly (rather than closing over it) so the tab components and the
 * orchestrator can reuse them without prop-drilling closures.
 */

export function getSbomFilename(project: Project, sbomFileId: string | undefined): string | null {
  if (!sbomFileId) return null
  const sbomFile = project.sbomFiles.find((f) => f.id === sbomFileId)
  return sbomFile ? sbomFile.filename : null
}

export function getVulnerabilitiesForComponent(project: Project, componentId: string): Vulnerability[] {
  return project.vulnerabilities.filter((v) => v.affectedComponents.includes(componentId))
}

export function getSbomFilenamesForVulnerability(project: Project, vuln: Vulnerability): string[] {
  const sbomIds = new Set<string>()
  for (const componentId of vuln.affectedComponents) {
    const component = project.components.find((c) => c.id === componentId)
    if (component?.sbomFileId) {
      sbomIds.add(component.sbomFileId)
    }
  }
  return Array.from(sbomIds)
    .map((id) => getSbomFilename(project, id))
    .filter((name): name is string => name !== null)
}

// A finding is "name-only" noise when EVERY component it matched was matched only by product name
// (matchQuality all 'name-only'). undefined matchQuality (legacy scans) counts as trusted/shown.
export function isNameOnlyMatch(vuln: Vulnerability): boolean {
  const quality = vuln.matchQuality
  if (!quality) return false
  const values = Object.values(quality)
  return values.length > 0 && values.every((c) => c === 'name-only')
}

// Never auto-hide genuinely dangerous findings, even at low match confidence.
export function isHighRiskVuln(vuln: Vulnerability): boolean {
  return Boolean(vuln.isKev) || (vuln.epssScore ?? 0) >= 0.5 || vuln.severity === 'critical' || vuln.severity === 'high'
}

// A vulnerability "has a patch available" only when a real fix exists — 'partial'/'upstream'/
// 'investigating'/'none' don't mean a user can actually remediate today, so they must not count as
// having a patch (the patch-availability filter, FR-08.3, exists to separate the two).
export function hasAvailablePatch(vuln: Vulnerability): boolean {
  return vuln.patchInfo?.patchAvailability === 'available' || (vuln.patchedVersions?.length ?? 0) > 0
}

// A vulnerability counts as "exploited" for filtering when it's in the CISA KEV catalog or its
// exploitStatus has been explicitly set to 'exploited'. isKev is the reliable signal in practice —
// providers don't currently populate exploitStatus — but both are checked so the filter keeps
// working if that changes.
export function isExploitedVuln(vuln: Vulnerability): boolean {
  return Boolean(vuln.isKev) || vuln.exploitStatus === 'exploited'
}

// Case-insensitive free-text match for the vulnerability search box (FR-04.1). Matches against
// the primary id, any aliases (GHSA/OSV ids — OSV-sourced findings are often looked up by those,
// not a CVE id), and the description (PRD requires keyword search, not just id lookup). An
// empty/whitespace query matches everything so clearing the box restores the full list.
export function matchesVulnerabilitySearch(vuln: Vulnerability, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return true
  if (vuln.id.toLowerCase().includes(normalized)) return true
  if ((vuln.aliases ?? []).some((alias) => alias.toLowerCase().includes(normalized))) return true
  return vuln.description.toLowerCase().includes(normalized)
}

// Build report generator input from a project. `ProjectStatistics` doesn't carry
// the KEV/EPSS aggregates the report needs, so derive them from the raw
// vulnerability list rather than duplicating a second statistics shape upstream.
export function buildReportData(project: Project): ReportData {
  const { vulnerabilities, statistics } = project
  const noneCount = vulnerabilities.filter((v) => v.severity === 'none').length
  const kevCount = vulnerabilities.filter((v) => v.isKev).length
  const epssScores = vulnerabilities
    .map((v) => v.epssScore)
    .filter((score): score is number => typeof score === 'number')
  const avgEpssScore = epssScores.length > 0 ? epssScores.reduce((sum, score) => sum + score, 0) / epssScores.length : 0

  return {
    project,
    vulnerabilities,
    components: project.components,
    statistics: {
      totalVulnerabilities: statistics.totalVulnerabilities,
      criticalCount: statistics.criticalCount,
      highCount: statistics.highCount,
      mediumCount: statistics.mediumCount,
      lowCount: statistics.lowCount,
      noneCount,
      totalComponents: statistics.totalComponents,
      vulnerableComponents: statistics.vulnerableComponents,
      kevCount,
      avgEpssScore,
    },
  }
}
