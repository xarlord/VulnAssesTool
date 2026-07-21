import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  matchVulnerabilitiesForComponent,
  matchVulnerabilitiesForComponents,
  filterBySeverity,
  filterByCvssScore,
  sortBySeverity,
  getVulnerabilityStatistics,
  hasHighSeverityVulnerabilities,
} from './vulnMatcher'
import type { Component, Vulnerability, CveResult } from '@@/types'
import { VULN_SEARCH_CPE_LIMIT, VULN_SEARCH_NAME_LIMIT } from '@@/constants'
import { getPlatform } from '@/lib/platform'

// Mock the OSV module
vi.mock('./osv', () => ({
  queryByPurls: vi.fn(),
}))

import { queryByPurls } from './osv'

// Helper to create mock CVE results from local database
function createMockCveResult(vuln: Vulnerability): CveResult {
  return {
    cveId: vuln.id,
    source: vuln.source.toUpperCase() as 'NVD' | 'OSV',
    severity: vuln.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
    cvssScore: vuln.cvssScore,
    cvssVector: vuln.cvssVector || null,
    description: vuln.description,
    publishedAt: vuln.publishedAt?.toISOString() || null,
    modifiedAt: vuln.modifiedAt?.toISOString() || null,
  }
}

// Helper to get the platform's database.search mock
function mockDatabaseSearch() {
  return getPlatform().database.search
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('matchVulnerabilitiesForComponent', () => {
  const mockComponent: Component = {
    id: 'comp-1',
    name: 'lodash',
    version: '4.17.21',
    type: 'library',
    purl: 'pkg:npm/lodash@4.17.21',
    cpe: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
    licenses: ['MIT'],
    vulnerabilities: [],
  }

  const mockNvdVulns: Vulnerability[] = [
    {
      id: 'CVE-2024-1001',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      description: 'Critical vulnerability in lodash',
      references: [],
      affectedComponents: [],
    },
    {
      id: 'CVE-2024-1002',
      source: 'nvd',
      severity: 'high',
      cvssScore: 8.5,
      description: 'High severity vulnerability in lodash',
      references: [],
      affectedComponents: [],
    },
  ]

  const mockOsvVulns: Vulnerability[] = [
    {
      id: 'OSV-2024-1001',
      source: 'osv',
      severity: 'medium',
      cvssScore: 5.3,
      description: 'Medium severity vulnerability in lodash',
      references: [],
      affectedComponents: [],
    },
  ]

  it('should return vulnerabilities from both NVD (local DB) and OSV', async () => {
    // Mock local database search for NVD via platform
    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: mockNvdVulns.map(createMockCveResult),
      totalResults: mockNvdVulns.length,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map([['pkg:npm/lodash@4.17.21', mockOsvVulns]]))

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('CVE-2024-1001')
    expect(result[0].affectedComponents).toEqual(['comp-1'])
    // Verify local database was called with correct CPE and limit from constants
    expect(mockDatabaseSearch()).toHaveBeenCalledWith({
      type: 'cpe',
      query: mockComponent.cpe,
      limit: VULN_SEARCH_CPE_LIMIT,
      offset: 0,
    })
  })

  it('should handle component without CPE', async () => {
    const componentWithoutCpe: Component = {
      ...mockComponent,
      cpe: undefined,
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map([['pkg:npm/lodash@4.17.21', mockOsvVulns]]))

    const result = await matchVulnerabilitiesForComponent(componentWithoutCpe)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('OSV-2024-1001')
  })

  it('should handle component without PURL', async () => {
    const componentWithoutPurl: Component = {
      ...mockComponent,
      purl: undefined,
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: mockNvdVulns.map(createMockCveResult),
      totalResults: mockNvdVulns.length,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(componentWithoutPurl)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('CVE-2024-1001')
  })

  it('should deduplicate vulnerabilities with same ID from both sources', async () => {
    const duplicateVuln: Vulnerability = {
      id: 'CVE-2024-1001',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      description: 'Vulnerability found in both NVD and OSV',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: [createMockCveResult(duplicateVuln)],
      totalResults: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map([['pkg:npm/lodash@4.17.21', [duplicateVuln]]]))

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-1001')
  })

  it('tags CPE matches as cpe-exact in matchQuality', async () => {
    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: mockNvdVulns.map(createMockCveResult),
      totalResults: mockNvdVulns.length,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result[0].matchQuality?.['comp-1']).toBe('cpe-exact')
  })

  it('tags name-only matches for a component with neither CPE nor suggested CPEs', async () => {
    // A gap component (no CPE, no purl, no suggested CPEs) can only be matched by product name,
    // which is the dominant false-positive source — it must be tagged so the UI can hide it.
    const nameOnly: Component = { ...mockComponent, cpe: undefined, purl: undefined, suggestedCpes: undefined }
    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: mockNvdVulns.map(createMockCveResult),
      totalResults: mockNvdVulns.length,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(nameOnly)

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].matchQuality?.[nameOnly.id]).toBe('name-only')
  })

  it('should return empty array when no vulnerabilities found', async () => {
    vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toEqual([])
  })

  it('should handle local database errors gracefully', async () => {
    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: false,
      error: 'Database error',
      results: [],
      totalResults: 0,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toEqual([])
  })

  it('should handle OSV API errors gracefully', async () => {
    vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
    vi.mocked(queryByPurls).mockRejectedValue(new Error('OSV API error'))

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toEqual([])
  })

  it('should handle errors from both local database and OSV', async () => {
    vi.mocked(mockDatabaseSearch()).mockRejectedValue(new Error('Database error'))
    vi.mocked(queryByPurls).mockRejectedValue(new Error('OSV API error'))

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toEqual([])
  })
})

