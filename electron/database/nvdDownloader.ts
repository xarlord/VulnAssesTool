/**
 * NVD Data Downloader and Importer
 * Downloads CVE data from NIST and imports into the local database
 */

import { promises as fs } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { app } from 'electron'
import { getDatabase } from './nvdDb.js'
import type { CPEMatch, Reference } from './types.js'

// NVD CVE JSON feeds base URL
const NVD_FEED_BASE_URL = 'https://nvd.nist.gov/feeds/json/cve/1.1'
const USER_AGENT = 'VulnAssessTool/1.0 (+https://github.com/vulnasstool)'

export interface NVDDownloadProgress {
  year: number
  status: 'pending' | 'downloading' | 'extracting' | 'parsing' | 'importing' | 'complete' | 'error' | string
  downloaded: number
  total: number
  error?: string
  totalYears?: number
  completedYears?: number
  totalCVEs?: number
  processedCVEs?: number
}

export interface NVDImportStats {
  totalYears: number
  completedYears: number
  totalCVEs: number
  processedCVEs: number
  status: string
  year?: number
}

/**
 * Download a single year's CVE feed from NIST
 */
async function downloadYearFeed(
  year: number,
  apiKey?: string,
  progressCallback?: (progress: NVDDownloadProgress) => void,
): Promise<string> {
  const userDataPath = app.getPath('userData')
  const cacheDir = path.join(userDataPath, 'nvd-cache')
  await fs.mkdir(cacheDir, { recursive: true })

  const gzFilename = path.join(cacheDir, `nvdcve-1.1-${year}.json.gz`)
  const jsonFilename = path.join(cacheDir, `nvdcve-1.1-${year}.json`)

  progressCallback?.({
    year,
    status: 'downloading',
    downloaded: 0,
    total: 100,
  })

  try {
    // Download the gzipped JSON file
    const url = `${NVD_FEED_BASE_URL}/nvdcve-1.1-${year}.json.gz`

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    }

    // Add NIST API key if available (required since 2024)
    if (apiKey) {
      headers['apiKey'] = apiKey
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      if (response.status === 403) {
        errorMessage +=
          '\n\nNIST now requires an API key to access NVD data feeds.\n' +
          'Get a free API key at: https://nvd.nist.gov/developers/request-an-api-key\n' +
          'Then add it in Settings > API Configuration.'
      }
      throw new Error(errorMessage)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0

    // Write to file
    const fileStream = createWriteStream(gzFilename)
    const reader = response.body.getReader()
    let downloaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      downloaded += value.length
      fileStream.write(value)

      if (total > 0) {
        progressCallback?.({
          year,
          status: 'downloading',
          downloaded,
          total,
        })
      }
    }

    fileStream.close()

    // Extract gzip file
    progressCallback?.({
      year,
      status: 'extracting',
      downloaded: 0,
      total: 100,
    })

    await pipeline(createReadStream(gzFilename), createGunzip(), createWriteStream(jsonFilename))

    // Delete gz file to save space
    await fs.unlink(gzFilename)

    progressCallback?.({
      year,
      status: 'complete',
      downloaded: 100,
      total: 100,
    })

    return jsonFilename
  } catch (error) {
    progressCallback?.({
      year,
      status: 'error',
      downloaded: 0,
      total: 100,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}

/**
 * Parse NVD CVE JSON format
 */
function parseNVDCVE(json: Record<string, unknown>): Array<{
  id: string
  description: string
  cvss_score?: number
  cvss_vector?: string
  severity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  published_at: string
  modified_at: string
  source: 'NVD'
  cpe_matches: CPEMatch[]
  references: Reference[]
}> {
  const cves: Array<{
    id: string
    description: string
    cvss_score?: number
    cvss_vector?: string
    severity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    published_at: string
    modified_at: string
    source: 'NVD'
    cpe_matches: CPEMatch[]
    references: Reference[]
  }> = []

  // NVD JSON format versions may vary
  const cveData = json.CVE_data as Record<string, unknown> | undefined
  // NVD API responses are deeply nested; cast once for safe property access
  type NvdCveItem = {
    cve?: Record<string, unknown>
    publishedDate?: string
    lastModifiedDate?: string
    configurations?: { nodes?: unknown[] }
  }
  const vulnerabilities = (cveData?.CVE_Items as NvdCveItem[]) || (json.vulnerabilities as NvdCveItem[]) || []

  for (const item of vulnerabilities) {
    const cve = item.cve as Record<string, unknown> | undefined
    const cveMeta = cve?.CVE_data_meta as Record<string, unknown> | undefined
    const cveId = cveMeta?.ID as string | undefined
    if (!cveId) continue

    const descData = cve?.description as Record<string, unknown> | undefined
    const descArray = descData?.description_data as Array<Record<string, unknown>> | undefined
    const description = (descArray?.[0]?.value as string) || ''

    // Get CVSS score
    let cvss_score: number | null = null
    let cvss_vector: string | null = null
    let severity: string | null = null

    const metrics = cve?.metrics as Record<string, unknown> | undefined
    if (metrics) {
      // Try CVSS v3.1 first
      const cvssV31Array = metrics.cvssMetricV31 as Array<Record<string, Record<string, unknown>>> | undefined
      const cvssV31 = cvssV31Array?.[0]
      if (cvssV31?.cvssData) {
        cvss_score = cvssV31.cvssData.baseScore as number
        cvss_vector = cvssV31.cvssData.vectorString as string
        severity = cvssV31.cvssData.baseSeverity as string
      }

      // Fall back to CVSS v3.0
      if (cvss_score === undefined) {
        const cvssV30Array = metrics.cvssMetricV30 as Array<Record<string, Record<string, unknown>>> | undefined
        const cvssV30 = cvssV30Array?.[0]
        if (cvssV30?.cvssData) {
          cvss_score = cvssV30.cvssData.baseScore as number
          cvss_vector = cvssV30.cvssData.vectorString as string
          severity = cvssV30.cvssData.baseSeverity as string
        }
      }

      // Fall back to CVSS v2.0
      if (cvss_score === undefined) {
        const cvssV2Array = metrics.cvssMetricV2 as Array<Record<string, Record<string, unknown>>> | undefined
        const cvssV2 = cvssV2Array?.[0]
        if (cvssV2?.cvssData) {
          cvss_score = cvssV2.cvssData.baseScore as number
          cvss_vector = cvssV2.cvssData.vectorString as string
          // Map v2 severity to v3 levels
          const baseSeverity = cvssV2.cvssData.baseSeverity as string
          if (baseSeverity === 'HIGH') severity = 'HIGH'
          else if (baseSeverity === 'MEDIUM') severity = 'MEDIUM'
          else if (baseSeverity === 'LOW') severity = 'LOW'
        }
      }
    }

    // Parse published and modified dates
    const publishedDate =
      (item.publishedDate as string) || (cveMeta?.ASSIGNER as string) || (cveMeta?.PUBLIC_DATE as string) || ''
    const modifiedDate = (item.lastModifiedDate as string) || new Date().toISOString()

    // Parse CPE matches
    const cpe_matches: CPEMatch[] = []
    const configNodes = (item.configurations as Record<string, unknown>)?.nodes as
      | Array<Record<string, unknown>>
      | undefined
    const configurations = configNodes || []

    for (const config of configurations) {
      const cpeList = (config.cpe_match as Array<Record<string, unknown>>) || []
      for (const cpe of cpeList) {
        cpe_matches.push({
          cpe_text: (cpe.cpe23Uri as string) || (cpe.cpe_name as string) || '',
          vulnerable: cpe.vulnerable ? cpe.vulnerable === 'true' || cpe.vulnerable === true : true,
          cve_id: cveId,
        })
      }
    }

    // Parse references
    const references: Reference[] = []
    const refsObj = cve?.references as Record<string, unknown> | undefined
    const refs = (refsObj?.reference_data as Array<Record<string, unknown>>) || []

    for (const ref of refs) {
      const rawTags = ref.tags as string[] | undefined
      const tags = rawTags?.join(',') || ''
      references.push({
        url: (ref.url as string) || (ref.href as string) || '',
        source: (ref.source as string) || '',
        tags: tags || undefined,
        cve_id: cveId,
      })
    }

    cves.push({
      id: cveId,
      description,
      cvss_score: cvss_score ?? undefined,
      cvss_vector: cvss_vector ?? undefined,
      severity: severity as 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
      published_at: publishedDate,
      modified_at: modifiedDate,
      source: 'NVD',
      cpe_matches,
      references,
    })
  }

  return cves
}

/**
 * Import a year's CVE data into the database
 */
async function importYearData(jsonFile: string, progressCallback?: (stats: NVDImportStats) => void): Promise<number> {
  progressCallback?.({
    totalYears: 0,
    completedYears: 0,
    totalCVEs: 0,
    processedCVEs: 0,
    status: `Reading ${path.basename(jsonFile)}...`,
  })

  const fileContent = await fs.readFile(jsonFile, 'utf-8')
  const json = JSON.parse(fileContent)

  progressCallback?.({
    totalYears: 0,
    completedYears: 0,
    totalCVEs: 0,
    processedCVEs: 0,
    status: `Parsing ${path.basename(jsonFile)}...`,
  })

  const cves = parseNVDCVE(json)
  const db = getDatabase()
  if (!db.isInitialized()) {
    await db.initialize()
  }

  let importedCount = 0

  progressCallback?.({
    totalYears: 0,
    completedYears: 0,
    totalCVEs: cves.length,
    processedCVEs: 0,
    status: `Importing ${cves.length} CVEs from ${path.basename(jsonFile)}...`,
  })

  for (const cve of cves) {
    try {
      await db.upsertCVE(cve)
      await db.insertCPEMatches(cve.id, cve.cpe_matches)
      await db.insertReferences(cve.id, cve.references)
      importedCount++

      // Update progress every 100 CVEs
      if (importedCount % 100 === 0) {
        progressCallback?.({
          totalYears: 0,
          completedYears: 0,
          totalCVEs: cves.length,
          processedCVEs: importedCount,
          status: `Importing ${importedCount}/${cves.length} CVEs...`,
        })
      }
    } catch (error) {
      console.error(`Failed to import ${cve.id}:`, error)
    }
  }

  progressCallback?.({
    totalYears: 0,
    completedYears: 0,
    totalCVEs: cves.length,
    processedCVEs: importedCount,
    status: `Completed importing ${importedCount} CVEs from ${path.basename(jsonFile)}`,
  })

  return importedCount
}

/**
 * Download and import multiple years of NVD data
 */
export async function downloadAndImportNVDData(
  years: number[],
  apiKey?: string,
  progressCallback?: (progress: NVDDownloadProgress & NVDImportStats) => void,
): Promise<void> {
  const totalYears = years.length
  let completedYears = 0
  let totalCVEs = 0
  const processedCVEs = 0

  for (const year of years) {
    try {
      progressCallback?.({
        year,
        status: `Starting year ${year}...`,
        downloaded: 0,
        total: 100,
        totalYears,
        completedYears,
        totalCVEs,
        processedCVEs,
      })

      // Check if we already have the file cached
      const userDataPath = app.getPath('userData')
      const cacheFile = path.join(userDataPath, 'nvd-cache', `nvdcve-1.1-${year}.json`)

      let jsonFile: string

      try {
        await fs.access(cacheFile)
        // File exists, use cached
        jsonFile = cacheFile
        progressCallback?.({
          year,
          status: `Using cached file for ${year}...`,
          downloaded: 100,
          total: 100,
          totalYears,
          completedYears,
          totalCVEs,
          processedCVEs,
        })
      } catch {
        // File doesn't exist, download and extract
        jsonFile = await downloadYearFeed(year, apiKey, (progress) => {
          progressCallback?.({
            ...progress,
            totalYears,
            completedYears,
            totalCVEs,
            processedCVEs,
          })
        })
      }

      // Import the data
      progressCallback?.({
        year,
        status: `Importing ${year}...`,
        downloaded: 100,
        total: 100,
        totalYears,
        completedYears,
        totalCVEs,
        processedCVEs,
      })

      const importedCount = await importYearData(jsonFile, (stats) => {
        progressCallback?.({
          year,
          downloaded: 100,
          total: 100,
          totalYears,
          completedYears,
          totalCVEs: stats.totalCVEs + totalCVEs,
          processedCVEs: stats.processedCVEs + processedCVEs,
          status: stats.status,
        })
      })

      completedYears++
      totalCVEs += importedCount

      // Update metadata
      const db = getDatabase()
      await db.updateMetadata('last_sync_at', new Date().toISOString())

      progressCallback?.({
        year,
        status: `Completed ${year}: ${importedCount} CVEs imported`,
        downloaded: 100,
        total: 100,
        totalYears,
        completedYears,
        totalCVEs,
        processedCVEs,
      })
    } catch (error) {
      console.error(`Failed to process year ${year}:`, error)
      progressCallback?.({
        year,
        status: `Error processing ${year}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        downloaded: 0,
        total: 100,
        totalYears,
        completedYears,
        totalCVEs,
        processedCVEs,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  progressCallback?.({
    year: years[years.length - 1] || new Date().getFullYear(),
    downloaded: 100,
    total: 100,
    totalYears,
    completedYears: totalYears,
    totalCVEs,
    processedCVEs,
    status: `Complete! Imported ${processedCVEs} CVEs from ${completedYears} years.`,
  })
}

/**
 * Get available years for download
 */
export function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear()
  const years: number[] = []

  // NVD data available from 2002 to present
  // Start from 2020 to keep database size manageable
  // Use current year (NVD publishes data for the current year)
  for (let year = 2020; year <= currentYear; year++) {
    years.push(year)
  }

  return years
}
