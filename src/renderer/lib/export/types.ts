/**
 * Export-related type definitions
 */

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json' | 'pdf'

/**
 * Export data type options
 */
export type ExportDataType = 'vulnerabilities' | 'components' | 'project' | 'all-projects'

/**
 * Compliance frameworks a compliance report can be templated for (FR-09.3).
 * Only the frameworks named in the PRD are offered.
 */
export type ComplianceFramework = 'soc2' | 'iso27001' | 'hipaa'

/**
 * Human-readable label + the full standard name for each framework. Kept here (not in pdf.ts)
 * so the report dialog can render the framework picker without pulling in the heavy jsPDF module.
 * These are descriptive labels only — the report never claims a control is satisfied (FR-09.3 is
 * implemented sections-only; control attestation stays with the organization's auditors).
 */
export const COMPLIANCE_FRAMEWORK_META: Record<ComplianceFramework, { label: string; standard: string }> = {
  soc2: { label: 'SOC 2', standard: 'AICPA SOC 2 (System and Organization Controls 2)' },
  iso27001: { label: 'ISO/IEC 27001', standard: 'ISO/IEC 27001 — Information Security Management' },
  hipaa: { label: 'HIPAA', standard: 'HIPAA Security Rule (45 CFR Part 164)' },
}

/**
 * CSV export column definitions
 */
export interface CsvColumn {
  key: string
  header: string
  formatter: (data: Record<string, unknown>) => string
}

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat
  dataType: ExportDataType
  includeHeaders?: boolean
  dateFormat?: string
}

/**
 * Export result
 */
export interface ExportResult {
  blob: Blob
  filename: string
  size: number
}

/**
 * Vulnerability CSV row data
 */
export interface VulnerabilityCsvRow {
  id: string
  severity: string
  cvssScore: string
  cvssVector: string
  component: string
  description: string
  source: string
  references: string
  patchAvailable: string
  cwes: string
  publishedDate?: string
  modifiedDate?: string
}

/**
 * Component CSV row data
 */
export interface ComponentCsvRow {
  id: string
  name: string
  version: string
  type: string
  licenses: string
  /** Offline license-compliance verdict, e.g. "allowed" or "review (strong-copyleft)". */
  licenseRisk: string
  purl: string
  vulnerabilityCount: number
  patchAvailable: string
  recommendedVersion?: string
  dependenciesCount: number
}

/**
 * Export metadata
 */
export interface ExportMetadata {
  exportDate: Date
  projectName?: string
  projectId?: string
  format: ExportFormat
  dataType: ExportDataType
  recordCount: number
}

/**
 * PDF Report configuration
 */
export interface PdfReportConfig {
  title: string
  subtitle?: string
  includeCharts?: boolean
  includeFullDetails?: boolean
  maxVulnerabilities?: number
}
