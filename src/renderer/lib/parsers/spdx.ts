import type { Component, Vulnerability } from '@@/types'

/**
 * SPDX SBOM types based on specification v2.3
 */
interface SpdxJson {
  spdxVersion?: string
  dataLicense?: string
  spdxId?: string
  name?: string
  documentNamespace?: string
  packages?: SpdxJsonPackage[]
  documentDescribes?: string[]
  relationships?: Array<{
    spdxElementId?: string
    relatedSpdxElement?: string
    relationshipType?: string
  }>
}

interface SpdxJsonPackage {
  SPDXID: string
  name: string
  versionInfo?: string
  downloadLocation?: string
  filesAnalyzed?: boolean
  licenseConcluded?: string
  licenseDeclared?: string
  copyrightText?: string
  description?: string
  externalRefs?: Array<{
    referenceCategory?: string
    referenceType?: string
    referenceLocator?: string
  }>
  packageVerificationCode?: {
    packageVerificationCodeValue?: string
  }
}

/**
 * Parse SPDX SBOM file (JSON, XML, or YAML format)
 * @param fileContent - The content of the SBOM file
 * @param filename - The name of the file (used for format detection)
 * @returns Object containing parsed components and metadata
 * @throws Error if the file format is invalid or unsupported
 */
export async function parseSpdx(
  fileContent: string,
  filename: string,
): Promise<{
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'spdx'
    formatVersion: string
    componentCount: number
  }
}> {
  const extension = filename.split('.').pop()?.toLowerCase()

  if (extension === 'json') {
    return parseSpdxJson(fileContent)
  }

  // XML and YAML parsing support to be added in future iteration
  // For MVP, focusing on JSON format which is most commonly used

  throw new Error(`Unsupported file format: ${extension}. Expected .json`)
}

/**
 * Extract vulnerabilities from SPDX JSON
 * Note: SPDX doesn't typically include vulnerability data natively,
 * so this returns an empty array for now.
 */
function extractVulnerabilitiesFromSpdxJson(_json: SpdxJson): Vulnerability[] {
  // SPDX format doesn't natively include vulnerability information
  // Vulnerabilities would need to be fetched from external sources
  return []
}

/**
 * Parse SPDX JSON format
 */
function parseSpdxJson(fileContent: string): {
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'spdx'
    formatVersion: string
    componentCount: number
  }
} {
  let json: SpdxJson

  try {
    json = JSON.parse(fileContent)
  } catch {
    throw new Error('Invalid JSON format')
  }

  // Validate SPDX format
  if (json.dataLicense !== 'CC0-1.0') {
    throw new Error('Invalid SPDX format: missing or invalid dataLicense')
  }

  const components = extractComponentsFromSpdxJson(json)
  const vulnerabilities = extractVulnerabilitiesFromSpdxJson(json)
  const formatVersion = extractSpdxVersion(json.spdxVersion)

  return {
    components,
    vulnerabilities,
    metadata: {
      format: 'spdx',
      formatVersion,
      componentCount: components.length,
    },
  }
}

/**
 * Extract version from SPDX version string
 */
function extractSpdxVersion(spdxVersion?: string): string {
  if (!spdxVersion) {
    return '2.3'
  }

  // SPDX versions are like "SPDX-2.3", extract the numeric part
  const match = spdxVersion.match(/(\d+\.\d+)/)
  return match ? match[1] : '2.3'
}

/**
 * Extract components from SPDX JSON, wiring package relationships into each
 * component's `dependencies` (FR-02.2: "handle package relationships and
 * dependencies"). Relationships reference SPDX ids, so a SPDXID -> component-id
 * map bridges them onto the ids the dependency graph and exports consume.
 */
function extractComponentsFromSpdxJson(json: SpdxJson): Component[] {
  if (!json.packages || json.packages.length === 0) {
    return []
  }

  const components: Component[] = []
  const spdxIdToComponentId = new Map<string, string>()

  for (const pkg of json.packages) {
    const component = mapSpdxPackageToComponent(pkg)
    components.push(component)
    if (pkg.SPDXID) {
      spdxIdToComponentId.set(pkg.SPDXID, component.id)
    }
  }

  applySpdxRelationships(components, spdxIdToComponentId, json.relationships)

  return components
}

/**
 * Translate SPDX relationships into component dependency edges. Only the two
 * relationship types that express a dependency are used: DEPENDS_ON (element
 * depends on the related element) and its inverse DEPENDENCY_OF. Relationships
 * whose endpoints don't resolve to a parsed package (e.g. DESCRIBES from the
 * document, or refs to files) are skipped.
 */
function applySpdxRelationships(
  components: Component[],
  spdxIdToComponentId: Map<string, string>,
  relationships?: SpdxJson['relationships'],
): void {
  if (!relationships || relationships.length === 0) {
    return
  }

  const componentsById = new Map(components.map((component) => [component.id, component]))

  const addDependency = (fromComponentId: string, toComponentId: string): void => {
    if (fromComponentId === toComponentId) {
      return
    }
    const component = componentsById.get(fromComponentId)
    if (!component) {
      return
    }
    const deps = component.dependencies ?? []
    if (!deps.includes(toComponentId)) {
      component.dependencies = [...deps, toComponentId]
    }
  }

  for (const rel of relationships) {
    const fromId = rel.spdxElementId ? spdxIdToComponentId.get(rel.spdxElementId) : undefined
    const toId = rel.relatedSpdxElement ? spdxIdToComponentId.get(rel.relatedSpdxElement) : undefined
    if (!fromId || !toId) {
      continue
    }

    if (rel.relationshipType === 'DEPENDS_ON') {
      addDependency(fromId, toId)
    } else if (rel.relationshipType === 'DEPENDENCY_OF') {
      addDependency(toId, fromId)
    }
  }
}

