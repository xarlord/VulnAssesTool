/**
 * Excel Parser for CycloneDX SBOM Generator
 *
 * Parses Excel files (.xlsx, .xls) containing component data
 * and converts them to a standardized format for SBOM generation.
 *
 * Features:
 * - Flexible column mapping (auto-detects common column name variations)
 * - Data validation and error reporting
 * - Type coercion (numeric versions to strings, whitespace trimming)
 * - Support for multiple sheets
 */

import * as XLSX from 'xlsx'
import type { Component } from '@@/types'

/**
 * Raw row data from Excel
 */
export interface ExcelRow {
  name?: string
  version?: string
  type?: string
  license?: string
  purl?: string
  cpe?: string
  description?: string
  supplier?: string
  group?: string
  [key: string]: any // Allow for dynamic column names
}

/**
 * Validation result for a row
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Column mapping detected from headers
 */
export interface ColumnMapping {
  name?: string
  version?: string
  type?: string
  license?: string
  purl?: string
  cpe?: string
  description?: string
  supplier?: string
  group?: string
}

/**
 * Valid component types
 */
export type ComponentType = 'library' | 'framework' | 'application' | 'container' | 'other'

/**
 * Column name patterns for auto-detection
 */
const COLUMN_PATTERNS = {
  name: ['name', 'Name', 'NAME', 'component_name', 'Component Name', 'component-name'],
  version: ['version', 'Version', 'VERSION', 'ver', 'Ver', 'Component Version', 'component_version'],
  type: ['type', 'Type', 'TYPE', 'component_type', 'Component Type'],
  license: ['license', 'License', 'LICENSE', 'licenses', 'Licenses'],
  purl: ['purl', 'PURL', 'purl', 'Package URL', 'package_url', 'package-url'],
  cpe: ['cpe', 'CPE', 'cpe', 'CPE Identifier'],
  description: ['description', 'Description', 'DESCRIPTION', 'desc'],
  supplier: ['supplier', 'Supplier', 'SUPPLIER', 'author', 'Author', 'vendor', 'Vendor'],
  group: ['group', 'Group', 'GROUP', 'namespace', 'Namespace'],
}

/**
 * CPE Match Result from estimation
 */
export interface CPEMatchResult {
  cpe: string
  vendor: string
  product: string
  confidence: 'high' | 'medium' | 'low'
  matchScore: number // 0-100 percentage
}

/**
 * Ambiguous Component - needs user confirmation for CPE selection
 */
export interface AmbiguousComponent {
  componentId: string
  componentName: string
  componentVersion: string
  estimatedCPEs: CPEMatchResult[]
  needsUserConfirmation: boolean
}

/**
 * Extended Component with CPE estimation flags
 */
export interface ComponentWithCPEEstimation extends Component {
  needsCPEEstimation: boolean
  estimatedCPEs?: CPEMatchResult[]
}

/**
 * Parse Excel file and extract component rows
 *
 * @param buffer - Excel file as ArrayBuffer
 * @param sheetName - Optional sheet name (defaults to first sheet)
 * @returns Array of parsed Excel rows
 * @throws Error if file is invalid or sheet not found
 */
export async function parseExcel(buffer: ArrayBuffer, sheetName?: string): Promise<ExcelRow[]> {
  try {
    // Read the workbook
    const workbook = XLSX.read(buffer, { type: 'array' })

    // Determine which sheet to use
    const targetSheet = sheetName || workbook.SheetNames[0]

    // Check if sheet exists
    if (!workbook.SheetNames.includes(targetSheet)) {
      throw new Error(`Sheet '${targetSheet}' not found in workbook`)
    }

    const worksheet = workbook.Sheets[targetSheet]

    // Convert sheet to JSON with options to handle empty cells
    const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, {
      defval: '', // Default value for empty cells
      raw: false, // Return formatted values instead of raw
    })

    // Process and normalize rows
    return processRows(rawRows)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found in workbook')) {
      throw error
    }
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Process raw rows from Excel and normalize data
 */
function processRows(rawRows: any[]): ExcelRow[] {
  const processedRows: ExcelRow[] = []

  for (const row of rawRows) {
    // Skip completely empty rows
    if (!row || Object.keys(row).length === 0) {
      continue
    }

    // Skip rows where all values are empty strings
    const hasContent = Object.values(row).some((val) => val !== null && val !== undefined && val !== '')
    if (!hasContent) {
      continue
    }

    // Detect column mapping from this row's keys
    const headers = Object.keys(row)
    const mapping = detectColumnMapping(headers)

    // Normalize the row using detected mapping
    const normalizedRow = normalizeRow(row, mapping)
    processedRows.push(normalizedRow)
  }

  return processedRows
}

/**
 * Normalize a row using detected column mapping
 */
