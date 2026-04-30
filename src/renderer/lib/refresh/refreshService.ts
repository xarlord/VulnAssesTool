import type { Component, Vulnerability, Project } from '@@/types'
import { matchVulnerabilitiesForComponents } from '@/lib/api/vulnMatcher'
import { getVulnCache } from '@/lib/cache'
import { getSecureKeyService } from '@/lib/storage'

export interface RefreshOptions {
  useCache?: boolean
  cacheTTL?: number // hours
  // Note: nvdApiKey is now fetched from secure storage internally
  onProgress?: (current: number, total: number) => void
  onComplete?: (results: RefreshResult) => void
  onError?: (error: Error) => void
}

export interface RefreshResult {
  success: boolean
  vulnerabilities: Vulnerability[]
  vulnerabilitiesFound: number
  componentsScanned: number
  cached: number
  fetched: number
  duration: number
  error?: string
}

/**
 * Refresh vulnerability data for a project's components
 */
export async function refreshVulnerabilityData(
  components: Component[],
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const startTime = Date.now()
  const {
    useCache = true,
    cacheTTL = 1, // default 1 hour
    onProgress,
    onComplete,
    onError,
  } = options

  // Fetch NVD API key from secure storage
  const secureKeyService = getSecureKeyService()
  const nvdApiKey = await secureKeyService.getApiKey('nvd')

  const cache = getVulnCache()
  const results: Map<string, Vulnerability[]> = new Map()
  let cached = 0
  let fetched = 0

  try {
    const total = components.length

    for (let i = 0; i < components.length; i++) {
      const component = components[i]
      const purl = component.purl

      if (!purl) {
        continue
      }

      // Check cache first if enabled
      if (useCache) {
        const cachedData = cache.get(purl, 'nvd')
        if (cachedData) {
          results.set(purl, cachedData)
          cached++
          onProgress?.(i + 1, total)
          continue
        }
      }

      // Fetch fresh data from APIs
      try {
        const vulnMap = await matchVulnerabilitiesForComponents([component], nvdApiKey || undefined)
        // Extract vulnerabilities for this component from the result map
        const vulns = vulnMap.get(component.id) || []
        results.set(purl, vulns)

        // Cache the results
        const ttl = cacheTTL * 60 * 60 * 1000 // Convert hours to ms
        cache.set(purl, 'nvd', vulns, ttl)
        fetched++
      } catch (error) {
        console.error(`Failed to fetch vulnerabilities for ${purl}:`, error)
        // Continue with other components even if one fails
      }

      onProgress?.(i + 1, total)
    }

    // Flatten results
    const allVulnerabilities = Array.from(results.values()).flat()

    const duration = Date.now() - startTime
    const result: RefreshResult = {
      success: true,
      vulnerabilities: allVulnerabilities,
      vulnerabilitiesFound: allVulnerabilities.length,
      componentsScanned: components.length,
      cached,
      fetched,
      duration,
    }

    onComplete?.(result)
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    const result: RefreshResult = {
      success: false,
      vulnerabilities: [],
      vulnerabilitiesFound: 0,
      componentsScanned: components.length,
      cached,
      fetched,
      duration,
      error: error instanceof Error ? error.message : String(error),
    }

    onError?.(error instanceof Error ? error : new Error(String(error)))
    onComplete?.(result)
    return result
  }
}

/**
 * Check if a project needs a refresh based on auto-refresh settings
 */
export function needsRefresh(project: Project, autoRefreshInterval: number): boolean {
  if (!project.lastVulnDataRefresh) {
    return true
  }

  const now = Date.now()
  const lastRefresh = new Date(project.lastVulnDataRefresh).getTime()
  const intervalMs = autoRefreshInterval * 60 * 60 * 1000

  return now - lastRefresh > intervalMs
}

/**
 * Get the next scheduled refresh time for a project
 */
export function getNextRefreshTime(project: Project | undefined, autoRefreshInterval: number): Date | null {
  if (!project || !project.lastVulnDataRefresh) {
    return null
  }

  const lastRefresh = new Date(project.lastVulnDataRefresh).getTime()
  const intervalMs = autoRefreshInterval * 60 * 60 * 1000
  const nextRefresh = lastRefresh + intervalMs

  return new Date(nextRefresh)
}

/**
 * Format time until next refresh
 */
export function formatTimeUntilRefresh(nextRefresh: Date | null): string {
  if (!nextRefresh) {
    return 'Not scheduled'
  }

  const now = Date.now()
  const diff = nextRefresh.getTime() - now

  if (diff <= 0) {
    return 'Due now'
  }

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 60) {
    return `in ${minutes} minute${minutes > 1 ? 's' : ''}`
  } else if (hours < 24) {
    return `in ${hours} hour${hours > 1 ? 's' : ''}`
  } else {
    return `in ${days} day${days > 1 ? 's' : ''}`
  }
}