/**
 * Generate a unique ID for a component
 */
function generateComponentId(name: string, version: string): string {
  const baseId = `${name}-${version || 'unknown'}`
  return baseId.replace(/[^a-zA-Z0-9-]/g, '-')
}

/**
 * Map SPDX package to internal Component type
 */
function mapSpdxPackageToComponent(pkg: SpdxJsonPackage): Component {
  const name = pkg.name || 'unknown'
  // Leave version empty when absent (was the literal 'unknown', which is truthy and defeats
  // downstream `if (!version)` guards). generateComponentId keeps its own 'unknown' placeholder,
  // so component IDs stay stable; `coverage` below records the gap. SPDX has no properties bag,
  // so coverage is derived purely from version presence.
  const rawVersion = pkg.versionInfo || ''
  const version = rawVersion ? rawVersion.replace(/[/\\]/g, '.').replace(/\.{2,}/g, '.') : ''
  const id = generateComponentId(name, version)
  const coverage: Component['coverage'] = version ? 'identified' : 'gap'

  // Extract licenses
  const licenses = extractSpdxLicenses(pkg.licenseConcluded, pkg.licenseDeclared)

  // Extract purl from external references
  const purl = pkg.externalRefs?.find((ref) => ref.referenceType === 'purl')?.referenceLocator

  // Extract CPE from external references
  const cpe = pkg.externalRefs?.find((ref) => ref.referenceType?.toLowerCase().includes('cpe'))?.referenceLocator

  // Extract hash from verification code
  const hash = pkg.packageVerificationCode?.packageVerificationCodeValue

  // Determine component type based on download location or name
  const type = determineComponentType(pkg.downloadLocation, name)

  return {
    id,
    name,
    version,
    type,
    purl,
    cpe,
    hasMissingCpe: !cpe, // Flag components that need CPE estimation
    licenses,
    description: pkg.description,
    hash,
    coverage,
    vulnerabilities: [],
  }
}

/**
 * Determine component type from SPDX package info
 */
function determineComponentType(downloadLocation?: string, name?: string): Component['type'] {
  if (!downloadLocation) {
    return 'library'
  }

  const location = downloadLocation.toLowerCase()

  // Check for container images
  if (location.includes('docker') || location.includes('container') || location.includes('oci')) {
    return 'container'
  }

  // Check for frameworks
  if (
    name?.toLowerCase().includes('react') ||
    name?.toLowerCase().includes('angular') ||
    name?.toLowerCase().includes('vue') ||
    name?.toLowerCase().includes('svelte')
  ) {
    return 'framework'
  }

  // Check for applications
  if (location.includes('binary') || location.includes('executable')) {
    return 'application'
  }

  return 'library'
}

/**
 * Extract licenses from SPDX package
 */
function extractSpdxLicenses(licenseConcluded?: string, licenseDeclared?: string): string[] {
  const licenses: string[] = []

  if (licenseConcluded && licenseConcluded !== 'NOASSERTION') {
    licenses.push(licenseConcluded)
  }

  if (licenseDeclared && licenseDeclared !== 'NOASSERTION' && !licenses.includes(licenseDeclared)) {
    licenses.push(licenseDeclared)
  }

  // Handle license expressions like "MIT OR Apache-2.0"
  const allLicenses = licenses.flatMap((lic) =>
    lic
      .split(/\s+(?:OR|AND)\s+/i)
      .map((l) => l.trim())
      .filter((l) => l && l !== 'NONE'),
  )

  return allLicenses.length > 0 ? allLicenses : ['unknown']
}

/**
 * Validate if a file is a valid SPDX SBOM
 */
export async function validateSpdx(fileContent: string, filename: string): Promise<boolean> {
  try {
    await parseSpdx(fileContent, filename)
    return true
  } catch {
    return false
  }
}

/**
 * Get format version from SPDX file
 */
export function getSpdxVersion(fileContent: string, filename: string): string | null {
  try {
    const extension = filename.split('.').pop()?.toLowerCase()

    if (extension === 'json') {
      const json = JSON.parse(fileContent) as SpdxJson
      return extractSpdxVersion(json.spdxVersion)
    }
  } catch {
    return null
  }

  return null
}

/**
 * Check if a file is SPDX format
 */
export function isSpdxFile(fileContent: string, filename: string): boolean {
  try {
    const extension = filename.split('.').pop()?.toLowerCase()

    if (extension === 'json') {
      const json = JSON.parse(fileContent) as SpdxJson
      // Check for SPDX-specific fields
      return json.dataLicense === 'CC0-1.0' || !!json.spdxVersion
    }

    return false
  } catch {
    return false
  }
}
