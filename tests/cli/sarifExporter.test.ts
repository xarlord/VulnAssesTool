import { describe, it, expect } from 'vitest'
import { exportToSarif, type SarifReport } from '../../cli/exporters/sarif.js'
import type { Vulnerability } from '../../src/shared/types.js'

describe('SARIF Exporter', () => {
  const mockVulnerabilities: Vulnerability[] = [
    {
      id: 'CVE-2024-12345',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      epssScore: 0.82,
      isKev: true,
      description: 'Prototype pollution in lodash',
      references: [{ source: 'nvd', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-12345' }],
      affectedComponents: ['lodash@4.17.0'],
      cwes: ['CWE-1321'],
      patchedVersions: ['4.17.21'],
    },
    {
      id: 'CVE-2024-54321',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      epssScore: 0.35,
      isKev: false,
      description: 'SSRF vulnerability in axios',
      references: [{ source: 'nvd', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-54321' }],
      affectedComponents: ['axios@1.6.0'],
      cwes: ['CWE-918'],
      patchedVersions: ['1.6.8'],
    },
  ]

  describe('exportToSarif', () => {
    it('creates valid SARIF 2.1.0 structure', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      expect(result.$schema).toBe(
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      )
      expect(result.version).toBe('2.1.0')
      expect(result.runs).toBeDefined()
      expect(result.runs).toHaveLength(1)
    })

    it('includes tool information', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      expect(result.runs[0].tool.driver.name).toBe('VulnAssesTool')
      expect(result.runs[0].tool.driver.version).toBe('2.0.0')
      expect(result.runs[0].tool.driver.informationUri).toBe('https://github.com/vulnasstool/vuln-asses-tool')
    })

    it('maps severity to SARIF levels correctly', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const criticalResult = result.runs[0].results.find((r) => r.ruleId === 'CVE-2024-12345')
      const highResult = result.runs[0].results.find((r) => r.ruleId === 'CVE-2024-54321')

      expect(criticalResult?.level).toBe('error')
      expect(highResult?.level).toBe('error') // high maps to error too
    })

    it('maps medium severity to warning level', () => {
      const mediumVuln: Vulnerability[] = [
        {
          id: 'CVE-2024-MEDIUM',
          source: 'nvd',
          severity: 'medium',
          cvssScore: 5.5,
          description: 'Medium severity vulnerability',
          references: [],
          affectedComponents: ['test@1.0.0'],
        },
      ]
      const result = exportToSarif(mediumVuln, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      expect(result.runs[0].results[0].level).toBe('warning')
    })

    it('maps low severity to note level', () => {
      const lowVuln: Vulnerability[] = [
        {
          id: 'CVE-2024-LOW',
          source: 'nvd',
          severity: 'low',
          cvssScore: 3.5,
          description: 'Low severity vulnerability',
          references: [],
          affectedComponents: ['test@1.0.0'],
        },
      ]
      const result = exportToSarif(lowVuln, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      expect(result.runs[0].results[0].level).toBe('note')
    })

    it('maps none/unknown severity to none level', () => {
      const noneVuln: Vulnerability[] = [
        {
          id: 'CVE-2024-NONE',
          source: 'nvd',
          severity: 'none',
          description: 'Unknown severity vulnerability',
          references: [],
          affectedComponents: ['test@1.0.0'],
        },
      ]
      const result = exportToSarif(noneVuln, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      expect(result.runs[0].results[0].level).toBe('none')
    })

    it('includes vulnerability details in message', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const firstResult = result.runs[0].results[0]

      expect(firstResult.message.text).toContain('CVE-2024-12345')
      expect(firstResult.message.text).toContain('lodash')
      expect(firstResult.message.text).toContain('CRITICAL')
    })

    it('includes CVSS score in properties', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const firstResult = result.runs[0].results[0]

      expect(firstResult.properties?.cvssScore).toBe(9.8)
      expect(firstResult.properties?.severity).toBe('critical')
    })

    it('includes EPSS score in properties', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const firstResult = result.runs[0].results[0]

      expect(firstResult.properties?.epss).toBe(0.82)
    })

    it('includes KEV status in properties', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const criticalResult = result.runs[0].results.find((r) => r.ruleId === 'CVE-2024-12345')
      const highResult = result.runs[0].results.find((r) => r.ruleId === 'CVE-2024-54321')

      expect(criticalResult?.properties?.kev).toBe(true)
      expect(highResult?.properties?.kev).toBe(false)
    })

    it('includes CWE information', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const firstResult = result.runs[0].results[0]

      expect(firstResult.properties?.cwe).toBe('CWE-1321')
    })

    it('includes component location', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const firstResult = result.runs[0].results[0]

      expect(firstResult.locations).toBeDefined()
      expect(firstResult.locations).toHaveLength(1)
      expect(firstResult.locations?.[0]?.physicalLocation?.artifactLocation?.uri).toContain('lodash')
    })

    it('includes remediation guidance', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const firstResult = result.runs[0].results[0]

      expect(firstResult.fixes).toBeDefined()
      expect(firstResult.fixes?.[0]?.description?.text).toContain('4.17.21')
    })

    it('handles empty vulnerability list', () => {
      const result = exportToSarif([], {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      expect(result.runs[0].results).toHaveLength(0)
    })

    it('filters by minimum severity when provided', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
        minSeverity: 'critical',
      })

      expect(result.runs[0].results).toHaveLength(1)
      expect(result.runs[0].results[0].ruleId).toBe('CVE-2024-12345')
    })

    it('filters by minimum EPSS when provided', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
        minEpss: 0.5,
      })

      expect(result.runs[0].results).toHaveLength(1)
      expect(result.runs[0].results[0].properties?.epss).toBe(0.82)
    })

    it('filters by KEV status when requested', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
        onlyKev: true,
      })

      expect(result.runs[0].results).toHaveLength(1)
      expect(result.runs[0].results[0].properties?.kev).toBe(true)
    })

    it('includes references as related locations', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const firstResult = result.runs[0].results[0]

      expect(firstResult.relatedLocations).toBeDefined()
      expect(firstResult.relatedLocations?.length).toBeGreaterThan(0)
    })

    it('generates rules for unique CWEs', () => {
      const result = exportToSarif(mockVulnerabilities, {
        toolName: 'VulnAssesTool',
        toolVersion: '2.0.0',
      })

      const rules = result.runs[0].tool.driver.rules

      expect(rules).toBeDefined()
      expect(rules?.length).toBeGreaterThan(0)
      expect(rules?.[0]?.id).toBeDefined()
    })
  })
})