describe('matchVulnerabilitiesForComponents', () => {
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
  ]

  it('should match vulnerabilities for multiple components', async () => {
    const lodashVuln: Vulnerability = {
      id: 'CVE-2024-1001',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      description: 'Critical in lodash',
      references: [],
      affectedComponents: [],
    }

    const expressVuln: Vulnerability = {
      id: 'CVE-2024-1002',
      source: 'nvd',
      severity: 'high',
      cvssScore: 8.5,
      description: 'High in express',
      references: [],
      affectedComponents: [],
    }

    // Mock local database search - return different results for each CPE
    vi.mocked(mockDatabaseSearch())
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(lodashVuln)],
        totalResults: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(expressVuln)],
        totalResults: 1,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    expect(result.size).toBe(2)
    expect(result.get('comp-1')).toHaveLength(1)
    expect(result.get('comp-2')).toHaveLength(1)
  })

  it('should handle errors gracefully', async () => {
    vi.mocked(mockDatabaseSearch()).mockRejectedValue(new Error('Database error'))
    vi.mocked(queryByPurls).mockRejectedValue(new Error('API error'))

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    expect(result.size).toBe(2)
    expect(result.get('comp-1')).toEqual([])
    expect(result.get('comp-2')).toEqual([])
  })

  it('should handle OSV query error but still return local DB results', async () => {
    const vuln1: Vulnerability = {
      id: 'CVE-2024-1001',
      source: 'nvd',
      severity: 'high',
      cvssScore: 8.5,
      description: 'Test vulnerability for comp-1',
      references: [],
      affectedComponents: [],
    }

    // Return different results for each CPE
    vi.mocked(mockDatabaseSearch())
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(vuln1)],
        totalResults: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [],
        totalResults: 0,
      })

    vi.mocked(queryByPurls).mockRejectedValue(new Error('OSV error'))

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    expect(result.size).toBe(2)
    // First component still gets NVD results
    expect(result.get('comp-1')).toHaveLength(1)
    expect(result.get('comp-1')![0].id).toBe('CVE-2024-1001')
    // Second component gets empty array from NVD (no vulns) and OSV failed
    expect(result.get('comp-2')).toEqual([])
  })

  it('should associate same vulnerability with multiple components', async () => {
    // Same vulnerability affects multiple components
    const sharedVuln: Vulnerability = {
      id: 'CVE-2024-1001',
      source: 'nvd',
      severity: 'high',
      cvssScore: 8.5,
      description: 'Shared vulnerability',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch())
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(sharedVuln)],
        totalResults: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(sharedVuln)],
        totalResults: 1,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    expect(result.get('comp-1')).toHaveLength(1)
    expect(result.get('comp-2')).toHaveLength(1)
    // Both components should have the same vulnerability in their results
    expect(result.get('comp-1')![0].id).toBe('CVE-2024-1001')
    expect(result.get('comp-2')![0].id).toBe('CVE-2024-1001')
  })

  it('should handle same vulnerability from OSV for multiple components (non-platform environment)', async () => {
    // Simulate non-platform environment by making database unavailable.
    // This triggers the OSV query path in matchVulnerabilitiesForComponents.
    const platform = getPlatform()
    const originalDatabase = platform.database
    platform.database = undefined as any

    const sharedOsvVuln: Vulnerability = {
      id: 'OSV-2024-1001',
      source: 'osv',
      severity: 'high',
      cvssScore: 8.5,
      description: 'Shared OSV vulnerability',
      references: [],
      affectedComponents: [],
    }

    // Return the same vulnerability for both PURLs
    vi.mocked(queryByPurls).mockResolvedValue(
      new Map([
        ['pkg:npm/lodash@4.17.21', [sharedOsvVuln]],
        ['pkg:npm/express@4.18.0', [sharedOsvVuln]], // Same vuln for second component
      ]),
    )

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    // Both components should have the same vulnerability
    expect(result.get('comp-1')).toHaveLength(1)
    expect(result.get('comp-2')).toHaveLength(1)
    expect(result.get('comp-1')![0].id).toBe('OSV-2024-1001')
    expect(result.get('comp-2')![0].id).toBe('OSV-2024-1001')
    // The vulnerability should have both components in affectedComponents
    expect(result.get('comp-1')![0].affectedComponents).toEqual(['comp-1', 'comp-2'])

    // Restore platform database for subsequent tests
    platform.database = originalDatabase
  })

  it('should populate affectedComponents correctly', async () => {
    const vuln1: Vulnerability = {
      id: 'CVE-2024-1001',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      description: 'Critical vulnerability',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch())
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(vuln1)],
        totalResults: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [],
        totalResults: 0,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    // First component should have the vulnerability
    expect(result.get('comp-1')).toHaveLength(1)
    expect(result.get('comp-1')![0].affectedComponents).toEqual(['comp-1'])

    // Second component should not have it
    expect(result.get('comp-2')).toEqual([])
  })
})

