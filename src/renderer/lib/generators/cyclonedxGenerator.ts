/**
 * CycloneDX SBOM Generator
 *
 * Generates valid CycloneDX 1.5 JSON SBOM from component data.
 * Reverse-engineered from the CycloneDX parser for consistency.
 */

import type { Component } from '@@/types'
import { ulid } from '../audit/ulid'
import { type CPEMatchResult, type AmbiguousComponent } from './excelParser'

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Generator options for creating CycloneDX SBOM
 */
export interface GeneratorOptions {
  /** Output format (JSON or XML) */
  format?: 'json' | 'xml'
  /** CycloneDX spec version */
  specVersion?: '1.3' | '1.4' | '1.5'
  /** Metadata options */
  metadata?: MetadataOptions
  /** Pretty print JSON output */
  pretty?: boolean
}

/**
 * Metadata options for the SBOM
 */
export interface MetadataOptions {
  /** Root component name */
  name?: string
  /** Root component version */
  version?: string
  /** Root component description */
  description?: string
  /** Root component author/supplier */
  author?: string
}

/**
 * SBOM output structure
 */
export interface SbomOutput {
  /** Output format */
  format: 'json' | 'xml'
  /** SBOM content as string */
  content: string
  /** Generated filename */
  filename: string
  /** Output metadata */
  metadata: {
    /** Number of components */
    componentCount: number
    /** Spec version */
    specVersion: string
    /** Generation timestamp */
    generatedAt: string
  }
}

/**
 * CycloneDX 1.5 BOM structure
 */
interface CycloneDXBom {
  bomFormat: 'CycloneDX'
  specVersion: string
  version: number
  serialNumber: string
  metadata: CycloneDXMetadata
  components?: CycloneDXComponent[]
}

/**
 * CycloneDX metadata structure
 */
export interface CycloneDXMetadata {
  timestamp: string
  component?: {
    type: string
    name: string
    version?: string
    description?: string
    author?: string
  }
}

/**
 * CycloneDX component structure
 */
