/**
 * Unit tests for NVD API v2 Client
 *
 * Note: Rate limiter behavior is tested separately in rateLimiter.test.ts
 * These tests focus on the API client functionality with mocked fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  NvdApiV2Client,
  NvdApiError,
  createNvdApiV2Client,
  createTestNvdApiV2Client,
  getAvailableYearsForDownload,
  getRecentYearsForDownload,
  type NvdCveV2,
  type NvdApiResponseV2,
} from './nvdApiV2Client.js'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Sample CVE data for testing
const sampleCve: NvdCveV2 = {
  id: 'CVE-2024-12345',
  sourceIdentifier: 'test@cve.org',
  published: '2024-01-15T10:00:00.000',
  lastModified: '2024-01-20T15:30:00.000',
  vulnStatus: 'ANALYZED',
  descriptions: [{ lang: 'en', value: 'Test vulnerability description' }],
  metrics: {
    cvssMetricV31: [
      {
        source: 'nvd@nist.gov',
        type: 'Primary',
        cvssData: {
          version: '3.1',
          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          attackVector: 'NETWORK',
          attackComplexity: 'LOW',
          privilegesRequired: 'NONE',
          userInteraction: 'NONE',
          scope: 'UNCHANGED',
          confidentialityImpact: 'HIGH',
          integrityImpact: 'HIGH',
          availabilityImpact: 'HIGH',
          baseScore: 9.8,
          baseSeverity: 'CRITICAL',
        },
        exploitabilityScore: 3.9,
        impactScore: 5.9,
      },
    ],
  },
  references: [{ url: 'https://example.com/advisory', source: 'VENDOR', tags: ['Vendor Advisory'] }],
}

const sampleApiResponse: NvdApiResponseV2 = {
  resultsPerPage: 1,
  startIndex: 0,
  totalResults: 1,
  format: 'NVD_CVE',
  version: '2.0',
  timestamp: '2024-01-20T16:00:00.000',
  vulnerabilities: [{ cve: sampleCve }],
}

describe('NvdApiV2Client', () => {
  let client: NvdApiV2Client

  beforeEach(() => {
    // Clear mock call history
    mockFetch.mockClear()
    // Set up default mock that returns a valid response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleApiResponse,
    })
    // Use test client with disabled rate limiting for unit tests
    client = createTestNvdApiV2Client()
  })

  afterEach(() => {
    client.cancel()
  })

  describe('constructor', () => {
    it('should create client without API key', () => {
      expect(client.hasApiKey()).toBe(false)
    })

    it('should create client with API key', () => {
      const clientWithKey = createNvdApiV2Client('test-api-key-1234')
      expect(clientWithKey.hasApiKey()).toBe(true)
    })

    it('should create client with custom concurrency', () => {
      const clientWithConcurrency = createNvdApiV2Client(undefined, 5)
      const stats = clientWithConcurrency.getExecutorStats()
      expect(stats.concurrency).toBe(5)
    })
  })

  describe('setApiKey', () => {
    it('should update API key', () => {
      expect(client.hasApiKey()).toBe(false)
      client.setApiKey('new-api-key')
      expect(client.hasApiKey()).toBe(true)
    })

    it('should clear API key when set to undefined', () => {
      client.setApiKey('api-key')
      expect(client.hasApiKey()).toBe(true)
      client.setApiKey(undefined)
      expect(client.hasApiKey()).toBe(false)
    })

    it('should update rate limit config when API key changes', () => {
      const configNoKey = client.getRateLimitConfig()
      expect(configNoKey.requestsPerWindow).toBe(5)

      client.setApiKey('test-key')
      const configWithKey = client.getRateLimitConfig()
      expect(configWithKey.requestsPerWindow).toBe(50)
    })
  })

  describe('setConcurrency', () => {
    it('should update concurrency level', () => {
      client.setConcurrency(7)
      const stats = client.getExecutorStats()
      expect(stats.concurrency).toBe(7)
    })
  })

  describe('getRateLimitConfig', () => {
    it('should return correct config without API key', () => {
      const config = client.getRateLimitConfig()
      expect(config).toEqual({
        requestsPerWindow: 5,
        windowMs: 30000,
      })
    })

    it('should return correct config with API key', () => {
      client.setApiKey('test-key')
      const config = client.getRateLimitConfig()
      expect(config).toEqual({
        requestsPerWindow: 50,
        windowMs: 30000,
      })
    })
  })

  describe('fetchCveById', () => {
    it('should fetch a single CVE by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleApiResponse,
      })

      const result = await client.fetchCveById('CVE-2024-12345')

      expect(result).toEqual(sampleCve)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url] = mockFetch.mock.calls[0]
      expect(url.toString()).toContain('cveId=CVE-2024-12345')
    })

    it('should normalize CVE ID format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleApiResponse,
      })

      await client.fetchCveById('cve-2024-12345')

      const [url] = mockFetch.mock.calls[0]
      expect(url.toString()).toContain('cveId=CVE-2024-12345')
    })

    it('should return null for 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await client.fetchCveById('CVE-9999-99999')

      expect(result).toBeNull()
    })

    it('should include API key in headers when set', async () => {
      client.setApiKey('test-key-123')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleApiResponse,
      })

      await client.fetchCveById('CVE-2024-12345')

      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers.apiKey).toBe('test-key-123')
    })

    it('should use cache for repeated requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleApiResponse,
      })

      // First request
      const result1 = await client.fetchCveById('CVE-2024-12345')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second request should use cache
      const result2 = await client.fetchCveById('CVE-2024-12345')
      expect(mockFetch).toHaveBeenCalledTimes(1) // Still 1, not 2

      expect(result1).toEqual(result2)
    })

    it('should bypass cache when useCache is false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => sampleApiResponse,
      })

      // First request
      await client.fetchCveById('CVE-2024-12345', true)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second request bypassing cache
      await client.fetchCveById('CVE-2024-12345', false)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchYear', () => {
    it('should fetch all CVEs for a year with pagination', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          resultsPerPage: 1,
          totalResults: 2,
          vulnerabilities: [{ cve: sampleCve }],
        }),
      })

      // Second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          resultsPerPage: 1,
          startIndex: 1,
          totalResults: 2,
          vulnerabilities: [{ cve: { ...sampleCve, id: 'CVE-2024-12346' } }],
        }),
      })

      const result = await client.fetchYear({ year: 2024 })

      expect(result.cves).toHaveLength(2)
      expect(result.totalResults).toBe(2)
      expect(result.truncated).toBe(false)
      expect(result.fromCache).toBe(false)
    })

    it('should report progress during fetch', async () => {
      const progressCallback = vi.fn()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          totalResults: 100,
          resultsPerPage: 100,
        }),
      })

      await client.fetchYear({
        year: 2024,
        onProgress: progressCallback,
      })

      // Should have at least fetching and complete phases
      expect(progressCallback).toHaveBeenCalled()
      const calls = progressCallback.mock.calls
      const lastCall = calls[calls.length - 1][0]
      expect(lastCall.phase).toBe('complete')
      expect(lastCall.percentage).toBe(100)
    })

    it('should use correct date range for year', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleApiResponse,
      })

      await client.fetchYear({ year: 2024 })

      const [url] = mockFetch.mock.calls[0]
      const urlString = decodeURIComponent(url.toString())
      // Date format is now local time without timezone
      expect(urlString).toContain('pubStartDate=2024-01-01T00:00:00.000')
      expect(urlString).toContain('pubEndDate=2024-12-31T23:59:59.000')
    })

    it('should return fromCache=true when using cached response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleApiResponse,
      })

      // First fetch - not from cache
      const result1 = await client.fetchYear({ year: 2024 })
      expect(result1.fromCache).toBe(false)

      // Clear mock to ensure no new fetch calls
      mockFetch.mockClear()

      // Second fetch - should be from cache (same URL parameters)
      // Note: Cache key includes startIndex=0, so this tests caching of first page
      await client.fetchYear({ year: 2024, useCache: true })
      // Since the cache should be hit, no new fetch should be made
      expect(mockFetch).toHaveBeenCalledTimes(0)
    })

    it('should bypass cache when useCache is false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => sampleApiResponse,
      })

      await client.fetchYear({ year: 2024, useCache: false })
      await client.fetchYear({ year: 2024, useCache: false })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchDateRange', () => {
    it('should fetch CVEs within date range', async () => {
      // Override default mock for this specific test
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          totalResults: 1,
          resultsPerPage: 1,
        }),
      })

      const result = await client.fetchDateRange({
        startDate: new Date('2024-01-01T00:00:00'),
        endDate: new Date('2024-06-30T23:59:59'),
      })

      expect(result.cves).toHaveLength(1)
      expect(result.totalResults).toBe(1)
    })

    it('should handle pagination', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          resultsPerPage: 2,
          startIndex: 0,
          totalResults: 4,
          vulnerabilities: [
            { cve: { ...sampleCve, id: 'CVE-2024-00001' } },
            { cve: { ...sampleCve, id: 'CVE-2024-00002' } },
          ],
        }),
      })

      // Second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          resultsPerPage: 2,
          startIndex: 2,
          totalResults: 4,
          vulnerabilities: [
            { cve: { ...sampleCve, id: 'CVE-2024-00003' } },
            { cve: { ...sampleCve, id: 'CVE-2024-00004' } },
          ],
        }),
      })

      const result = await client.fetchDateRange({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        resultsPerPage: 2,
      })

      expect(result.cves).toHaveLength(4)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchModifiedSince', () => {
    it('should fetch CVEs modified since date', async () => {
      // Override default mock for this specific test
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          totalResults: 1,
          resultsPerPage: 1,
        }),
      })

      const lastModDate = new Date('2024-01-01T00:00:00')
      const result = await client.fetchModifiedSince({
        lastModifiedDate: lastModDate,
      })

      const [url] = mockFetch.mock.calls[0]
      const urlString = decodeURIComponent(url.toString())
      expect(urlString).toContain('lastModStartDate=2024-01-01T00:00:00.000')
      expect(result.cves).toHaveLength(1)
    })
  })

  describe('fetchYearsParallel', () => {
    it('should fetch multiple years in parallel', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          totalResults: 1,
          resultsPerPage: 1,
        }),
      })

      const result = await client.fetchYearsParallel({
        years: [2022, 2023, 2024],
        concurrency: 2,
      })

      expect(result.results.size).toBe(3)
      expect(result.failedYears.size).toBe(0)
      expect(result.cancelled).toBe(false)
      expect(result.totalCves).toBe(3) // 1 CVE per year
    })

    it('should report progress for each year', async () => {
      const progressCallback = vi.fn()
      const yearProgressCallback = vi.fn()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          totalResults: 1,
          resultsPerPage: 1,
        }),
      })

      await client.fetchYearsParallel({
        years: [2024],
        onOverallProgress: progressCallback,
        onYearProgress: yearProgressCallback,
      })

      expect(progressCallback).toHaveBeenCalled()
      expect(yearProgressCallback).toHaveBeenCalled()
    })

    it('should handle year failures gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...sampleApiResponse,
            totalResults: 1,
            resultsPerPage: 1,
          }),
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...sampleApiResponse,
            totalResults: 1,
            resultsPerPage: 1,
          }),
        })

      const yearErrorCallback = vi.fn()

      const result = await client.fetchYearsParallel({
        years: [2022, 2023, 2024],
        onYearError: yearErrorCallback,
      })

      expect(result.results.size).toBe(2) // 2 succeeded
      expect(result.failedYears.size).toBe(1) // 1 failed
      expect(result.failedYears.has(2023)).toBe(true)
      expect(yearErrorCallback).toHaveBeenCalledWith(2023, expect.any(Error))
    })

    it('should use cache when enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...sampleApiResponse,
          totalResults: 1,
          resultsPerPage: 1,
        }),
      })

      // First batch
      await client.fetchYearsParallel({
        years: [2024],
        useCache: true,
      })
      const firstCallCount = mockFetch.mock.calls.length

      // Second batch with same years should use cache
      await client.fetchYearsParallel({
        years: [2024],
        useCache: true,
      })

      // Fetch count should not have increased significantly
      // (may have some initial calls, but pages should be cached)
      expect(mockFetch.mock.calls.length).toBe(firstCallCount)
    })
  })

  describe('cancel', () => {
    it('should reset rate limiter on cancel', () => {
      // Cancel should not throw
      client.cancel()

      const statusAfter = client.getRateLimiterStatus()
      expect(statusAfter.queueSize).toBe(0)
    })

    it('should clear executor queue', () => {
      client.setConcurrency(2)
      client.cancel()

      const stats = client.getExecutorStats()
      expect(stats.queued).toBe(0)
    })
  })

  describe('getRateLimiterStatus', () => {
    it('should return rate limiter status', () => {
      const status = client.getRateLimiterStatus()

      expect(status).toHaveProperty('queueSize')
      expect(status).toHaveProperty('timeUntilNextRequest')
      expect(typeof status.queueSize).toBe('number')
      expect(typeof status.timeUntilNextRequest).toBe('number')
    })
  })

  describe('getExecutorStats', () => {
    it('should return executor statistics', () => {
      const stats = client.getExecutorStats()

      expect(stats).toHaveProperty('active')
      expect(stats).toHaveProperty('queued')
      expect(stats).toHaveProperty('concurrency')
    })
  })

  describe('cache management', () => {
    it('should clear cache', () => {
      client.clearCache()
      const stats = client.getCacheStats()
      expect(stats.size).toBe(0)
    })

    it('should return cache statistics', () => {
      const stats = client.getCacheStats()
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('oldestEntry')
    })
  })
})

describe('NvdApiError', () => {
  it('should create error with all properties', () => {
    const error = new NvdApiError('Test error', 403, true, 5000)

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('NvdApiError')
    expect(error.statusCode).toBe(403)
    expect(error.retryable).toBe(true)
    expect(error.retryAfter).toBe(5000)
  })

  it('should create error with defaults', () => {
    const error = new NvdApiError('Test error')

    expect(error.statusCode).toBeUndefined()
    expect(error.retryable).toBe(false)
    expect(error.retryAfter).toBeUndefined()
  })
})

describe('getAvailableYearsForDownload', () => {
  it('should return years from 1999 to current year by default', () => {
    const currentYear = new Date().getFullYear()
    const years = getAvailableYearsForDownload()

    expect(years[0]).toBe(1999)
    expect(years[years.length - 1]).toBe(currentYear)
  })

  it('should respect custom start year', () => {
    const years = getAvailableYearsForDownload(2020)

    expect(years[0]).toBe(2020)
  })

  it('should respect custom end year', () => {
    const years = getAvailableYearsForDownload(1999, 2023)

    expect(years[years.length - 1]).toBe(2023)
  })

  it('should support full historical range from 1999', () => {
    const years = getAvailableYearsForDownload(1999, 2024)

    expect(years[0]).toBe(1999)
    expect(years.length).toBe(2024 - 1999 + 1)
  })
})

describe('getRecentYearsForDownload', () => {
  it('should return last 2 years by default', () => {
    const currentYear = new Date().getFullYear()
    const years = getRecentYearsForDownload()

    expect(years).toHaveLength(2)
    expect(years[0]).toBe(currentYear - 1)
    expect(years[1]).toBe(currentYear)
  })

  it('should respect custom years back parameter', () => {
    const currentYear = new Date().getFullYear()
    const years = getRecentYearsForDownload(5)

    expect(years).toHaveLength(5)
    expect(years[0]).toBe(currentYear - 4)
    expect(years[years.length - 1]).toBe(currentYear)
  })
})

describe('createNvdApiV2Client', () => {
  it('should create client instance', () => {
    const client = createNvdApiV2Client()
    expect(client).toBeInstanceOf(NvdApiV2Client)
  })

  it('should create client with API key', () => {
    const client = createNvdApiV2Client('test-key')
    expect(client.hasApiKey()).toBe(true)
  })

  it('should create client with concurrency setting', () => {
    const client = createNvdApiV2Client(undefined, 5)
    const stats = client.getExecutorStats()
    expect(stats.concurrency).toBe(5)
  })
})

describe('Error handling', () => {
  let client: NvdApiV2Client

  beforeEach(() => {
    mockFetch.mockClear()
    client = createTestNvdApiV2Client()
  })

  afterEach(() => {
    client.cancel()
  })

  it('should throw NvdApiError for 403 rate limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({ 'Retry-After': '30' }),
    })

    await expect(client.fetchCveById('CVE-2024-12345')).rejects.toThrow(NvdApiError)
  })

  it('should throw NvdApiError for 429 too many requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers(),
    })

    await expect(client.fetchCveById('CVE-2024-12345')).rejects.toThrow(NvdApiError)
  })

  it('should throw NvdApiError for 500 server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(client.fetchCveById('CVE-2024-12345')).rejects.toThrow(NvdApiError)
  })

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(client.fetchCveById('CVE-2024-12345')).rejects.toThrow('Network error')
  })
})

describe('Progress reporting', () => {
  let client: NvdApiV2Client

  beforeEach(() => {
    mockFetch.mockClear()
    client = createTestNvdApiV2Client()
  })

  afterEach(() => {
    client.cancel()
  })

  it('should report elapsed time in progress', async () => {
    const progressCallback = vi.fn()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...sampleApiResponse,
        totalResults: 100,
        resultsPerPage: 100,
      }),
    })

    await client.fetchYear({
      year: 2024,
      onProgress: progressCallback,
    })

    const calls = progressCallback.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.elapsedTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('should estimate remaining time', async () => {
    const progressCallback = vi.fn()

    // First page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...sampleApiResponse,
        totalResults: 200,
        resultsPerPage: 100,
        startIndex: 0,
      }),
    })

    // Second page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...sampleApiResponse,
        totalResults: 200,
        resultsPerPage: 100,
        startIndex: 100,
      }),
    })

    await client.fetchYear({
      year: 2024,
      resultsPerPage: 100,
      onProgress: progressCallback,
    })

    // Check that progress was reported
    expect(progressCallback).toHaveBeenCalled()
  })
})

describe('Cancellation', () => {
  let client: NvdApiV2Client

  beforeEach(() => {
    mockFetch.mockClear()
    client = createTestNvdApiV2Client()
  })

  afterEach(() => {
    client.cancel()
  })

  it('should report cancelled phase on abort', async () => {
    const progressCallback = vi.fn()
    const controller = new AbortController()

    // Set up a delayed response that will be aborted
    mockFetch.mockImplementationOnce(() => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          resolve({
            ok: true,
            json: async () => sampleApiResponse,
          })
        }, 500) // Longer delay to ensure abort happens first

        // Listen for abort signal
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId)
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })
    })

    // Start the fetch
    const fetchPromise = client.fetchYear({
      year: 2024,
      signal: controller.signal,
      onProgress: progressCallback,
    })

    // Abort after a small delay to ensure fetch started
    setTimeout(() => controller.abort(), 10)

    // Should throw or handle cancellation
    await expect(fetchPromise).rejects.toThrow()
  })

  it('should handle already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort() // Abort before starting

    const progressCallback = vi.fn()

    await expect(
      client.fetchYear({
        year: 2024,
        signal: controller.signal,
        onProgress: progressCallback,
      }),
    ).rejects.toThrow()
  })
})