describe('filterBySeverity', () => {
  const mockVulnerabilities: Vulnerability[] = [
    { id: '1', source: 'nvd', severity: 'critical', references: [], affectedComponents: [] },
    { id: '2', source: 'nvd', severity: 'high', references: [], affectedComponents: [] },
    { id: '3', source: 'nvd', severity: 'medium', references: [], affectedComponents: [] },
    { id: '4', source: 'nvd', severity: 'low', references: [], affectedComponents: [] },
    { id: '5', source: 'nvd', severity: 'none', references: [], affectedComponents: [] },
  ]

  it('should filter by critical severity', () => {
    const result = filterBySeverity(mockVulnerabilities, 'critical')
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('critical')
  })

  it('should filter by high severity and above', () => {
    const result = filterBySeverity(mockVulnerabilities, 'high')
    expect(result).toHaveLength(2)
    expect(result.every((v) => v.severity === 'critical' || v.severity === 'high')).toBe(true)
  })

  it('should filter by medium severity and above', () => {
    const result = filterBySeverity(mockVulnerabilities, 'medium')
    expect(result).toHaveLength(3)
  })

  it('should return all for low severity filter', () => {
    const result = filterBySeverity(mockVulnerabilities, 'low')
    expect(result).toHaveLength(4)
  })
})

describe('filterByCvssScore', () => {
  const mockVulnerabilities: Vulnerability[] = [
    { id: '1', source: 'nvd', severity: 'critical', cvssScore: 9.8, references: [], affectedComponents: [] },
    { id: '2', source: 'nvd', severity: 'high', cvssScore: 7.5, references: [], affectedComponents: [] },
    { id: '3', source: 'nvd', severity: 'medium', cvssScore: 5.3, references: [], affectedComponents: [] },
    { id: '4', source: 'nvd', severity: 'low', cvssScore: 2.5, references: [], affectedComponents: [] },
    { id: '5', source: 'nvd', severity: 'none', cvssScore: 0, references: [], affectedComponents: [] },
  ]

  it('should filter by minimum score', () => {
    const result = filterByCvssScore(mockVulnerabilities, 7.0)
    expect(result).toHaveLength(2)
    expect(result.every((v) => (v.cvssScore || 0) >= 7.0)).toBe(true)
  })

  it('should handle undefined CVSS scores as 0', () => {
    const vulnsWithUndefined: Vulnerability[] = [
      { id: '1', source: 'nvd', severity: 'none', cvssScore: undefined, references: [], affectedComponents: [] },
      { id: '2', source: 'nvd', severity: 'high', cvssScore: 8.0, references: [], affectedComponents: [] },
    ]
    const result = filterByCvssScore(vulnsWithUndefined, 5.0)
    expect(result).toHaveLength(1)
  })
})

