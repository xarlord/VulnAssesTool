import { XMLParser } from 'fast-xml-parser'
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

/** Shared return shape of every SPDX parse path (JSON, tag-value, RDF/XML). */
interface SpdxParseResult {
  components: Component[]
  vulnerabilities: Vulnerability[]
  metadata: {
    format: 'spdx'
    formatVersion: string
    componentCount: number
  }
}

/**
 * Parse SPDX SBOM file (JSON, XML, or YAML format)
 * @param fileContent - The content of the SBOM file
 * @param filename - The name of the file (used for format detection)
 * @returns Object containing parsed components and metadata
 * @throws Error if the file format is invalid or unsupported
 */
export async function parseSpdx(fileContent: string, filename: string): Promise<SpdxParseResult> {
  const extension = filename.split('.').pop()?.toLowerCase()

  if (extension === 'json') {
    return parseSpdxJson(fileContent)
  }

  // Tag-value is SPDX's line-oriented text format (the canonical `.spdx` extension).
  if (extension === 'spdx' || extension === 'tag' || extension === 'tv') {
    return parseSpdxTagValue(fileContent)
  }

  // RDF/XML — SPDX serialized as RDF (`.rdf`, `.rdf.xml`, or `.xml`).
  if (extension === 'rdf' || extension === 'xml') {
    return parseSpdxRdfXml(fileContent)
  }

  throw new Error(`Unsupported file format: ${extension}. Expected .json, .spdx (tag-value), or .rdf/.xml`)
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
function parseSpdxJson(fileContent: string): SpdxParseResult {
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
function parseSpdxTagValue(fileContent: string): SpdxParseResult {
  const json = tagValueToSpdxJson(fileContent)
  return buildSpdxResult(json)
}

/**
 * Shared tail of both SPDX parsers: validate the document is SPDX, then extract
 * components, vulnerabilities and metadata.
 */
function buildSpdxResult(json: SpdxJson): SpdxParseResult {
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
        // "SHA256: <hash>" — surface the digest as the component hash. A package may carry
        // several checksum lines (SHA1, SHA256, …); keep the first so the value is stable
        // regardless of line order, matching the RDF/JSON paths (which take the first checksum).
        if (current && !current.packageVerificationCode) {
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
 * Parse SPDX RDF/XML. This is a pragmatic parser for tool-generated SPDX RDF (the
 * spdx:Package / spdx:Relationship structure that spdx-tools, syft, etc. emit), not
 * a full RDF graph reasoner: it walks the XML tree prefix-agnostically, extracts the
 * package fields the Component mapper needs, and reads relationships nested inside
 * their subject package. Packages referenced only by rdf:resource (never given inline)
 * cannot be resolved and are skipped. Output is normalized into the SpdxJson shape so
 * the shared extractor produces components consistent with the JSON/tag-value paths.
 */
function parseSpdxRdfXml(fileContent: string): SpdxParseResult {
  return buildSpdxResult(rdfXmlToSpdxJson(fileContent))
}

/** Local (namespace-stripped) name of an XML tag/attribute key, e.g. 'spdx:name' -> 'name'. */
function localName(key: string): string {
  const idx = key.indexOf(':')
  return idx === -1 ? key : key.slice(idx + 1)
}

/** Value of the first child whose local name matches, regardless of namespace prefix. */
function rdfField(node: Record<string, unknown>, name: string): unknown {
  for (const [key, value] of Object.entries(node)) {
    if (localName(key) === name) return value
  }
  return undefined
}

/** First attribute value whose local name matches (e.g. 'resource' matches 'rdf:resource'). */
function rdfAttr(node: Record<string, unknown>, name: string): string {
  for (const [key, value] of Object.entries(node)) {
    if (localName(key) === name && typeof value === 'string') return value
  }
  return ''
}

/** Coerce an RDF field value (string, {#text}, or {rdf:resource}) to plain text. */
function rdfText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj['#text'] === 'string') return obj['#text']
    const resource = rdfAttr(obj, 'resource')
    if (resource) return resource
  }
  return ''
}

function rdfFieldText(node: Record<string, unknown>, name: string): string {
  return rdfText(rdfField(node, name))
}

/** SPDX ids appear as `#SPDXRef-x` or a full URI ending in `#SPDXRef-x`; reduce to the fragment. */
function normalizeRef(ref: string): string {
  const hash = ref.lastIndexOf('#')
  return hash === -1 ? ref : ref.slice(hash + 1)
}

/** The SPDX id of an RDF node from its rdf:about / rdf:ID / rdf:nodeID attribute. */
function rdfNodeId(node: Record<string, unknown>): string {
  return normalizeRef(rdfAttr(node, 'about') || rdfAttr(node, 'ID') || rdfAttr(node, 'nodeID'))
}

/** A license as an SPDX id: strip the `spdx.org/licenses/<ID>` URI down to `<ID>`. */
function normalizeRdfLicense(value: unknown): string | undefined {
  const text = rdfText(value)
  if (!text) return undefined
  // SPDX RDF encodes "no license asserted" as the ontology individuals
  // `.../terms#noassertion` / `#none`; map them to the string literals the JSON and
  // tag-value paths use so extractSpdxLicenses filters them the same way (FR-02.2 consistency).
  const lower = text.toLowerCase()
  if (lower === 'noassertion' || lower.endsWith('#noassertion')) return 'NOASSERTION'
  if (lower === 'none' || lower.endsWith('#none')) return 'NONE'
  if (text.includes('spdx.org/licenses/')) return text.split('/').pop()
  return text
}

/** Last segment of a URI-ish string, splitting on `/`, `#`, and `_` (e.g. `.../references#purl` -> `purl`). */
function lastUriSegment(text: string): string {
  return text.split(/[/#_]/).filter(Boolean).pop() ?? text
}

/** Reduce an RDF referenceType (e.g. `.../references#purl`) to the bare type the mapper expects. */
function normalizeRefType(value: unknown): string {
  return lastUriSegment(rdfText(value))
}

/** Reduce an RDF relationshipType (`.../relationshipType_dependsOn`) to SPDX's DEPENDS_ON form. */
function normalizeRelationshipType(value: unknown): string {
  // camelCase (dependsOn) -> SCREAMING_SNAKE (DEPENDS_ON)
  return lastUriSegment(rdfText(value))
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase()
}

/** Collect every object that is the value of a key with the given local name, anywhere in the tree. */
function collectNodesByLocalName(root: unknown, name: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (localName(key) === name) {
        const values = Array.isArray(value) ? value : [value]
        for (const entry of values) {
          if (entry && typeof entry === 'object') out.push(entry as Record<string, unknown>)
        }
      }
      visit(value)
    }
  }
  visit(root)
  return out
}

function extractRdfExternalRefs(packageNode: Record<string, unknown>): SpdxJsonPackage['externalRefs'] {
  return collectNodesByLocalName(packageNode, 'ExternalRef').map((ref) => ({
    referenceCategory: rdfFieldText(ref, 'referenceCategory'),
    referenceType: normalizeRefType(rdfField(ref, 'referenceType')),
    referenceLocator: rdfFieldText(ref, 'referenceLocator'),
  }))
}

function extractRdfChecksum(packageNode: Record<string, unknown>): SpdxJsonPackage['packageVerificationCode'] {
  const value = collectNodesByLocalName(packageNode, 'Checksum')
    .map((check) => rdfFieldText(check, 'checksumValue'))
    .find(Boolean)
  return value ? { packageVerificationCodeValue: value } : undefined
}

/** Resolve a relationship's related element to an SPDX id (resource ref or inline node). */
function relationshipTarget(relationship: Record<string, unknown>): string {
  const value = rdfField(relationship, 'relatedSpdxElement')
  if (typeof value === 'string') return normalizeRef(value)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const resource = rdfAttr(obj, 'resource')
    if (resource) return normalizeRef(resource)
    return rdfNodeId(obj)
  }
  return ''
}

