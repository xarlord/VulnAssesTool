import { XMLParser } from 'fast-xml-parser'
import type { Component, Vulnerability, VulnerabilitySource } from '@@/types'

/**
 * CycloneDX SBOM types based on specification v1.5
 */
interface CycloneDXBom {
  $: {
    version?: string
    serialNumber?: string
  }
  // Root `<bom>` attributes are flattened onto this object by the parser config below
  // (attributeNamePrefix: ''), so the real specVersion lives in the `xmlns` namespace
  // (e.g. "http://cyclonedx.org/schema/bom/1.5"), not under `$`.
  xmlns?: string
  metadata?: {
    timestamp?: string
    component?: CycloneDXComponent
  }
  components?: CycloneDXComponent[]
  vulnerabilities?: CycloneDXVulnerability[] | { vulnerability: CycloneDXVulnerability | CycloneDXVulnerability[] }
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
  hashes?: { hash?: CycloneDXXmlHash | CycloneDXXmlHash[] }
  properties?: { property?: CycloneDXXmlProperty | CycloneDXXmlProperty[] }
}

/** A CycloneDX XML `<hash alg="...">content</hash>` as parsed by fast-xml-parser. */
interface CycloneDXXmlHash {
  alg?: string
  '#text'?: string | number
}

/** A CycloneDX XML `<property name="...">value</property>` as parsed by fast-xml-parser. */
interface CycloneDXXmlProperty {
  name?: string
  '#text'?: string | number
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
  properties?: Array<{ name: string; value: string }>
  hashes?: Array<{ alg?: string; content: string }>
}

/**
 * CycloneDX specVersion values this parser is validated against. PRD CR-03.1 requires v1.0-1.5;
 * 1.6 is also accepted because the bundled Syft SBOM-from-binary feature emits CycloneDX 1.6 and
 * its output must round-trip through this importer (see SyftService.test.ts) — do not trim 1.6 to
 * match the PRD text or that feature breaks. The component/vulnerability mapping below is
 * structurally version-agnostic (all fields it reads are present across 1.0-1.6), so support is
 * enforced here as a validity check rather than per-version branching.
 */
const SUPPORTED_CYCLONEDX_SPEC_VERSIONS = ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6']

/** Throws if `version` is not one of the CycloneDX specVersions this parser supports. */
function assertSupportedSpecVersion(version: string): void {
  if (!SUPPORTED_CYCLONEDX_SPEC_VERSIONS.includes(version)) {
    throw new Error(
      `Unsupported CycloneDX specVersion "${version}". Supported versions: ${SUPPORTED_CYCLONEDX_SPEC_VERSIONS.join(', ')}`,
    )
  }
}

/**
 * Extract the CycloneDX specVersion from a parsed XML `<bom>` element.
 * The real specVersion lives in the `xmlns` namespace (e.g. ".../schema/bom/1.5") — the `version`
 * attribute on `<bom>` is the document/BOM revision number, not the spec version.
 */
function extractXmlSpecVersion(bom: CycloneDXBom): string {
  const match = bom.xmlns?.match(/\/bom\/(\d+(?:\.\d+)*)/)
  return match ? match[1] : '1.5'
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

  const formatVersion = json.specVersion || '1.5'
  assertSupportedSpecVersion(formatVersion)

  const components = extractComponentsFromJson(json)
  const vulnerabilities = extractVulnerabilitiesFromJson(json)

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
    // Only the REPEATABLE child elements are forced to arrays. The singular container elements
    // (`components`, `vulnerabilities`) must NOT be — forcing them produced `[{ component: [...] }]`,
    // whose wrapper object the extractors then treated as a component (crashing mapComponentType on
    // an undefined type) / as a bogus vulnerability. The extractors already unwrap the object shape.
    isArray: (name) => ['component', 'vulnerability'].includes(name),
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

  const bom = (parsed as unknown as Record<string, CycloneDXBom>)[rootKey]
  const formatVersion = extractXmlSpecVersion(bom)
  assertSupportedSpecVersion(formatVersion)

  const components = extractComponentsFromXml(bom)
  const vulnerabilities = extractVulnerabilitiesFromXml(bom)

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
 * fast-xml-parser renders a repeated child element as the value itself, an array of values, or —
 * for a single occurrence wrapped in a container like `<ratings><rating/></ratings>` — as
 * `{ <childKey>: value | value[] }`. Coerce any of these to a flat array. JSON input already arrives
 * as an array, so this is a pass-through there. This is the normalization the extraction code needs
 * because it (and the shared JSON/XML mapper) expect flat arrays for ratings/advisories/affects/etc.
 */
function xmlChildList<T>(value: unknown, childKey: string): T[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'object') {
    const child = (value as Record<string, unknown>)[childKey]
    if (Array.isArray(child)) return child as T[]
    if (child !== undefined && child !== null) return [child as T]
  }
  return []
}