export interface CycloneDXComponent {
  type: string
  'bom-ref': string
  name: string
  version?: string
  description?: string
  licenses?: Array<{ license: { id?: string; name?: string } }>
  purl?: string
  cpe?: string
  supplier?: {
    name: string
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================

/**
 * SPDX License List (subset of common licenses)
 * Full list: https://spdx.org/licenses/
 */
const SPDX_LICENSES = new Set([
  '0BSD',
  'AFL-1.1',
  'AFL-1.2',
  'AFL-2.0',
  'AFL-2.1',
  'AFL-3.0',
  'AGPL-1.0',
  'AGPL-3.0',
  'APACHE-1.0',
  'APACHE-1.1',
  'APACHE-2.0',
  'ARTISTIC-1.0',
  'ARTISTIC-2.0',
  'BSD-1-CLAUSE',
  'BSD-2-CLAUSE',
  'BSD-2-CLAUSE-PATENT',
  'BSD-3-CLAUSE',
  'BSD-3-CLAUSE-CLEAR',
  'BSD-4-CLAUSE',
  'BSL-1.0',
  'CA-TOSL-1.1',
  'CATOSL-1.1',
  'CC-BY-1.0',
  'CC-BY-2.0',
  'CC-BY-2.5',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-NC-1.0',
  'CC-BY-NC-2.0',
  'CC-BY-NC-2.5',
  'CC-BY-NC-3.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-ND-1.0',
  'CC-BY-NC-ND-2.0',
  'CC-BY-NC-ND-2.5',
  'CC-BY-NC-ND-3.0',
  'CC-BY-NC-ND-4.0',
  'CC-BY-NC-SA-1.0',
  'CC-BY-NC-SA-2.0',
  'CC-BY-NC-SA-2.5',
  'CC-BY-NC-SA-3.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-ND-1.0',
  'CC-BY-ND-2.0',
  'CC-BY-ND-2.5',
  'CC-BY-ND-3.0',
  'CC-BY-ND-4.0',
  'CC-BY-SA-1.0',
  'CC-BY-SA-2.0',
  'CC-BY-SA-2.5',
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
  'CC0-1.0',
  'CDDL-1.0',
  'CDDL-1.1',
  'CPAL-1.0',
  'CPL-1.0',
  'ECL-1.0',
  'ECL-2.0',
  'EFL-1.0',
  'EFL-2.0',
  'EPL-1.0',
  'EPL-2.0',
  'EUDATAGRID',
  'EUPL-1.0',
  'EUPL-1.1',
  'EUPL-1.2',
  'GFDL-1.1',
  'GFDL-1.2',
  'GFDL-1.3',
  'GL2PS',
  'GPL-1.0',
  'GPL-2.0',
  'GPL-3.0',
  'HPND',
  'IBM-pibs',
  'ISC',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'LPL-1.0',
  'LPL-1.02',
  'LPPL-1.0',
  'LPPL-1.1',
  'LPPL-1.2',
  'LPPL-1.3a',
  'LPPL-1.3c',
  'MIT',
  'MIT-0',
  'MOTOSOTO',
  'MPL-1.0',
  'MPL-1.1',
  'MPL-2.0',
  'MPL-2.0-no-copyleft-exception',
  'MS-PL',
  'MS-RL',
  'NASA-1.3',
  'NASA-1.3', // Duplicate in original list, keeping for compatibility
  'NCGL-UK-2.0',
  'NCSA',
  'NGPL',
  'NOSL',
  'NOWEB',
  'NPL-1.0',
  'NPL-1.1',
  'NPOSL-3.0',
  'OCLC-2.0',
  'OFL-1.0',
  'OFL-1.1',
  'OGTSL',
  'OLDAP-1.1',
  'OLDAP-1.2',
  'OLDAP-1.3',
  'OLDAP-1.4',
  'OLDAP-2.0',
  'OLDAP-2.0.1',
  'OLDAP-2.1',
  'OLDAP-2.2',
  'OLDAP-2.2.1',
  'OLDAP-2.2.2',
  'OLDAP-2.3',
  'OLDAP-2.4',
  'OLDAP-2.5',
  'OLDAP-2.6',
  'OLDAP-2.7',
  'OLDAP-2.8',
  'OSET-PL-2.1',
  'PHP-3.0',
  'PHP-3.01',
  'POSTGRESQL',
  'PSF-2.0',
  'Python-2.0',
  'QPL-1.0',
  'RPSL-1.0',
  'RSCPL',
  'SISSL',
  'SISSL-1.2',
  'SMLGL',
  'SMPPL',
  'ZPL-1.1',
  'ZPL-2.0',
  'ZPL-2.1',
  'Zlib',
])

/**
 * Validate Package URL (PURL) format
 * @param purl - Package URL to validate
 * @returns True if valid PURL
 */
export function validatePurl(purl: string): boolean {
  if (!purl || typeof purl !== 'string') {
    return false
  }

  // Basic PURL validation: scheme:type/namespace/name@version
  // Full spec: https://github.com/package-url/purl-spec
  // Updated regex to handle scoped packages like @types/node
  const purlRegex = /^pkg:[A-Za-z0-9][A-Za-z0-9._-]*\/.+@.+$/

  return purlRegex.test(purl)
}

/**
 * Validate SPDX license ID
 * @param license - License ID to validate
 * @returns True if valid SPDX license
 */
export function validateLicense(license: string): boolean {
  if (!license || typeof license !== 'string') {
    return false
  }

  // Normalize to uppercase for case-insensitive comparison
  const normalized = license.toUpperCase().trim()
  return SPDX_LICENSES.has(normalized)
}

/**
 * Validate CycloneDX output structure
 * @param output - Parsed JSON object to validate
 * @returns Validation result with errors
 */
export function validateOutput(output: unknown): ValidationResult {
  const errors: string[] = []

  if (!output || typeof output !== 'object') {
    errors.push('Output must be a valid object')
    return { isValid: false, errors }
  }

  const bom = output as Record<string, unknown>

  // Check bomFormat
  if (!bom.bomFormat || typeof bom.bomFormat !== 'string') {
    errors.push('Missing required field: bomFormat')
  } else if (bom.bomFormat !== 'CycloneDX') {
    errors.push('Invalid bomFormat: expected CycloneDX')
  }

  // Check specVersion
  if (!bom.specVersion || typeof bom.specVersion !== 'string') {
    errors.push('Missing required field: specVersion')
  } else if (!['1.3', '1.4', '1.5'].includes(bom.specVersion)) {
    errors.push('Invalid specVersion: supported versions are 1.3, 1.4, 1.5')
  }

  // Check version
  if (bom.version === undefined || typeof bom.version !== 'number') {
    errors.push('Missing required field: version')
  }

  // Check components
  if (bom.components !== undefined && !Array.isArray(bom.components)) {
    errors.push('components must be an array')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// ============================================================
// GENERATION FUNCTIONS
// ============================================================

/**
 * Generate CycloneDX SBOM from components
 * @param components - Array of components
 * @param options - Generator options
 * @returns Promise resolving to SBOM output
 */
export async function generateCycloneDX(components: Component[], options: GeneratorOptions = {}): Promise<SbomOutput> {
  const format = options.format || 'json'
  const specVersion = options.specVersion || '1.5'

  if (format === 'xml') {
    throw new Error('XML output is not yet implemented')
  }

  // Build CycloneDX BOM
  const bom: CycloneDXBom = {
    bomFormat: 'CycloneDX',
    specVersion,
    version: 1,
    serialNumber: generateSerialNumber(),
    metadata: createMetadata(options.metadata),
  }

  // Add components (always include as array)
  bom.components = components.map(componentToCycloneDX)

  // Validate output
  const validation = validateOutput(bom)
  if (!validation.isValid) {
    throw new Error(`Generated invalid CycloneDX: ${validation.errors.join(', ')}`)
  }

  // Generate output
  const content = generateJsonOutput(bom, options.pretty)

  // Generate filename with timestamp (format: YYYYMMDDHHMMSS)
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)
  const filename = `sbom-${timestamp}.bom.json`

  return {
    format: 'json',
    content,
    filename,
    metadata: {
      componentCount: components.length,
      specVersion,
      generatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Generate JSON output from BOM
 * @param bom - CycloneDX BOM object
 * @param pretty - Whether to pretty-print JSON
 * @returns JSON string
 */
export function generateJsonOutput(bom: CycloneDXBom, pretty = false): string {
  if (pretty) {
    return JSON.stringify(bom, null, 2)
  }
  return JSON.stringify(bom)
}

/**
 * Create metadata for the SBOM
 * @param options - Metadata options
 * @returns CycloneDX metadata
 */
export function createMetadata(options?: MetadataOptions): CycloneDXMetadata {
  const metadata: CycloneDXMetadata = {
    timestamp: new Date().toISOString(),
  }

  // Add root component if metadata options provided
  if (options?.name || options?.version || options?.description || options?.author) {
    metadata.component = {
      type: 'application',
      name: options.name || 'Generated SBOM',
      version: options.version,
      description: options.description,
      author: options.author,
    }
  } else {
    // Add default root component
    metadata.component = {
      type: 'application',
      name: 'Generated SBOM',
    }
  }

  return metadata
}

/**
 * Convert internal Component to CycloneDX component
 * @param component - Internal component
 * @returns CycloneDX component
 */
export function componentToCycloneDX(component: Component): CycloneDXComponent {
  const cyclonedxComponent: CycloneDXComponent = {
    type: component.type,
    'bom-ref': component.purl || generateBomRef(component.name, component.version),
    name: component.name,
    version: component.version,
  }

  // Add optional fields if present
  if (component.description) {
    cyclonedxComponent.description = component.description
  }

  if (component.licenses && component.licenses.length > 0) {
    cyclonedxComponent.licenses = component.licenses.map((license) => ({
      license: {
        id: license,
      },
    }))
  }

  if (component.purl) {
    cyclonedxComponent.purl = component.purl
  }

  if (component.cpe) {
    cyclonedxComponent.cpe = component.cpe
  }

  if (component.supplier) {
    cyclonedxComponent.supplier = {
      name: component.supplier,
    }
  }

  return cyclonedxComponent
}

/**
 * Generate a bom-ref (unique component reference)
 * Uses ULID if no name/version provided, otherwise creates formatted reference
 * @param name - Component name
 * @param version - Component version
 * @returns Unique bom-ref string
 */
export function generateBomRef(name?: string, version?: string): string {
  if (name && version) {
    // Create formatted reference from name and version
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9.-]/g, '-')
    return `${sanitizedName}@${version}`
  }

  // Generate ULID for unique reference
  return ulid()
}

/**
 * Generate UUID v4 for serial number
 * @returns UUID string
 */
function generateUUID(): string {
  // Generate random UUID v4
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Generate serial number in urn:uuid: format
 * @returns Serial number string
 */
export function generateSerialNumber(): string {
  const uuid = generateUUID()
  return `urn:uuid:${uuid}`
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate filename for SBOM output
 * @param format - Output format
 * @param timestamp - Optional timestamp
 * @returns Generated filename
 */
export function generateFilename(format: 'json' | 'xml' = 'json', timestamp?: Date): string {
  const ts = timestamp || new Date()
  const tsStr = ts.toISOString().replace(/[:.]/g, '').slice(0, -5)
  const ext = format === 'xml' ? 'bom.xml' : 'bom.json'
  return `sbom-${tsStr}.${ext}`
}

/**
 * Create a complete CycloneDX document from components
 * This is the main entry point for the generator
 *
 * @param components - Components to include in SBOM
 * @param options - Generator options
 * @returns Promise resolving to complete SBOM output
 */
export async function createSbom(components: Component[], options: GeneratorOptions = {}): Promise<SbomOutput> {
  return generateCycloneDX(components, options)
}

// ============================================================
// CPE ESTIMATION FUNCTIONS
// ============================================================

/**
 * CPE Estimation Service Interface
 * Used for dependency injection of the CPE estimation service
 */
export interface CPEEstimationServiceInterface {
  estimateCPEs(componentName: string, version: string): Promise<CPEMatchResult[]>
}

/**
 * Result of CPE estimation and assignment
 */
export interface CPEEstimationResult {
  /** Components with CPEs assigned (either pre-existing or auto-assigned) */
  components: Component[]
  /** Components that need user confirmation for CPE selection */
  ambiguous: AmbiguousComponent[]
  /** Number of CPEs auto-assigned */
  autoAssignedCount: number
}

/**
 * High confidence threshold for auto-selecting CPEs (percentage)
 * CPEs with matchScore >= this value will be auto-selected
 */
const HIGH_CONFIDENCE_THRESHOLD = 80

/**
 * Estimate and assign CPEs to components that are missing them.
 *
 * This function:
 * 1. Identifies components without CPEs
 * 2. Estimates CPEs using the provided service
 * 3. Auto-assigns high-confidence single matches (>80%)
 * 4. Returns ambiguous cases for UI handling
 *
 * @param components - Components to process
 * @param estimationService - Service for CPE estimation
 * @returns Promise resolving to estimation result
 *
 * @example
 * ```ts
 * const result = await estimateAndAssignCPEs(components, cpeService)
 * if (result.ambiguous.length > 0) {
 *   // Show UI for user to select from multiple matches
 *   showCPEMatchDialog(result.ambiguous)
 * } else {
 *   // All CPEs auto-assigned, proceed with generation
 *   generateCycloneDX(result.components)
 * }
 * ```
 */
export async function estimateAndAssignCPEs(
  components: Component[],
  estimationService: CPEEstimationServiceInterface,
): Promise<CPEEstimationResult> {
  const updatedComponents: Component[] = []
  const ambiguous: AmbiguousComponent[] = []
  let autoAssignedCount = 0

  for (const component of components) {
    // Skip if component already has a CPE
    if (component.cpe) {
      updatedComponents.push(component)
      continue
    }

    // Skip if component doesn't have a version (required for CPE)
    if (!component.version) {
      updatedComponents.push(component)
      continue
    }

    // Estimate CPEs for this component
    const estimatedCPEs = await estimationService.estimateCPEs(component.name, component.version)

    if (estimatedCPEs.length === 0) {
      // No CPEs found, keep component as-is
      updatedComponents.push(component)
      continue
    }

    // Filter to high-confidence matches only
    const highConfidenceMatches = estimatedCPEs.filter((cpe) => cpe.matchScore >= HIGH_CONFIDENCE_THRESHOLD)

    if (highConfidenceMatches.length === 1) {
      // Single high-confidence match - auto-assign
      const selectedCPE = highConfidenceMatches[0]
      updatedComponents.push({
        ...component,
        cpe: selectedCPE.cpe,
      })
      autoAssignedCount++
    } else if (highConfidenceMatches.length > 1 || estimatedCPEs.length > 1) {
      // Multiple matches - needs user confirmation
      ambiguous.push({
        componentId: component.id,
        componentName: component.name,
        componentVersion: component.version,
        estimatedCPEs: estimatedCPEs,
        needsUserConfirmation: true,
      })
      updatedComponents.push(component)
    } else {
      // Single low-confidence match - needs user confirmation
      ambiguous.push({
        componentId: component.id,
        componentName: component.name,
        componentVersion: component.version,
        estimatedCPEs: estimatedCPEs,
        needsUserConfirmation: true,
      })
      updatedComponents.push(component)
    }
  }

  return {
    components: updatedComponents,
    ambiguous,
    autoAssignedCount,
  }
}

/**
 * Assign user-selected CPEs to components.
 *
 * @param components - Original components
 * @param selections - Map of component ID to selected CPE string
 * @returns Components with CPEs assigned
 */
export function assignSelectedCPEs(components: Component[], selections: Map<string, string>): Component[] {
  return components.map((component) => {
    const selectedCPE = selections.get(component.id)
    if (selectedCPE) {
      return {
        ...component,
        cpe: selectedCPE,
      }
    }
    return component
  })
}
