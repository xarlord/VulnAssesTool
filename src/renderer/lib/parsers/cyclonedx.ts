import { XMLParser } from 'fast-xml-parser'
import type { Component, Vulnerability } from '@@/types'

/**
 * CycloneDX SBOM types based on specification v1.5
 */
interface CycloneDXBom {
  $: {
    version?: string
    serialNumber?: string
  }
  metadata?: {
    timestamp?: string
    component?: CycloneDXComponent
  }
  components?: CycloneDXComponent[]
}

interface CycloneDXComponent {
  $?: {
    type?: string
    'bom-ref'?: string
  }
  type: string
  'bom-ref'?: string
  name: string
  version?: string
  description?: string
  licenses?: ({ expression: string } | { license: { id?: string; name?: string } })[]
  externalReferences?: {
    reference: {
      type: string
      url: string
    }
  }[]
  components?: CycloneDXComponent[]
  supplyChain?: {
    supplies?: Array<{
      supplies: Array<{
        link: { href?: string; url?: string }
      }>
    }>
  }
  cpe?: string
  purl?: string
  hash?: Array<{
    alg: string
    content: string
  }>
}

interface CycloneDXJson {
  bomFormat?: string
  specVersion?: string
  serialNumber?: string
  version?: number
  metadata?: {
    timestamp?: string
    component?: {
      type: string
      'bom-ref'?: string
      name: string
      version?: string
      description?: string
      licenses?: ({ expression: string } | { license: { id?: string; name?: string } })[]
      cpe?: string
      purl?: string
      externalReferences?: { type: string; url: string }[]
    }
  }
  components?: CycloneDXJsonComponent[]
  vulnerabilities?: CycloneDXVulnerability[]
}

interface CycloneDXVulnerability {
  id: string
  source?: {
    name: string
    url?: string
  }
  ratings?: Array<{
    severity?: string
    score?: number
    method?: string
    vector?: string
  }>
  description?: string
  advisories?: Array<{
    url?: string
  }>
  affects?: Array<{
    ref?: string
  }>
  published?: string
  modified?: string
}

interface CycloneDXJsonComponent {
  type: string
  'bom-ref'?: string
  name: string
  version?: string
  description?: string
  licenses?: ({ expression: string } | { license: { id?: string; name?: string } })[]
  cpe?: string
  purl?: string
  externalReferences?: { type: string; url: string }[]
  components?: CycloneDXJsonComponent[]
}

/**
 * Parse CycloneDX SBOM file (JSON or XML format)
 * @param fileContent - The content of the SBOM file
 * @param filename - The name of the file (used for format detection)
 * @returns Object containing parsed components, vulnerabilities, and metadata
 * @throws Error if the file format is invalid or unsupported
 */
export async function parseCycloneDX(
  fileContent: string,
  filename: string,
): Promise<{
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'cyclonedx'
    formatVersion: string
    componentCount: number
  }
}> {
  const extension = filename.split('.').pop()?.toLowerCase()

  if (extension === 'json') {
    return parseCycloneDXJson(fileContent)
  } else if (extension === 'xml') {
    return parseCycloneDXXml(fileContent)
  }

  throw new Error(`Unsupported file format: ${extension}. Expected .json or .xml`)
}

/**
 * Parse CycloneDX JSON format
 */
function parseCycloneDXJson(fileContent: string): {
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'cyclonedx'
    formatVersion: string
    componentCount: number
  }
} {
  let json: CycloneDXJson

  try {
    json = JSON.parse(fileContent)
  } catch {
    throw new Error('Invalid JSON format')
  }

  // Validate CycloneDX format
  if (json.bomFormat !== 'CycloneDX') {
    throw new Error('Invalid CycloneDX format: missing bomFormat')
  }

  const components = extractComponentsFromJson(json)
  const vulnerabilities = extractVulnerabilitiesFromJson(json)
  const formatVersion = json.specVersion || '1.5'

  return {
    components,
    vulnerabilities,
    metadata: {
      format: 'cyclonedx',
      formatVersion,
      componentCount: components.length,
    },
  }
}

/**
 * Parse CycloneDX XML format
 */
function parseCycloneDXXml(fileContent: string): {
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'cyclonedx'
    formatVersion: string
    componentCount: number
  }
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (name) => ['component', 'components', 'vulnerability', 'vulnerabilities'].includes(name),
  })

  let parsed: CycloneDXBom

  try {
    parsed = parser.parse(fileContent)
  } catch {
    throw new Error('Invalid XML format')
  }

  // Validate CycloneDX format - check for root element
  const rootKey = Object.keys(parsed).find((k) => k.toLowerCase().includes('bom'))
  if (!rootKey) {
    throw new Error('Invalid CycloneDX XML format: missing bom element')
  }

  const bom = parsed[rootKey] as CycloneDXBom
  const components = extractComponentsFromXml(bom)
  const vulnerabilities = extractVulnerabilitiesFromXml(bom)
  const formatVersion = bom.$?.version || '1.5'

  return {
    components,
    vulnerabilities,
    metadata: {
      format: 'cyclonedx',
      formatVersion,
      componentCount: components.length,
    },
  }
}

