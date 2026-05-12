/**
 * Tests for Intelligence Enrichment Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enrichVulnerability,
  enrichVulnerabilities,
  enrichVulnerabilityMap,
  sortByRiskScore,
  filterKevOnly,
  filterHighEpss,
} from './enrichVulnerabilities'
import type { Vulnerability } from '@@/types'

// Mock electronAPI
const mockIntelligence = {
  checkKev: vi.fn(),
  getKevDetails: vi.fn(),
  getEpssScore: vi.fn(),
  getEpssScores: vi.fn(),
  getKevStats: vi.fn(),
  syncKev: vi.fn(),
}

vi.stubGlobal('window', {
  electronAPI: {
    intelligence: mockIntelligence,
  },
})

describe('enrichVulnerabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('enrichVulnerability', () => {
    it('should add KEV status when CVE is in KEV catalog', async () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        severity: 'high',
        description: 'Test vulnerability',
        references: [],
        affectedComponents: [],
      }

      mockIntelligence.checkKev.mockResolvedValue({ success: true, isKev: true })
      mockIntelligence.getKevDetails.mockResolvedValue({
        success: true,
        entry: {
          vendorProject: 'Test',
          product: 'Product',
          vulnerabilityName: 'Test Vuln',
          dateAdded: '2024-01-01',
          shortDescription: 'Test',
          requiredAction: 'Update',
          knownRansomwareUse: false,
        },
      })
      mockIntelligence.getEpssScore.mockResolvedValue({ success: false, score: null })

      const result = await enrichVulnerability(vuln)

      expect(result.isKev).toBe(true)
      expect(result.kevDetails).toBeDefined()
      expect(result.riskScore).toBeGreaterThan(0)
    })

    it('should add EPSS score when available', async () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        severity: 'high',
        description: 'Test vulnerability',
        references: [],
        affectedComponents: [],
      }

      mockIntelligence.checkKev.mockResolvedValue({ success: true, isKev: false })
      mockIntelligence.getEpssScore.mockResolvedValue({
        success: true,
        score: {
          cveId: 'CVE-2024-1234',
          score: 0.05,
          percentile: 0.75,
          fetchedAt: new Date(),
        },
      })

      const result = await enrichVulnerability(vuln)

      expect(result.epssScore).toBe(0.05)
      expect(result.epssPercentile).toBe(0.75)
    })

    it('should calculate risk score from all factors', async () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        severity: 'critical',
        description: 'Test vulnerability',
        references: [],
        affectedComponents: [],
      }

      mockIntelligence.checkKev.mockResolvedValue({ success: true, isKev: true })
      mockIntelligence.getKevDetails.mockResolvedValue({
        success: true,
        entry: { knownRansomwareUse: true },
      })
      mockIntelligence.getEpssScore.mockResolvedValue({
        success: true,
        score: { score: 0.9, percentile: 1.0, fetchedAt: new Date() }, // 100th percentile
      })

      const result = await enrichVulnerability(vuln)

      // KEV (50) + EPSS 100% (30) + Critical (20) = 100
      expect(result.riskScore).toBe(100)
      expect(result.isKev).toBe(true)
    })

    it('should preserve existing KEV status', async () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        severity: 'high',
        description: 'Test vulnerability',
        references: [],
        affectedComponents: [],
        isKev: true,
      }

      // Should not call checkKev since isKev is already set
      const result = await enrichVulnerability(vuln)

      expect(mockIntelligence.checkKev).not.toHaveBeenCalled()
      expect(result.isKev).toBe(true)
    })

    it('should handle API errors gracefully', async () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        severity: 'high',
        description: 'Test vulnerability',
        references: [],
        affectedComponents: [],
      }

      mockIntelligence.checkKev.mockRejectedValue(new Error('API Error'))
      mockIntelligence.getEpssScore.mockRejectedValue(new Error('API Error'))

      const result = await enrichVulnerability(vuln)

      // Should still return the vulnerability, just without enrichment
      expect(result.id).toBe('CVE-2024-1234')
      expect(result.isKev).toBeUndefined()
    })
  })

  describe('enrichVulnerabilities', () => {
    it('should enrich multiple vulnerabilities in batch', async () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'critical',
          description: 'Vuln 1',
          references: [],
          affectedComponents: [],
        },
        {
          id: 'CVE-2024-0002',
          source: 'nvd',
          severity: 'high',
          description: 'Vuln 2',
          references: [],
          affectedComponents: [],
        },
      ]

      mockIntelligence.checkKev.mockResolvedValue({ success: true, isKev: false })
      mockIntelligence.getEpssScores.mockResolvedValue({
        success: true,
        scores: {
          'CVE-2024-0001': { score: 0.1, percentile: 0.8, fetchedAt: new Date() },
          'CVE-2024-0002': { score: 0.05, percentile: 0.5, fetchedAt: new Date() },
        },
      })

      const results = await enrichVulnerabilities(vulns)

      expect(results).toHaveLength(2)
      expect(results[0].epssPercentile).toBe(0.8)
      expect(results[1].epssPercentile).toBe(0.5)
      // Should use batch EPSS fetch
      expect(mockIntelligence.getEpssScores).toHaveBeenCalledTimes(1)
    })

    it('should return empty array for empty input', async () => {
      const results = await enrichVulnerabilities([])
      expect(results).toHaveLength(0)
    })
  })

  describe('enrichVulnerabilityMap', () => {
    it('should enrich vulnerability map by component', async () => {
      const vulnMap = new Map<string, Vulnerability[]>()
      vulnMap.set('comp-1', [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'critical',
          description: 'Vuln',
          references: [],
          affectedComponents: [],
        },
      ])
      vulnMap.set('comp-2', [
        {
          id: 'CVE-2024-0001', // Same CVE, different component
          source: 'nvd',
          severity: 'critical',
          description: 'Vuln',
          references: [],
          affectedComponents: [],
        },
      ])

      mockIntelligence.checkKev.mockResolvedValue({ success: true, isKev: false })
      mockIntelligence.getEpssScores.mockResolvedValue({
        success: true,
        scores: {
          'CVE-2024-0001': { score: 0.1, percentile: 0.7, fetchedAt: new Date() },
        },
      })

      const result = await enrichVulnerabilityMap(vulnMap)

      expect(result.size).toBe(2)
      // Both components should have enriched vulnerability
      expect(result.get('comp-1')![0].epssPercentile).toBe(0.7)
      expect(result.get('comp-2')![0].epssPercentile).toBe(0.7)
      // Should only fetch EPSS once for the duplicate CVE
      expect(mockIntelligence.getEpssScores).toHaveBeenCalledTimes(1)
    })
  })

  describe('sortByRiskScore', () => {
    it('should sort by risk score descending', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'low',
          severity: 'low',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          riskScore: 10,
        },
        {
          id: 'high',
          severity: 'critical',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          riskScore: 90,
        },
        {
          id: 'medium',
          severity: 'medium',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          riskScore: 50,
        },
      ]

      const sorted = sortByRiskScore(vulns)

      expect(sorted[0].id).toBe('high')
      expect(sorted[1].id).toBe('medium')
      expect(sorted[2].id).toBe('low')
    })

    it('should handle missing risk scores', () => {
      const vulns: Vulnerability[] = [
        { id: 'no-score', severity: 'high', source: 'nvd', description: '', references: [], affectedComponents: [] },
        {
          id: 'with-score',
          severity: 'high',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          riskScore: 50,
        },
      ]

      const sorted = sortByRiskScore(vulns)

      expect(sorted[0].id).toBe('with-score')
      expect(sorted[1].id).toBe('no-score')
    })
  })

  describe('filterKevOnly', () => {
    it('should filter to only KEV vulnerabilities', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'kev-1',
          severity: 'high',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          isKev: true,
        },
        {
          id: 'non-kev',
          severity: 'high',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          isKev: false,
        },
        {
          id: 'kev-2',
          severity: 'critical',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          isKev: true,
        },
      ]

      const filtered = filterKevOnly(vulns)

      expect(filtered).toHaveLength(2)
      expect(filtered.every((v) => v.isKev)).toBe(true)
    })
  })

  describe('filterHighEpss', () => {
    it('should filter to high EPSS percentile (>= threshold)', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'high',
          severity: 'high',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          epssPercentile: 0.8,
        },
        {
          id: 'low',
          severity: 'high',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          epssPercentile: 0.3,
        },
        { id: 'no-epss', severity: 'high', source: 'nvd', description: '', references: [], affectedComponents: [] },
      ]

      const filtered = filterHighEpss(vulns, 0.5)

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('high')
    })

    it('should use default threshold of 0.5', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'exactly-50',
          severity: 'high',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          epssPercentile: 0.5,
        },
        {
          id: 'below-50',
          severity: 'high',
          source: 'nvd',
          description: '',
          references: [],
          affectedComponents: [],
          epssPercentile: 0.49,
        },
      ]

      const filtered = filterHighEpss(vulns)

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('exactly-50')
    })
  })
})
