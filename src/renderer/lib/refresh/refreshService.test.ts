import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  refreshVulnerabilityData,
  needsRefresh,
  getNextRefreshTime,
  formatTimeUntilRefresh,
  type RefreshOptions,
  type RefreshResult,
} from './refreshService'
import type { Component, Project, Vulnerability } from '@@/types'

// Mock the dependencies
vi.mock('@/lib/api/vulnMatcher', () => ({
  matchVulnerabilitiesForComponents: vi.fn(),
}))

vi.mock('@/lib/cache', () => ({
  getVulnCache: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  getSecureKeyService: vi.fn(),
}))

import { matchVulnerabilitiesForComponents } from '@/lib/api/vulnMatcher'
import { getVulnCache } from '@/lib/cache'
import { getSecureKeyService } from '@/lib/storage'

describe('refreshService', () => {
  // Mock cache implementation
  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
    clear: vi.fn(),
    clearComponent: vi.fn(),
    size: vi.fn(),
    cleanup: vi.fn(),
    keys: vi.fn(),
    getStats: vi.fn(),
  }

  // Mock secure key service
  const mockSecureKeyService = {
    getApiKey: vi.fn(),
    setApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    hasApiKey: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getVulnCache).mockReturnValue(mockCache as any)
    vi.mocked(getSecureKeyService).mockReturnValue(mockSecureKeyService as any)
    // Default: no API key
    mockSecureKeyService.getApiKey.mockResolvedValue(null)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('refreshVulnerabilityData', () => {
    const mockComponents: Component[] = [
      {
        id: 'comp-1',
        name: 'lodash',
        version: '4.17.21',
        type: 'library',
        purl: 'pkg:npm/lodash@4.17.21',
        cpe: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
        licenses: ['MIT'],
        vulnerabilities: [],
      },
      {
        id: 'comp-2',
        name: 'express',
        version: '4.18.0',
        type: 'framework',
        purl: 'pkg:npm/express@4.18.0',
        cpe: 'cpe:2.3:a:expressjs:express:4.18.0:*:*:*:*:*:*:*',
        licenses: ['MIT'],
        vulnerabilities: [],
      },
      {
        id: 'comp-3',
        name: 'react',
        version: '18.2.0',
        type: 'library',
        purl: 'pkg:npm/react@18.2.0',
        licenses: ['MIT'],
        vulnerabilities: [],
      },
    ]

    const mockVulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.8,
        description: 'Critical vulnerability',
        references: [],
        affectedComponents: ['comp-1'],
      },
      {
        id: 'CVE-2024-1002',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'High severity vulnerability',
        references: [],
        affectedComponents: ['comp-2'],
      },
    ]

    it('should successfully refresh vulnerability data with cache enabled', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', [mockVulnerabilities[0]]],
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', []],
        ]),
      )

      const result = await refreshVulnerabilityData(mockComponents, {
        useCache: true,
        cacheTTL: 1,
      })

      expect(result.success).toBe(true)
      expect(result.vulnerabilitiesFound).toBe(2)
      expect(result.componentsScanned).toBe(3)
      expect(result.cached).toBe(0)
      expect(result.fetched).toBe(3)
      expect(result.vulnerabilities).toHaveLength(2)
      expect(result.error).toBeUndefined()
    })

    it('should use cached data when available', async () => {
      mockCache.get.mockImplementation((purl: string) => {
        if (purl === 'pkg:npm/lodash@4.17.21') {
          return [mockVulnerabilities[0]]
        }
        return null
      })
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', []],
        ]),
      )

      const result = await refreshVulnerabilityData(mockComponents, {
        useCache: true,
        cacheTTL: 1,
      })

      expect(result.success).toBe(true)
      expect(result.cached).toBe(1)
      expect(result.fetched).toBe(2)
      expect(result.vulnerabilitiesFound).toBe(2)
    })

    it('should skip components without purl', async () => {
      const componentsWithoutPurl: Component[] = [
        {
          id: 'comp-no-purl',
          name: 'no-purl-lib',
          version: '1.0.0',
          type: 'library',
          licenses: ['MIT'],
          vulnerabilities: [],
        },
        ...mockComponents,
      ]

      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', [mockVulnerabilities[0]]],
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', []],
        ]),
      )

      const result = await refreshVulnerabilityData(componentsWithoutPurl, {
        useCache: true,
      })

      expect(result.success).toBe(true)
      expect(result.componentsScanned).toBe(4)
      expect(result.fetched).toBe(3) // Only 3 components have purl
    })

    it('should handle empty components array', async () => {
      const result = await refreshVulnerabilityData([])

      expect(result.success).toBe(true)
      expect(result.componentsScanned).toBe(0)
      expect(result.vulnerabilitiesFound).toBe(0)
      expect(result.vulnerabilities).toEqual([])
    })

    it('should call onProgress callback for each component', async () => {
      const progressCallback = vi.fn()
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map())

      await refreshVulnerabilityData(mockComponents, {
        onProgress: progressCallback,
      })

      expect(progressCallback).toHaveBeenCalledTimes(3)
      expect(progressCallback).toHaveBeenNthCalledWith(1, 1, 3)
      expect(progressCallback).toHaveBeenNthCalledWith(2, 2, 3)
      expect(progressCallback).toHaveBeenNthCalledWith(3, 3, 3)
    })

    it('should call onComplete callback with results', async () => {
      const completeCallback = vi.fn()
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', [mockVulnerabilities[0]]],
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', []],
        ]),
      )

      const result = await refreshVulnerabilityData(mockComponents, {
        onComplete: completeCallback,
      })

      expect(completeCallback).toHaveBeenCalledTimes(1)
      expect(completeCallback).toHaveBeenCalledWith(result)
    })

    it('should cache results after fetching', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', [mockVulnerabilities[0]]],
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', []],
        ]),
      )

      await refreshVulnerabilityData(mockComponents, {
        cacheTTL: 2, // 2 hours
      })

      expect(mockCache.set).toHaveBeenCalledTimes(3)
      expect(mockCache.set).toHaveBeenCalledWith(
        'pkg:npm/lodash@4.17.21',
        'nvd',
        [mockVulnerabilities[0]],
        2 * 60 * 60 * 1000,
      )
    })

    it('should use custom cache TTL', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map())

      await refreshVulnerabilityData(mockComponents, {
        cacheTTL: 5, // 5 hours
      })

      expect(mockCache.set).toHaveBeenCalledWith(expect.any(String), 'nvd', expect.any(Array), 5 * 60 * 60 * 1000)
    })

    it('should pass NVD API key to matcher', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map())

      // Mock secure key service to return the API key
      vi.mocked(mockSecureKeyService.getApiKey).mockResolvedValue('test-api-key-123')

      await refreshVulnerabilityData(mockComponents)

      expect(matchVulnerabilitiesForComponents).toHaveBeenCalledWith(expect.any(Array), 'test-api-key-123')
    })

    it('should handle individual component fetch errors gracefully', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockImplementation(async (components) => {
        // Simulate error for first component
        if (components[0]?.id === 'comp-1') {
          throw new Error('API error for component 1')
        }
        return new Map([
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', []],
        ])
      })

      // Mock to return result for second and third components
      vi.mocked(matchVulnerabilitiesForComponents)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(
          new Map([
            ['comp-2', [mockVulnerabilities[1]]],
            ['comp-3', []],
          ]),
        )

      const result = await refreshVulnerabilityData(mockComponents)

      // Should continue with other components even if one fails
      expect(result.success).toBe(true)
    })

    it('should handle all components failing to fetch', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockRejectedValue(new Error('All API calls failed'))

      const result = await refreshVulnerabilityData(mockComponents)

      // Should still return success=true as errors are handled per component
      expect(result.success).toBe(true)
      expect(result.vulnerabilitiesFound).toBe(0)
      expect(result.fetched).toBe(0)
    })

    it('should handle cache disabled', async () => {
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', [mockVulnerabilities[0]]],
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', []],
        ]),
      )

      const result = await refreshVulnerabilityData(mockComponents, {
        useCache: false,
      })

      expect(result.success).toBe(true)
      expect(mockCache.get).not.toHaveBeenCalled()
      expect(result.cached).toBe(0)
      expect(result.fetched).toBe(3)
    })

    it('should handle vulnerability matcher returning empty map for component', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', []],
          ['comp-2', []],
          ['comp-3', []],
        ]),
      )

      const result = await refreshVulnerabilityData(mockComponents)

      expect(result.success).toBe(true)
      expect(result.vulnerabilitiesFound).toBe(0)
      expect(result.vulnerabilities).toEqual([])
    })

    it('should measure and report duration', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map())

      const result = await refreshVulnerabilityData(mockComponents)

      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(typeof result.duration).toBe('number')
    })

    it('should handle concurrent cache hits for all components', async () => {
      mockCache.get.mockReturnValue([mockVulnerabilities[0]])

      const result = await refreshVulnerabilityData(mockComponents, {
        useCache: true,
      })

      expect(result.success).toBe(true)
      expect(result.cached).toBe(3)
      expect(result.fetched).toBe(0)
      expect(matchVulnerabilitiesForComponents).not.toHaveBeenCalled()
    })

    it('should flatten vulnerabilities from all components', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', [mockVulnerabilities[0], { ...mockVulnerabilities[1], id: 'CVE-2024-1003' }]],
          ['comp-2', [mockVulnerabilities[1]]],
          ['comp-3', [{ ...mockVulnerabilities[0], id: 'CVE-2024-1004' }]],
        ]),
      )

      const result = await refreshVulnerabilityData(mockComponents)

      expect(result.vulnerabilities).toHaveLength(4)
      expect(result.vulnerabilitiesFound).toBe(4)
    })

    it('should call onError callback on error', async () => {
      const errorCallback = vi.fn()
      mockCache.get.mockImplementation(() => {
        throw new Error('Cache error')
      })

      const result = await refreshVulnerabilityData(mockComponents, {
        onError: errorCallback,
      })

      expect(result.success).toBe(false)
      expect(errorCallback).toHaveBeenCalledTimes(1)
      expect(result.error).toBeDefined()
    })

    it('should call onComplete even on error', async () => {
      const completeCallback = vi.fn()
      const errorCallback = vi.fn()
      mockCache.get.mockImplementation(() => {
        throw new Error('Cache error')
      })

      const result = await refreshVulnerabilityData(mockComponents, {
        onComplete: completeCallback,
        onError: errorCallback,
      })

      expect(completeCallback).toHaveBeenCalledTimes(1)
      expect(completeCallback).toHaveBeenCalledWith(result)
    })

    it('should handle non-Error objects in error callback', async () => {
      const errorCallback = vi.fn()
      mockCache.get.mockImplementation(() => {
        throw 'String error'
      })

      await refreshVulnerabilityData(mockComponents, {
        onError: errorCallback,
      })

      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should return proper error result structure', async () => {
      mockCache.get.mockImplementation(() => {
        throw new Error('Test error')
      })

      const result = await refreshVulnerabilityData(mockComponents)

      expect(result.success).toBe(false)
      expect(result.vulnerabilities).toEqual([])
      expect(result.vulnerabilitiesFound).toBe(0)
      expect(result.error).toBe('Test error')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('should handle default options', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map())

      const result = await refreshVulnerabilityData(mockComponents)

      expect(result.success).toBe(true)
      // Default options should be applied
      expect(mockCache.get).toHaveBeenCalled()
    })

    it('should cache data with correct TTL calculation', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map([['comp-1', [mockVulnerabilities[0]]]]))

      const cacheTTL = 3 // 3 hours
      await refreshVulnerabilityData([mockComponents[0]], {
        cacheTTL,
      })

      const expectedTTL = cacheTTL * 60 * 60 * 1000 // 3 hours in ms
      expect(mockCache.set).toHaveBeenCalledWith('pkg:npm/lodash@4.17.21', 'nvd', [mockVulnerabilities[0]], expectedTTL)
    })

    it('should continue processing after cache.get returns null (cache miss)', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map([['comp-1', [mockVulnerabilities[0]]]]))

      const result = await refreshVulnerabilityData([mockComponents[0]], {
        useCache: true,
      })

      expect(result.fetched).toBe(1)
      expect(result.cached).toBe(0)
      expect(matchVulnerabilitiesForComponents).toHaveBeenCalled()
    })

    it('should handle components with null/undefined purl gracefully', async () => {
      const componentsWithMissingPurl: Component[] = [
        { ...mockComponents[0], purl: undefined },
        { ...mockComponents[1], purl: null as any },
        mockComponents[2],
      ]

      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map([['comp-3', []]]))

      const result = await refreshVulnerabilityData(componentsWithMissingPurl)

      expect(result.success).toBe(true)
      expect(result.componentsScanned).toBe(3)
      expect(result.fetched).toBe(1) // Only one component with valid purl
    })

    it('should store results by purl not component id', async () => {
      mockCache.get.mockReturnValue(null)
      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map([['comp-1', [mockVulnerabilities[0]]]]))

      await refreshVulnerabilityData([mockComponents[0]], {
        useCache: true,
        cacheTTL: 1,
      })

      // Cache should use purl as key
      expect(mockCache.set).toHaveBeenCalledWith(
        'pkg:npm/lodash@4.17.21', // purl
        'nvd',
        [mockVulnerabilities[0]],
        expect.any(Number),
      )
    })
  })

  describe('needsRefresh', () => {
    const mockProject: Project = {
      id: 'project-1',
      name: 'Test Project',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      sbomFiles: [],
      components: [],
      vulnerabilities: [],
      statistics: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        totalComponents: 0,
        vulnerableComponents: 0,
      },
    }

    it('should return true when project has no lastVulnDataRefresh', () => {
      const result = needsRefresh(mockProject, 24)
      expect(result).toBe(true)
    })

    it('should return true when last refresh is older than interval', () => {
      const projectWithOldRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      }

      const result = needsRefresh(projectWithOldRefresh, 24)
      expect(result).toBe(true)
    })

    it('should return false when last refresh is within interval', () => {
      const projectWithRecentRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(Date.now() - 23 * 60 * 60 * 1000), // 23 hours ago
      }

      const result = needsRefresh(projectWithRecentRefresh, 24)
      expect(result).toBe(false)
    })

    it('should handle zero interval (never needs refresh if just refreshed)', () => {
      const project: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(),
      }

      const result = needsRefresh(project, 0)
      // With 0 interval, intervalMs is 0, so now - lastRefresh > 0 is false if just refreshed
      expect(result).toBe(false)
    })

    it('should handle very short intervals', () => {
      const project: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(Date.now() - 1000), // 1 second ago
      }

      const result = needsRefresh(project, 0.00001) // Very small interval
      expect(result).toBe(true)
    })

    it('should handle very long intervals', () => {
      const project: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      }

      const result = needsRefresh(project, 168) // 1 week
      expect(result).toBe(false)
    })

    it('should return false exactly at interval boundary (just within interval)', () => {
      const now = Date.now()
      const intervalMs = 24 * 60 * 60 * 1000 // 24 hours

      const project: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(now - intervalMs),
      }

      const result = needsRefresh(project, 24)
      // At exact boundary, now - lastRefresh === intervalMs, so > is false
      expect(result).toBe(false)
    })

    it('should handle lastVulnDataRefresh as Date object', () => {
      const project: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date('2024-01-01T00:00:00Z'),
      }

      const result = needsRefresh(project, 1)
      expect(result).toBe(true)
    })

    it('should convert interval hours to milliseconds correctly', () => {
      const project: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      }

      const result = needsRefresh(project, 1) // 1 hour interval
      expect(result).toBe(true)
    })
  })

  describe('getNextRefreshTime', () => {
    const mockProject: Project = {
      id: 'project-1',
      name: 'Test Project',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      sbomFiles: [],
      components: [],
      vulnerabilities: [],
      statistics: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        totalComponents: 0,
        vulnerableComponents: 0,
      },
    }

    it('should return null when project is undefined', () => {
      const result = getNextRefreshTime(undefined, 24)
      expect(result).toBeNull()
    })

    it('should return null when project has no lastVulnDataRefresh', () => {
      const result = getNextRefreshTime(mockProject, 24)
      expect(result).toBeNull()
    })

    it('should return correct next refresh time', () => {
      const now = Date.now()
      const projectWithRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(now),
      }

      const result = getNextRefreshTime(projectWithRefresh, 24)

      expect(result).toBeInstanceOf(Date)
      expect(result!.getTime()).toBe(now + 24 * 60 * 60 * 1000)
    })

    it('should calculate next refresh for short intervals', () => {
      const now = Date.now()
      const projectWithRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(now),
      }

      const result = getNextRefreshTime(projectWithRefresh, 1) // 1 hour

      expect(result!.getTime()).toBe(now + 1 * 60 * 60 * 1000)
    })

    it('should calculate next refresh for long intervals', () => {
      const now = Date.now()
      const projectWithRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(now),
      }

      const result = getNextRefreshTime(projectWithRefresh, 168) // 1 week

      expect(result!.getTime()).toBe(now + 168 * 60 * 60 * 1000)
    })

    it('should handle past refresh times', () => {
      const pastTime = Date.now() - 24 * 60 * 60 * 1000 // 24 hours ago
      const projectWithRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(pastTime),
      }

      const result = getNextRefreshTime(projectWithRefresh, 24)

      expect(result!.getTime()).toBe(pastTime + 24 * 60 * 60 * 1000)
    })

    it('should return a valid Date object', () => {
      const projectWithRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(),
      }

      const result = getNextRefreshTime(projectWithRefresh, 24)

      expect(result).toBeInstanceOf(Date)
      expect(typeof result!.getTime()).toBe('number')
    })
  })

  describe('formatTimeUntilRefresh', () => {
    it('should return "Not scheduled" when nextRefresh is null', () => {
      const result = formatTimeUntilRefresh(null)
      expect(result).toBe('Not scheduled')
    })

    it('should return "Due now" when refresh time is in the past', () => {
      const pastDate = new Date(Date.now() - 1000)
      const result = formatTimeUntilRefresh(pastDate)
      expect(result).toBe('Due now')
    })

    it('should return "Due now" when refresh time is now', () => {
      const now = new Date()
      const result = formatTimeUntilRefresh(now)
      expect(result).toBe('Due now')
    })

    it('should format time in minutes for less than an hour', () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 30 minutes')
    })

    it('should use singular "minute" for 1 minute', () => {
      const futureDate = new Date(Date.now() + 1 * 60 * 1000) // 1 minute
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 1 minute')
    })

    it('should use plural "minutes" for multiple minutes', () => {
      const futureDate = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 5 minutes')
    })

    it('should format time in hours for less than a day', () => {
      const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000) // 3 hours
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 3 hours')
    })

    it('should use singular "hour" for 1 hour', () => {
      const futureDate = new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 1 hour')
    })

    it('should use plural "hours" for multiple hours', () => {
      const futureDate = new Date(Date.now() + 5 * 60 * 60 * 1000) // 5 hours
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 5 hours')
    })

    it('should format time in days for more than a day', () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 3 days')
    })

    it('should use singular "day" for 1 day', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 1 day')
    })

    it('should use plural "days" for multiple days', () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 7 days')
    })

    it('should handle boundary at 59 minutes', () => {
      const futureDate = new Date(Date.now() + 59 * 60 * 1000) // 59 minutes
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 59 minutes')
    })

    it('should handle boundary at 60 minutes (1 hour)', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 60 minutes = 1 hour
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 1 hour')
    })

    it('should handle boundary at 23 hours', () => {
      const futureDate = new Date(Date.now() + 23 * 60 * 60 * 1000) // 23 hours
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 23 hours')
    })

    it('should handle boundary at 24 hours (1 day)', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours = 1 day
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toBe('in 1 day')
    })

    it('should handle very short future times', () => {
      const futureDate = new Date(Date.now() + 100) // 100ms
      const result = formatTimeUntilRefresh(futureDate)
      // When diff is positive but less than 1 minute, it shows "in 0 minute"
      expect(result).toBe('in 0 minute')
    })

    it('should handle very long future times', () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      const result = formatTimeUntilRefresh(futureDate)
      expect(result).toMatch(/^in \d+ days/)
    })
  })

  describe('edge cases and integration', () => {
    const mockProject: Project = {
      id: 'project-1',
      name: 'Test Project',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      sbomFiles: [],
      components: [],
      vulnerabilities: [],
      statistics: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        totalComponents: 0,
        vulnerableComponents: 0,
      },
    }

    it('should handle needsRefresh with undefined project', () => {
      // The function doesn't handle undefined project, it will throw
      expect(() => needsRefresh(undefined as any, 24)).toThrow()
    })

    it('should integrate needsRefresh and getNextRefreshTime', () => {
      const projectWithRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }

      const needsRefreshResult = needsRefresh(projectWithRefresh, 24)
      const nextRefreshTime = getNextRefreshTime(projectWithRefresh, 24)

      expect(needsRefreshResult).toBe(true)
      expect(nextRefreshTime).not.toBeNull()
      expect(nextRefreshTime!.getTime()).toBeLessThan(Date.now())
    })

    it('should integrate getNextRefreshTime and formatTimeUntilRefresh', () => {
      const projectWithRefresh: Project = {
        ...mockProject,
        lastVulnDataRefresh: new Date(),
      }

      const nextRefreshTime = getNextRefreshTime(projectWithRefresh, 24)
      const formatted = formatTimeUntilRefresh(nextRefreshTime)

      expect(nextRefreshTime).not.toBeNull()
      expect(formatted).not.toBe('Not scheduled')
      expect(formatted).not.toBe('Due now')
    })
  })
})