/**
 * Extract all components from CycloneDX JSON (including nested components)
 */
function extractComponentsFromJson(json: CycloneDXJson, components: Component[] = [], parentId?: string): Component[] {
  if (!json.components) {
    return components
  }

  for (const comp of json.components) {
    const component = mapJsonComponentToComponent(comp, parentId)
    components.push(component)

    // Recursively process nested components
    if (comp.components) {
      extractComponentsFromJson({ components: comp.components }, components, component.id)
    }
  }

  return components
}

/**
 * Extract all components from CycloneDX XML (including nested components)
 */
function extractComponentsFromXml(bom: CycloneDXBom, components: Component[] = [], parentId?: string): Component[] {
  if (!bom.components) {
    return components
  }

  // Handle the case where components might be an object with a 'component' property
  let componentList: CycloneDXComponent[] = []

  if (Array.isArray(bom.components)) {
    componentList = bom.components as CycloneDXComponent[]
  } else if (typeof bom.components === 'object') {
    const comps = bom.components as unknown as { component: CycloneDXComponent | CycloneDXComponent[] }
    if (Array.isArray(comps.component)) {
      componentList = comps.component
    } else if (comps.component) {
      componentList = [comps.component]
    }
  }

  for (const comp of componentList) {
    const component = mapXmlComponentToComponent(comp, parentId)
    components.push(component)

    // Recursively process nested components
    if (comp.components) {
      extractComponentsFromXml({ components: comp.components, $: {} }, components, component.id)
    }
  }

  return components
}

/**
 * Generate a unique ID for a component
 */
function generateComponentId(name: string, version: string, parentId?: string): string {
  const baseId = `${name}-${version}`
  if (parentId) {
    return `${parentId}-${baseId}`.replace(/[^a-zA-Z0-9-]/g, '-')
  }
  return baseId.replace(/[^a-zA-Z0-9-]/g, '-')
}

/**
 * Map CycloneDX JSON component to internal Component type
 */
function mapJsonComponentToComponent(comp: CycloneDXJsonComponent, parentId?: string): Component {
  const name = comp.name || 'unknown'
  const version = comp.version || 'unknown'

  // Use PURL as ID if available, otherwise generate from name/version
  // This ensures vulnerability references (which use PURLs) match component IDs
  const id = comp.purl || generateComponentId(name, version, parentId)

  // Extract licenses
  const licenses = extractLicenses(comp.licenses)

  // Extract hash from purl or external references
  const hash = comp.purl?.split('@')[1] || undefined

  return {
    id,
    name,
    version,
    type: mapComponentType(comp.type),
    purl: comp.purl,
    cpe: comp.cpe,
    hasMissingCpe: !comp.cpe, // Flag components that need CPE estimation
    licenses,
    description: comp.description,
    hash,
    vulnerabilities: [],
  }
}

/**
 * Map CycloneDX XML component to internal Component type
 */
function mapXmlComponentToComponent(comp: CycloneDXComponent, parentId?: string): Component {
  const name = comp.name || 'unknown'
  const version = comp.version || 'unknown'

  // Use PURL as ID if available, otherwise generate from name/version
  // This ensures vulnerability references (which use PURLs) match component IDs
  const id = comp.purl || generateComponentId(name, version, parentId)

  // Extract licenses
  const licenses = extractLicenses(comp.licenses)

  // Extract hash from purl or hash array
  const hash = comp.purl?.split('@')[1] || comp.hash?.find((h) => h.alg === 'SHA-256')?.content || undefined

  return {
    id,
    name,
    version,
    type: mapComponentType(comp.type),
    purl: comp.purl,
    cpe: comp.cpe,
    hasMissingCpe: !comp.cpe, // Flag components that need CPE estimation
    licenses,
    description: comp.description,
    hash,
    vulnerabilities: [],
  }
}

/**
 * Map CycloneDX component type to internal type
 */
function mapComponentType(type: string): Component['type'] {
  const typeMap: Record<string, Component['type']> = {
    library: 'library',
    framework: 'framework',
    application: 'application',
    container: 'container',
    platform: 'other',
    device: 'other',
    firmware: 'other',
    file: 'other',
  }

  return typeMap[type.toLowerCase()] || 'other'
}

/**
 * Extract licenses from CycloneDX component
 */
