import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getVulnCache,
  resetVulnCache,
  isVulnDataStale,
  getStalenessText,
  shouldRefreshData,
  VulnerabilityDataCache,
} from './vulnCache'
import type { Vulnerability } from '@@/types'

describe('vulnCache', () => {
  let cache: VulnerabilityDataCache

  beforeEach(() => {
    // Reset the singleton before each test
    resetVulnCache()
    cache = getVulnCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetVulnCache()
  })

  describe('VulnerabilityDataCache - Initialization', () => {
    it('should create a new cache instance', () => {
      expect(cache).toBeDefined()
      expect(cache.size).toBeDefined()
      expect(cache.get).toBeDefined()
      expect(cache.set).toBeDefined()
      expect(cache.has).toBeDefined()
      expect(cache.clear).toBeDefined()
      expect(cache.clearComponent).toBeDefined()
      expect(cache.keys).toBeDefined()
      expect(cache.getStats).toBeDefined()
      expect(cache.cleanup).toBeDefined()
      expect(cache.size()).toBe(0)
    })

    it('should return singleton instance', () => {
      const instance1 = getVulnCache()
      const instance2 = getVulnCache()
      expect(instance1).toBe(instance2)
    })

    it('should reset cache instance', () => {
      const instance1 = getVulnCache()
      resetVulnCache()
      const instance2 = getVulnCache()
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('VulnerabilityDataCache - set operation', () => {
    it('should store vulnerability data in cache', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)

      expect(cache.size()).toBe(1)
    })

    it('should overwrite existing cache entry', () => {
      const vulns1: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      const vulns2: Vulnerability[] = [
        {
          id: 'CVE-2024-5678',
          source: 'nvd',
          severity: 'critical',
          description: 'Updated vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns1, 60000)
      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns2, 60000)

      expect(cache.size()).toBe(1)

      const retrieved = cache.get('pkg:npm/lodash@4.17.21', 'nvd')
      expect(retrieved).toEqual(vulns2)
    })

    it('should handle empty vulnerability array', () => {
      cache.set('pkg:npm/empty@1.0.0', 'osv', [], 60000)

      const retrieved = cache.get('pkg:npm/empty@1.0.0', 'osv')
      expect(retrieved).toEqual([])
    })

    it('should store multiple entries with different keys', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      cache.set('pkg:npm/express@4.18.2', 'nvd', vulns, 60000)
      cache.set('pkg:npm/lodash@4.17.21', 'osv', vulns, 60000)

      expect(cache.size()).toBe(3)
    })
  })

  describe('VulnerabilityDataCache - get operation', () => {
    it('should return null for non-existent key', () => {
      const result = cache.get('pkg:npm/nonexistent@1.0.0', 'nvd')
      expect(result).toBeNull()
    })

    it('should return cached data when exists and valid', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      const retrieved = cache.get('pkg:npm/lodash@4.17.21', 'nvd')

      expect(retrieved).toEqual(vulns)
    })

    it('should return null for expired cache entry', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      // Set cache with 1ms TTL
      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 1)

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const retrieved = cache.get('pkg:npm/lodash@4.17.21', 'nvd')
          expect(retrieved).toBeNull()
          expect(cache.size()).toBe(0) // Expired entry should be deleted
          resolve()
        }, 10)
      })
    })

    it('should delete expired entry when retrieved', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 1)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          cache.get('pkg:npm/lodash@4.17.21', 'nvd')
          expect(cache.size()).toBe(0)
          resolve()
        }, 10)
      })
    })

    it('should handle different sources for same purl', () => {
      const nvdVulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'NVD vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      const osvVulns: Vulnerability[] = [
        {
          id: 'CVE-2024-5678',
          source: 'osv',
          severity: 'medium',
          description: 'OSV vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', nvdVulns, 60000)
      cache.set('pkg:npm/lodash@4.17.21', 'osv', osvVulns, 60000)

      const nvdResult = cache.get('pkg:npm/lodash@4.17.21', 'nvd')
      const osvResult = cache.get('pkg:npm/lodash@4.17.21', 'osv')

      expect(nvdResult).toEqual(nvdVulns)
      expect(osvResult).toEqual(osvVulns)
      expect(nvdResult).not.toEqual(osvResult)
    })
  })

  describe('VulnerabilityDataCache - has operation', () => {
    it('should return false for non-existent key', () => {
      expect(cache.has('pkg:npm/nonexistent@1.0.0', 'nvd')).toBe(false)
    })

    it('should return true for existing valid cache entry', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      expect(cache.has('pkg:npm/lodash@4.17.21', 'nvd')).toBe(true)
    })

    it('should return false for expired cache entry', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 1)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.has('pkg:npm/lodash@4.17.21', 'nvd')).toBe(false)
          resolve()
        }, 10)
      })
    })

    it('should not delete entry when checking has', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      cache.has('pkg:npm/lodash@4.17.21', 'nvd')

      expect(cache.size()).toBe(1)
    })
  })

  describe('VulnerabilityDataCache - clear operation', () => {
    it('should clear all cache entries', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      cache.set('pkg:npm/express@4.18.2', 'nvd', vulns, 60000)

      expect(cache.size()).toBe(2)

      cache.clear()

      expect(cache.size()).toBe(0)
      expect(cache.get('pkg:npm/lodash@4.17.21', 'nvd')).toBeNull()
    })

    it('should clear metadata map', () => {
      cache.clear()
      // The clear operation clears both cache and metadata
      expect(cache.size()).toBe(0)
    })
  })

  describe('VulnerabilityDataCache - clearComponent operation', () => {
    it('should clear specific component cache entry', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      cache.set('pkg:npm/express@4.18.2', 'nvd', vulns, 60000)

      expect(cache.size()).toBe(2)

      cache.clearComponent('pkg:npm/lodash@4.17.21', 'nvd')

      expect(cache.size()).toBe(1)
      expect(cache.get('pkg:npm/lodash@4.17.21', 'nvd')).toBeNull()
      expect(cache.get('pkg:npm/express@4.18.2', 'nvd')).toEqual(vulns)
    })

    it('should handle clearing non-existent component', () => {
      expect(() => {
        cache.clearComponent('pkg:npm/nonexistent@1.0.0', 'nvd')
      }).not.toThrow()

      expect(cache.size()).toBe(0)
    })

    it('should clear only the specified source for a purl', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      cache.set('pkg:npm/lodash@4.17.21', 'osv', vulns, 60000)

      expect(cache.size()).toBe(2)

      cache.clearComponent('pkg:npm/lodash@4.17.21', 'nvd')

      expect(cache.size()).toBe(1)
      expect(cache.get('pkg:npm/lodash@4.17.21', 'nvd')).toBeNull()
      expect(cache.get('pkg:npm/lodash@4.17.21', 'osv')).toEqual(vulns)
    })
  })

  describe('VulnerabilityDataCache - size operation', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0)
    })

    it('should return correct size after adding entries', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      expect(cache.size()).toBe(1)

      cache.set('pkg:npm/express@4.18.2', 'nvd', vulns, 60000)
      expect(cache.size()).toBe(2)
    })

    it('should update size when entries expire and are retrieved', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 1)
      expect(cache.size()).toBe(1)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          cache.get('pkg:npm/lodash@4.17.21', 'nvd')
          expect(cache.size()).toBe(0)
          resolve()
        }, 10)
      })
    })
  })

  describe('VulnerabilityDataCache - cleanup operation', () => {
    it('should remove all expired entries', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/expired@1.0.0', 'nvd', vulns, 1)
      cache.set('pkg:npm/valid@1.0.0', 'nvd', vulns, 60000)

      expect(cache.size()).toBe(2)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const removed = cache.cleanup()
          expect(removed).toBe(1)
          expect(cache.size()).toBe(1)
          resolve()
        }, 10)
      })
    })

    it('should return 0 when no expired entries', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/valid@1.0.0', 'nvd', vulns, 60000)

      const removed = cache.cleanup()
      expect(removed).toBe(0)
      expect(cache.size()).toBe(1)
    })

    it('should handle empty cache', () => {
      const removed = cache.cleanup()
      expect(removed).toBe(0)
      expect(cache.size()).toBe(0)
    })

    it('should remove multiple expired entries', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/expired1@1.0.0', 'nvd', vulns, 1)
      cache.set('pkg:npm/expired2@1.0.0', 'nvd', vulns, 1)
      cache.set('pkg:npm/expired3@1.0.0', 'nvd', vulns, 1)
      cache.set('pkg:npm/valid@1.0.0', 'nvd', vulns, 60000)

      expect(cache.size()).toBe(4)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const removed = cache.cleanup()
          expect(removed).toBe(3)
          expect(cache.size()).toBe(1)
          resolve()
        }, 10)
      })
    })
  })

  describe('VulnerabilityDataCache - keys operation', () => {
    it('should return empty array for empty cache', () => {
      expect(cache.keys()).toEqual([])
    })

    it('should return all cache keys', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      cache.set('pkg:npm/express@4.18.2', 'osv', vulns, 60000)
      cache.set('pkg:npm/react@18.2.0', 'nvd', vulns, 60000)

      const keys = cache.keys()
      expect(keys).toHaveLength(3)
      expect(keys).toContain('nvd:pkg:npm/lodash@4.17.21')
      expect(keys).toContain('osv:pkg:npm/express@4.18.2')
      expect(keys).toContain('nvd:pkg:npm/react@18.2.0')
    })

    it('should reflect current cache state', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      expect(cache.keys()).toHaveLength(1)

      cache.clear()
      expect(cache.keys()).toEqual([])
    })
  })

  describe('VulnerabilityDataCache - getStats operation', () => {
    it('should return stats for empty cache', () => {
      const stats = cache.getStats()

      expect(stats.total).toBe(0)
      expect(stats.valid).toBe(0)
      expect(stats.expired).toBe(0)
      expect(stats.sizeBytes).toBe(0)
      expect(stats.sizeMB).toBe(0)
    })

    it('should return correct stats for valid entries', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns, 60000)
      cache.set('pkg:npm/express@4.18.2', 'osv', vulns, 60000)

      const stats = cache.getStats()

      expect(stats.total).toBe(2)
      expect(stats.valid).toBe(2)
      expect(stats.expired).toBe(0)
      expect(stats.sizeBytes).toBeGreaterThan(0)
      expect(stats.sizeMB).toBeGreaterThan(0)
    })

    it('should count expired entries correctly', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/expired@1.0.0', 'nvd', vulns, 1)
      cache.set('pkg:npm/valid@1.0.0', 'nvd', vulns, 60000)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const stats = cache.getStats()
          expect(stats.total).toBe(2)
          expect(stats.valid).toBe(1)
          expect(stats.expired).toBe(1)
          resolve()
        }, 10)
      })
    })

    it('should calculate size correctly for multiple entries', () => {
      const vulns1: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability 1',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      const vulns2: Vulnerability[] = [
        {
          id: 'CVE-2024-5678',
          source: 'nvd',
          severity: 'medium',
          description: 'Test vulnerability 2',
          references: [],
          affectedComponents: ['component-2'],
        },
      ]

      cache.set('pkg:npm/lodash@4.17.21', 'nvd', vulns1, 60000)
      cache.set('pkg:npm/express@4.18.2', 'nvd', vulns2, 60000)

      const stats = cache.getStats()

      expect(stats.total).toBe(2)
      expect(stats.sizeBytes).toBeGreaterThan(0)
      expect(stats.sizeMB).toBe(stats.sizeBytes / (1024 * 1024))
    })
  })

  describe('isVulnDataStale', () => {
    it('should return true when lastRefresh is undefined', () => {
      expect(isVulnDataStale(undefined, 24)).toBe(true)
    })

    it('should return false when data is fresh', () => {
      const lastRefresh = new Date()
      expect(isVulnDataStale(lastRefresh, 24)).toBe(false)
    })

    it('should return true when data is stale', () => {
      const lastRefresh = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      expect(isVulnDataStale(lastRefresh, 24)).toBe(true)
    })

    it('should handle edge case of exactly TTL hours', () => {
      const lastRefresh = new Date(Date.now() - 24 * 60 * 60 * 1000) // Exactly 24 hours ago
      // Note: The function uses > not >=, so exactly at TTL is not stale
      expect(isVulnDataStale(lastRefresh, 24)).toBe(false)
    })

    it('should work with Date string', () => {
      const lastRefresh = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() as any
      expect(isVulnDataStale(lastRefresh, 24)).toBe(true)
    })

    it('should handle different TTL values', () => {
      const lastRefresh = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago

      expect(isVulnDataStale(lastRefresh, 1)).toBe(true)
      expect(isVulnDataStale(lastRefresh, 3)).toBe(false)
    })

    it('should handle zero TTL', () => {
      const lastRefresh = new Date()
      // Zero TTL means staleness is only true if time has passed since lastRefresh
      expect(isVulnDataStale(lastRefresh, 0)).toBe(false)
    })
  })

  describe('getStalenessText', () => {
    it('should return "Never refreshed" when lastRefresh is undefined', () => {
      expect(getStalenessText(undefined, 24)).toBe('Never refreshed')
    })

    it('should return "Just now" for less than 1 minute', () => {
      const lastRefresh = new Date(Date.now() - 30 * 1000) // 30 seconds ago
      expect(getStalenessText(lastRefresh, 24)).toBe('Just now')
    })

    it('should return "X minute(s) ago" for less than 1 hour', () => {
      const lastRefresh = new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      expect(getStalenessText(lastRefresh, 24)).toBe('30 minutes ago')
    })

    it('should return singular "minute" for 1 minute', () => {
      const lastRefresh = new Date(Date.now() - 1 * 60 * 1000) // 1 minute ago
      expect(getStalenessText(lastRefresh, 24)).toBe('1 minute ago')
    })

    it('should return "X hour(s) ago" for less than 1 day', () => {
      const lastRefresh = new Date(Date.now() - 5 * 60 * 60 * 1000) // 5 hours ago
      expect(getStalenessText(lastRefresh, 24)).toBe('5 hours ago')
    })

    it('should return singular "hour" for 1 hour', () => {
      const lastRefresh = new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago
      expect(getStalenessText(lastRefresh, 24)).toBe('1 hour ago')
    })

    it('should return "X day(s) ago" for less than 7 days', () => {
      const lastRefresh = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      expect(getStalenessText(lastRefresh, 24)).toBe('3 days ago')
    })

    it('should return singular "day" for 1 day', () => {
      const lastRefresh = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      expect(getStalenessText(lastRefresh, 24)).toBe('1 day ago')
    })

    it('should return localized date string for 7+ days', () => {
      const lastRefresh = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      const result = getStalenessText(lastRefresh, 24)
      expect(result).toBe(lastRefresh.toLocaleDateString())
    })

    it('should handle Date string input', () => {
      const lastRefresh = new Date(Date.now() - 30 * 1000).toISOString() as any
      expect(getStalenessText(lastRefresh, 24)).toBe('Just now')
    })

    it('should handle boundary at 59 minutes', () => {
      const lastRefresh = new Date(Date.now() - 59 * 60 * 1000) // 59 minutes ago
      expect(getStalenessText(lastRefresh, 24)).toBe('59 minutes ago')
    })

    it('should handle boundary at 60 minutes (1 hour)', () => {
      const lastRefresh = new Date(Date.now() - 60 * 60 * 1000) // 60 minutes ago
      expect(getStalenessText(lastRefresh, 24)).toBe('1 hour ago')
    })

    it('should handle boundary at 23 hours', () => {
      const lastRefresh = new Date(Date.now() - 23 * 60 * 60 * 1000) // 23 hours ago
      expect(getStalenessText(lastRefresh, 24)).toBe('23 hours ago')
    })

    it('should handle boundary at 24 hours (1 day)', () => {
      const lastRefresh = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
      expect(getStalenessText(lastRefresh, 24)).toBe('1 day ago')
    })

    it('should handle boundary at 6 days', () => {
      const lastRefresh = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // 6 days ago
      expect(getStalenessText(lastRefresh, 24)).toBe('6 days ago')
    })

    it('should handle boundary at 7 days', () => {
      const lastRefresh = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      const result = getStalenessText(lastRefresh, 24)
      expect(result).toBe(lastRefresh.toLocaleDateString())
    })
  })

  describe('shouldRefreshData', () => {
    it('should return false when lastRefresh is undefined', () => {
      expect(shouldRefreshData(undefined, true, 24)).toBe(false)
    })

    it('should return false when autoRefreshEnabled is false', () => {
      const lastRefresh = new Date(Date.now() - 25 * 60 * 60 * 1000)
      expect(shouldRefreshData(lastRefresh, false, 24)).toBe(false)
    })

    it('should return true when data needs refresh', () => {
      const lastRefresh = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      expect(shouldRefreshData(lastRefresh, true, 24)).toBe(true)
    })

    it('should return false when data is fresh', () => {
      const lastRefresh = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      expect(shouldRefreshData(lastRefresh, true, 24)).toBe(false)
    })

    it('should handle edge case of exactly interval hours', () => {
      const lastRefresh = new Date(Date.now() - 24 * 60 * 60 * 1000) // Exactly 24 hours ago
      // Note: The function uses > not >=, so exactly at interval is not stale
      expect(shouldRefreshData(lastRefresh, true, 24)).toBe(false)
    })

    it('should work with Date string', () => {
      const lastRefresh = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() as any
      expect(shouldRefreshData(lastRefresh, true, 24)).toBe(true)
    })

    it('should handle different interval values', () => {
      const lastRefresh = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago

      expect(shouldRefreshData(lastRefresh, true, 1)).toBe(true)
      expect(shouldRefreshData(lastRefresh, true, 3)).toBe(false)
    })

    it('should handle zero interval', () => {
      const lastRefresh = new Date()
      // Zero interval means refresh is only needed if time has passed since lastRefresh
      expect(shouldRefreshData(lastRefresh, true, 0)).toBe(false)
    })

    it('should return false when both lastRefresh and autoRefresh are undefined/null', () => {
      expect(shouldRefreshData(undefined, false, 24)).toBe(false)
    })

    it('should handle very large interval values', () => {
      const lastRefresh = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      expect(shouldRefreshData(lastRefresh, true, 1000)).toBe(false)
    })
  })

  describe('Integration tests', () => {
    it('should handle complex workflow with multiple operations', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      // Set entries
      cache.set('pkg:npm/pkg1@1.0.0', 'nvd', vulns, 60000)
      cache.set('pkg:npm/pkg2@1.0.0', 'nvd', vulns, 60000)
      cache.set('pkg:npm/pkg3@1.0.0', 'osv', vulns, 60000)

      expect(cache.size()).toBe(3)
      expect(cache.keys()).toHaveLength(3)

      // Check has
      expect(cache.has('pkg:npm/pkg1@1.0.0', 'nvd')).toBe(true)
      expect(cache.has('pkg:npm/pkg1@1.0.0', 'osv')).toBe(false)

      // Get entries
      const retrieved = cache.get('pkg:npm/pkg1@1.0.0', 'nvd')
      expect(retrieved).toEqual(vulns)

      // Get stats
      const stats = cache.getStats()
      expect(stats.total).toBe(3)
      expect(stats.valid).toBe(3)

      // Clear one component
      cache.clearComponent('pkg:npm/pkg1@1.0.0', 'nvd')
      expect(cache.size()).toBe(2)

      // Clear all
      cache.clear()
      expect(cache.size()).toBe(0)
    })

    it('should handle multiple sources for same package correctly', () => {
      const nvdVulns: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'critical',
          description: 'NVD vuln',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      const osvVulns: Vulnerability[] = [
        {
          id: 'CVE-2024-0002',
          source: 'osv',
          severity: 'high',
          description: 'OSV vuln',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      const purl = 'pkg:npm/test@1.0.0'

      cache.set(purl, 'nvd', nvdVulns, 60000)
      cache.set(purl, 'osv', osvVulns, 60000)

      // Both should coexist
      expect(cache.size()).toBe(2)
      expect(cache.get(purl, 'nvd')).toEqual(nvdVulns)
      expect(cache.get(purl, 'osv')).toEqual(osvVulns)

      // Both should be present in keys
      const keys = cache.keys()
      expect(keys).toContain('nvd:' + purl)
      expect(keys).toContain('osv:' + purl)

      // Clear one should not affect the other
      cache.clearComponent(purl, 'nvd')
      expect(cache.size()).toBe(1)
      expect(cache.get(purl, 'nvd')).toBeNull()
      expect(cache.get(purl, 'osv')).toEqual(osvVulns)
    })

    it('should work correctly with cleanup and getStats combination', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      // Add mix of valid and expired entries
      cache.set('pkg:npm/expired1@1.0.0', 'nvd', vulns, 1)
      cache.set('pkg:npm/expired2@1.0.0', 'nvd', vulns, 1)
      cache.set('pkg:npm/valid1@1.0.0', 'nvd', vulns, 60000)
      cache.set('pkg:npm/valid2@1.0.0', 'nvd', vulns, 60000)

      // Check stats before expiration
      let stats = cache.getStats()
      expect(stats.total).toBe(4)
      expect(stats.valid).toBe(4)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Check stats after expiration
          stats = cache.getStats()
          expect(stats.total).toBe(4)
          expect(stats.valid).toBe(2)
          expect(stats.expired).toBe(2)

          // Run cleanup
          const removed = cache.cleanup()
          expect(removed).toBe(2)

          // Check stats after cleanup
          stats = cache.getStats()
          expect(stats.total).toBe(2)
          expect(stats.valid).toBe(2)
          expect(stats.expired).toBe(0)

          resolve()
        }, 10)
      })
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle very long purls', () => {
      const longPurl = 'pkg:npm/' + 'a'.repeat(1000) + '@1.0.0'
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      expect(() => {
        cache.set(longPurl, 'nvd', vulns, 60000)
        cache.get(longPurl, 'nvd')
      }).not.toThrow()
    })

    it('should handle special characters in purl', () => {
      const specialPurl = 'pkg:npm/test@1.0.0?foo=bar&baz=qux#fragment'
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set(specialPurl, 'nvd', vulns, 60000)
      expect(cache.get(specialPurl, 'nvd')).toEqual(vulns)
    })

    it('should handle empty purl', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('', 'nvd', vulns, 60000)
      expect(cache.get('', 'nvd')).toEqual(vulns)
    })

    it('should handle empty source', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/test@1.0.0', '', vulns, 60000)
      expect(cache.get('pkg:npm/test@1.0.0', '')).toEqual(vulns)
    })

    it('should handle very large vulnerability arrays', () => {
      const largeVulnList: Vulnerability[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `CVE-2024-${String(i).padStart(4, '0')}`,
        source: 'nvd' as const,
        severity: ['low', 'medium', 'high', 'critical'][i % 4] as any,
        description: `Test vulnerability ${i}`,
        references: [],
        affectedComponents: [`component-${i}`],
      }))

      cache.set('pkg:npm/large@1.0.0', 'nvd', largeVulnList, 60000)
      const retrieved = cache.get('pkg:npm/large@1.0.0', 'nvd')

      expect(retrieved).toHaveLength(1000)
      expect(retrieved).toEqual(largeVulnList)
    })

    it('should handle very small TTL values', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      cache.set('pkg:npm/test@1.0.0', 'nvd', vulns, 0)

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.get('pkg:npm/test@1.0.0', 'nvd')).toBeNull()
          resolve()
        }, 5)
      })
    })

    it('should handle very large TTL values', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      const largeTTL = 365 * 24 * 60 * 60 * 1000 // 1 year
      cache.set('pkg:npm/test@1.0.0', 'nvd', vulns, largeTTL)

      expect(cache.get('pkg:npm/test@1.0.0', 'nvd')).toEqual(vulns)
      expect(cache.has('pkg:npm/test@1.0.0', 'nvd')).toBe(true)
    })

    it('should handle vulnerability with all optional fields', () => {
      const fullVuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        sources: ['nvd', 'osv'],
        severity: 'critical',
        cvssScore: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        cwes: ['CWE-79', 'CWE-89'],
        description: 'Full vulnerability',
        references: [{ source: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234' }],
        affectedComponents: ['component-1', 'component-2'],
        publishedAt: new Date('2024-01-01'),
        modifiedAt: new Date('2024-01-15'),
        patchInfo: {
          fixedVersions: ['2.0.0', '2.1.0'],
          patchLinks: [],
          remediationAdvice: {
            priority: 'immediate',
            category: 'upgrade',
            steps: [{ step: 1, action: 'Upgrade', description: 'Upgrade now' }],
          },
          affectedVersionRanges: [],
          patchAvailability: 'available',
        },
        exploitStatus: 'exploited',
        patchedVersions: ['2.0.0', '2.1.0'],
        aliases: ['CVE-2024-1234', 'GHSA-1234-5678-9012'],
      }

      cache.set('pkg:npm/test@1.0.0', 'nvd', [fullVuln], 60000)
      const retrieved = cache.get('pkg:npm/test@1.0.0', 'nvd')

      expect(retrieved).toEqual([fullVuln])
    })

    it('should handle rapid set and get operations', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd',
          severity: 'high',
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['component-1'],
        },
      ]

      // Rapid operations
      for (let i = 0; i < 100; i++) {
        cache.set(`pkg:npm/test${i}@1.0.0`, 'nvd', vulns, 60000)
      }

      expect(cache.size()).toBe(100)

      for (let i = 0; i < 100; i++) {
        expect(cache.get(`pkg:npm/test${i}@1.0.0`, 'nvd')).toEqual(vulns)
      }
    })
  })
})