function normalizeRow(row: any, mapping: ColumnMapping): ExcelRow {
  const normalized: ExcelRow = {}

  // Map each field using detected column names
  if (mapping.name) normalized.name = normalizeString(row[mapping.name])
  if (mapping.version) normalized.version = normalizeString(row[mapping.version])
  if (mapping.type) normalized.type = normalizeString(row[mapping.type])
  if (mapping.license) normalized.license = normalizeString(row[mapping.license])
  if (mapping.purl) normalized.purl = normalizeString(row[mapping.purl])
  if (mapping.cpe) normalized.cpe = normalizeString(row[mapping.cpe])
  if (mapping.description) normalized.description = normalizeString(row[mapping.description])
  if (mapping.supplier) normalized.supplier = normalizeString(row[mapping.supplier])
  if (mapping.group) normalized.group = normalizeString(row[mapping.group])

  // Preserve any unmapped columns (might be custom fields)
  for (const [key, value] of Object.entries(row)) {
    if (!Object.values(mapping).includes(key)) {
      normalized[key] = normalizeValue(value)
    }
  }

  return normalized
}

/**
 * Normalize a value (trim strings, convert numbers to strings)
 */
function normalizeValue(value: any): any {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return value
}

/**
 * Normalize a string value (trim and convert)
 */
function normalizeString(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = String(value).trim()
  return str
}

/**
 * Validate a row for required fields
 *
 * @param row - Excel row to validate
 * @returns Validation result with errors if any
 */
export function validateRow(row: ExcelRow): ValidationResult {
  const errors: string[] = []

  // Check required fields
  const name = row.name?.trim() || ''
  const version = row.version?.trim() || ''

  if (!name) {
    errors.push('name is required')
  }

  if (!version) {
    errors.push('version is required')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Map an Excel row to a Component object
 *
 * @param row - Validated Excel row
 * @param type - Optional default type override (takes precedence over row type)
 * @returns Component object
 */
export function mapRowToComponent(row: ExcelRow, type?: ComponentType): Component {
  // Normalize component type - parameter override takes precedence
  const normalizedType = type ? type : row.type ? normalizeComponentType(row.type) : getDefaultType()

  // Handle licenses (can be comma-separated)
  const licenses = row.license
    ? row.license
        .split(',')
        .map((lic) => lic.trim())
        .filter(Boolean)
    : []

  // Generate component ID
  const id = row.purl || generateComponentId(row.name!, row.version!)

  return {
    id,
    name: row.name!,
    version: row.version!,
    type: normalizedType,
    licenses,
    purl: row.purl,
    cpe: row.cpe,
    description: row.description,
    supplier: row.supplier,
    vulnerabilities: [], // Empty for newly created components
  }
}

/**
 * Generate component ID from name and version
 */
function generateComponentId(name: string, version: string): string {
  // Sanitize the ID by replacing special characters (but keep dots in version)
  const sanitized = `${name}-${version}`.replace(/[^a-zA-Z0-9.-]/g, '-')
  return sanitized
}

/**
 * Normalize component type string to valid ComponentType
 */
function normalizeComponentType(type: string): ComponentType {
  const normalized = type.toLowerCase().trim()

  const typeMap: Record<string, ComponentType> = {
    library: 'library',
    framework: 'framework',
    application: 'application',
    container: 'container',
    platform: 'other',
    device: 'other',
    firmware: 'other',
    file: 'other',
    operating_system: 'other',
    'operating-system': 'other',
  }

  return typeMap[normalized] || getDefaultType()
}

/**
 * Get the default component type
 *
 * @returns Default component type ('library')
 */
export function getDefaultType(): ComponentType {
  return 'library'
}

/**
 * Detect column mapping from headers
 *
 * Auto-detects which columns correspond to which fields
 * based on common naming patterns.
 *
 * @param headers - Array of column header names
 * @returns Column mapping object
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}

  // Detect each field by checking patterns
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    // Find first matching pattern (exact match priority)
    for (const pattern of patterns) {
      if (headers.includes(pattern)) {
        mapping[field as keyof ColumnMapping] = pattern
        break // Use first match
      }
    }

    // If no exact match, try partial match (case-insensitive)
    if (!mapping[field as keyof ColumnMapping]) {
      for (const header of headers) {
        const headerLower = header.toLowerCase()
        for (const pattern of patterns) {
          if (headerLower === pattern.toLowerCase() || headerLower.includes(pattern.toLowerCase())) {
            mapping[field as keyof ColumnMapping] = header
            break
          }
        }
        if (mapping[field as keyof ColumnMapping]) break
      }
    }
  }

  return mapping
}

/**
 * Identify components that are missing CPEs and need estimation
 *
 * @param components - Array of components to check
 * @returns Array of components with needsCPEEstimation flag set
 */
export function identifyMissingCPEs(components: Component[]): ComponentWithCPEEstimation[] {
  return components.map((component) => {
    // A component needs CPE estimation if:
    // 1. It doesn't have a CPE already
    // 2. It has a version (required for CPE)
    const needsCPEEstimation = !component.cpe && !!component.version

    return {
      ...component,
      needsCPEEstimation,
    }
  })
}

/**
 * Count components that need CPE estimation
 *
 * @param components - Array of components with estimation flags
 * @returns Number of components needing CPE estimation
 */
export function countMissingCPEs(components: ComponentWithCPEEstimation[]): number {
  return components.filter((c) => c.needsCPEEstimation).length
}
