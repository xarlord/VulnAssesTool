/**
 * Tests for the jsPDF executive-report builder (FR-09.2).
 *
 * The previous PDF path flattened HTML to bare text — no logo image, no vector
 * chart, unsorted table. These tests pin the real behaviors: an embedded logo
 * image, a vector severity chart drawn with real fills, and a severity-sorted
 * vulnerability table.
 *
 * jsPDF is mocked module-wide (methods live on the instance, not the prototype),
 * mirroring the established convention in lib/export/pdf.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockText = vi.fn()
const mockSetFont = vi.fn()
const mockSetFontSize = vi.fn()
const mockSetTextColor = vi.fn()
const mockSetFillColor = vi.fn()
const mockRect = vi.fn()
const mockAddImage = vi.fn()
const mockSetPage = vi.fn()
const mockInternal = {
  pages: [{}, {}, {}],
  pageSize: { width: 210, height: 297, getWidth: () => 210, getHeight: () => 297 },
}
const mockAutoTable = vi.fn()

vi.mock('jspdf', () => ({
  default: class {
    text = mockText
    setFont = mockSetFont
    setFontSize = mockSetFontSize
    setTextColor = mockSetTextColor
    setFillColor = mockSetFillColor
    rect = mockRect
    addImage = mockAddImage
    setPage = mockSetPage
    internal = mockInternal
    lastAutoTable = { finalY: 100 }
  },
}))

vi.mock('jspdf-autotable', () => ({
  default: (doc: unknown, options: unknown) => {
    mockAutoTable(options)
    return doc
  },
}))

import { buildExecutiveReportPdf } from './executiveReportPdf'
import type { ReportData, ReportOptions, ExecutiveSummaryMetrics } from './types'
import type { Project, Vulnerability } from '@@/types'

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function vuln(overrides: Partial<Vulnerability>): Vulnerability {
  return {
    id: 'CVE-0000',
    source: 'nvd',
    severity: 'medium',
    references: [],
    affectedComponents: [],
    ...overrides,
  }
}

const options: ReportOptions = {
  title: 'Executive Report',
  projectName: 'Test Project',
  includeExecutiveSummary: true,
  includeCharts: true,
  includeRecommendations: true,
}

const metrics: ExecutiveSummaryMetrics = {
  overallRiskScore: 80,
  riskLevel: 'High',
  trend: 'up',
  keyFindings: ['1 critical vulnerability'],
  topVulnerableComponents: [],
  recommendedActions: ['Patch log4j'],
}

function reportData(vulnerabilities: Vulnerability[]): ReportData {
  return {
    project: { id: 'p1', name: 'Test Project' } as Project,
    vulnerabilities,
    components: [],
    statistics: {
      totalVulnerabilities: vulnerabilities.length,
      criticalCount: vulnerabilities.filter((v) => v.severity === 'critical').length,
      highCount: vulnerabilities.filter((v) => v.severity === 'high').length,
      mediumCount: vulnerabilities.filter((v) => v.severity === 'medium').length,
      lowCount: vulnerabilities.filter((v) => v.severity === 'low').length,
      noneCount: 0,
      totalComponents: 0,
      vulnerableComponents: 0,
      kevCount: 0,
      avgEpssScore: 0,
    },
  }
}

/** The body rows passed to the autoTable call that rendered the vulnerability table. */
function vulnTableBody(): string[][] | undefined {
  const call = mockAutoTable.mock.calls.find((args) =>
    JSON.stringify((args[0] as { head?: unknown }).head).includes('CVSS Vector'),
  )
  return call ? ((call[0] as { body?: string[][] }).body ?? undefined) : undefined
}

describe('buildExecutiveReportPdf (FR-09.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('embeds the company logo as an image when it is a PNG data URL', () => {
    buildExecutiveReportPdf(reportData([vuln({ severity: 'critical' })]), { ...options, companyLogo: PNG_1x1 }, metrics)

    expect(mockAddImage).toHaveBeenCalled()
  })

  it('draws a real severity bar chart using the per-severity fill color', () => {
    buildExecutiveReportPdf(reportData([vuln({ id: 'C1', severity: 'critical' })]), options, metrics)

    // Critical maps to RGB (220,38,38) — proves a colored vector bar, not text.
    expect(mockSetFillColor).toHaveBeenCalledWith(220, 38, 38)
    expect(mockRect).toHaveBeenCalled()
  })

  it('renders the vulnerability table sorted most-severe-first regardless of input order', () => {
    buildExecutiveReportPdf(
      reportData([vuln({ id: 'CVE-LOW', severity: 'low' }), vuln({ id: 'CVE-CRIT', severity: 'critical' })]),
      options,
      metrics,
    )

    const body = vulnTableBody()
    expect(body).toBeDefined()
    expect(body?.[0]?.[0]).toBe('CVE-CRIT')
  })

  it('does not throw and omits the image for an unsupported SVG logo', () => {
    expect(() =>
      buildExecutiveReportPdf(
        reportData([vuln({ severity: 'high' })]),
        { ...options, companyLogo: 'data:image/svg+xml;base64,PHN2Zy8+' },
        metrics,
      ),
    ).not.toThrow()

    expect(mockAddImage).not.toHaveBeenCalled()
  })
})
