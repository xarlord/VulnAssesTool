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

  // Tag-value is SPDX's line-oriented text format (the canonical `.spdx` extension).
  if (extension === 'spdx' || extension === 'tag' || extension === 'tv') {
    return parseSpdxTagValue(fileContent)
  }

  throw new Error(`Unsupported file format: ${extension}. Expected .json or .spdx (tag-value)`)
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

  return buildSpdxResult(json)
}

/**
 * Parse SPDX tag-value format (`.spdx`). The text is normalized into the same
 * SpdxJson shape the JSON path produces, then run through the identical
 * component/relationship extraction so both formats yield consistent output.
 */
function parseSpdxTagValue(fileContent: string): {
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'spdx'
    formatVersion: string
    componentCount: number
  }
} {
  const json = tagValueToSpdxJson(fileContent)
  return buildSpdxResult(json)
}

/**
 * Shared tail of both SPDX parsers: validate the document is SPDX, then extract
 * components, vulnerabilities and metadata.
 */
function buildSpdxResult(json: SpdxJson): {
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'spdx'
    formatVersion: string
    componentCount: number
  }
} {
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
 * Split SPDX tag-value text into (tag, value) pairs, joining multi-line
 * `<text>...</text>` blocks into a single value and skipping blanks/comments.
 */
function tokenizeTagValue(content: string): Array<{ tag: string; value: string }> {
  const pairs: Array<{ tag: string; value: string }> = []
  const lines = content.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue

    const tag = line.slice(0, colon).trim()
    if (!tag) continue

    let value = line.slice(colon + 1).trim()

    // A value may open a multi-line <text> block that closes on a later line.
    if (value.startsWith('<text>')) {
      if (value.includes('</text>')) {
        value = value.slice('<text>'.length, value.indexOf('</text>'))
      } else {
        const buf = [value.slice('<text>'.length)]
        i++
        while (i < lines.length && !lines[i].includes('</text>')) {
          buf.push(lines[i])
          i++
        }
        if (i < lines.length) buf.push(lines[i].slice(0, lines[i].indexOf('</text>')))
        value = buf.join('\n')
      }
    }

    pairs.push({ tag, value })
  }

  return pairs
}

/**
 * Convert SPDX tag-value text into the SpdxJson shape. A `PackageName` line
 * starts a new package (the conventional SPDX ordering, PackageName before its
 * other fields); document-level fields seen before the first package attach to
 * the document. Only the fields the extractor consumes are mapped.
 */
function tagValueToSpdxJson(content: string): SpdxJson {
  const doc: SpdxJson = { packages: [], relationships: [] }
  let current: SpdxJsonPackage | null = null

  for (const { tag, value } of tokenizeTagValue(content)) {
    switch (tag) {
      case 'SPDXVersion':
        doc.spdxVersion = value
        break
      case 'DataLicense':
        doc.dataLicense = value
        break
      case 'DocumentName':
        doc.name = value
        break
      case 'DocumentNamespace':
        doc.documentNamespace = value
        break
      case 'PackageName':
        current = { SPDXID: '', name: value }
        doc.packages?.push(current)
        break
      case 'SPDXID':
        if (current) current.SPDXID = value
        else doc.spdxId = value
        break
      case 'PackageVersion':
        if (current) current.versionInfo = value
        break
      case 'PackageDownloadLocation':
        if (current) current.downloadLocation = value
        break
      case 'PackageLicenseConcluded':
        if (current) current.licenseConcluded = value
        break
      case 'PackageLicenseDeclared':
        if (current) current.licenseDeclared = value
        break
      case 'PackageCopyrightText':
        if (current) current.copyrightText = value
        break
      case 'PackageDescription':
        if (current) current.description = value
        break
      case 'PackageChecksum': {
        // "SHA256: <hash>" — surface the digest as the component hash.
        if (current) {
          const match = value.match(/^\S+:\s*(.+)$/)
          if (match) current.packageVerificationCode = { packageVerificationCodeValue: match[1].trim() }
        }
        break
      }
      case 'ExternalRef': {
        // "<category> <type> <locator>", e.g. "PACKAGE-MANAGER purl pkg:npm/lodash@4.17.21".
        if (current) {
          const parts = value.split(/\s+/)
          if (parts.length >= 3) {
            current.externalRefs = current.externalRefs ?? []
            current.externalRefs.push({
              referenceCategory: parts[0],
              referenceType: parts[1],
              referenceLocator: parts.slice(2).join(' '),
            })
          }
        }
        break
      }
      case 'Relationship': {
        // "<element> <TYPE> <relatedElement>", e.g. "SPDXRef-A DEPENDS_ON SPDXRef-B".
        const parts = value.split(/\s+/)
        if (parts.length === 3) {
          doc.relationships?.push({
            spdxElementId: parts[0],
            relationshipType: parts[1],
            relatedSpdxElement: parts[2],
          })
        }
        break
      }
      default:
        break
    }
  }

  return doc
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

    if (extension === 'spdx' || extension === 'tag' || extension === 'tv') {
      const match = fileContent.match(/SPDXVersion:\s*(SPDX-\d+\.\d+)/)
      return match ? extractSpdxVersion(match[1]) : null
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

    if (extension === 'spdx' || extension === 'tag' || extension === 'tv') {
      return /^\s*SPDXVersion:\s*SPDX-/m.test(fileContent) || /^\s*DataLicense:\s*CC0-1\.0/m.test(fileContent)
    }

    return false
  } catch {
    return false
  }
}
