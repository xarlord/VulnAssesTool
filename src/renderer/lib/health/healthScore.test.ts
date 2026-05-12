import { describe, it, expect } from 'vitest'
import { calculateComponentHealth, calculateProjectHealth, getHealthColor, getHealthChartColor } from './healthScore'
import type { Component, Vulnerability } from '@@/types'

describe('calculateComponentHealth', () => {
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

  it('should return perfect score for component with no vulnerabilities', () => {
    const result = calculateComponentHealth(mockComponent, [])

    expect(result.score).toBe(100)
    expect(result.category).toBe('excellent')
    expect(result.factors.vulnerabilityScore).toBe(0)
    expect(result.factors.ageScore).toBe(0)
    expect(result.factors.patchScore).toBe(0)
    expect(result.factors.versionScore).toBe(0)
    expect(result.trend).toBe('unknown')
  })

  it('should calculate vulnerability score correctly for critical vulnerabilities', () => {
    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.8,
        description: 'Critical vulnerability',
        references: [],
        affectedComponents: [],
      },
      {
        id: 'CVE-2024-1002',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.5,
        description: 'Another critical vulnerability',
        references: [],
        affectedComponents: [],
      },
    ]

    const result = calculateComponentHealth(mockComponent, vulnerabilities)

    expect(result.factors.vulnerabilityScore).toBe(30) // 2 * 15
    expect(result.score).toBe(60) // 100 - 30 (vuln) - 10 (patch, no patch info)
    expect(result.category).toBe('fair') // 60 is in fair range (50-74)
  })

  it('should calculate vulnerability score correctly for high vulnerabilities', () => {
    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'High vulnerability',
        references: [],
        affectedComponents: [],
      },
      {
        id: 'CVE-2024-1002',
        source: 'nvd',
        severity: 'high',
        cvssScore: 7.5,
        description: 'Another high vulnerability',
        references: [],
        affectedComponents: [],
      },
      {
        id: 'CVE-2024-1003',
        source: 'nvd',
        severity: 'high',
        cvssScore: 7.0,
        description: 'Third high vulnerability',
        references: [],
        affectedComponents: [],
      },
    ]

    const result = calculateComponentHealth(mockComponent, vulnerabilities)

    expect(result.factors.vulnerabilityScore).toBe(30) // 3 * 10
    expect(result.score).toBe(60) // 100 - 30 (vuln) - 10 (patch, no patch info)
    expect(result.category).toBe('fair') // 60 is in fair range (50-74)
  })

  it('should calculate vulnerability score correctly for mixed severities', () => {
    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.8,
        description: 'Critical vulnerability',
        references: [],
        affectedComponents: [],
      },
      {
        id: 'CVE-2024-1002',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'High vulnerability',
        references: [],
        affectedComponents: [],
      },
      {
        id: 'CVE-2024-1003',
        source: 'nvd',
        severity: 'medium',
        cvssScore: 5.3,
        description: 'Medium vulnerability',
        references: [],
        affectedComponents: [],
      },
      {
        id: 'CVE-2024-1004',
        source: 'nvd',
        severity: 'low',
        cvssScore: 2.5,
        description: 'Low vulnerability',
        references: [],
        affectedComponents: [],
      },
    ]

    const result = calculateComponentHealth(mockComponent, vulnerabilities)

    expect(result.factors.vulnerabilityScore).toBe(32) // 15 + 10 + 5 + 2
    expect(result.score).toBe(58) // Actually need to account for patch score being calculated
    expect(result.category).toBe('fair') // 58 is in fair range (50-74)
  })

  it('should cap vulnerability score at 40', () => {
    const vulnerabilities: Vulnerability[] = Array(5)
      .fill(null)
      .map((_, i) => ({
        id: `CVE-2024-${1000 + i}`,
        source: 'nvd' as const,
        severity: 'critical' as const,
        cvssScore: 9.8,
        description: 'Critical vulnerability',
        references: [],
        affectedComponents: [],
      }))

    const result = calculateComponentHealth(mockComponent, vulnerabilities)

    expect(result.factors.vulnerabilityScore).toBe(40) // Capped at 40, not 75
    expect(result.score).toBe(50) // 100 - 40 (vuln) - 10 (patch, since no patch info)
  })

  it('should calculate age score based on oldest vulnerability', () => {
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000

    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'Recent vulnerability',
        references: [],
        affectedComponents: [],
        publishedAt: new Date(now - 10 * dayInMs).toISOString(), // 10 days ago
      },
      {
        id: 'CVE-2024-1002',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'Old vulnerability',
        references: [],
        affectedComponents: [],
        publishedAt: new Date(now - 100 * dayInMs).toISOString(), // 100 days ago
      },
    ]

    const result = calculateComponentHealth(mockComponent, vulnerabilities)

    expect(result.factors.ageScore).toBe(10) // Based on 100-day-old vuln
  })

  it('should return age score of 0 for vulnerabilities less than 30 days old', () => {
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000

    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'Recent vulnerability',
        references: [],
        affectedComponents: [],
        publishedAt: new Date(now - 15 * dayInMs).toISOString(), // 15 days ago
      },
    ]

    const result = calculateComponentHealth(mockComponent, vulnerabilities)

    expect(result.factors.ageScore).toBe(0)
  })

  it('should calculate patch score when patch is available', () => {
    const componentWithPatch: Component = {
      ...mockComponent,
      patchInfo: {
        hasFixAvailable: true,
        recommendedVersion: '4.17.22',
        fixedVersions: ['4.17.22'],
        vulnerableVersions: ['4.17.21'],
      },
    }

    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'High vulnerability',
        references: [],
        affectedComponents: [],
        patchInfo: {
          fixedVersions: ['4.17.22'],
          patchLinks: [],
          remediationAdvice: {
            priority: 'high',
            category: 'upgrade',
            steps: [],
          },
          affectedVersionRanges: [],
          patchAvailability: 'available',
        },
      },
    ]

    const result = calculateComponentHealth(componentWithPatch, vulnerabilities)

    expect(result.factors.patchScore).toBe(5) // Patch available
  })

  it('should calculate patch score when no patch is available', () => {
    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2024-1001',
        source: 'nvd',
        severity: 'high',
        cvssScore: 8.5,
        description: 'High vulnerability',
        references: [],
        affectedComponents: [],
        patchInfo: {
          fixedVersions: [],
          patchLinks: [],
          remediationAdvice: {
            priority: 'high',
            category: 'mitigation',
            steps: [],
          },
          affectedVersionRanges: [],
          patchAvailability: 'none',
        },
      },
    ]

    const result = calculateComponentHealth(mockComponent, vulnerabilities)

    expect(result.factors.patchScore).toBe(15) // No patch available
  })

  it('should calculate version score based on recommended version', () => {
    const componentWithPatchInfo: Component = {
      ...mockComponent,
      version: '4.17.21',
      patchInfo: {
        hasFixAvailable: true,
        recommendedVersion: '4.20.0',
        fixedVersions: ['4.20.0'],
        vulnerableVersions: ['4.17.21'],
      },
    }

    const result = calculateComponentHealth(componentWithPatchInfo, [])

    expect(result.factors.versionScore).toBe(10) // 3 versions behind (20 - 17 = 3)
  })

  it('should return correct health category based on score', () => {
    const excellentComponent = { ...mockComponent, id: 'excellent' }
    const goodComponent = { ...mockComponent, id: 'good' }
    const fairComponent = { ...mockComponent, id: 'fair' }
    const poorComponent = { ...mockComponent, id: 'poor' }
    const criticalComponent = { ...mockComponent, id: 'critical' }

    // Create vulnerabilities to achieve different scores
    const criticalVulns: Vulnerability[] = Array(3)
      .fill(null)
      .map((_, i) => ({
        id: `CVE-2024-${1000 + i}`,
        source: 'nvd' as const,
        severity: 'critical' as const,
        cvssScore: 9.8,
        description: 'Critical vulnerability',
        references: [],
        affectedComponents: [],
      }))

    const excellentResult = calculateComponentHealth(excellentComponent, [])
    const goodResult = calculateComponentHealth(goodComponent, [])
    const fairResult = calculateComponentHealth(fairComponent, criticalVulns.slice(0, 1))
    const poorResult = calculateComponentHealth(poorComponent, criticalVulns.slice(0, 2))
    const criticalResult = calculateComponentHealth(criticalComponent, criticalVulns)

    expect(excellentResult.category).toBe('excellent')
    expect(excellentResult.score).toBeGreaterThanOrEqual(90)

    expect(goodResult.category).toBe('excellent') // No vulns = 100 = excellent

    expect(fairResult.category).toBe('good') // 1 critical = 85 - 10 (patch) = 75, which is good range (75-89)

    expect(poorResult.category).toBe('fair') // 2 critical = 70 - 10 (patch) = 60, in fair range (50-74)

    expect(criticalResult.category).toBe('fair') // 3 critical = 50 (40 capped + 10 patch), in fair range (50-74)
  })

  it('should set trend to unknown by default', () => {
    const result = calculateComponentHealth(mockComponent, [])

    expect(result.trend).toBe('unknown')
  })

  it('should include componentId in result', () => {
    const result = calculateComponentHealth(mockComponent, [])

    expect(result.componentId).toBe('comp-1')
  })

  it('should include lastCalculated timestamp', () => {
    const before = Date.now()
    const result = calculateComponentHealth(mockComponent, [])
    const after = Date.now()

    expect(result.lastCalculated.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.lastCalculated.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('calculateProjectHealth', () => {
  it('should return perfect score for empty array', () => {
    const result = calculateProjectHealth([])

    expect(result.averageScore).toBe(100)
    expect(result.totalComponents).toBe(0)
    expect(result.distribution.excellent).toBe(0)
    expect(result.distribution.good).toBe(0)
    expect(result.distribution.fair).toBe(0)
    expect(result.distribution.poor).toBe(0)
    expect(result.distribution.critical).toBe(0)
    expect(result.trend).toBe('unknown')
  })

  it('should calculate average score correctly', () => {
    const componentHealths = [
      {
        componentId: 'comp-1',
        score: 90,
        category: 'excellent' as const,
        factors: {
          vulnerabilityScore: 0,
          ageScore: 0,
          patchScore: 0,
          versionScore: 0,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-2',
        score: 70,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 10,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-3',
        score: 50,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 20,
          ageScore: 10,
          patchScore: 10,
          versionScore: 10,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
    ]

    const result = calculateProjectHealth(componentHealths)

    expect(result.averageScore).toBe(70) // (90 + 70 + 50) / 3
    expect(result.totalComponents).toBe(3)
  })

  it('should calculate distribution correctly', () => {
    const componentHealths = [
      {
        componentId: 'comp-1',
        score: 95,
        category: 'excellent' as const,
        factors: {
          vulnerabilityScore: 0,
          ageScore: 0,
          patchScore: 0,
          versionScore: 0,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-2',
        score: 80,
        category: 'good' as const,
        factors: {
          vulnerabilityScore: 5,
          ageScore: 5,
          patchScore: 5,
          versionScore: 5,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-3',
        score: 60,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 15,
          ageScore: 10,
          patchScore: 5,
          versionScore: 10,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-4',
        score: 40,
        category: 'poor' as const,
        factors: {
          vulnerabilityScore: 25,
          ageScore: 15,
          patchScore: 10,
          versionScore: 10,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-5',
        score: 20,
        category: 'critical' as const,
        factors: {
          vulnerabilityScore: 40,
          ageScore: 20,
          patchScore: 15,
          versionScore: 5,
        },
        trend: 'stable' as const,
        lastCalculated: new Date(),
      },
    ]

    const result = calculateProjectHealth(componentHealths)

    expect(result.distribution.excellent).toBe(1)
    expect(result.distribution.good).toBe(1)
    expect(result.distribution.fair).toBe(1)
    expect(result.distribution.poor).toBe(1)
    expect(result.distribution.critical).toBe(1)
  })

  it('should calculate trend as improving when most components are improving', () => {
    const componentHealths = [
      {
        componentId: 'comp-1',
        score: 90,
        category: 'excellent' as const,
        factors: {
          vulnerabilityScore: 0,
          ageScore: 0,
          patchScore: 0,
          versionScore: 0,
        },
        trend: 'improving' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-2',
        score: 70,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 10,
        },
        trend: 'improving' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-3',
        score: 50,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 20,
          ageScore: 10,
          patchScore: 10,
          versionScore: 10,
        },
        trend: 'degrading' as const,
        lastCalculated: new Date(),
      },
    ]

    const result = calculateProjectHealth(componentHealths)

    expect(result.trend).toBe('improving')
  })

  it('should calculate trend as degrading when most components are degrading', () => {
    const componentHealths = [
      {
        componentId: 'comp-1',
        score: 90,
        category: 'excellent' as const,
        factors: {
          vulnerabilityScore: 0,
          ageScore: 0,
          patchScore: 0,
          versionScore: 0,
        },
        trend: 'degrading' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-2',
        score: 70,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 10,
        },
        trend: 'degrading' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-3',
        score: 50,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 20,
          ageScore: 10,
          patchScore: 10,
          versionScore: 10,
        },
        trend: 'improving' as const,
        lastCalculated: new Date(),
      },
    ]

    const result = calculateProjectHealth(componentHealths)

    expect(result.trend).toBe('degrading')
  })

  it('should calculate trend as stable when trends are balanced', () => {
    const componentHealths = [
      {
        componentId: 'comp-1',
        score: 90,
        category: 'excellent' as const,
        factors: {
          vulnerabilityScore: 0,
          ageScore: 0,
          patchScore: 0,
          versionScore: 0,
        },
        trend: 'improving' as const,
        lastCalculated: new Date(),
      },
      {
        componentId: 'comp-2',
        score: 70,
        category: 'fair' as const,
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 10,
        },
        trend: 'degrading' as const,
        lastCalculated: new Date(),
      },
    ]

    const result = calculateProjectHealth(componentHealths)

    expect(result.trend).toBe('stable')
  })

  it('should include lastCalculated timestamp', () => {
    const before = Date.now()
    const result = calculateProjectHealth([])
    const after = Date.now()

    expect(result.lastCalculated.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.lastCalculated.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('getHealthColor', () => {
  it('should return correct color for excellent', () => {
    const color = getHealthColor('excellent')
    expect(color).toContain('text-green-600')
    expect(color).toContain('bg-green-50')
    expect(color).toContain('border-green-200')
  })

  it('should return correct color for good', () => {
    const color = getHealthColor('good')
    expect(color).toContain('text-blue-600')
    expect(color).toContain('bg-blue-50')
    expect(color).toContain('border-blue-200')
  })

  it('should return correct color for fair', () => {
    const color = getHealthColor('fair')
    expect(color).toContain('text-yellow-600')
    expect(color).toContain('bg-yellow-50')
    expect(color).toContain('border-yellow-200')
  })

  it('should return correct color for poor', () => {
    const color = getHealthColor('poor')
    expect(color).toContain('text-orange-600')
    expect(color).toContain('bg-orange-50')
    expect(color).toContain('border-orange-200')
  })

  it('should return correct color for critical', () => {
    const color = getHealthColor('critical')
    expect(color).toContain('text-red-600')
    expect(color).toContain('bg-red-50')
    expect(color).toContain('border-red-200')
  })
})

describe('getHealthChartColor', () => {
  it('should return correct chart color for excellent', () => {
    expect(getHealthChartColor('excellent')).toBe('#22c55e')
  })

  it('should return correct chart color for good', () => {
    expect(getHealthChartColor('good')).toBe('#3b82f6')
  })

  it('should return correct chart color for fair', () => {
    expect(getHealthChartColor('fair')).toBe('#eab308')
  })

  it('should return correct chart color for poor', () => {
    expect(getHealthChartColor('poor')).toBe('#f97316')
  })

  it('should return correct chart color for critical', () => {
    expect(getHealthChartColor('critical')).toBe('#ef4444')
  })
})
