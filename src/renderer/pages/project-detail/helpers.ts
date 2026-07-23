import type { Project, Vulnerability } from '@@/types'

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
