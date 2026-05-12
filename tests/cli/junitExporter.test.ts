import { describe, it, expect } from 'vitest'
import { exportToJunit, junitToXml, type JunitReport } from '../../cli/exporters/junit.js'
import type { Vulnerability } from '../../src/shared/types.js'

describe('JUnit XML Exporter', () => {
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
      patchInfo: {
        fixedVersions: ['4.17.21'],
        patchLinks: [],
        remediationAdvice: { summary: 'Upgrade lodash', steps: ['Update to 4.17.21'] },
        affectedVersionRanges: [],
        patchAvailability: 'available',
      },
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
      patchInfo: {
        fixedVersions: ['1.6.8'],
        patchLinks: [],
        remediationAdvice: { summary: 'Upgrade axios', steps: ['Update to 1.6.8'] },
        affectedVersionRanges: [],
        patchAvailability: 'available',
      },
    },
    {
      id: 'CVE-2024-11111',
      source: 'nvd',
      severity: 'medium',
      cvssScore: 5.5,
      epssScore: 0.15,
      isKev: false,
      description: 'Information disclosure in express',
      references: [{ source: 'nvd', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-11111' }],
      affectedComponents: ['express@4.18.0'],
      cwes: ['CWE-200'],
      patchInfo: {
        fixedVersions: ['4.18.2'],
        patchLinks: [],
        remediationAdvice: { summary: 'Upgrade express', steps: ['Update to 4.18.2'] },
        affectedVersionRanges: [],
        patchAvailability: 'available',
      },
    },
  ]

  describe('exportToJunit', () => {
    it('creates valid JUnit XML structure', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      expect(result.testsuites).toBeDefined()
      expect(result.testsuites.testsuite).toBeDefined()
      expect(result.testsuites.testsuite).toHaveLength(1)
    })

    it('includes project name in suite name', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'my-project',
      })

      expect(result.testsuites.name).toBe('my-project')
      expect(result.testsuites.testsuite[0].name).toContain('my-project')
    })

    it('maps each vulnerability to a test case', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      expect(testcases).toHaveLength(3)
    })

    it('marks critical/high vulnerabilities as failures', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase

      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')
      const highTest = testcases.find((tc) => tc.name === 'CVE-2024-54321')
      const mediumTest = testcases.find((tc) => tc.name === 'CVE-2024-11111')

      expect(criticalTest?.failure).toBeDefined()
      expect(highTest?.failure).toBeDefined()
      expect(mediumTest?.failure).toBeUndefined()
    })

    it('includes vulnerability details in failure message', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')

      expect(criticalTest?.failure?.[0]?._text).toContain('CVE-2024-12345')
      expect(criticalTest?.failure?.[0]?._text).toContain('lodash')
      expect(criticalTest?.failure?.[0]?._text).toContain('CRITICAL')
    })

    it('includes CVSS score in properties', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')

      const cvssProperty = criticalTest?.properties?.property?.find((p) => p.name === 'cvssScore')
      expect(cvssProperty?.value).toBe('9.8')
    })

    it('includes EPSS score in properties', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')

      const epssProperty = criticalTest?.properties?.property?.find((p) => p.name === 'epss')
      expect(epssProperty?.value).toBe('0.82')
    })

    it('includes KEV status in properties', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')
      const highTest = testcases.find((tc) => tc.name === 'CVE-2024-54321')

      const kevPropertyCritical = criticalTest?.properties?.property?.find((p) => p.name === 'kev')
      const kevPropertyHigh = highTest?.properties?.property?.find((p) => p.name === 'kev')

      expect(kevPropertyCritical?.value).toBe('true')
      expect(kevPropertyHigh?.value).toBe('false')
    })

    it('includes CWE information in properties', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')

      const cweProperty = criticalTest?.properties?.property?.find((p) => p.name === 'cwe')
      expect(cweProperty?.value).toBe('CWE-1321')
    })

    it('includes component in classname', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')

      expect(criticalTest?.classname).toContain('lodash')
    })

    it('includes remediation in failure message', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')

      expect(criticalTest?.failure?.[0]?._text).toContain('4.17.21')
    })

    it('calculates correct test counts', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const suite = result.testsuites.testsuite[0]

      expect(suite.tests).toBe(3)
      expect(suite.failures).toBe(2) // critical + high
      expect(suite.errors).toBe(0)
    })

    it('handles empty vulnerability list', () => {
      const result = exportToJunit([], {
        projectName: 'test-project',
      })

      expect(result.testsuites.testsuite[0].tests).toBe(0)
      expect(result.testsuites.testsuite[0].testcase).toHaveLength(0)
    })

    it('filters by minimum severity when provided', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
        minSeverity: 'high',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      expect(testcases).toHaveLength(2)
    })

    it('filters by minimum EPSS when provided', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
        minEpss: 0.3,
      })

      const testcases = result.testsuites.testsuite[0].testcase
      expect(testcases).toHaveLength(2)
    })

    it('filters by KEV status when requested', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
        onlyKev: true,
      })

      const testcases = result.testsuites.testsuite[0].testcase
      expect(testcases).toHaveLength(1)
      expect(testcases[0].name).toBe('CVE-2024-12345')
    })

    it('includes timestamp in testsuite', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })

      const suite = result.testsuites.testsuite[0]
      expect(suite.timestamp).toBeDefined()
      expect(new Date(suite.timestamp).getTime()).not.toBeNaN()
    })

    it('sets failure threshold correctly', () => {
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
        failureThreshold: 'medium',
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const mediumTest = testcases.find((tc) => tc.name === 'CVE-2024-11111')

      // With medium threshold, medium severity should also be a failure
      expect(mediumTest?.failure).toBeDefined()
    })
  })

  describe('junitToXml', () => {
    it('generates valid XML declaration', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    })

    it('generates testsuites element with correct attributes', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'my-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('<testsuites')
      expect(xml).toContain('name="my-project"')
      expect(xml).toContain('tests="3"')
      expect(xml).toContain('failures="2"')
      expect(xml).toContain('errors="0"')
    })

    it('generates testsuite element with correct attributes', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('<testsuite')
      expect(xml).toContain('name="test-project - Security Vulnerabilities"')
      expect(xml).toContain('tests="3"')
      expect(xml).toContain('timestamp=')
    })

    it('generates testcase elements for each vulnerability', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('<testcase name="CVE-2024-12345"')
      expect(xml).toContain('<testcase name="CVE-2024-54321"')
      expect(xml).toContain('<testcase name="CVE-2024-11111"')
    })

    it('includes classname in testcase', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('classname="lodash"')
      expect(xml).toContain('classname="axios"')
    })

    it('generates properties element for vulnerability metadata', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('<properties>')
      expect(xml).toContain('<property name="cvssScore"')
      expect(xml).toContain('<property name="epss"')
      expect(xml).toContain('<property name="kev"')
      expect(xml).toContain('<property name="severity"')
    })

    it('generates failure element for critical/high vulnerabilities', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('<failure')
      expect(xml).toContain('message="CRITICAL: CVE-2024-12345')
      expect(xml).toContain('type="critical"')
    })

    it('escapes special XML characters in text content', () => {
      const vulnWithSpecialChars: Vulnerability[] = [
        {
          id: 'CVE-2024-<test>',
          source: 'nvd',
          severity: 'critical',
          cvssScore: 9.8,
          description: 'Test with <special> & "quotes" and \'apostrophes\'',
          references: [],
          affectedComponents: ['test@1.0.0'],
        },
      ]
      const report = exportToJunit(vulnWithSpecialChars, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('&lt;')
      expect(xml).toContain('&gt;')
      expect(xml).toContain('&amp;')
      expect(xml).toContain('&quot;')
      expect(xml).toContain('&apos;')
    })

    it('escapes project name with special characters', () => {
      const report = exportToJunit([], {
        projectName: 'test & "project" <v1>',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('test &amp; &quot;project&quot; &lt;v1&gt;')
    })

    it('generates empty testsuites for empty vulnerability list', () => {
      const report = exportToJunit([], {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('tests="0"')
      expect(xml).toContain('failures="0"')
    })

    it('closes all elements properly', () => {
      const report = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
      })
      const xml = junitToXml(report)

      expect(xml).toContain('</testcase>')
      expect(xml).toContain('</testsuite>')
      expect(xml).toContain('</testsuites>')
    })
  })
})
