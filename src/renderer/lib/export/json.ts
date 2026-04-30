/**
 * JSON Export Utilities
 * Handles exporting project data to JSON format
 */

import type { Project } from '@@/types'
import type { ExportMetadata } from './types'

/**
 * Helper to safely convert date to ISO string
 * Handles both Date objects and string dates (from JSON serialization)
 */
function toISOString(date: Date | string | undefined): string | null {
  if (!date) return null
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (isNaN(dateObj.getTime())) return null
  return dateObj.toISOString()
}

/**
 * Export metadata for JSON exports
 */
function createMetadata(
  dataType: 'project' | 'vulnerabilities' | 'components' | 'all-projects',
  projectName?: string,
): ExportMetadata {
  return {
    exportDate: new Date(),
    projectName,
    format: 'json',
    dataType,
    recordCount: 0, // Will be updated
  }
}

/**
 * Prepare project data for JSON export
 */
export function prepareProjectJson(project: Project): string {
  const metadata = createMetadata('project', project.name)

  const exportData = {
    metadata,
    project: {
      id: project.id,
      name: project.name,
      description: project.description || '',
      createdAt: toISOString(project.createdAt),
      updatedAt: toISOString(project.updatedAt),
      lastScanAt: toISOString(project.lastScanAt),
      statistics: project.statistics,
    },
    vulnerabilities: project.vulnerabilities.map((vuln) => ({
      id: vuln.id,
      source: vuln.sources?.length ? vuln.sources : [vuln.source],
      severity: vuln.severity,
      cvssScore: vuln.cvssScore,
      cvssVector: vuln.cvssVector,
      cvssBreakdown: vuln.cvssBreakdown || null,
      cwes: vuln.cwes || [],
      description: vuln.description,
      references: vuln.references,
      affectedComponents: vuln.affectedComponents,
      publishedAt: toISOString(vuln.publishedAt),
      modifiedAt: toISOString(vuln.modifiedAt),
      exploitStatus: vuln.exploitStatus || null,
      patchedVersions: vuln.patchedVersions || [],
      aliases: vuln.aliases || [],
      patchInfo: vuln.patchInfo || null,
    })),
    components: project.components.map((comp) => ({
      id: comp.id,
      name: comp.name,
      version: comp.version,
      type: comp.type,
      purl: comp.purl || null,
      cpe: comp.cpe || null,
      licenses: comp.licenses,
      description: comp.description || null,
      supplier: comp.supplier || null,
      hash: comp.hash || null,
      dependencies: comp.dependencies || [],
      dependents: comp.dependents || [],
      vulnerabilities: comp.vulnerabilities,
      patchInfo: comp.patchInfo || null,
    })),
    sbomFiles: project.sbomFiles.map((file) => ({
      id: file.id,
      filename: file.filename,
      format: file.format,
      formatVersion: file.formatVersion,
      uploadedAt: file.uploadedAt.toISOString(),
      fileHash: file.fileHash,
      componentCount: file.componentCount,
    })),
  }

  // Update record count
  metadata.recordCount = exportData.vulnerabilities.length

  return JSON.stringify(exportData, null, 2)
}

/**
 * Prepare vulnerabilities-only JSON export
 */
export function prepareVulnerabilitiesJson(project: Project): string {
  const metadata = createMetadata('vulnerabilities', project.name)

  const exportData = {
    metadata,
    projectName: project.name,
    projectId: project.id,
    vulnerabilities: project.vulnerabilities.map((vuln) => ({
      id: vuln.id,
      source: vuln.sources?.length ? vuln.sources : [vuln.source],
      severity: vuln.severity,
      cvssScore: vuln.cvssScore,
      cvssVector: vuln.cvssVector,
      cvssBreakdown: vuln.cvssBreakdown || null,
      cwes: vuln.cwes || [],
      description: vuln.description,
      references: vuln.references,
      affectedComponents: vuln.affectedComponents,
      publishedAt: vuln.publishedAt?.toISOString() || null,
      modifiedAt: vuln.modifiedAt?.toISOString() || null,
      exploitStatus: vuln.exploitStatus || null,
      patchedVersions: vuln.patchedVersions || [],
      aliases: vuln.aliases || [],
      patchInfo: vuln.patchInfo || null,
    })),
    statistics: project.statistics,
  }

  // Update record count
  metadata.recordCount = exportData.vulnerabilities.length

  return JSON.stringify(exportData, null, 2)
}

/**
 * Prepare components-only JSON export
 */
export function prepareComponentsJson(project: Project): string {
  const metadata = createMetadata('components', project.name)

  const exportData = {
    metadata,
    projectName: project.name,
    projectId: project.id,
    components: project.components.map((comp) => ({
      id: comp.id,
      name: comp.name,
      version: comp.version,
      type: comp.type,
      purl: comp.purl || null,
      cpe: comp.cpe || null,
      licenses: comp.licenses,
      description: comp.description || null,
      supplier: comp.supplier || null,
      hash: comp.hash || null,
      dependencies: comp.dependencies || [],
      dependents: comp.dependents || [],
      vulnerabilities: comp.vulnerabilities,
      vulnerabilityCount: comp.vulnerabilities.length,
      patchInfo: comp.patchInfo || null,
    })),
    statistics: {
      totalComponents: project.components.length,
      vulnerableComponents: project.statistics.vulnerableComponents,
      componentsWithFixes: project.components.filter((c) => c.patchInfo?.hasFixAvailable).length,
    },
  }

  // Update record count
  metadata.recordCount = exportData.components.length

  return JSON.stringify(exportData, null, 2)
}

/**
 * Prepare all projects JSON export
 */
export function prepareAllProjectsJson(projects: Project[]): string {
  const metadata = createMetadata('all-projects')

  const exportData = {
    metadata,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description || '',
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      lastScanAt: project.lastScanAt?.toISOString() || null,
      statistics: project.statistics,
      vulnerabilityCount: project.vulnerabilities.length,
      componentCount: project.components.length,
    })),
    summary: {
      totalProjects: projects.length,
      totalVulnerabilities: projects.reduce((sum, p) => sum + p.statistics.totalVulnerabilities, 0),
      totalComponents: projects.reduce((sum, p) => sum + p.statistics.totalComponents, 0),
      totalCritical: projects.reduce((sum, p) => sum + p.statistics.criticalCount, 0),
      totalHigh: projects.reduce((sum, p) => sum + p.statistics.highCount, 0),
      totalMedium: projects.reduce((sum, p) => sum + p.statistics.mediumCount, 0),
      totalLow: projects.reduce((sum, p) => sum + p.statistics.lowCount, 0),
    },
  }

  // Update record count
  metadata.recordCount = exportData.projects.length

  return JSON.stringify(exportData, null, 2)
}

/**
 * Download JSON data as file
 */
export function downloadJson(jsonContent: string, filename: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' })

  // Create download link and trigger download
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
