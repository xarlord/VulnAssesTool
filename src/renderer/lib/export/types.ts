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

/**
 * Export error types
 */
export class ExportError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ExportError'
  }
}

/**
 * Validation error for invalid export data
 */
export class ValidationError extends ExportError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details)
  }
}

/**
 * File generation error
 */
export class FileGenerationError extends ExportError {
  constructor(message: string, details?: unknown) {
    super(message, 'FILE_GENERATION_ERROR', details)
  }
}