describe('sortBySeverity', () => {
  const mockVulnerabilities: Vulnerability[] = [
    { id: '1', source: 'nvd', severity: 'low', cvssScore: 3.0, references: [], affectedComponents: [] },
    { id: '2', source: 'nvd', severity: 'critical', cvssScore: 9.8, references: [], affectedComponents: [] },
    { id: '3', source: 'nvd', severity: 'high', cvssScore: 7.5, references: [], affectedComponents: [] },
    { id: '4', source: 'nvd', severity: 'critical', cvssScore: 9.5, references: [], affectedComponents: [] },
  ]

  it('should sort by severity (most severe first)', () => {
    const result = sortBySeverity(mockVulnerabilities)

    expect(result[0].severity).toBe('critical')
    expect(result[1].severity).toBe('critical')
    expect(result[2].severity).toBe('high')
    expect(result[3].severity).toBe('low')
  })

  it('should secondary sort by CVSS score within same severity', () => {
    const result = sortBySeverity(mockVulnerabilities)

    expect(result[0].cvssScore).toBe(9.8)
    expect(result[1].cvssScore).toBe(9.5)
  })

  it('should not mutate original array', () => {
    const originalOrder = mockVulnerabilities.map((v) => v.id)
    sortBySeverity(mockVulnerabilities)
    expect(mockVulnerabilities.map((v) => v.id)).toEqual(originalOrder)
  })
})

describe('getVulnerabilityStatistics', () => {
  const mockVulnerabilities: Vulnerability[] = [
    { id: '1', source: 'nvd', severity: 'critical', references: [], affectedComponents: [] },
    { id: '2', source: 'nvd', severity: 'critical', references: [], affectedComponents: [] },
    { id: '3', source: 'nvd', severity: 'high', references: [], affectedComponents: [] },
    { id: '4', source: 'nvd', severity: 'high', references: [], affectedComponents: [] },
    { id: '5', source: 'nvd', severity: 'high', references: [], affectedComponents: [] },
    { id: '6', source: 'nvd', severity: 'medium', references: [], affectedComponents: [] },
    { id: '7', source: 'nvd', severity: 'low', references: [], affectedComponents: [] },
    { id: '8', source: 'nvd', severity: 'none', references: [], affectedComponents: [] },
  ]

  it('should calculate correct statistics', () => {
    const result = getVulnerabilityStatistics(mockVulnerabilities)

    expect(result.total).toBe(8)
    expect(result.critical).toBe(2)
    expect(result.high).toBe(3)
    expect(result.medium).toBe(1)
    expect(result.low).toBe(1)
    expect(result.none).toBe(1)
  })

  it('should handle empty array', () => {
    const result = getVulnerabilityStatistics([])

    expect(result.total).toBe(0)
    expect(result.critical).toBe(0)
    expect(result.high).toBe(0)
    expect(result.medium).toBe(0)
    expect(result.low).toBe(0)
    expect(result.none).toBe(0)
  })
})

describe('hasHighSeverityVulnerabilities', () => {
  const mockComponent: Component = {
    id: 'comp-1',
    name: 'test',
    version: '1.0.0',
    type: 'library',
    licenses: [],
    vulnerabilities: [],
  }

  const mockVulnerabilities: Vulnerability[] = [
    { id: '1', source: 'nvd', severity: 'critical', references: [], affectedComponents: ['comp-1'] },
    { id: '2', source: 'nvd', severity: 'medium', references: [], affectedComponents: ['comp-1'] },
    { id: '3', source: 'nvd', severity: 'high', references: [], affectedComponents: ['comp-2'] },
  ]

  it('should return true when component has critical vulnerabilities', () => {
    expect(hasHighSeverityVulnerabilities(mockComponent, mockVulnerabilities)).toBe(true)
  })

  it('should return true when component has high vulnerabilities', () => {
    const componentWithHigh: Component = { ...mockComponent, id: 'comp-2' }
    expect(hasHighSeverityVulnerabilities(componentWithHigh, mockVulnerabilities)).toBe(true)
  })

  it('should return false when component only has lower severity vulnerabilities', () => {
    const componentWithLow: Component = { ...mockComponent, id: 'comp-3' }
    const lowVulns: Vulnerability[] = [
      { id: '1', source: 'nvd', severity: 'medium', references: [], affectedComponents: ['comp-3'] },
    ]
    expect(hasHighSeverityVulnerabilities(componentWithLow, lowVulns)).toBe(false)
  })

  it('should return false when component has no vulnerabilities', () => {
    expect(hasHighSeverityVulnerabilities(mockComponent, [])).toBe(false)
  })
})

