/**
 * Tests for reportGenerator.generatePDF (FR-09.2).
 *
 * generatePDF must produce a real PDF blob through the jsPDF builder and must NOT
 * route through the old getPlatform().generatePDF path, which flattened HTML to
 * bare text (no chart, no logo).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { buildSpy, platformGeneratePdf } = vi.hoisted(() => ({
  buildSpy: vi.fn(() => ({ output: () => new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }) })),
  platformGeneratePdf: vi.fn(() => new Uint8Array([1, 2, 3])),
}))

vi.mock('./executiveReportPdf', () => ({ buildExecutiveReportPdf: buildSpy }))
vi.mock('@/lib/platform', () => ({ getPlatform: () => ({ generatePDF: platformGeneratePdf }) }))

import { generatePDF } from './reportGenerator'
import type { ReportData, ReportOptions } from './types'
import type { Project } from '@@/types'

const options: ReportOptions = {
  title: 'Report',
  projectName: 'Test Project',
  includeExecutiveSummary: true,
  includeCharts: true,
  includeRecommendations: true,
}

const data: ReportData = {
  project: { id: 'p1', name: 'Test Project' } as Project,
  vulnerabilities: [],
  components: [],
  statistics: {
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    noneCount: 0,
    totalComponents: 0,
    vulnerableComponents: 0,
    kevCount: 0,
    avgEpssScore: 0,
  },
}

describe('generatePDF (FR-09.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('produces a PDF blob via the jsPDF builder and no longer calls the platform HTML-flatten path', async () => {
    const report = await generatePDF(data, options)

    expect(report.contentType).toBe('application/pdf')
    expect(report.content).toBeInstanceOf(Blob)
    expect(report.filename.endsWith('.pdf')).toBe(true)
    expect(buildSpy).toHaveBeenCalled()
    // The teeth: the text-flattening round-trip must be replaced, not supplemented.
    expect(platformGeneratePdf).not.toHaveBeenCalled()
  })
})
