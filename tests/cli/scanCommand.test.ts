import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  scanCommand,
  determineFormat,
  filterVulnerabilities,
  generateSummary,
  calculateExitCode,
  meetsMinSeverity,
  isFailure,
  filterByEpss,
  filterByKev,
  type ScanCommandOptions,
  type ScanResult,
} from '../../cli/commands/scan.js'
import type { Vulnerability, Component } from '../../src/shared/types.js'
import * as fs from 'fs'
import * as path from 'path'

// Mock the file system
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

// Mock the parsers
vi.mock('../../src/renderer/lib/parsers/cyclonedx.js', () => ({
  parseCycloneDX: vi.fn(),
}))

vi.mock('../../src/renderer/lib/parsers/spdx.js', () => ({
  parseSPDX: vi.fn(),
}))

// Mock the hybrid scanner
vi.mock('../../src/renderer/lib/database/hybridScanner.js', () => ({
  HybridScanner: vi.fn().mockImplementation(() => ({
    scanComponent: vi.fn(),
    scanComponents: vi.fn(),
    getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
  })),
  getHybridScanner: vi.fn().mockImplementation(() => ({
    scanComponent: vi.fn(),
    scanComponents: vi.fn(),
    getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
  })),
}))

describe('CLI Scan Command', () => {
  const mockVulnerabilities: Vulnerability[] = [
    {
      id: 'CVE-2024-12345',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      epssScore: 0.82,
      isKev: true,
      description: 'Critical vulnerability in lodash',
      references: [{ source: 'nvd', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-12345' }],
      affectedComponents: ['lodash@4.17.0'],
      cwes: ['CWE-1321'],
      patchInfo: {
        fixedVersions: ['4.17.21'],
        patchLinks: [],
        remediationAdvice: { summary: 'Upgrade lodash', steps: [] },
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
      description: 'High severity vulnerability in axios',
      references: [{ source: 'nvd', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-54321' }],
      affectedComponents: ['axios@1.6.0'],
      cwes: ['CWE-918'],
      patchInfo: {
        fixedVersions: ['1.6.8'],
        patchLinks: [],
        remediationAdvice: { summary: 'Upgrade axios', steps: [] },
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
      description: 'Medium severity vulnerability in express',
      references: [{ source: 'nvd', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-11111' }],
      affectedComponents: ['express@4.18.0'],
      cwes: ['CWE-200'],
    },
  ]

  const mockComponents: Component[] = [
    {
      id: 'comp-1',
      name: 'lodash',
      version: '4.17.0',
      type: 'library',
      purl: 'pkg:npm/lodash@4.17.0',
      cpe: 'cpe:2.3:a:lodash:lodash:4.17.0:*:*:*:*:*:*:*',
      licenses: ['MIT'],
      vulnerabilities: ['CVE-2024-12345'],
    },
    {
      id: 'comp-2',
      name: 'axios',
      version: '1.6.0',
      type: 'library',
      purl: 'pkg:npm/axios@1.6.0',
      cpe: 'cpe:2.3:a:axios:axios:1.6.0:*:*:*:*:*:*:*',
      licenses: ['MIT'],
      vulnerabilities: ['CVE-2024-54321'],
    },
    {
      id: 'comp-3',
      name: 'express',
      version: '4.18.0',
      type: 'library',
      purl: 'pkg:npm/express@4.18.0',
      cpe: 'cpe:2.3:a:expressjs:express:4.18.0:*:*:*:*:*:*:*',
      licenses: ['MIT'],
      vulnerabilities: ['CVE-2024-11111'],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('scanCommand', () => {
    it('returns error when SBOM file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await scanCommand('nonexistent.json', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('File not found')
    })

    it('returns error when file format is unsupported', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}))

      const result = await scanCommand('unknown.txt', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported format')
    })

    it('parses CycloneDX JSON files correctly', async () => {
      const cycloneDxContent = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ name: 'lodash', version: '4.17.0', purl: 'pkg:npm/lodash@4.17.0' }],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cycloneDxContent))

      const { parseCycloneDX } = await import('../../src/renderer/lib/parsers/cyclonedx.js')
      vi.mocked(parseCycloneDX).mockReturnValue({
        components: mockComponents.slice(0, 1),
        vulnerabilities: [],
        sbomFile: {} as any,
      })

      const { getHybridScanner } = await import('../../src/renderer/lib/database/hybridScanner.js')
      vi.mocked(getHybridScanner).mockReturnValue({
        scanComponent: vi.fn().mockResolvedValue({
          vulnerabilities: [mockVulnerabilities[0]],
          fromCache: 1,
          fromApi: 0,
          errors: [],
        }),
        scanComponents: vi.fn(),
        getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
      } as any)

      const result = await scanCommand('sbom.cdx.json', {})

      expect(result.success).toBe(true)
      expect(result.vulnerabilities).toBeDefined()
    })

    it('parses SPDX JSON files correctly', async () => {
      const spdxContent = {
        spdxVersion: 'SPDX-2.3',
        packages: [
          {
            name: 'lodash',
            versionInfo: '4.17.0',
            externalRefs: [
              {
                referenceCategory: 'PACKAGE-MANAGER',
                referenceType: 'purl',
                referenceLocator: 'pkg:npm/lodash@4.17.0',
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(spdxContent))

      const { parseSPDX } = await import('../../src/renderer/lib/parsers/spdx.js')
      vi.mocked(parseSPDX).mockReturnValue({
        components: mockComponents.slice(0, 1),
        vulnerabilities: [],
        sbomFile: {} as any,
      })

      const { getHybridScanner } = await import('../../src/renderer/lib/database/hybridScanner.js')
      vi.mocked(getHybridScanner).mockReturnValue({
        scanComponent: vi.fn().mockResolvedValue({
          vulnerabilities: [mockVulnerabilities[0]],
          fromCache: 1,
          fromApi: 0,
          errors: [],
        }),
        scanComponents: vi.fn(),
        getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
      } as any)

      const result = await scanCommand('sbom.spdx.json', {})

      expect(result.success).toBe(true)
      expect(result.format).toBe('spdx')
    })

    it('returns warnings from parser', async () => {
      const cycloneDxContent = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cycloneDxContent))

      const { parseCycloneDX } = await import('../../src/renderer/lib/parsers/cyclonedx.js')
      vi.mocked(parseCycloneDX).mockReturnValue({
        components: [],
        vulnerabilities: [],
        sbomFile: {} as any,
        warnings: ['Unknown component type'],
      })

      const { getHybridScanner } = await import('../../src/renderer/lib/database/hybridScanner.js')
      vi.mocked(getHybridScanner).mockReturnValue({
        scanComponent: vi.fn().mockResolvedValue({
          vulnerabilities: [],
          fromCache: 0,
          fromApi: 0,
          errors: [],
        }),
        scanComponents: vi.fn(),
        getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
      } as any)

      const result = await scanCommand('sbom.cdx.json', {})

      expect(result.success).toBe(true)
      expect(result.warnings).toContain('Unknown component type')
    })

    it('handles errors during scanning', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      const result = await scanCommand('sbom.cdx.json', {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Read error')
    })

    it('handles non-Error exceptions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'string error'
      })

      const result = await scanCommand('sbom.cdx.json', {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Scan failed')
    })

    it('scans multiple components', async () => {
      const cycloneDxContent = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: mockComponents,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cycloneDxContent))

      const { parseCycloneDX } = await import('../../src/renderer/lib/parsers/cyclonedx.js')
      vi.mocked(parseCycloneDX).mockReturnValue({
        components: mockComponents,
        vulnerabilities: [],
        sbomFile: {} as any,
      })

      const { getHybridScanner } = await import('../../src/renderer/lib/database/hybridScanner.js')
      const mockScanner = {
        scanComponent: vi.fn().mockImplementation((purl: string) => {
          if (purl.includes('lodash')) {
            return Promise.resolve({ vulnerabilities: [mockVulnerabilities[0]], fromCache: 1, fromApi: 0, errors: [] })
          }
          if (purl.includes('axios')) {
            return Promise.resolve({ vulnerabilities: [mockVulnerabilities[1]], fromCache: 1, fromApi: 0, errors: [] })
          }
          return Promise.resolve({ vulnerabilities: [mockVulnerabilities[2]], fromCache: 1, fromApi: 0, errors: [] })
        }),
        scanComponents: vi.fn(),
        getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
      }
      vi.mocked(getHybridScanner).mockReturnValue(mockScanner as any)

      const result = await scanCommand('sbom.cdx.json', {})

      expect(result.success).toBe(true)
      expect(result.componentsScanned).toBe(3)
      expect(result.vulnerabilities).toHaveLength(3)
    })

    it('uses component CPE when purl is not available', async () => {
      const componentWithoutPurl: Component[] = [
        {
          id: 'comp-no-purl',
          name: 'test-lib',
          version: '1.0.0',
          type: 'library',
          cpe: 'cpe:2.3:a:test:test-lib:1.0.0:*:*:*:*:*:*:*',
          licenses: [],
          vulnerabilities: [],
        },
      ]

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ bomFormat: 'CycloneDX' }))

      const { parseCycloneDX } = await import('../../src/renderer/lib/parsers/cyclonedx.js')
      vi.mocked(parseCycloneDX).mockReturnValue({
        components: componentWithoutPurl,
        vulnerabilities: [],
        sbomFile: {} as any,
      })

      const { getHybridScanner } = await import('../../src/renderer/lib/database/hybridScanner.js')
      const mockScanComponent = vi.fn().mockResolvedValue({
        vulnerabilities: [],
        fromCache: 0,
        fromApi: 0,
        errors: [],
      })
      vi.mocked(getHybridScanner).mockReturnValue({
        scanComponent: mockScanComponent,
        scanComponents: vi.fn(),
        getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
      } as any)

      await scanCommand('sbom.cdx.json', {})

      expect(mockScanComponent).toHaveBeenCalledWith('cpe:2.3:a:test:test-lib:1.0.0:*:*:*:*:*:*:*', {
        preferLocal: true,
      })
    })

    it('uses name@version when neither purl nor cpe available', async () => {
      const componentWithNoIds: Component[] = [
        {
          id: 'comp-no-ids',
          name: 'test-lib',
          version: '2.0.0',
          type: 'library',
          licenses: [],
          vulnerabilities: [],
        },
      ]

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ bomFormat: 'CycloneDX' }))

      const { parseCycloneDX } = await import('../../src/renderer/lib/parsers/cyclonedx.js')
      vi.mocked(parseCycloneDX).mockReturnValue({
        components: componentWithNoIds,
        vulnerabilities: [],
        sbomFile: {} as any,
      })

      const { getHybridScanner } = await import('../../src/renderer/lib/database/hybridScanner.js')
      const mockScanComponent = vi.fn().mockResolvedValue({
        vulnerabilities: [],
        fromCache: 0,
        fromApi: 0,
        errors: [],
      })
      vi.mocked(getHybridScanner).mockReturnValue({
        scanComponent: mockScanComponent,
        scanComponents: vi.fn(),
        getStatistics: vi.fn().mockReturnValue({ totalCves: 1000 }),
      } as any)

      await scanCommand('sbom.cdx.json', {})

      expect(mockScanComponent).toHaveBeenCalledWith('test-lib@2.0.0', { preferLocal: true })
    })

    it('filters by minimum severity', async () => {
      const result = filterVulnerabilities(mockVulnerabilities, {
        minSeverity: 'high',
      })

      expect(result).toHaveLength(2)
      expect(result.every((v) => v.severity === 'critical' || v.severity === 'high')).toBe(true)
    })

    it('filters by minimum EPSS score', async () => {
      const result = filterVulnerabilities(mockVulnerabilities, {
        minEpss: 0.3,
      })

      expect(result).toHaveLength(2)
      expect(result.every((v) => (v.epssScore ?? 0) >= 0.3)).toBe(true)
    })

    it('filters by KEV status', async () => {
      const result = filterVulnerabilities(mockVulnerabilities, {
        onlyKev: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0].isKev).toBe(true)
    })

    it('applies all filters together', async () => {
      const result = filterVulnerabilities(mockVulnerabilities, {
        minSeverity: 'high',
        minEpss: 0.3,
        onlyKev: false,
      })

      expect(result).toHaveLength(2)
    })

    it('handles empty vulnerability list', async () => {
      const result = filterVulnerabilities([], {
        minSeverity: 'critical',
      })

      expect(result).toHaveLength(0)
    })
  })

  describe('determineFormat', () => {
    it('detects CycloneDX JSON by extension', () => {
      expect(determineFormat('sbom.cdx.json')).toBe('cyclonedx-json')
      expect(determineFormat('sbom.cyclonedx.json')).toBe('cyclonedx-json')
    })

    it('detects CycloneDX XML by extension', () => {
      expect(determineFormat('sbom.cdx.xml')).toBe('cyclonedx-xml')
      expect(determineFormat('sbom.cyclonedx.xml')).toBe('cyclonedx-xml')
    })

    it('detects SPDX JSON by extension', () => {
      expect(determineFormat('sbom.spdx.json')).toBe('spdx-json')
    })

    it('detects SPDX RDF by extension', () => {
      expect(determineFormat('sbom.spdx')).toBe('spdx-rdf')
    })

    it('detects CycloneDX JSON by content', () => {
      const content = JSON.stringify({ bomFormat: 'CycloneDX' })
      expect(determineFormat('sbom.json', content)).toBe('cyclonedx-json')
    })

    it('detects SPDX JSON by content', () => {
      const content = JSON.stringify({ spdxVersion: 'SPDX-2.3' })
      expect(determineFormat('sbom.json', content)).toBe('spdx-json')
    })

    it('detects CycloneDX XML by content', () => {
      const content = '<?xml version="1.0"?><bom xmlns="http://cyclonedx.org/schema/bom/1.5">'
      expect(determineFormat('sbom.xml', content)).toBe('cyclonedx-xml')
    })

    it('returns unknown for unrecognized formats', () => {
      expect(determineFormat('sbom.txt')).toBe('unknown')
      expect(determineFormat('sbom.json', '{}')).toBe('unknown')
    })

    it('returns unknown for XML without cyclonedx namespace', () => {
      const content = '<?xml version="1.0"?><unknown></unknown>'
      expect(determineFormat('sbom.xml', content)).toBe('unknown')
    })
  })

  describe('calculateExitCode', () => {
    it('returns 0 for no vulnerabilities', () => {
      expect(calculateExitCode([], 'critical')).toBe(0)
    })

    it('returns 1 when critical vulnerabilities found with critical threshold', () => {
      expect(calculateExitCode(mockVulnerabilities.slice(0, 1), 'critical')).toBe(1)
    })

    it('returns 1 when high vulnerabilities found with high threshold', () => {
      expect(calculateExitCode(mockVulnerabilities.slice(1, 2), 'high')).toBe(1)
    })

    it('returns 0 when no vulnerabilities meet threshold', () => {
      expect(calculateExitCode(mockVulnerabilities.slice(2, 3), 'high')).toBe(0)
    })

    it('returns 1 when any vulnerability found with none threshold', () => {
      expect(calculateExitCode(mockVulnerabilities.slice(2, 3), 'none')).toBe(1)
    })
  })

  describe('generateSummary', () => {
    it('generates correct summary statistics', () => {
      const summary = generateSummary(mockVulnerabilities)

      expect(summary.total).toBe(3)
      expect(summary.critical).toBe(1)
      expect(summary.high).toBe(1)
      expect(summary.medium).toBe(1)
      expect(summary.low).toBe(0)
      expect(summary.kev).toBe(1)
      expect(summary.fixable).toBe(2)
    })

    it('handles empty vulnerability list', () => {
      const summary = generateSummary([])

      expect(summary.total).toBe(0)
      expect(summary.critical).toBe(0)
    })

    it('counts none severity correctly', () => {
      const noneVuln: Vulnerability[] = [
        {
          id: 'CVE-2024-NONE',
          source: 'nvd',
          severity: 'none',
          description: 'Unknown severity',
          references: [],
          affectedComponents: ['test@1.0.0'],
        },
      ]
      const summary = generateSummary(noneVuln)

      expect(summary.none).toBe(1)
      expect(summary.total).toBe(1)
    })

    it('counts affected components correctly', () => {
      const vulns: Vulnerability[] = [
        {
          id: 'CVE-2024-1',
          source: 'nvd',
          severity: 'high',
          description: 'Test',
          references: [],
          affectedComponents: ['lib-a@1.0.0', 'lib-b@2.0.0'],
        },
        {
          id: 'CVE-2024-2',
          source: 'nvd',
          severity: 'high',
          description: 'Test',
          references: [],
          affectedComponents: ['lib-a@1.0.0', 'lib-c@3.0.0'],
        },
      ]
      const summary = generateSummary(vulns)

      expect(summary.affectedComponents).toBe(3) // lib-a, lib-b, lib-c
    })
  })

  describe('meetsMinSeverity', () => {
    it('returns true when no minimum severity specified', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1',
        source: 'nvd',
        severity: 'low',
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      expect(meetsMinSeverity(vuln, undefined)).toBe(true)
    })

    it('returns true when vulnerability meets minimum severity', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1',
        source: 'nvd',
        severity: 'critical',
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      expect(meetsMinSeverity(vuln, 'high')).toBe(true)
    })

    it('returns false when vulnerability below minimum severity', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1',
        source: 'nvd',
        severity: 'low',
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      expect(meetsMinSeverity(vuln, 'high')).toBe(false)
    })

    it('handles unknown severity levels', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1',
        source: 'nvd',
        severity: 'unknown' as any,
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      expect(meetsMinSeverity(vuln, 'low')).toBe(false)
    })
  })

  describe('isFailure', () => {
    it('returns true for critical vulnerability with high threshold', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1',
        source: 'nvd',
        severity: 'critical',
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      expect(isFailure(vuln, 'high')).toBe(true)
    })

    it('returns false for low vulnerability with high threshold', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1',
        source: 'nvd',
        severity: 'low',
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      expect(isFailure(vuln, 'high')).toBe(false)
    })

    it('uses high as default threshold', () => {
      const highVuln: Vulnerability = {
        id: 'CVE-2024-1',
        source: 'nvd',
        severity: 'high',
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      const mediumVuln: Vulnerability = {
        id: 'CVE-2024-2',
        source: 'nvd',
        severity: 'medium',
        description: 'Test',
        references: [],
        affectedComponents: [],
      }
      expect(isFailure(highVuln, undefined)).toBe(true)
      expect(isFailure(mediumVuln, undefined)).toBe(false)
    })
  })

  describe('filterByEpss', () => {
    it('returns all vulnerabilities when no minimum specified', () => {
      const result = filterByEpss(mockVulnerabilities, undefined)
      expect(result).toHaveLength(3)
    })

    it('filters by minimum EPSS score', () => {
      const result = filterByEpss(mockVulnerabilities, 0.5)
      expect(result).toHaveLength(1)
      expect(result[0].epssScore).toBe(0.82)
    })

    it('includes vulnerabilities with undefined EPSS as maximum', () => {
      const vulns: Vulnerability[] = [
        {
          id: '1',
          source: 'nvd',
          severity: 'high',
          description: 'Test',
          references: [],
          affectedComponents: [],
          epssScore: undefined,
        },
      ]
      const result = filterByEpss(vulns, 0.5)
      expect(result).toHaveLength(1)
    })
  })

  describe('filterByKev', () => {
    it('returns all vulnerabilities when onlyKev is false', () => {
      const result = filterByKev(mockVulnerabilities, false)
      expect(result).toHaveLength(3)
    })

    it('returns only KEV vulnerabilities when onlyKev is true', () => {
      const result = filterByKev(mockVulnerabilities, true)
      expect(result).toHaveLength(1)
      expect(result[0].isKev).toBe(true)
    })

    it('returns all when onlyKev is undefined', () => {
      const result = filterByKev(mockVulnerabilities, undefined)
      expect(result).toHaveLength(3)
    })
  })
})