describe('CPE Validation', () => {
  describe('with invalid CPE formats', () => {
    it('should handle component with invalid CPE format gracefully', async () => {
      const componentWithInvalidCpe: Component = {
        id: 'comp-invalid',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        cpe: 'invalid:cpe:format',
        licenses: [],
        vulnerabilities: [],
      }

      // Mock database to return success (but it won't be called due to validation)
      vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
      vi.mocked(queryByPurls).mockResolvedValue(new Map())

      const result = await matchVulnerabilitiesForComponent(componentWithInvalidCpe)

      // Should fall back to name search since CPE is invalid
      expect(result).toEqual([])
    })

    it('should handle component with malformed CPE (missing parts)', async () => {
      const componentWithShortCpe: Component = {
        id: 'comp-short',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        cpe: 'cpe:2.3:a', // Missing vendor and product
        licenses: [],
        vulnerabilities: [],
      }

      vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
      vi.mocked(queryByPurls).mockResolvedValue(new Map())

      const result = await matchVulnerabilitiesForComponent(componentWithShortCpe)

      // Should fall back to name search
      expect(result).toEqual([])
    })

    it('should handle component with invalid CPE part type', async () => {
      const componentWithBadPart: Component = {
        id: 'comp-badpart',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        cpe: 'cpe:2.3:x:vendor:product:1.0', // 'x' is not a valid part
        licenses: [],
        vulnerabilities: [],
      }

      vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
      vi.mocked(queryByPurls).mockResolvedValue(new Map())

      const result = await matchVulnerabilitiesForComponent(componentWithBadPart)

      // Should handle gracefully
      expect(result).toEqual([])
    })
  })

  describe('with URL-encoded CPE values', () => {
    it('should handle CPE with URL-encoded characters', async () => {
      const componentWithEncodedCpe: Component = {
        id: 'comp-encoded',
        name: 'test library',
        version: '1.0.0',
        type: 'library',
        // CPE with URL-encoded space (%20) in vendor/product
        cpe: 'cpe:2.3:a:test%20vendor:test%20product:1.0:*:*:*:*:*:*:*',
        licenses: [],
        vulnerabilities: [],
      }

      const mockVuln: Vulnerability = {
        id: 'CVE-2024-TEST',
        source: 'nvd',
        severity: 'high',
        cvssScore: 7.5,
        description: 'Test vulnerability',
        references: [],
        affectedComponents: [],
      }

      vi.mocked(mockDatabaseSearch()).mockResolvedValue({
        success: true,
        results: [createMockCveResult(mockVuln)],
        totalResults: 1,
      })
      vi.mocked(queryByPurls).mockResolvedValue(new Map())

      const result = await matchVulnerabilitiesForComponent(componentWithEncodedCpe)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('CVE-2024-TEST')
    })
  })
})

describe('Search Limit Constants', () => {
  it('should use VULN_SEARCH_CPE_LIMIT constant for CPE search', async () => {
    const component: Component = {
      id: 'comp-1',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      cpe: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
      licenses: [],
      vulnerabilities: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    await matchVulnerabilitiesForComponent(component)

    expect(mockDatabaseSearch()).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: VULN_SEARCH_CPE_LIMIT,
      }),
    )
  })

  it('should use VULN_SEARCH_NAME_LIMIT constant for name search', async () => {
    const componentNoCpe: Component = {
      id: 'comp-2',
      name: 'test-product',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    await matchVulnerabilitiesForComponent(componentNoCpe)

    expect(mockDatabaseSearch()).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: VULN_SEARCH_NAME_LIMIT,
      }),
    )
  })
})