/**
 * Normalize a CycloneDX XML `<licenses>` element to the flat array shape extractLicenses expects.
 * XML yields `{ license: {…} | [{…}] }` or `{ expression: '…' }`; JSON already yields the array.
 */
function xmlLicensesToArray(
  licenses: unknown,
): Array<{ expression: string } | { license: { id?: string; name?: string } }> {
  if (!licenses) return []
  if (Array.isArray(licenses)) {
    return licenses as Array<{ expression: string } | { license: { id?: string; name?: string } }>
  }
  if (typeof licenses === 'object') {
    const obj = licenses as Record<string, unknown>
    if (obj.expression !== undefined) {
      return [{ expression: String(obj.expression) }]
    }
    if ('license' in obj) {
      return xmlChildList<{ id?: string; name?: string }>(obj, 'license').map((license) => ({ license }))
    }
  }
  return []
}

/**
 * Sanitize version string — normalize slash/backslash separators to dots.
 * Converts formats like "2/9/05" → "2.9.05". Hyphens are intentionally left intact to preserve
 * semantic-versioning pre-release/build suffixes (e.g. "1.0.0-beta").
 */
function sanitizeVersion(version: string): string {
  if (!version) return version
  return version.replace(/[/\\]/g, '.').replace(/\.{2,}/g, '.')
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
 * Derive extraction-coverage fields from a component's CycloneDX properties (the vat:* namespace the
 * binary catalogers emit). Accepts already-normalized {name, value} pairs so JSON and XML share it.
 */
function coverageFromProperties(pairs: Array<{ name: string; value: string }>): {
  coverage?: Component['coverage']
  provenanceSources?: string[]
  coverageNote?: string
} {
  const get = (n: string): string | undefined => pairs.find((p) => p.name === n)?.value
  const rawCoverage = get('vat:coverage')
  const coverage = rawCoverage === 'gap' ? 'gap' : rawCoverage === 'identified' ? 'identified' : undefined
  const source = get('vat:source')
  const provenanceSources = source
    ? source
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  return { coverage, provenanceSources, coverageNote: get('vat:note') }
}

/** Normalize CycloneDX XML `<hashes>` (fast-xml-parser shape) to {alg, content} pairs. */
function xmlHashesToPairs(hashes: { hash?: CycloneDXXmlHash | CycloneDXXmlHash[] } | undefined): Array<{
  alg?: string
  content: string
}> {
  if (!hashes?.hash) return []
  const list = Array.isArray(hashes.hash) ? hashes.hash : [hashes.hash]
  return list
    .filter((h): h is CycloneDXXmlHash & { '#text': string | number } => h['#text'] !== undefined)
    .map((h) => ({ alg: h.alg, content: String(h['#text']) }))
}

/** Normalize CycloneDX XML `<properties>` (fast-xml-parser shape) to {name, value} pairs. */
function xmlPropertiesToPairs(
  properties: { property?: CycloneDXXmlProperty | CycloneDXXmlProperty[] } | undefined,
): Array<{ name: string; value: string }> {
  if (!properties?.property) return []
  const list = Array.isArray(properties.property) ? properties.property : [properties.property]
  return list
    .filter((p): p is CycloneDXXmlProperty & { name: string } => typeof p.name === 'string')
    .map((p) => ({ name: p.name, value: p['#text'] === undefined ? '' : String(p['#text']) }))
}

/**
 * Map CycloneDX JSON component to internal Component type
 */
function mapJsonComponentToComponent(comp: CycloneDXJsonComponent, parentId?: string): Component {
  const name = comp.name || 'unknown'
  // Leave version empty when absent (was the literal 'unknown', which is truthy and defeats
  // downstream `if (!version)` guards); `coverage` below records the gap instead.
  const version = sanitizeVersion(comp.version || '')

  // Use PURL as ID if available, otherwise generate from name/version. Keep the legacy 'unknown'
  // placeholder in the ID (not in `version`) so purl-less component IDs stay stable across this
  // change — component IDs feed vulnerability refs and VEX `affects` matching.
  const id = comp.purl || generateComponentId(name, version || 'unknown', parentId)

  // Extract licenses
  const licenses = extractLicenses(comp.licenses)

  // Extract hash from the CycloneDX 'hashes' array (first entry's content); undefined when absent.
  // (Was `comp.purl?.split('@')[1]`, which yields the *version*, not a hash.)
  const hash = comp.hashes?.[0]?.content

  // Coverage: an explicit vat:coverage property wins; otherwise derive from version presence.
  const derived = coverageFromProperties(comp.properties ?? [])
  const coverage = derived.coverage ?? (version ? 'identified' : 'gap')

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
    coverage,
    provenanceSources: derived.provenanceSources,
    coverageNote: derived.coverageNote,
    vulnerabilities: [],
  }
}