function extractLicenses(
  licenses: ({ expression: string } | { license: { id?: string; name?: string } })[] | undefined,
): string[] {
  if (!licenses) {
    return []
  }

  const result: string[] = []

  for (const lic of licenses) {
    if ('expression' in lic) {
      result.push(lic.expression)
    } else if (lic.license) {
      result.push(lic.license.id || lic.license.name || 'unknown')
    }
  }

  return result
}

/**
 * Validate if a file is a valid CycloneDX SBOM
 */
export async function validateCycloneDX(fileContent: string, filename: string): Promise<boolean> {
  try {
    await parseCycloneDX(fileContent, filename)
    return true
  } catch {
    return false
  }
}

/**
 * Get format version from CycloneDX file
 */
export function getCycloneDXVersion(fileContent: string, filename: string): string | null {
  try {
    const extension = filename.split('.').pop()?.toLowerCase()

    if (extension === 'json') {
      const json = JSON.parse(fileContent) as CycloneDXJson
      return json.specVersion || null
    } else if (extension === 'xml') {
      // Use regex to extract version attribute from bom element
      const bomMatch = fileContent.match(/<bom[^>]*version=["']([^"']+)["']/)
      if (bomMatch && bomMatch[1]) {
        return bomMatch[1]
      }
      return null
    }
  } catch {
    return null
  }

  return null
}

/**
 * Extract vulnerabilities from CycloneDX JSON
 */
function extractVulnerabilitiesFromJson(json: CycloneDXJson): Vulnerability[] {
  if (!json.vulnerabilities || !Array.isArray(json.vulnerabilities)) {
    return []
  }

  return json.vulnerabilities.map((vuln) => mapCycloneDXVulnerability(vuln))
}

/**
 * Extract vulnerabilities from CycloneDX XML
 */
function extractVulnerabilitiesFromXml(bom: CycloneDXBom): Vulnerability[] {
  // Vulnerabilities in XML are typically nested under the bom element
  let vulnList: CycloneDXVulnerability[] = []

  // Handle different possible structures
  if ('vulnerabilities' in bom) {
    const vulns = (bom as any).vulnerabilities
    if (Array.isArray(vulns)) {
      vulnList = vulns
    } else if (vulns && typeof vulns === 'object' && 'vulnerability' in vulns) {
      const nested = vulns.vulnerability
      vulnList = Array.isArray(nested) ? nested : [nested]
    }
  }

  return vulnList.map((vuln) => mapCycloneDXVulnerability(vuln))
}

/**
 * Map CycloneDX vulnerability to internal Vulnerability type
 */
function mapCycloneDXVulnerability(vuln: CycloneDXVulnerability): Vulnerability {
  // Get the severity from the first rating
  const severity = vuln.ratings?.[0]?.severity?.toUpperCase() || 'UNKNOWN'
  const normalizedSeverity = normalizeSeverity(severity)
  const sourceName = (vuln.source?.name || 'NVD').toLowerCase()
  const sourceId = vuln.id

  // Build references array with both advisories and the primary source URL
  const references: Vulnerability['references'] = []

  // Add advisories from CycloneDX data (these are typically GitHub advisories or other external references)
  if (vuln.advisories && vuln.advisories.length > 0) {
    for (const advisory of vuln.advisories) {
      if (advisory.url) {
        references.push({
          url: advisory.url,
          source: vuln.source?.name || 'NVD',
          tags: ['advisory'],
        })
      }
    }
  }

  // Add the primary source URL (NVD or OSV) for quick access
  // This ensures the correct source link is always available
  const sourceUrl =
    sourceName === 'nvd' ? `https://nvd.nist.gov/vuln/detail/${sourceId}` : `https://osv.dev/vulnerability/${sourceId}`

  // Add source URL if not already present in references
  if (!references.some((ref) => ref.url === sourceUrl)) {
    references.unshift({
      url: sourceUrl,
      source: sourceName === 'nvd' ? 'NVD' : 'OSV',
      tags: ['official'],
    })
  }

  return {
    id: vuln.id,
    source: sourceName,
    severity: normalizedSeverity,
    cvssScore: vuln.ratings?.[0]?.score,
    cvssVector: vuln.ratings?.[0]?.vector,
    description: vuln.description || '',
    references,
    affectedComponents: vuln.affects?.map((a) => a.ref || '').filter(Boolean) || [],
    publishedAt: vuln.published ? new Date(vuln.published) : undefined,
    modifiedAt: vuln.modified ? new Date(vuln.modified) : undefined,
    patchInfo: undefined,
  }
}

/**
 * Normalize severity string to expected values
 */
function normalizeSeverity(severity: string): Vulnerability['severity'] {
  const normalized = severity.toUpperCase()
  if (normalized === 'CRITICAL') return 'critical'
  if (normalized === 'HIGH') return 'high'
  if (normalized === 'MEDIUM') return 'medium'
  if (normalized === 'LOW') return 'low'
  if (normalized === 'NONE') return 'none'
  return 'low' // Default to low if unknown
}