describe('matchVulnerabilitiesForComponent — Priority 2: suggestedCpes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should use high-confidence suggested CPEs when no CPE on component', async () => {
    const component: Component = {
      id: 'comp-sug1',
      name: 'lodash',
      version: '4.17.21',
      type: 'library',
      suggestedCpes: [
        {
          cpe: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
          vendor: 'lodash',
          product: 'lodash',
          confidence: 'high',
          source: 'known_mapping',
        },
        {
          cpe: 'cpe:2.3:a:other:product:*:*:*:*:*:*:*:*',
          vendor: 'other',
          product: 'product',
          confidence: 'medium',
          source: 'inferred',
        },
      ],
      licenses: ['MIT'],
      vulnerabilities: [],
    }

    const mockVuln: Vulnerability = {
      id: 'CVE-2024-SUG1',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      description: 'Found via suggested CPE',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: [createMockCveResult(mockVuln)],
      totalResults: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-SUG1')
    expect(result[0].affectedComponents).toEqual(['comp-sug1'])
  })

  it('should stop at first high-confidence CPE that returns results', async () => {
    const component: Component = {
      id: 'comp-sug2',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      suggestedCpes: [
        {
          cpe: 'cpe:2.3:a:vendor1:product1:1.0:*:*:*:*:*:*:*',
          vendor: 'vendor1',
          product: 'product1',
          confidence: 'high',
          source: 'known_mapping',
        },
        {
          cpe: 'cpe:2.3:a:vendor2:product2:1.0:*:*:*:*:*:*:*',
          vendor: 'vendor2',
          product: 'product2',
          confidence: 'high',
          source: 'inferred',
        },
      ],
      licenses: [],
      vulnerabilities: [],
    }

    const vuln1: Vulnerability = {
      id: 'CVE-2024-FIRST',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      description: 'First CPE match',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValueOnce({
      success: true,
      results: [createMockCveResult(vuln1)],
      totalResults: 1,
    })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-FIRST')
    expect(mockDatabaseSearch()).toHaveBeenCalledTimes(1)
  })

  it('should fall back to name search when no high-confidence CPEs', async () => {
    const component: Component = {
      id: 'comp-sug3',
      name: 'mylib',
      version: '1.0.0',
      type: 'library',
      suggestedCpes: [
        {
          cpe: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*:*',
          vendor: 'vendor',
          product: 'product',
          confidence: 'low',
          source: 'fallback',
        },
      ],
      licenses: [],
      vulnerabilities: [],
    }

    const nameVuln: Vulnerability = {
      id: 'CVE-2024-NAME',
      source: 'nvd',
      severity: 'medium',
      cvssScore: 5.3,
      description: 'Found by name',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: [createMockCveResult(nameVuln)],
      totalResults: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-NAME')
  })

  it('should fall back to name search when high-confidence CPE search returns empty', async () => {
    const component: Component = {
      id: 'comp-sug4',
      name: 'mylib',
      version: '1.0.0',
      type: 'library',
      suggestedCpes: [
        {
          cpe: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*:*',
          vendor: 'vendor',
          product: 'product',
          confidence: 'high',
          source: 'known_mapping',
        },
      ],
      licenses: [],
      vulnerabilities: [],
    }

    const nameVuln: Vulnerability = {
      id: 'CVE-2024-NAMEFB',
      source: 'nvd',
      severity: 'low',
      cvssScore: 2.5,
      description: 'Name fallback',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch())
      .mockResolvedValueOnce({ success: true, results: [], totalResults: 0 })
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(nameVuln)],
        totalResults: 1,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-NAMEFB')
  })

  it('should handle suggested CPE search errors gracefully', async () => {
    const component: Component = {
      id: 'comp-sug5',
      name: 'mylib',
      version: '1.0.0',
      type: 'library',
      suggestedCpes: [
        {
          cpe: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*:*',
          vendor: 'vendor',
          product: 'product',
          confidence: 'high',
          source: 'known_mapping',
        },
      ],
      licenses: [],
      vulnerabilities: [],
    }

    vi.mocked(mockDatabaseSearch())
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({ success: true, results: [], totalResults: 0 })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toEqual([])
  })
})