/**
 * Map CycloneDX XML component to internal Component type
 */
function mapXmlComponentToComponent(comp: CycloneDXComponent, parentId?: string): Component {
  const name = comp.name || 'unknown'
  // Leave version empty when absent (see JSON mapper) so gap components are detectable downstream.
  const version = sanitizeVersion(comp.version || '')

  // Keep the legacy 'unknown' placeholder in the generated ID (not in `version`) for id stability.
  const id = comp.purl || generateComponentId(name, version || 'unknown', parentId)

  // Extract licenses (XML nests these as {license:…}/{expression:…}; normalize to the array shape)
  const licenses = extractLicenses(xmlLicensesToArray(comp.licenses))

  // Extract hash from the CycloneDX 'hashes' array (first entry's content); undefined when absent.
  // (Was `comp.purl?.split('@')[1]`, which yields the *version*, not a hash.)
  const hash = xmlHashesToPairs(comp.hashes)[0]?.content

  const derived = coverageFromProperties(xmlPropertiesToPairs(comp.properties))
  const coverage = derived.coverage ?? (version ? 'identified' : 'gap')

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
    coverage,
    provenanceSources: derived.provenanceSources,
    coverageNote: derived.coverageNote,
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
  if ('vulnerabilities' in bom && bom.vulnerabilities) {
    const vulns = bom.vulnerabilities
    if (Array.isArray(vulns)) {
      vulnList = vulns
    } else if (vulns && typeof vulns === 'object' && 'vulnerability' in vulns) {
      const nested = vulns.vulnerability
      vulnList = Array.isArray(nested) ? nested : [nested]
    }
  }

  // The shared mapper expects ratings/advisories/affects as flat arrays (the JSON shape); XML nests
  // them under their singular child element, so normalize each before mapping.
  return vulnList.map((vuln) =>
    mapCycloneDXVulnerability({
      ...vuln,
      ratings: xmlChildList(vuln.ratings, 'rating'),
      advisories: xmlChildList(vuln.advisories, 'advisory'),
      affects: xmlChildList(vuln.affects, 'target'),
    } as CycloneDXVulnerability),
  )
}

/** The rating with the highest base score (falls back to the first if no scores are present). */
function bestCycloneDXRating(
  ratings: CycloneDXVulnerability['ratings'],
): { severity?: string; score?: number; vector?: string } | undefined {
  if (!ratings || ratings.length === 0) return undefined
  return ratings.reduce((best, r) => ((r.score ?? -1) > (best.score ?? -1) ? r : best))
}

/** Canonical detail URL + source label for a vulnerability id, chosen by its id prefix. */
function officialReferenceForVulnId(id: string): { url: string; source: string } {
  if (/^CVE-/i.test(id)) return { url: `https://nvd.nist.gov/vuln/detail/${id}`, source: 'NVD' }
  if (/^GHSA-/i.test(id)) return { url: `https://github.com/advisories/${id}`, source: 'GitHub' }
  return { url: `https://osv.dev/vulnerability/${id}`, source: 'OSV' }
}

/**
 * Map CycloneDX vulnerability to internal Vulnerability type
 */
function mapCycloneDXVulnerability(vuln: CycloneDXVulnerability): Vulnerability {
  // Pick the highest-scoring rating rather than document order — a producer may list a
  // lower-severity rating first, and CVSS v3.x should win over an older v2 rating.
  const bestRating = bestCycloneDXRating(vuln.ratings)
  const severity = bestRating?.severity?.toUpperCase() || 'UNKNOWN'
  const normalizedSeverity = normalizeSeverity(severity)
  const sourceNameRaw = (vuln.source?.name || 'NVD').toLowerCase()
  const validSources: readonly VulnerabilitySource[] = ['nvd', 'osv', 'oss-index', 'github-advisory', 'snyk', 'both']
  const sourceName: VulnerabilitySource = validSources.includes(sourceNameRaw as VulnerabilitySource)
    ? (sourceNameRaw as VulnerabilitySource)
    : 'nvd'
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

  // Add the canonical detail URL, chosen by the vulnerability id's OWN prefix (CVE→NVD,
  // GHSA→GitHub, else OSV) rather than the source name — an unknown source used to default to
  // 'nvd' and build an nvd.nist.gov URL for a non-CVE id (e.g. a GHSA), producing a broken link.
  const official = officialReferenceForVulnId(sourceId)
  if (!references.some((ref) => ref.url === official.url)) {
    references.unshift({
      url: official.url,
      source: official.source,
      tags: ['official'],
    })
  }

  return {
    id: vuln.id,
    source: sourceName,
    severity: normalizedSeverity,
    cvssScore: bestRating?.score,
    cvssVector: bestRating?.vector,
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
  return 'none' // Unknown/unrated — don't inflate an unrated finding into a concrete severity
}
