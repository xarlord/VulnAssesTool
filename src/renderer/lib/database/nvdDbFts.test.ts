/**
 * NVD Database FTS Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  searchFts,
  getFtsStats,
  isFtsAvailable,
  buildFtsQuery,
  shouldUseFts,
  formatRank,
  type FtsSearchRequest,
  type FtsSearchResult,
} from './nvdDbFts'

// Mock window.electronAPI
const mockElectronAPI = {
  database: {
    searchFts: vi.fn(),
    getFtsStats: vi.fn(),
  },
}

describe('nvdDbFts', () => {
  beforeEach(() => {
    // Setup mock
    global.window = {
      electronAPI: mockElectronAPI,
    } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('searchFts', () => {
    it('should return error when Electron API is unavailable', async () => {
      // @ts-expect-error - remove electronAPI for test
      delete (global.window as any).electronAPI

      const result = await searchFts({ query: 'test' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not available')
    })

    it('should search FTS successfully', async () => {
      const mockResults: FtsSearchResult[] = [
        {
          id: 'CVE-2024-1234',
          description: 'Test vulnerability',
          severity: 'HIGH',
          cvssScore: 7.5,
          cvssVector: 'CVSS:3.1/AV:N/...',
          publishedAt: '2024-01-01T00:00:00Z',
          modifiedAt: '2024-01-02T00:00:00Z',
          source: 'nvd',
          rank: 0.5,
        },
      ]

      mockElectronAPI.database.searchFts.mockResolvedValue({
        success: true,
        results: mockResults,
        total: mockResults.length,
      })

      const result = await searchFts({ query: 'test', limit: 10 })

      expect(result.success).toBe(true)
      expect(result.results).toEqual(mockResults)
      expect(result.total).toBe(mockResults.length)
    })

    it('should handle search errors', async () => {
      mockElectronAPI.database.searchFts.mockRejectedValue(new Error('Search failed'))

      const result = await searchFts({ query: 'test' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Search failed')
    })
  })

  describe('getFtsStats', () => {
    it('should return FTS statistics', async () => {
      const mockStats = {
        indexedCount: 1000,
        totalCount: 1200,
        coveragePercent: 83.33,
      }

      mockElectronAPI.database.getFtsStats.mockResolvedValue({
        success: true,
        stats: mockStats,
      })

      const result = await getFtsStats()

      expect(result.success).toBe(true)
      expect(result.stats).toEqual(mockStats)
    })

    it('should handle stats errors', async () => {
      mockElectronAPI.database.getFtsStats.mockRejectedValue(new Error('Stats failed'))

      const result = await getFtsStats()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Stats failed')
    })
  })

  describe('isFtsAvailable', () => {
    it('should return true when stats are available', async () => {
      mockElectronAPI.database.getFtsStats.mockResolvedValue({
        success: true,
        stats: {
          indexedCount: 100,
          totalCount: 100,
          coveragePercent: 100,
        },
      })

      const available = await isFtsAvailable()

      expect(available).toBe(true)
    })

    it('should return false when stats fail', async () => {
      mockElectronAPI.database.getFtsStats.mockRejectedValue(new Error('Not available'))

      const available = await isFtsAvailable()

      expect(available).toBe(false)
    })
  })

  describe('buildFtsQuery', () => {
    it('should return empty string for empty input', () => {
      expect(buildFtsQuery('')).toBe('')
    })

    it('should handle CVE ID format', () => {
      const query = buildFtsQuery('CVE-2024-1234')
      expect(query).toBe('CVE-2024-1234')
    })

    it('should handle simple text search', () => {
      const query = buildFtsQuery('sql injection')
      expect(query).toBe('sql injection')
    })

    it('should trim whitespace', () => {
      const query = buildFtsQuery('  sql injection  ')
      expect(query).toBe('sql injection')
    })
  })

  describe('shouldUseFts', () => {
    it('should return false for empty query', () => {
      expect(shouldUseFts('')).toBe(false)
    })

    it('should return false for CVE ID', () => {
      expect(shouldUseFts('CVE-2024-1234')).toBe(false)
    })

    it('should return true for text search', () => {
      expect(shouldUseFts('buffer overflow')).toBe(true)
      expect(shouldUseFts('sql')).toBe(true)
    })
  })

  describe('formatRank', () => {
    it('should format rank correctly', () => {
      expect(formatRank(0.5)).toBe('Very Relevant')
      expect(formatRank(1.5)).toBe('Relevant')
      expect(formatRank(2.5)).toBe('Somewhat Relevant')
      expect(formatRank(5)).toBe('Less Relevant')
      expect(formatRank(10)).toBe('Less Relevant')
    })
  })
})
