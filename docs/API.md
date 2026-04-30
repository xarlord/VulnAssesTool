# VulnAssesTool API Documentation

Complete API reference for VulnAssesTool - A comprehensive vulnerability assessment tool for SBOM analysis.

## Table of Contents

- [Overview](#overview)
- [IPC Channels](#ipc-channels)
  - [Application APIs](#application-apis)
  - [Database APIs](#database-apis)
  - [Container Scanning APIs](#container-scanning-apis)
  - [PDF Generation API](#pdf-generation-api)
  - [FTS Search API](#fts-search-api)
  - [Cache Management API](#cache-management-api)
- [External APIs](#external-apis)
  - [NVD API Integration](#nvd-api-integration)
  - [OSV API Integration](#osv-api-integration)
- [Internal Modules](#internal-modules)
  - [Health Module](#health-module)
  - [CVSS Module](#cvss-module)
  - [Search Module](#search-module)
  - [Export Module](#export-module)
  - [Audit Module](#audit-module)
  - [SBOM Generators](#sbom-generators)
  - [SBOM Parsers](#sbom-parsers)
- [Security Features](#security-features)
  - [Secure Storage](#secure-storage)
  - [SQL Sanitization](#sql-sanitization)
  - [IPC Rate Limiting](#ipc-rate-limiting)
- [Type Definitions](#type-definitions)

---

## Overview

VulnAssesTool provides three types of APIs:

1. **IPC Channels**: Communication between renderer and main process (Electron)
2. **External APIs**: Integration with NVD and OSV vulnerability databases
3. **Internal Modules**: Reusable libraries for data processing

### Accessing APIs

**IPC APIs (Renderer Process):**

```typescript
// Access via window.electronAPI
await window.electronAPI.database.search({ type: 'text', query: 'linux' })
await window.electronAPI.getAppVersion()
```

**External APIs (Renderer Process):**

```typescript
import { searchCvesByCpe, getCveById } from '@/lib/api/nvd'
import { queryByPurl } from '@/lib/api/osv'
```

**Internal Modules (Renderer Process):**

```typescript
import { calculateComponentHealth } from '@/lib/health'
import { parseCvssVector } from '@/lib/cvss'
```

---

## IPC Channels

All IPC channels are exposed through `window.electronAPI` via the preload script.

### Application APIs

#### `ping()`

Health check for IPC communication.

**Returns:** `Promise<'pong'>`

**Example:**

```typescript
const response = await window.electronAPI.ping()
console.log(response) // 'pong'
```

---

#### `getAppVersion()`

Get the application version.

**Returns:** `Promise<string>` - Version string (e.g., "1.0.0")

**Example:**

```typescript
const version = await window.electronAPI.getAppVersion()
console.log(version) // '1.0.0'
```

---

#### `getPlatform()`

Get the operating system platform.

**Returns:** `Promise<string>` - Platform identifier ('win32', 'darwin', 'linux')

**Example:**

```typescript
const platform = await window.electronAPI.getPlatform()
console.log(platform) // 'win32'
```

---

#### `openExternal(url: string)`

Open a URL in the system's default browser.

**Parameters:**

- `url` - The URL to open

**Returns:** `Promise<boolean>`

**Example:**

```typescript
await window.electronAPI.openExternal('https://nvd.nist.gov/vuln/detail/CVE-2024-1234')
```

---

#### `onThemeChange(callback: (theme: string) => void)`

Listen for theme changes.

**Parameters:**

- `callback` - Function called when theme changes ('light', 'dark', or 'system')

**Returns:** `void`

**Example:**

```typescript
window.electronAPI.onThemeChange((theme) => {
  console.log('Theme changed to:', theme)
})
```

---

#### `getSystemTheme()`

Get the current system theme.

**Returns:** `Promise<string>` - 'light', 'dark', or 'system'

**Example:**

```typescript
const theme = await window.electronAPI.getSystemTheme()
```

---

#### `onMenuAction(callback: (action: string) => void)`

Listen for menu actions.

**Parameters:**

- `callback` - Function called when menu action occurs

**Returns:** `() => void` - Cleanup function to remove listener

**Example:**

```typescript
const cleanup = window.electronAPI.onMenuAction((action) => {
  if (action === 'create-project') {
    // Handle create project action
  }
})

// Later: cleanup()
```

---

### Database APIs

#### `database.search(request: NvdSearchRequest)`

Search the NVD vulnerability database.

**Parameters:**

```typescript
interface NvdSearchRequest {
  type: 'cve-id' | 'cpe' | 'text'
  query: string
  limit?: number // Default: 100
  offset?: number // Default: 0
}
```

**Returns:** `Promise<NvdSearchResponse>`

```typescript
interface NvdSearchResponse {
  success: boolean
  results: CveResult[]
  total: number
  limit: number
  offset: number
  error?: string
}

interface CveResult {
  id: string
  cveId: string
  description: string
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  cvssScore: number
  cvssVector?: string
  publishedAt: string
  modifiedAt?: string
  source: string
}
```

**Example:**

```typescript
// Search by CVE ID
const result = await window.electronAPI.database.search({
  type: 'cve-id',
  query: 'CVE-2024-2389',
})

// Search by CPE
const result = await window.electronAPI.database.search({
  type: 'cpe',
  query: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*',
})

// Text search with pagination
const result = await window.electronAPI.database.search({
  type: 'text',
  query: 'linux kernel',
  limit: 50,
  offset: 0,
})
```

---

#### `database.getCve(request: GetCveRequest)`

Get a specific CVE by ID.

**Parameters:**

```typescript
interface GetCveRequest {
  cveId: string
}
```

**Returns:** `Promise<GetCveResponse>`

```typescript
interface GetCveResponse {
  success: boolean
  cve: CveResult | null
  error?: string
}
```

**Example:**

```typescript
const response = await window.electronAPI.database.getCve({
  cveId: 'CVE-2024-2389',
})

if (response.success && response.cve) {
  console.log('CVE:', response.cve.description)
}
```

---

#### `database.getStats()`

Get database statistics.

**Returns:** `Promise<GetStatsResponse>`

```typescript
interface GetStatsResponse {
  success: boolean
  stats: DatabaseStats | null
  error?: string
}

interface DatabaseStats {
  totalCves: number
  lastUpdate: string | null
  dbSize: number
  version: number
}
```

**Example:**

```typescript
const response = await window.electronAPI.database.getStats()
if (response.stats) {
  console.log('Total CVEs:', response.stats.totalCves)
  console.log('Last update:', response.stats.lastUpdate)
}
```

---

#### `database.getSyncStatus()`

Get current synchronization status.

**Returns:** `Promise<SyncStatusResponse>`

```typescript
interface SyncStatusResponse {
  success: boolean
  status: SyncStatus | null
  error?: string
}

interface SyncStatus {
  isSyncing: boolean
  progress: number
  total: number
  currentFile: string | null
  error: string | null
  lastSync: string | null
}
```

**Example:**

```typescript
const response = await window.electronAPI.database.getSyncStatus()
if (response.status?.isSyncing) {
  console.log(`Syncing: ${response.status.progress}/${response.status.total}`)
}
```

---

#### `database.startSync(request?: StartSyncRequest)`

Start NVD data synchronization.

**Parameters:**

```typescript
interface StartSyncRequest {
  force?: boolean
  years?: number[] // Years to download (e.g., [2020, 2021, ..., 2026])
}
```

**Returns:** `Promise<StartSyncResponse>`

```typescript
interface StartSyncResponse {
  success: boolean
  message: string
  error?: string
}
```

**Example:**

```typescript
// Start regular sync
const response = await window.electronAPI.database.startSync()

// Force sync for specific years
const response = await window.electronAPI.database.startSync({
  force: true,
  years: [2024, 2025, 2026],
})
```

---

#### `database.onSyncProgress(callback: (progress: any) => void)`

Listen to sync progress updates.

**Parameters:**

- `callback` - Function called with progress updates

**Returns:** `() => void` - Cleanup function

**Example:**

```typescript
const cleanup = window.electronAPI.database.onSyncProgress((progress) => {
  console.log(`Progress: ${progress.current}/${progress.total}`)
})
```

---

#### `database.onSyncComplete(callback: (result: any) => void)`

Listen to sync completion.

**Parameters:**

- `callback` - Function called when sync completes

**Returns:** `() => void` - Cleanup function

**Example:**

```typescript
const cleanup = window.electronAPI.database.onSyncComplete((result) => {
  console.log('Sync complete:', result)
})
```

---

#### `database.onSyncError(callback: (error: any) => void)`

Listen to sync errors.

**Parameters:**

- `callback` - Function called when sync error occurs

**Returns:** `() => void` - Cleanup function

**Example:**

```typescript
const cleanup = window.electronAPI.database.onSyncError((error) => {
  console.error('Sync error:', error)
})
```

---

### Container Scanning APIs

#### `container.checkRuntime(runtime: ContainerRuntime)`

Check if a container runtime (Docker or Podman) is installed and available.

**Parameters:**

- `runtime` - `'docker'` or `'podman'`

**Returns:** `Promise<CheckRuntimeResponse>`

```typescript
{
  success: boolean
  runtime?: {
    type: 'docker' | 'podman'
    version: string
    available: boolean
    socket?: string
  }
  error?: string
}
```

**Example:**

```typescript
const result = await window.electronAPI.container.checkRuntime('docker')
if (result.success && result.runtime?.available) {
  console.log(`Docker ${result.runtime.version} is available`)
}
```

---

#### `container.scanImage(request: ScanImageRequest)`

Perform a full container image scan: pull image, inspect layers, extract packages.

**Parameters:**

```typescript
{
  imageRef: string       // e.g., 'nginx:1.21', 'alpine:latest'
  runtime: 'docker' | 'podman'
  platform?: string      // For multi-arch images
  maxLayers?: number     // Max layers to process (default: 100)
}
```

**Returns:** `Promise<ScanImageResponse>` — includes image info, platform, layers with packages, consolidated packages, and scan statistics.

**Example:**

```typescript
const result = await window.electronAPI.container.scanImage({
  imageRef: 'alpine:latest',
  runtime: 'docker',
})
if (result.success && result.result) {
  console.log(`Found ${result.result.stats.uniquePackages} packages`)
  for (const pkg of result.result.packages) {
    console.log(`  ${pkg.name} ${pkg.version} (${pkg.manager})`)
  }
}
```

---

#### `container.pullImage(request)`

Pull a container image to local storage.

**Parameters:**

```typescript
{
  imageRef: string
  runtime: 'docker' | 'podman'
  platform?: string
}
```

---

#### `container.getManifest(request)`

Get the image manifest (list of layers and config digest).

**Parameters:**

```typescript
{
  imageRef: string
  runtime: 'docker' | 'podman'
}
```

---

#### `container.inspectImage(request)`

Get image configuration (OS, architecture, labels, history).

**Parameters:**

```typescript
{
  imageRef: string
  runtime: 'docker' | 'podman'
}
```

---

#### `container.extractPackages(request)`

Extract packages from specific image layers.

**Parameters:**

```typescript
{
  imageRef: string
  runtime: 'docker' | 'podman'
  layerDigests: string[]
}
```

---

#### `container.onScanProgress(callback)`

Listen to scan progress events (pull, manifest, extract phases).

**Returns:** Cleanup function `() => void`

**Example:**

```typescript
const cleanup = window.electronAPI.container.onScanProgress((progress) => {
  console.log(`[${progress.phase}] ${progress.message}`)
})
```

---

### PDF Generation API

#### `generatePDF(htmlContent: string)`

Generate a PDF document from HTML content using Electron's BrowserWindow printToPDF.

**Parameters:**

- `htmlContent` - HTML string to render as PDF

**Returns:** `Promise<Uint8Array>` - PDF file data

**Example:**

```typescript
const html = '<h1>Security Report</h1><p>Generated by VulnAssesTool</p>'
const pdfData = await window.electronAPI.generatePDF(html)
// Save or download pdfData
```

---

### FTS Search API

#### `database.searchFts(query: string, limit?: number)`

Full-text search across CVE descriptions using SQLite FTS5.

**Returns:** `Promise<{ success: boolean; results?: any[]; error?: string }>`

---

#### `database.getFtsStats()`

Get FTS index statistics (document count, index size).

**Returns:** `Promise<{ success: boolean; stats?: any; error?: string }>`

---

### Cache Management API

#### `database.getCacheStats()`

Get cache statistics (entry count, memory usage).

**Returns:** `Promise<{ success: boolean; stats?: any; error?: string }>`

---

#### `database.clearCache()`

Clear all cached data.

**Returns:** `Promise<{ success: boolean; error?: string }>`

---

## External APIs

### NVD API Integration

Located in: `src/renderer/lib/api/nvd.ts`

Base URL: `https://services.nvd.nist.gov/rest/json/cves/2.0`

**Rate Limiting:**

- Without API key: 6 seconds between requests
- With API key: 50 requests per rolling 30-second window

---

#### `searchCvesByCpe(cpe: string, apiKey?: string)`

Search for CVEs by CPE string.

**Parameters:**

- `cpe` - The CPE string to search for
- `apiKey` - Optional NVD API key for higher rate limits

**Returns:** `Promise<Vulnerability[]>`

**Example:**

```typescript
import { searchCvesByCpe } from '@/lib/api/nvd'

const vulnerabilities = await searchCvesByCpe('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 'your-api-key-here')

vulnerabilities.forEach((vuln) => {
  console.log(`${vuln.id}: ${vuln.severity} - ${vuln.description}`)
})
```

---

#### `getCveById(cveId: string, apiKey?: string)`

Get a specific CVE by ID.

**Parameters:**

- `cveId` - The CVE ID (e.g., "CVE-2024-1234")
- `apiKey` - Optional NVD API key

**Returns:** `Promise<Vulnerability | null>`

**Example:**

```typescript
import { getCveById } from '@/lib/api/nvd'

const vuln = await getCveById('CVE-2024-2389')
if (vuln) {
  console.log('CVSS Score:', vuln.cvssScore)
  console.log('Description:', vuln.description)
}
```

---

#### `searchCvesByCpes(cpes: string[], apiKey?: string)`

Search for CVEs by multiple CPEs (batch search).

**Parameters:**

- `cpes` - Array of CPE strings
- `apiKey` - Optional NVD API key

**Returns:** `Promise<Map<string, Vulnerability[]>>`

**Example:**

```typescript
import { searchCvesByCpes } from '@/lib/api/nvd'

const results = await searchCvesByCpes([
  'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*',
  'cpe:2.3:o:linux:linux_kernel:5.10:*:*:*:*:*:*:*',
])

for (const [cpe, vulns] of results.entries()) {
  console.log(`${cpe}: ${vulns.length} vulnerabilities found`)
}
```

---

#### `getSeverityFromScore(score: number)`

Determine severity from CVSS score.

**Parameters:**

- `score` - CVSS score (0-10)

**Returns:** `'critical' | 'high' | 'medium' | 'low' | 'none'`

**Example:**

```typescript
import { getSeverityFromScore } from '@/lib/api/nvd'

const severity = getSeverityFromScore(9.2)
console.log(severity) // 'critical'
```

---

#### `parseCvssScore(cvssVector?: string)`

Parse CVSS vector to extract score.

**Parameters:**

- `cvssVector` - CVSS vector string

**Returns:** `number | undefined`

**Note:** Currently returns undefined - CVSS calculation requires additional library.

---

#### `isValidNvdApiKey(apiKey: string)`

Validate NVD API key format.

**Parameters:**

- `apiKey` - API key to validate

**Returns:** `boolean`

**Example:**

```typescript
import { isValidNvdApiKey } from '@/lib/api/nvd'

const isValid = isValidNvdApiKey('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
console.log(isValid) // true if valid UUID format
```

---

#### `checkNvdApiStatus(apiKey?: string)`

Check if NVD API is accessible.

**Parameters:**

- `apiKey` - Optional NVD API key

**Returns:** `Promise<boolean>`

**Example:**

```typescript
import { checkNvdApiStatus } from '@/lib/api/nvd'

const isOnline = await checkNvdApiStatus()
if (isOnline) {
  console.log('NVD API is available')
}
```

---

### OSV API Integration

Located in: `src/renderer/lib/api/osv.ts`

Base URL: `https://api.osv.dev/v1`

**Rate Limiting:** No strict rate limit, but be respectful.

---

#### `queryByPurl(purl: string)`

Query OSV API by package URL.

**Parameters:**

- `purl` - The package URL (e.g., "pkg:npm/lodash@4.17.21")

**Returns:** `Promise<Vulnerability[]>`

**Example:**

```typescript
import { queryByPurl } from '@/lib/api/osv'

const vulnerabilities = await queryByPurl('pkg:npm/lodash@4.17.21')
console.log(`Found ${vulnerabilities.length} vulnerabilities`)
```

---

#### `getVulnerabilityById(vulnId: string)`

Get a specific vulnerability by ID.

**Parameters:**

- `vulnId` - The OSV vulnerability ID

**Returns:** `Promise<Vulnerability | null>`

**Example:**

```typescript
import { getVulnerabilityById } from '@/lib/api/osv'

const vuln = await getVulnerabilityById('OSV-2024-1234')
if (vuln) {
  console.log('Vulnerability:', vuln.description)
}
```

---

#### `queryByPurls(purls: string[])`

Query OSV API by multiple package URLs.

**Parameters:**

- `purls` - Array of package URLs

**Returns:** `Promise<Map<string, Vulnerability[]>>`

**Example:**

```typescript
import { queryByPurls } from '@/lib/api/osv'

const results = await queryByPurls(['pkg:npm/lodash@4.17.21', 'pkg:npm/express@4.18.0'])
```

---

#### `batchQuery(purls: string[])`

Batch query OSV API with single request per PURL.

**Parameters:**

- `purls` - Array of package URLs

**Returns:** `Promise<Vulnerability[]>` - Deduplicated vulnerabilities

**Example:**

```typescript
import { batchQuery } from '@/lib/api/osv'

const vulns = await batchQuery(['pkg:npm/lodash@4.17.21', 'pkg:npm/express@4.18.0'])
```

---

#### `parsePurl(purl: string)`

Parse package URL to extract components.

**Parameters:**

- `purl` - Package URL string

**Returns:** `{ ecosystem: string; name: string; version?: string } | null`

**Example:**

```typescript
import { parsePurl } from '@/lib/api/osv'

const parsed = parsePurl('pkg:npm/@babel/core@7.23.0')
console.log(parsed)
// { ecosystem: 'npm', name: '@babel/core', version: '7.23.0' }
```

---

#### `buildPurl(ecosystem: string, name: string, version?: string)`

Build a package URL from components.

**Parameters:**

- `ecosystem` - Package ecosystem (e.g., "npm", "pypi")
- `name` - Package name
- `version` - Optional version

**Returns:** `string`

**Example:**

```typescript
import { buildPurl } from '@/lib/api/osv'

const purl = buildPurl('npm', 'lodash', '4.17.21')
console.log(purl) // 'pkg:npm/lodash@4.17.21'
```

---

#### `isValidPurl(purl: string)`

Validate package URL format.

**Parameters:**

- `purl` - Package URL string

**Returns:** `boolean`

**Example:**

```typescript
import { isValidPurl } from '@/lib/api/osv'

const valid = isValidPurl('pkg:npm/lodash@4.17.21')
console.log(valid) // true
```

---

#### `checkOsvApiStatus()`

Check if OSV API is accessible.

**Returns:** `Promise<boolean>`

**Example:**

```typescript
import { checkOsvApiStatus } from '@/lib/api/osv'

const isOnline = await checkOsvApiStatus()
```

---

## Internal Modules

### Health Module

Located in: `src/renderer/lib/health/`

Provides health scoring and trend analysis for components and projects.

---

#### `calculateComponentHealth(component: Component, vulnerabilities: Vulnerability[])`

Calculate the health score for a single component.

**Parameters:**

- `component` - The component to assess
- `vulnerabilities` - List of vulnerabilities affecting this component

**Returns:** `ComponentHealth`

```typescript
interface ComponentHealth {
  componentId: string
  score: number // 0-100
  category: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  factors: HealthFactors
  trend: 'improving' | 'degrading' | 'stable' | 'unknown'
  lastCalculated: Date
}

interface HealthFactors {
  vulnerabilityScore: number // 0-40 penalty
  ageScore: number // 0-20 penalty
  patchScore: number // 0-20 penalty
  versionScore: number // 0-20 penalty
}
```

**Example:**

```typescript
import { calculateComponentHealth } from '@/lib/health'

const health = calculateComponentHealth(component, vulnerabilities)
console.log(`Health score: ${health.score}/100 (${health.category})`)
```

---

#### `calculateProjectHealth(componentHealths: ComponentHealth[])`

Calculate project health summary from component health scores.

**Parameters:**

- `componentHealths` - Array of component health scores

**Returns:** `ProjectHealthSummary`

```typescript
interface ProjectHealthSummary {
  averageScore: number
  totalComponents: number
  distribution: {
    excellent: number
    good: number
    fair: number
    poor: number
    critical: number
  }
  trend: 'improving' | 'degrading' | 'stable'
  lastCalculated: Date
}
```

**Example:**

```typescript
import { calculateProjectHealth } from '@/lib/health'

const summary = calculateProjectHealth(componentHealths)
console.log(`Project health: ${summary.averageScore}/100`)
```

---

#### `getHealthColor(category: ComponentHealth['category'])`

Get color classes for health category.

**Returns:** `string` - Tailwind CSS classes

**Example:**

```typescript
import { getHealthColor } from '@/lib/health'

const classes = getHealthColor('excellent')
console.log(classes) // 'text-green-600 bg-green-50 border-green-200'
```

---

#### `getHealthChartColor(category: ComponentHealth['category'])`

Get chart color for health category.

**Returns:** `string` - Hex color code

**Example:**

```typescript
import { getHealthChartColor } from '@/lib/health'

const color = getHealthChartColor('critical')
console.log(color) // '#ef4444'
```

---

#### `calculateTrend(current: number, previous: number)`

Calculate trend between two values.

**Parameters:**

- `current` - Current value
- `previous` - Previous value

**Returns:** `'improving' | 'degrading' | 'stable'`

**Example:**

```typescript
import { calculateTrend } from '@/lib/health/trends'

const trend = calculateTrend(85, 75)
console.log(trend) // 'improving'
```

---

#### `calculateTrendPercentage(current: number, previous: number)`

Calculate trend percentage.

**Returns:** `number` - Percentage change

**Example:**

```typescript
import { calculateTrendPercentage } from '@/lib/health/trends'

const change = calculateTrendPercentage(85, 75)
console.log(change) // 13.33
```

---

### CVSS Module

Located in: `src/renderer/lib/cvss/`

CVSS v3.1 vector parsing and scoring.

---

#### `parseCvssVector(vectorString: string)`

Parse CVSS v3.1 vector string into structured data.

**Parameters:**

- `vectorString` - CVSS vector string (e.g., "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")

**Returns:** `CvssBreakdown | null`

```typescript
interface CvssBreakdown {
  vectorString: string
  version: '3.0' | '3.1'
  metrics: CvssMetrics
  scores: CvssScores
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  explanations: CvssMetricExplanation[]
}

interface CvssMetrics {
  attackVector: 'Network' | 'Adjacent' | 'Local' | 'Physical'
  attackComplexity: 'Low' | 'High'
  privilegesRequired: 'None' | 'Low' | 'High'
  userInteraction: 'None' | 'Required'
  scope: 'Unchanged' | 'Changed'
  confidentialityImpact: 'High' | 'Low' | 'None'
  integrityImpact: 'High' | 'Low' | 'None'
  availabilityImpact: 'High' | 'Low' | 'None'
}

interface CvssScores {
  baseScore: number
  impactSubScore: number
  exploitabilitySubScore: number
}
```

**Example:**

```typescript
import { parseCvssVector } from '@/lib/cvss'

const breakdown = parseCvssVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')
if (breakdown) {
  console.log('Base Score:', breakdown.scores.baseScore)
  console.log('Severity:', breakdown.severity)
  breakdown.explanations.forEach((exp) => {
    console.log(`${exp.metric}: ${exp.description}`)
  })
}
```

---

#### `getSeverityFromScore(score: number)`

Get severity from CVSS score.

**Returns:** `'critical' | 'high' | 'medium' | 'low' | 'none'`

**Score Ranges:**

- Critical: 9.0 - 10.0
- High: 7.0 - 8.9
- Medium: 4.0 - 6.9
- Low: 0.1 - 3.9
- None: 0.0

---

### Search Module

Located in: `src/renderer/lib/search/`

Full-text search and indexing functionality.

---

#### `buildSearchIndex(projects: Project[])`

Build search index from projects.

**Parameters:**

- `projects` - Array of projects to index

**Returns:** `SearchIndex`

**Example:**

```typescript
import { buildSearchIndex } from '@/lib/search'

const index = buildSearchIndex(projects)
```

---

#### `searchIndex(query: string, index: SearchIndex, options?)`

Search the index for matching items.

**Parameters:**

- `query` - Search query string
- `index` - Search index
- `options` - Optional search options

**Returns:** `SearchResult[]`

**Example:**

```typescript
import { searchIndex } from '@/lib/search'

const results = searchIndex('linux kernel', searchIndex, {
  limit: 20,
  filterBy: ['vulnerabilities'],
})
```

---

#### `groupSearchResults(results: SearchResult[])`

Group search results by type.

**Returns:** Grouped results object

**Example:**

```typescript
import { groupSearchResults } from '@/lib/search'

const grouped = groupSearchResults(results)
console.log('Projects:', grouped.projects.length)
console.log('Vulnerabilities:', grouped.vulnerabilities.length)
```

---

#### `getSearchResultCounts(results: SearchResult[])`

Get counts of results by type.

**Returns:** Object with counts

**Example:**

```typescript
import { getSearchResultCounts } from '@/lib/search'

const counts = getSearchResultCounts(results)
```

---

#### `isValidSearchQuery(query: string)`

Validate search query.

**Returns:** `boolean`

**Example:**

```typescript
import { isValidSearchQuery } from '@/lib/search'

if (isValidSearchQuery(query)) {
  // Perform search
}
```

---

#### `getSearchSuggestions(query: string, index: SearchIndex)`

Get search suggestions based on query.

**Returns:** Array of suggestion strings

**Example:**

```typescript
import { getSearchSuggestions } from '@/lib/search'

const suggestions = getSearchSuggestions('lin', searchIndex)
// ['linux', 'linux kernel', 'link', ...]
```

---

### Export Module

Located in: `src/renderer/lib/export/`

Export functionality for CSV, JSON, and PDF formats.

---

#### `exportProjectData(project: Project, format: ExportFormat, dataType?: ExportDataType)`

Export project data to specified format.

**Parameters:**

- `project` - Project to export
- `format` - Export format ('csv', 'json', or 'pdf')
- `dataType` - Data type to export ('project', 'vulnerabilities', 'components')

**Returns:** `void` - Triggers download

**Example:**

```typescript
import { exportProjectData } from '@/lib/export'

// Export full project as PDF
exportProjectData(project, 'pdf', 'project')

// Export vulnerabilities as CSV
exportProjectData(project, 'csv', 'vulnerabilities')

// Export components as JSON
exportProjectData(project, 'json', 'components')
```

---

#### `exportAllProjects(projects: Project[], format: ExportFormat)`

Export all projects to specified format.

**Parameters:**

- `projects` - Array of all projects
- `format` - Export format

**Example:**

```typescript
import { exportAllProjects } from '@/lib/export'

exportAllProjects(projects, 'csv')
```

---

#### CSV Export Functions

```typescript
import {
  exportVulnerabilitiesToCsv,
  exportComponentsToCsv,
  downloadCsv,
  sanitizeFilename,
  generateFilename,
} from '@/lib/export/csv'

const csv = exportVulnerabilitiesToCsv(vulnerabilities, componentMap)
downloadCsv(csv, 'vulnerabilities.csv')
```

---

#### JSON Export Functions

```typescript
import {
  prepareProjectJson,
  prepareVulnerabilitiesJson,
  prepareComponentsJson,
  prepareAllProjectsJson,
  downloadJson,
} from '@/lib/export/json'

const json = prepareProjectJson(project)
downloadJson(json, 'project.json')
```

---

#### PDF Export Functions

```typescript
import {
  prepareProjectPdf,
  prepareVulnerabilitiesPdf,
  prepareComponentsPdf,
  prepareAllProjectsPdf,
  downloadPdf,
} from '@/lib/export/pdf'

const pdfDoc = prepareProjectPdf(project)
downloadPdf(pdfDoc, 'project.pdf')
```

---

### Audit Module

Located in: `src/renderer/lib/audit/`

Audit and compliance logging functionality.

---

#### `useAuditStore()`

Zustand store for audit log management.

**Returns:** Audit store object

**Example:**

```typescript
import { useAuditStore } from '@/lib/audit'

const auditStore = useAuditStore()
console.log(auditStore.events)
```

---

#### `logProjectCreate(project: Project)`

Log project creation event.

**Example:**

```typescript
import { logProjectCreate } from '@/lib/audit'

logProjectCreate(project)
```

---

#### `logProjectUpdate(project: Project, changes: Record<string, unknown>)`

Log project update event.

**Example:**

```typescript
import { logProjectUpdate } from '@/lib/audit'

logProjectUpdate(project, { name: 'New Name' })
```

---

#### `logProjectDelete(project: Project)`

Log project deletion event.

**Example:**

```typescript
import { logProjectDelete } from '@/lib/audit'

logProjectDelete(project)
```

---

#### `logVulnerabilityScan(projectId: string, count: number)`

Log vulnerability scan event.

**Example:**

```typescript
import { logVulnerabilityScan } from '@/lib/audit'

logVulnerabilityScan(projectId, 42)
```

---

#### `logSbomUpload(projectId: string, filename: string)`

Log SBOM upload event.

**Example:**

```typescript
import { logSbomUpload } from '@/lib/audit'

logSbomUpload(projectId, 'bom.json')
```

---

#### `exportAuditLogs(format: 'csv' | 'json' | 'pdf')`

Export audit logs in specified format.

**Example:**

```typescript
import { exportAuditLogs } from '@/lib/audit'

exportAuditLogs('pdf')
```

---

### SBOM Generators

Located in: `src/renderer/lib/generators/`

CycloneDX SBOM generation functionality.

---

#### `generateCycloneDX(components: Component[], options?: GeneratorOptions)`

Generate CycloneDX SBOM from components.

**Parameters:**

- `components` - Array of components
- `options` - Optional generator options

**Returns:** `SbomOutput`

```typescript
interface GeneratorOptions {
  format?: 'json' | 'xml'
  includeVulnerabilities?: boolean
  includeDependencies?: boolean
  metadata?: MetadataOptions
}

interface SbomOutput {
  format: 'json' | 'xml'
  content: string
  filename: string
  validation: ValidationResult
}
```

**Example:**

```typescript
import { generateCycloneDX } from '@/lib/generators'

const sbom = generateCycloneDX(components, {
  format: 'json',
  includeVulnerabilities: true,
})
```

---

#### `createMetadata(options: MetadataOptions)`

Create CycloneDX metadata.

**Example:**

```typescript
import { createMetadata } from '@/lib/generators'

const metadata = createMetadata({
  name: 'My Project',
  version: '1.0.0',
  authors: [{ name: 'John Doe' }],
})
```

---

#### `generateBomRef(component: Component)`

Generate BOM reference for component.

**Example:**

```typescript
import { generateBomRef } from '@/lib/generators'

const bomRef = generateBomRef(component)
```

---

#### `generateSerialNumber()`

Generate random BOM serial number.

**Returns:** `string`

**Example:**

```typescript
import { generateSerialNumber } from '@/lib/generators'

const serial = generateSerialNumber()
// 'urn:uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
```

---

### SBOM Parsers

Located in: `src/renderer/lib/parsers/`

SBOM parsing functionality for CycloneDX and SPDX formats.

---

#### CycloneDX Parser

```typescript
import { parseCycloneDX } from '@/lib/parsers/cyclonedx'

const result = parseCycloneDX(fileContent)
if (result.success) {
  console.log('Components:', result.components)
  console.log('Vulnerabilities:', result.vulnerabilities)
}
```

---

#### SPDX Parser

```typescript
import { parseSpdx } from '@/lib/parsers/spdx'

const result = parseSpdx(fileContent)
if (result.success) {
  console.log('Packages:', result.packages)
}
```

---

## Security Features

### Secure Storage

Located in: `electron/main/storage/secureStorage.ts`

VulnAssesTool implements secure API key storage using Electron's `safeStorage` API with platform-specific encryption.

#### Features

- **Platform-Specific Encryption:**
  - Windows: DPAPI (Data Protection API)
  - macOS: Keychain Services
  - Linux: libsecret

- **Automatic Migration:**
  - Detects and migrates plaintext keys to encrypted storage
  - Prefix-based encryption detection (`encrypted:v1:`)

- **Secure Key Management:**
  - Keys never stored in renderer process memory
  - No localStorage persistence of sensitive data
  - In-memory encryption key caching with timeouts

#### API Reference

##### `setApiKey(key: string): Promise<boolean>`

Store an API key securely.

**Parameters:**

- `key` - The API key to store

**Returns:** `Promise<boolean>` - Success status

**Example:**

```typescript
import { secureStorage } from '@/main/storage/secureStorage'

await secureStorage.setApiKey('your-api-key-here')
```

##### `getApiKey(): Promise<string | null>`

Retrieve a stored API key.

**Returns:** `Promise<string | null>` - The API key or null if not found

**Example:**

```typescript
const apiKey = await secureStorage.getApiKey()
if (apiKey) {
  console.log('API key retrieved successfully')
}
```

##### `deleteApiKey(): Promise<boolean>`

Remove a stored API key.

**Returns:** `Promise<boolean>` - Success status

##### `hasApiKey(): Promise<boolean>`

Check if an API key is stored.

**Returns:** `Promise<boolean>` - True if key exists

##### `isKeyEncrypted(storedKey: string): boolean`

Check if a stored key is encrypted.

**Parameters:**

- `storedKey` - The stored key string to check

**Returns:** `boolean` - True if encrypted

---

### SQL Sanitization

Located in: `electron/database/sqlSanitizer.ts`

Comprehensive input sanitization to prevent SQL injection attacks.

#### Functions

##### `sanitizeSqlInput(input: string): string`

Sanitize user input for SQL queries.

**Parameters:**

- `input` - Raw user input

**Returns:** `string` - Sanitized input safe for SQL queries

**Sanitization Steps:**

1. Escape single quotes (`'` → `''`)
2. Remove SQL comments (`--`, `#`, `/* */`)
3. Remove SQL keywords (`DROP`, `DELETE`, etc.)
4. Limit input length to 1000 characters

**Example:**

```typescript
import { sanitizeSqlInput } from '@/database/sqlSanitizer'

const userInput = "'; DROP TABLE users; --"
const safe = sanitizeSqlInput(userInput)
console.log(safe) // ''DROP TABLE users ''
```

##### `sanitizeLikePattern(input: string): string`

Sanitize input for LIKE queries.

**Parameters:**

- `input` - Raw search pattern

**Returns:** `string` - Sanitized pattern with escaped wildcards

**Example:**

```typescript
const searchPattern = sanitizeLikePattern('test_pattern%')
// Returns: 'test\\_pattern\\%'
```

##### `validateCveId(cveId: string): boolean`

Validate CVE ID format.

**Parameters:**

- `cveId` - CVE ID string to validate

**Returns:** `boolean` - True if valid CVE ID format

**Valid Format:** `CVE-YYYY-NNNN` (4-7 digits)

---

### IPC Rate Limiting

Located in: `electron/main/rateLimit.ts`

Rate limiting for IPC channel requests to prevent abuse and ensure system stability.

#### Features

- **Per-Channel Limits:** Different limits for different IPC operations
- **Sliding Window:** Time-based request tracking
- **Priority Queuing:** Critical operations bypass limits
- **Configurable Thresholds:** Adjustable limits per channel

#### Configuration

```typescript
interface RateLimitConfig {
  maxRequests: number // Maximum requests per window
  windowMs: number // Time window in milliseconds
  priority?: number // Priority level (0-10)
  burstAllowance?: number // Temporary burst capacity
}
```

#### Default Limits

| IPC Channel          | Max Requests | Window           | Priority |
| -------------------- | ------------ | ---------------- | -------- |
| `db:nvd-search`      | 100          | 60000ms (1 min)  | 5        |
| `db:nvd-get-by-cve`  | 200          | 60000ms          | 7        |
| `db:sync-start`      | 5            | 300000ms (5 min) | 3        |
| `secure-storage:get` | 50           | 60000ms          | 8        |
| `secure-storage:set` | 10           | 60000ms          | 6        |

---

## XML Parsing Support

VulnAssesTool supports XML-based SBOM formats (CycloneDX XML, SPDX Tag:XML).

#### Features

- **Streaming Parser:** Handles large XML files efficiently
- **XEE Prevention:** Protection against XML Entity Expansion attacks
- **Schema Validation:** Validates against official schemas
- **File Size Limits:** Configurable maximum file size (default: 50MB)

#### Usage

```typescript
import { parseCycloneDXXml } from '@/lib/parsers/cyclonedx'

const result = parseCycloneDXXml(xmlContent)
if (result.success) {
  console.log('Components:', result.components)
}
```

---

## FTS5 Full-Text Search

Located in: `electron/database/fts5.ts`

High-performance full-text search using SQLite FTS5 extension.

#### Features

- **BM25 Ranking:** Relevance-based result ordering
- **Tokenization:** Intelligent word splitting and stemming
- **Partial Matching:** Find results with partial words
- **Multi-Column Search:** Search across multiple fields simultaneously

#### Performance

- **Search Speed:** 10-100x faster than LIKE queries
- **Index Size:** ~20% of original data size
- **Update Speed:** Incremental index updates

#### Usage

```typescript
import { fts5Search } from '@/database/fts5'

const results = await fts5Search('linux kernel vulnerability', {
  limit: 20,
  offset: 0,
  rankBy: 'bm25',
})
```

---

## Type Definitions

### Vulnerability Types

```typescript
interface Vulnerability {
  id: string
  source: 'nvd' | 'osv' | 'github'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  cvssScore?: number
  cvssVector?: string
  cwes?: string[]
  description: string
  references: Array<{
    source: string
    url: string
    tags: string[]
  }>
  affectedComponents: string[]
  publishedAt?: Date
  modifiedAt?: Date
  patchInfo?: {
    patchAvailability: 'available' | 'partial' | 'upstream' | 'investigating' | 'none'
    patchUrl?: string
    fixedVersion?: string
    recommendedVersion?: string
  }
}
```

### Component Types

```typescript
interface Component {
  id: string
  name: string
  version: string
  type: 'library' | 'framework' | 'tool' | 'platform' | 'application'
  purl?: string
  cpe?: string
  supplier?: string
  author?: string
  description?: string
  license?: string
  vulnerabilities: string[] // Vulnerability IDs
  patchInfo?: {
    hasFixAvailable: boolean
    fixedVersion?: string
    recommendedVersion?: string
  }
}
```

### Project Types

```typescript
interface Project {
  id: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
  components: Component[]
  vulnerabilities: Vulnerability[]
  profile?: ProjectProfile
}
```

### Project Profile Types

```typescript
interface ProjectProfile {
  id: string
  projectId: string
  name: string
  filters: {
    severity?: string[]
    cvssScore?: { min?: number; max?: number }
    affectedComponents?: string[]
    sources?: string[]
  }
  thresholds: {
    criticalVulnerabilities?: number
    highVulnerabilities?: number
    healthScore?: number
  }
  notifications: {
    enabled: boolean
    notifyOnNewVulnerabilities: boolean
    notifyOnThresholdExceeded: boolean
  }
}
```

### Audit Event Types

```typescript
interface AuditEvent {
  id: string // ULID
  timestamp: Date
  eventType: AuditEventType
  entityType: 'project' | 'vulnerability' | 'sbom' | 'settings' | 'profile' | 'export'
  entityId: string
  actor: 'user' | 'system'
  action: string
  changes?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    diff?: Array<{
      path: string
      oldValue: unknown
      newValue: unknown
    }>
  }
  metadata?: Record<string, unknown>
  sessionId?: string
}

type AuditEventType =
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'vulnerability.scanned'
  | 'vulnerability.refreshed'
  | 'sbom.uploaded'
  | 'sbom.removed'
  | 'settings.changed'
  | 'profile.created'
  | 'profile.updated'
  | 'profile.deleted'
  | 'export.created'
  | 'bulk.operation'
```

---

## Error Handling

### Database Error Codes

```typescript
const DatabaseErrorCode = {
  DATABASE_NOT_INITIALIZED: 'DATABASE_NOT_INITIALIZED',
  DATABASE_LOCKED: 'DATABASE_LOCKED',
  INVALID_CVE_FORMAT: 'INVALID_CVE_FORMAT',
  INVALID_CPE_FORMAT: 'INVALID_CPE_FORMAT',
  SEARCH_FAILED: 'SEARCH_FAILED',
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
}
```

### Error Response Format

```typescript
interface DatabaseError {
  code: keyof typeof DatabaseErrorCode
  message: string
  details?: unknown
}
```

---

## Constants

### IPC Channels

```typescript
const DB_IPC_CHANNELS = {
  SEARCH: 'db:nvd-search',
  GET_CVE: 'db:nvd-get-by-cve',
  GET_STATS: 'db:nvd-get-stats',
  GET_SYNC_STATUS: 'db:sync-status',
  START_SYNC: 'db:sync-start',
}
```

### Score Thresholds

```typescript
const HIGH_SCORE_THRESHOLD = 7.0
const MEDIUM_SCORE_THRESHOLD = 4.0
```

### API Base URLs

```typescript
const NVD_API_BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const OSV_API_BASE_URL = 'https://api.osv.dev/v1'
```

---

## Usage Examples

### Complete Workflow Example

```typescript
// 1. Create a project and scan for vulnerabilities
import { exportProjectData } from '@/lib/export'
import { calculateProjectHealth } from '@/lib/health'
import { logProjectCreate, logVulnerabilityScan } from '@/lib/audit'

// Log project creation
logProjectCreate(newProject)

// Scan components for vulnerabilities
const vulnerabilities = await scanComponents(newProject.components)

// Log scan results
logVulnerabilityScan(newProject.id, vulnerabilities.length)

// Calculate health
const componentHealths = newProject.components.map((comp) => calculateComponentHealth(comp, vulnerabilities))
const projectHealth = calculateProjectHealth(componentHealths)

console.log(`Project health: ${projectHealth.averageScore}/100`)

// Export results
exportProjectData(newProject, 'pdf', 'project')
```

### Database Search Example

```typescript
// Search local NVD database
const searchResult = await window.electronAPI.database.search({
  type: 'text',
  query: 'apache',
  limit: 20,
})

if (searchResult.success) {
  console.log(`Found ${searchResult.total} CVEs`)
  searchResult.results.forEach((cve) => {
    console.log(`${cve.cveId}: ${cve.description}`)
  })
}
```

### External API Example

```typescript
// Combine NVD and OSV results
import { searchCvesByCpe } from '@/lib/api/nvd'
import { queryByPurl } from '@/lib/api/osv'

const cpe = 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*'
const purl = 'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1'

const [nvdResults, osvResults] = await Promise.all([searchCvesByCpe(cpe), queryByPurl(purl)])

const allVulnerabilities = [...nvdResults, ...osvResults]
console.log(`Total vulnerabilities: ${allVulnerabilities.length}`)
```

---

## License

This API documentation is part of VulnAssesTool.

---

## Support

For issues or questions:

- GitHub: [Create an issue]
- Documentation: See `/docs` folder
- API Status: Check NVD and OSV status pages
