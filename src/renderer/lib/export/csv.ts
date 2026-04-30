/**
 * CSV Export Utilities
 * Handles exporting vulnerability and component data to CSV format
 */

import type { Vulnerability, Component } from '@@/types'
import type { VulnerabilityCsvRow, ComponentCsvRow } from './types'

/**
 * Escape a CSV value by wrapping in quotes and escaping quotes
 */
function escapeCSV(value: string): string {
  if (!value) return '""'

  // Convert to string if not already
  const str = String(value)

  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Join CSV values with commas
 */
function joinCSV(...values: string[]): string {
  return values.join(',')
}

/**
 * Convert array to CSV string representation
 * Returns semicolon-separated values that will be escaped by escapeCSV
 */
function arrayToCSV(arr: string[]): string {
  if (!arr || arr.length === 0) return ''
  // Join with semicolon - escapeCSV will handle the quoting
  return arr.join('; ')
}

/**
 * Format date for CSV export
 */
function formatDate(date: Date | string | undefined): string {
  if (!date) return ''
  // Handle both Date objects and string dates (from JSON serialization)
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (isNaN(dateObj.getTime())) return ''
  return dateObj.toISOString().split('T')[0] // YYYY-MM-DD
}

/**
 * Convert vulnerability to CSV row
 */
export function vulnerabilityToCsvRow(vuln: Vulnerability, componentName?: string): VulnerabilityCsvRow {
  const component = componentName || vuln.affectedComponents.join('; ') || 'N/A'

  // Format references as semicolon-separated URLs
  const references = vuln.references.map((r) => r.url).join('; ')

  // Format CWEs as semicolon-separated list
  const cwes = vuln.cwes?.join('; ') || ''

  // Check patch availability
  const patchAvailable =
    vuln.patchInfo?.patchAvailability || (vuln.patchedVersions && vuln.patchedVersions.length > 0)
      ? 'Available'
      : 'Unknown'

  return {
    id: vuln.id,
    severity: vuln.severity,
    cvssScore: vuln.cvssScore?.toString() || 'N/A',
    cvssVector: vuln.cvssVector || 'N/A',
    component,
    description: vuln.description,
    source: vuln.sources?.join(', ') || vuln.source,
    references,
    patchAvailable,
    cwes,
    publishedDate: formatDate(vuln.publishedAt),
    modifiedDate: formatDate(vuln.modifiedAt),
  }
}

/**
 * Convert vulnerability to CSV line
 */
export function vulnerabilityToCsvLine(vuln: Vulnerability, componentName?: string): string {
  const row = vulnerabilityToCsvRow(vuln, componentName)
  return joinCSV(
    escapeCSV(row.id),
    escapeCSV(row.severity),
    escapeCSV(row.cvssScore),
    escapeCSV(row.cvssVector),
    escapeCSV(row.component),
    escapeCSV(row.description),
    escapeCSV(row.source),
    escapeCSV(row.references),
    escapeCSV(row.patchAvailable),
    escapeCSV(row.cwes),
    escapeCSV(row.publishedDate || ''),
    escapeCSV(row.modifiedDate || ''),
  )
}

/**
 * Generate CSV header for vulnerabilities export
 */
export function getVulnerabilityCsvHeader(): string {
  return joinCSV(
    'ID',
    'Severity',
    'CVSS Score',
    'CVSS Vector',
    'Component',
    'Description',
    'Source',
    'References',
    'Patch Available',
    'CWEs',
    'Published Date',
    'Modified Date',
  )
}

/**
 * Export vulnerabilities to CSV
 */
export function exportVulnerabilitiesToCsv(
  vulnerabilities: Vulnerability[],
  componentMap?: Map<string, string>,
): string {
  if (!vulnerabilities || vulnerabilities.length === 0) {
    return getVulnerabilityCsvHeader() + '\r\n'
  }

  const lines: string[] = [getVulnerabilityCsvHeader()]

  for (const vuln of vulnerabilities) {
    // Build component name string from component map
    let componentNames: string[] | undefined
    if (componentMap && vuln.affectedComponents.length > 0) {
      componentNames = vuln.affectedComponents
        .map((compId) => componentMap.get(compId))
        .filter((name): name is string => name !== undefined)
    }

    const componentName =
      componentNames && componentNames.length > 0
        ? componentNames.join('; ')
        : vuln.affectedComponents.join('; ') || 'N/A'

    lines.push(vulnerabilityToCsvLine(vuln, componentName))
  }

  return lines.join('\r\n')
}

/**
 * Convert component to CSV row
 */
export function componentToCsvRow(comp: Component): ComponentCsvRow {
  return {
    id: comp.id,
    name: comp.name,
    version: comp.version,
    type: comp.type,
    licenses: arrayToCSV(comp.licenses),
    purl: comp.purl || '',
    vulnerabilityCount: comp.vulnerabilities.length,
    patchAvailable: comp.patchInfo?.hasFixAvailable ? 'Available' : comp.patchInfo ? 'Not Available' : 'Unknown',
    recommendedVersion: comp.patchInfo?.recommendedVersion || '',
    dependenciesCount: comp.dependencies?.length || 0,
  }
}

/**
 * Convert component to CSV line
 */
export function componentToCsvLine(comp: Component): string {
  const row = componentToCsvRow(comp)
  return joinCSV(
    escapeCSV(row.id),
    escapeCSV(row.name),
    escapeCSV(row.version),
    escapeCSV(row.type),
    escapeCSV(row.licenses),
    escapeCSV(row.purl),
    escapeCSV(row.vulnerabilityCount.toString()),
    escapeCSV(row.patchAvailable),
    escapeCSV(row.recommendedVersion),
    escapeCSV(row.dependenciesCount.toString()),
  )
}

/**
 * Generate CSV header for components export
 */
export function getComponentCsvHeader(): string {
  return joinCSV(
    'ID',
    'Name',
    'Version',
    'Type',
    'Licenses',
    'PURL',
    'Vulnerability Count',
    'Patch Available',
    'Recommended Version',
    'Dependencies Count',
  )
}

/**
 * Export components to CSV
 */
export function exportComponentsToCsv(components: Component[]): string {
  if (!components || components.length === 0) {
    return getComponentCsvHeader() + '\r\n'
  }

  const lines: string[] = [getComponentCsvHeader()]

  for (const comp of components) {
    lines.push(componentToCsvLine(comp))
  }

  return lines.join('\r\n')
}

/**
 * Download data as CSV file
 */
export function downloadCsv(csvContent: string, filename: string): void {
  // Add UTF-8 BOM for Excel compatibility
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' })

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

/**
 * Sanitize filename by removing invalid characters
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-') // Remove invalid characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .toLowerCase()
    .substring(0, 100) // Limit length
}

/**
 * Generate export filename with date
 */
export function generateFilename(
  entityName: string,
  format: 'csv' | 'json' | 'pdf',
  dataType?: 'vulnerabilities' | 'components' | 'project' | 'all-projects',
): string {
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  // For all-projects, use fixed name
  if (dataType === 'all-projects') {
    return `all-projects-${date}.${format}`
  }

  const sanitizedName = sanitizeFilename(entityName)

  const typePrefix =
    dataType === 'vulnerabilities' ? '-vulnerabilities' : dataType === 'components' ? '-components' : ''

  return `${sanitizedName}${typePrefix}-${date}.${format}`
}

/**
 * Build component name map for vulnerability export
 */
export function buildComponentMap(vulnerabilities: Vulnerability[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const vuln of vulnerabilities) {
    for (const compId of vuln.affectedComponents) {
      if (!map.has(compId)) {
        map.set(compId, compId) // Will be replaced with actual component name if available
      }
    }
  }

  return map
}
