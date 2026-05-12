import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
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

// Store original window reference for proper cleanup
const originalWindow = (globalThis as any).window

// Mock window.electronAPI for local database access
const mockDatabaseSearch = vi.fn()

/**
 * Helper to set up the Electron API mock
 * This ensures consistent mock state across tests
 */
function setupElectronMock() {
  ;(globalThis as any).window = {
    electronAPI: {
      database: {
        search: mockDatabaseSearch,
      },
    },
  }
}

/**
 * Helper to clean up the Electron API mock
 * Restores global state to prevent test leakage
 */
function cleanupElectronMock() {
  if (originalWindow !== undefined) {
    ;(globalThis as any).window = originalWindow
  } else {
    delete (globalThis as any).window
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupElectronMock()
})

afterEach(() => {
  vi.clearAllMocks()
  cleanupElectronMock()
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
    // Mock local database search for NVD
    mockDatabaseSearch.mockResolvedValue({
      success: true,
      results: mockNvdVulns.map(createMockCveResult),
      total: mockNvdVulns.length,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map([['pkg:npm/lodash@4.17.21', mockOsvVulns]]))

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('CVE-2024-1001')
    expect(result[0].affectedComponents).toEqual(['comp-1'])
    // Verify local database was called with correct CPE and limit from constants
    expect(mockDatabaseSearch).toHaveBeenCalledWith({
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

    mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
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

    mockDatabaseSearch.mockResolvedValue({
      success: true,
      results: mockNvdVulns.map(createMockCveResult),
      total: mockNvdVulns.length,
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

    mockDatabaseSearch.mockResolvedValue({
      success: true,
      results: [createMockCveResult(duplicateVuln)],
      total: 1,
    })
    vi.mocked(queryByPurls).mockResolvedValue(new Map([['pkg:npm/lodash@4.17.21', [duplicateVuln]]]))

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-1001')
  })

  it('should return empty array when no vulnerabilities found', async () => {
    mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toEqual([])
  })

  it('should handle local database errors gracefully', async () => {
    mockDatabaseSearch.mockResolvedValue({ success: false, error: 'Database error', results: [], total: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toEqual([])
  })

  it('should handle OSV API errors gracefully', async () => {
    mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
    vi.mocked(queryByPurls).mockRejectedValue(new Error('OSV API error'))

    const result = await matchVulnerabilitiesForComponent(mockComponent)

    expect(result).toEqual([])
  })

  it('should handle errors from both local database and OSV', async () => {
    mockDatabaseSearch.mockRejectedValue(new Error('Database error'))
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
    mockDatabaseSearch
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(lodashVuln)],
        total: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(expressVuln)],
        total: 1,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    expect(result.size).toBe(2)
    expect(result.get('comp-1')).toHaveLength(1)
    expect(result.get('comp-2')).toHaveLength(1)
  })

  it('should handle errors gracefully', async () => {
    mockDatabaseSearch.mockRejectedValue(new Error('Database error'))
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
    mockDatabaseSearch
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(vuln1)],
        total: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [],
        total: 0,
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

    mockDatabaseSearch
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(sharedVuln)],
        total: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(sharedVuln)],
        total: 1,
      })

    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    const result = await matchVulnerabilitiesForComponents(mockComponents)

    expect(result.get('comp-1')).toHaveLength(1)
    expect(result.get('comp-2')).toHaveLength(1)
    // Both components should have the same vulnerability in their results
    expect(result.get('comp-1')![0].id).toBe('CVE-2024-1001')
    expect(result.get('comp-2')![0].id).toBe('CVE-2024-1001')
  })

  it('should handle same vulnerability from OSV for multiple components (non-Electron environment)', async () => {
    // Note: OSV is only queried when Electron API is NOT available (to avoid CORS)
    // This test simulates a non-Electron environment by removing the Electron mock

    // Clean up Electron mock to simulate non-Electron environment
    // Set window to undefined to simulate non-browser/non-Electron context
    ;(globalThis as any).window = undefined

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

    // Note: afterEach will restore the Electron mock for subsequent tests
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

    mockDatabaseSearch
      .mockResolvedValueOnce({
        success: true,
        results: [createMockCveResult(vuln1)],
        total: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [],
        total: 0,
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
      mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
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

      mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
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

      mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
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

      mockDatabaseSearch.mockResolvedValue({
        success: true,
        results: [createMockCveResult(mockVuln)],
        total: 1,
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

    mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    await matchVulnerabilitiesForComponent(component)

    expect(mockDatabaseSearch).toHaveBeenCalledWith(
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

    mockDatabaseSearch.mockResolvedValue({ success: true, results: [], total: 0 })
    vi.mocked(queryByPurls).mockResolvedValue(new Map())

    await matchVulnerabilitiesForComponent(componentNoCpe)

    expect(mockDatabaseSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: VULN_SEARCH_NAME_LIMIT,
      }),
    )
  })
})