describe('matchVulnerabilitiesForComponent — Priority 3: name-only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should search by name when no CPE and no suggestedCpes', async () => {
    const component: Component = {
      id: 'comp-name1',
      name: 'express',
      version: '4.18.0',
      type: 'library',
      licenses: ['MIT'],
      vulnerabilities: [],
    }

    const nameVuln: Vulnerability = {
      id: 'CVE-2024-EXPR',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.8,
      description: 'Express vuln',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: [createMockCveResult(nameVuln)],
      totalResults: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-EXPR')
    expect(mockDatabaseSearch()).toHaveBeenCalledWith(expect.objectContaining({ type: 'text', query: 'express' }))
  })

  it('should return empty when component has no name, CPE, or suggestedCpes', async () => {
    const component: Component = {
      id: 'comp-empty',
      name: '',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toEqual([])
  })

  it('should handle name search database error gracefully', async () => {
    const component: Component = {
      id: 'comp-nameerr',
      name: 'testlib',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    vi.mocked(mockDatabaseSearch()).mockRejectedValue(new Error('DB down'))
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toEqual([])
  })

  it('should handle name search returning failed response', async () => {
    const component: Component = {
      id: 'comp-namefail',
      name: 'testlib',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: false,
      error: 'Query failed',
      results: [],
      totalResults: 0,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toEqual([])
  })
})

describe('matchVulnerabilitiesForComponent — CPE with no results fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fall back to name search when CPE search returns empty', async () => {
    const component: Component = {
      id: 'comp-cpefb',
      name: 'lodash',
      version: '4.17.21',
      type: 'library',
      cpe: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
      licenses: ['MIT'],
      vulnerabilities: [],
    }

    const nameVuln: Vulnerability = {
      id: 'CVE-2024-NAMEFB2',
      source: 'nvd',
      severity: 'medium',
      cvssScore: 5.5,
      description: 'Found by name after CPE empty',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch())
      .mockResolvedValueOnce({ success: true, results: [], totalResults: 0 })
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(nameVuln)],
        totalResults: 1,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-NAMEFB2')
    expect(mockDatabaseSearch()).toHaveBeenCalledTimes(2)
  })
})

describe('matchVulnerabilitiesForComponent — OSV PURL matching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should query OSV when component has PURL and platform database available', async () => {
    const component: Component = {
      id: 'comp-osv1',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      purl: 'pkg:npm/test@1.0.0',
      licenses: [],
      vulnerabilities: [],
    }

    const osvVuln: Vulnerability = {
      id: 'OSV-2024-PURL',
      source: 'osv',
      severity: 'medium',
      cvssScore: 5.0,
      description: 'OSV found',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map([['pkg:npm/test@1.0.0', [osvVuln]]]))

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('OSV-2024-PURL')
  })

  it('should handle OSV query errors gracefully', async () => {
    const component: Component = {
      id: 'comp-osverr',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      purl: 'pkg:npm/test@1.0.0',
      licenses: [],
      vulnerabilities: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({ success: true, results: [], totalResults: 0 })
    vi.mocked(queryByPurls).mockRejectedValue(new Error('OSV down'))

    const result = await matchVulnerabilitiesForComponent(component)

    expect(result).toEqual([])
  })
})

