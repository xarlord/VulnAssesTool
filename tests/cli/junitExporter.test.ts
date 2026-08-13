import { describe, it, expect } from 'vitest'
import { exportToJunit, junitToXml, type JunitReport, type JunitExportOptions } from '../../cli/exporters/junit.js'
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

      expect(criticalTest?.failure?.[0]?.text).toContain('CVE-2024-12345')
      expect(criticalTest?.failure?.[0]?.text).toContain('lodash')
      expect(criticalTest?.failure?.[0]?.text).toContain('CRITICAL')
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

      expect(criticalTest?.failure?.[0]?.text).toContain('4.17.21')
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

    it('filters out a vulnerability with an unrecognized severity rather than assuming it is safe', () => {
      // Defends against corrupted/legacy data (e.g. a DB row with a severity string
      // that predates the current enum) being silently treated as passing a minSeverity
      // gate it should not pass: unknown severity must fall back to priority 0.
      const corruptVuln: Vulnerability = {
        id: 'CVE-2024-CORRUPT',
        source: 'nvd',
        severity: 'unrecognized' as unknown as Vulnerability['severity'],
        description: 'Severity value outside the known enum',
        references: [],
        affectedComponents: ['weird@1.0.0'],
      }

      const result = exportToJunit([corruptVuln], {
        projectName: 'test-project',
        minSeverity: 'low',
      })

      expect(result.testsuites.testsuite[0].testcase).toHaveLength(0)
    })

    it('does not mark a vulnerability with an unrecognized severity as a failure', () => {
      // Same defensive fallback (priority 0) must also apply to failure-threshold
      // comparison, so corrupted severity data cannot silently fail a CI build for
      // the wrong reason, nor slip through by accident.
      const corruptVuln: Vulnerability = {
        id: 'CVE-2024-CORRUPT2',
        source: 'nvd',
        severity: 'unrecognized' as unknown as Vulnerability['severity'],
        description: 'Severity value outside the known enum',
        references: [],
        affectedComponents: ['weird@1.0.0'],
      }

      const result = exportToJunit([corruptVuln], { projectName: 'test-project' })
      const testcase = result.testsuites.testsuite[0].testcase[0]

      expect(testcase.failure).toBeUndefined()
    })

    it('treats an unrecognized minSeverity option as priority 0, letting everything through', () => {
      // minSeverity is only ever produced by our own CLI arg parsing in practice, but the
      // exported function must still degrade gracefully (not throw, not exclude everything)
      // if it ever receives a value outside the known enum.
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
        minSeverity: 'unrecognized' as unknown as JunitExportOptions['minSeverity'],
      })

      expect(result.testsuites.testsuite[0].testcase).toHaveLength(mockVulnerabilities.length)
    })

    it('treats an unrecognized failureThreshold as equivalent to "high" (priority 3)', () => {
      // The threshold lookup falls back to 3 (== 'high') when the value is unrecognized,
      // so critical/high still fail the build and medium/low still do not.
      const result = exportToJunit(mockVulnerabilities, {
        projectName: 'test-project',
        failureThreshold: 'unrecognized' as unknown as JunitExportOptions['failureThreshold'],
      })

      const testcases = result.testsuites.testsuite[0].testcase
      const criticalTest = testcases.find((tc) => tc.name === 'CVE-2024-12345')
      const mediumTest = testcases.find((tc) => tc.name === 'CVE-2024-11111')

      expect(criticalTest?.failure).toBeDefined()
      expect(mediumTest?.failure).toBeUndefined()
    })

    it('treats a missing EPSS score as 0 when filtering by minEpss, excluding rather than assuming it passes', () => {
      // A vulnerability that has not yet been scored by EPSS must not be assumed to have a
      // high (or any) exploit-prediction score; otherwise minEpss filtering would leak
      // unscored vulnerabilities into a report meant to be filtered by risk.
      const vulnWithoutEpss: Vulnerability = {
        id: 'CVE-2024-NOEPSS',
        source: 'nvd',
        severity: 'high',
        description: 'No EPSS score available yet',
        references: [],
        affectedComponents: ['pkg@1.0.0'],
      }

      const result = exportToJunit([vulnWithoutEpss], {
        projectName: 'test-project',
        minEpss: 0.1,
      })

      expect(result.testsuites.testsuite[0].testcase).toHaveLength(0)
    })

    it('labels a vulnerability with no affected components as "unknown component" instead of crashing', () => {
      // SBOM data can be incomplete; the exporter must still produce a usable JUnit
      // testcase (valid classname/component property) rather than emitting undefined
      // or throwing when component info is missing.
      const vulnWithoutComponents: Vulnerability = {
        id: 'CVE-2024-NOCOMP',
        source: 'nvd',
        severity: 'medium',
        description: 'No component data',
        references: [],
        affectedComponents: [],
      }

      const result = exportToJunit([vulnWithoutComponents], { projectName: 'test-project' })
      const testcase = result.testsuites.testsuite[0].testcase[0]

      expect(testcase.classname).toBe('unknown component')
      const componentProperty = testcase.properties?.property.find((p) => p.name === 'component')
      expect(componentProperty?.value).toBe('unknown component')
    })

    it('omits the cvssScore property and shows "N/A" in the failure text when CVSS score is missing', () => {
      // A vulnerability can be a known failure (critical/high) before NVD has published a
      // CVSS score; the report must say "N/A" rather than "undefined" and must not emit a
      // cvssScore property that would misleadingly imply a score of 0.
      const vulnWithoutCvss: Vulnerability = {
        id: 'CVE-2024-NOCVSS',
        source: 'nvd',
        severity: 'critical',
        description: 'No CVSS score assigned yet',
        references: [],
        affectedComponents: ['pkg@2.0.0'],
      }

      const result = exportToJunit([vulnWithoutCvss], { projectName: 'test-project' })
      const testcase = result.testsuites.testsuite[0].testcase[0]

      const cvssProperty = testcase.properties?.property.find((p) => p.name === 'cvssScore')
      expect(cvssProperty).toBeUndefined()
      expect(testcase.failure?.[0]?.text).toContain('CVSS Score: N/A')
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

    it('omits time, properties, and testcase-time attributes when a hand-built report does not set them', () => {
      // JunitReport's time/properties fields are optional in the type because not every
      // producer of a JunitReport (e.g. a future importer, or a partial report) will fill
      // them in. The serializer must skip the attribute/element entirely rather than
      // emitting time="undefined" or an empty <properties> block.
      const minimalReport: JunitReport = {
        testsuites: {
          name: 'minimal-project',
          tests: '1',
          failures: '0',
          errors: '0',
          testsuite: [
            {
              name: 'minimal-project - Security Vulnerabilities',
              tests: 1,
              failures: 0,
              errors: 0,
              timestamp: new Date().toISOString(),
              testcase: [
                {
                  name: 'CVE-2024-MINIMAL',
                  classname: 'pkg',
                },
              ],
            },
          ],
        },
      }

      const xml = junitToXml(minimalReport)

      expect(xml).not.toContain('time=')
      expect(xml).not.toContain('<properties>')
    })

    it('serializes a failure lacking message/type and a system-out block when present', () => {
      // failure.message/type are optional per the JunitTestCase type, and system-out is an
      // independent optional element. The serializer must render a bare <failure> tag
      // without stray attributes, and must render <system-out> when it is supplied.
      const reportWithBareFailure: JunitReport = {
        testsuites: {
          name: 'bare-project',
          tests: '1',
          failures: '1',
          errors: '0',
          testsuite: [
            {
              name: 'bare-project - Security Vulnerabilities',
              tests: 1,
              failures: 1,
              errors: 0,
              timestamp: new Date().toISOString(),
              testcase: [
                {
                  name: 'CVE-2024-BARE',
                  classname: 'pkg',
                  failure: [{ text: 'raw failure text with no message or type' }],
                  systemOut: 'log output captured during the scan',
                },
              ],
            },
          ],
        },
      }

      const xml = junitToXml(reportWithBareFailure)

      expect(xml).toContain('<failure>raw failure text with no message or type</failure>')
      expect(xml).not.toContain('message=')
      expect(xml).not.toContain('type=')
      expect(xml).toContain('<system-out>log output captured during the scan</system-out>')
    })
  })
})
