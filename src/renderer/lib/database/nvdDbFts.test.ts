/**
 * NVD Database FTS Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
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
import { getPlatform } from '@/lib/platform'

describe('nvdDbFts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('searchFts', () => {
    it('should return error when platform API is unavailable', async () => {
      const platform = getPlatform()
      const originalSearchFts = platform.database.searchFts
      // Temporarily remove searchFts to simulate unavailable API
      platform.database.searchFts = undefined as any

      const result = await searchFts({ query: 'test' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not available')

      platform.database.searchFts = originalSearchFts
    })

    it('should search FTS successfully', async () => {
      // Mock platform to return IPC-format results that the source transforms
      vi.mocked(getPlatform().database.searchFts).mockResolvedValue({
        success: true,
        results: [
          {
            cveId: 'CVE-2024-1234',
            description: 'Test vulnerability',
            severity: 'HIGH',
            score: 0.5,
          },
        ],
      })

      const result = await searchFts({ query: 'test', limit: 10 })

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].id).toBe('CVE-2024-1234')
      expect(result.results[0].description).toBe('Test vulnerability')
      expect(result.results[0].severity).toBe('HIGH')
      expect(result.results[0].rank).toBe(0.5)
      expect(result.results[0].source).toBe('nvd')
      expect(result.total).toBe(1)
    })

    it('should handle search errors', async () => {
      vi.mocked(getPlatform().database.searchFts).mockRejectedValue(new Error('Search failed'))

      const result = await searchFts({ query: 'test' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Search failed')
    })
  })

  describe('getFtsStats', () => {
    it('should return FTS statistics', async () => {
      vi.mocked(getPlatform().database.getFtsStats).mockResolvedValue({
        success: true,
        stats: {
          indexedTerms: 1000,
          totalDocuments: 1200,
        },
      })

      const result = await getFtsStats()

      expect(result.success).toBe(true)
      expect(result.stats).toEqual({
        indexedCount: 1000,
        totalCount: 1200,
        coveragePercent: 83,
      })
    })

    it('should handle stats errors', async () => {
      vi.mocked(getPlatform().database.getFtsStats).mockRejectedValue(new Error('Stats failed'))

      const result = await getFtsStats()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Stats failed')
    })
  })

  describe('isFtsAvailable', () => {
    it('should return true when stats are available', async () => {
      vi.mocked(getPlatform().database.getFtsStats).mockResolvedValue({
        success: true,
        stats: {
          indexedTerms: 100,
          totalDocuments: 100,
        },
      })

      const available = await isFtsAvailable()

      expect(available).toBe(true)
    })

    it('should return false when stats fail', async () => {
      vi.mocked(getPlatform().database.getFtsStats).mockRejectedValue(new Error('Not available'))

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