describe('matchVulnerabilitiesForComponents — Priority 2: suggestedCpes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle batch component with suggested CPEs', async () => {
    const components: Component[] = [
      {
        id: 'comp-bsug',
        name: 'mylib',
        version: '1.0.0',
        type: 'library',
        suggestedCpes: [
          {
            cpe: 'cpe:2.3:a:mylib:mylib:1.0:*:*:*:*:*:*:*',
            vendor: 'mylib',
            product: 'mylib',
            confidence: 'high',
            source: 'known_mapping',
          },
        ],
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const vuln: Vulnerability = {
      id: 'CVE-2024-BSUG',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      description: 'Batch suggested',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: [createMockCveResult(vuln)],
      totalResults: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(components)

    expect(result.get('comp-bsug')).toHaveLength(1)
    expect(result.get('comp-bsug')![0].id).toBe('CVE-2024-BSUG')
  })

  it('should handle batch component with no high-confidence CPEs falling to name', async () => {
    const components: Component[] = [
      {
        id: 'comp-bnohi',
        name: 'somelib',
        version: '2.0.0',
        type: 'library',
        suggestedCpes: [
          { cpe: 'cpe:2.3:a:x:y:*:*:*:*:*:*:*:*', vendor: 'x', product: 'y', confidence: 'medium', source: 'inferred' },
        ],
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const vuln: Vulnerability = {
      id: 'CVE-2024-BNAME',
      source: 'nvd',
      severity: 'low',
      cvssScore: 3.0,
      description: 'Batch name',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: [createMockCveResult(vuln)],
      totalResults: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(components)

    expect(result.get('comp-bnohi')).toHaveLength(1)
  })

  it('should handle batch component with only name (priority 3)', async () => {
    const components: Component[] = [
      {
        id: 'comp-bname3',
        name: 'onlyname',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const vuln: Vulnerability = {
      id: 'CVE-2024-BNAME3',
      source: 'nvd',
      severity: 'medium',
      cvssScore: 4.5,
      description: 'Batch name only',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch()).mockResolvedValue({
      success: true,
      results: [createMockCveResult(vuln)],
      totalResults: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(components)

    expect(result.get('comp-bname3')).toHaveLength(1)
    expect(result.get('comp-bname3')![0].id).toBe('CVE-2024-BNAME3')
  })

  it('should handle batch component with suggestedCpes search error', async () => {
    const components: Component[] = [
      {
        id: 'comp-bsugerr',
        name: 'errlib',
        version: '1.0.0',
        type: 'library',
        suggestedCpes: [
          {
            cpe: 'cpe:2.3:a:err:err:*:*:*:*:*:*:*:*',
            vendor: 'err',
            product: 'err',
            confidence: 'high',
            source: 'known_mapping',
          },
        ],
        licenses: [],
        vulnerabilities: [],
      },
    ]

    vi.mocked(mockDatabaseSearch())
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({ success: true, results: [], totalResults: 0 })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(components)

    expect(result.get('comp-bsugerr')).toEqual([])
  })

  it('should handle batch component name search error', async () => {
    const components: Component[] = [
      {
        id: 'comp-bnameerr',
        name: 'namelib',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    vi.mocked(mockDatabaseSearch()).mockRejectedValue(new Error('Name search error'))
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(components)

    expect(result.get('comp-bnameerr')).toEqual([])
  })

  it('should handle batch component with CPE that returns no results', async () => {
    const components: Component[] = [
      {
        id: 'comp-bcpeno',
        name: 'mylib',
        version: '1.0.0',
        type: 'library',
        cpe: 'cpe:2.3:a:mylib:mylib:1.0:*:*:*:*:*:*:*',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const nameVuln: Vulnerability = {
      id: 'CVE-2024-BCPEFB',
      source: 'nvd',
      severity: 'medium',
      cvssScore: 4.5,
      description: 'Fallback name',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(mockDatabaseSearch())
      .mockResolvedValueOnce({ success: true, results: [], totalResults: 0 })
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(nameVuln)],
        totalResults: 1,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(components)

    expect(result.get('comp-bcpeno')).toHaveLength(1)
    expect(result.get('comp-bcpeno')![0].id).toBe('CVE-2024-BCPEFB')
  })
})

describe('filterBySeverity edge cases', () => {
  it('should return empty array when no vulnerabilities meet threshold', () => {
    const vulns: Vulnerability[] = [{ id: '1', source: 'nvd', severity: 'low', references: [], affectedComponents: [] }]
    expect(filterBySeverity(vulns, 'critical')).toHaveLength(0)
  })

  it('should return all vulnerabilities for none threshold', () => {
    const vulns: Vulnerability[] = [
      { id: '1', source: 'nvd', severity: 'none', references: [], affectedComponents: [] },
      { id: '2', source: 'nvd', severity: 'low', references: [], affectedComponents: [] },
    ]
    expect(filterBySeverity(vulns, 'none')).toHaveLength(2)
  })
})

describe('sortBySeverity edge cases', () => {
  it('should sort undefined cvssScore as 0', () => {
    const vulns: Vulnerability[] = [
      { id: '1', source: 'nvd', severity: 'high', references: [], affectedComponents: [] },
      { id: '2', source: 'nvd', severity: 'high', cvssScore: 7.0, references: [], affectedComponents: [] },
    ]
    const result = sortBySeverity(vulns)
    expect(result[0].cvssScore).toBe(7.0)
    expect(result[1].cvssScore).toBeUndefined()
  })
})