function rdfXmlToSpdxJson(fileContent: string): SpdxJson {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  })

  let parsed: unknown
  try {
    parsed = parser.parse(fileContent)
  } catch {
    throw new Error('Invalid XML format')
  }

  const doc: SpdxJson = { packages: [], relationships: [] }

  const documentNode = collectNodesByLocalName(parsed, 'SpdxDocument')[0]
  if (documentNode) {
    doc.spdxVersion = rdfFieldText(documentNode, 'specVersion') || undefined
    doc.dataLicense = normalizeRdfLicense(rdfField(documentNode, 'dataLicense'))
    doc.name = rdfFieldText(documentNode, 'name') || undefined
  }

  for (const node of collectNodesByLocalName(parsed, 'Package')) {
    const spdxId = rdfNodeId(node)
    doc.packages?.push({
      SPDXID: spdxId,
      name: rdfFieldText(node, 'name') || 'unknown',
      versionInfo: rdfFieldText(node, 'versionInfo') || undefined,
      downloadLocation: rdfFieldText(node, 'downloadLocation') || undefined,
      licenseConcluded: normalizeRdfLicense(rdfField(node, 'licenseConcluded')),
      licenseDeclared: normalizeRdfLicense(rdfField(node, 'licenseDeclared')),
      copyrightText: rdfFieldText(node, 'copyrightText') || undefined,
      description: rdfFieldText(node, 'description') || rdfFieldText(node, 'summary') || undefined,
      externalRefs: extractRdfExternalRefs(node),
      packageVerificationCode: extractRdfChecksum(node),
    })

    // Relationships are nested inside their subject package; the enclosing package is the subject.
    for (const relationship of collectNodesByLocalName(node, 'Relationship')) {
      const relationshipType = normalizeRelationshipType(rdfField(relationship, 'relationshipType'))
      const relatedSpdxElement = relationshipTarget(relationship)
      if (spdxId && relationshipType && relatedSpdxElement) {
        doc.relationships?.push({ spdxElementId: spdxId, relationshipType, relatedSpdxElement })
      }
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

    if (extension === 'rdf' || extension === 'xml') {
      const match = fileContent.match(/specVersion>\s*(SPDX-\d+\.\d+)/)
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

    if (extension === 'rdf' || extension === 'xml') {
      return fileContent.includes('spdx.org/rdf/terms') || /<[a-z0-9]*:?SpdxDocument/i.test(fileContent)
    }

    return false
  } catch {
    return false
  }
}
