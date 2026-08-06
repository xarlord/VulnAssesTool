import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComplianceReportDialog } from './ComplianceReportDialog'
import type { Project } from '@@/types'

// jsPDF is heavy and lazy-loaded by the dialog; mock the generator module so the test stays fast
// and we can assert exactly what the dialog hands it. The audit store is mocked so we can assert
// the dialog sources the project's audit trail. vi.hoisted keeps the refs available to the hoisted
// vi.mock factories.
const { mockPrepare, mockDownload, mockGetEventsForEntity } = vi.hoisted(() => ({
  mockPrepare: vi.fn(() => ({})),
  mockDownload: vi.fn(),
  mockGetEventsForEntity: vi.fn(() => [
    { id: 'evt-1', actionType: 'SCAN', entityId: 'project-1', timestamp: new Date('2024-01-03') },
  ]),
}))

vi.mock('@/lib/export/pdf', () => ({
  prepareCompliancePdf: mockPrepare,
  downloadPdf: mockDownload,
}))

vi.mock('@/lib/audit', () => ({
  useAuditStore: { getState: () => ({ getEventsForEntity: mockGetEventsForEntity }) },
}))

const createProject = (): Project => ({
  id: 'project-1',
  name: 'My Service',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  sbomFiles: [],
  components: [],
  vulnerabilities: [],
  statistics: {
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    totalComponents: 0,
    vulnerableComponents: 0,
  },
})

describe('ComplianceReportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers every PRD-named framework', () => {
    render(<ComplianceReportDialog open onClose={vi.fn()} project={createProject()} />)
    expect(screen.getByRole('button', { name: /SOC 2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ISO\/IEC 27001/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /HIPAA/i })).toBeInTheDocument()
  })

  it('generates a report for the chosen framework, sourcing the project audit trail', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ComplianceReportDialog open onClose={onClose} project={createProject()} />)

    await user.click(screen.getByRole('button', { name: /HIPAA/i }))
    await user.click(screen.getByRole('button', { name: /Generate PDF/i }))

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(1))

    // The audit trail was fetched scoped to this project (getEventsForEntity also captures SBOM
    // events, which store the project id in metadata.relatedEntityIds rather than entityId)...
    expect(mockGetEventsForEntity).toHaveBeenCalledWith('project-1')
    // ...and handed to the generator alongside the selected framework.
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1' }),
      'hipaa',
      expect.arrayContaining([expect.objectContaining({ id: 'evt-1' })]),
    )
    // Downloaded with a framework-tagged filename, then the dialog closes.
    expect(mockDownload).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('hipaa'))
    expect(mockDownload).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('My-Service'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('defaults to SOC 2 when no framework is picked', async () => {
    const user = userEvent.setup()
    render(<ComplianceReportDialog open onClose={vi.fn()} project={createProject()} />)

    await user.click(screen.getByRole('button', { name: /Generate PDF/i }))

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(expect.anything(), 'soc2', expect.anything()))
  })

  it('recovers when generation fails: re-enables the button, keeps the dialog open, downloads nothing', async () => {
    // Intent: a failed generation must be recoverable (retry), not silently swallowed. If a future
    // change left the button stuck disabled or called onClose() on error, this test fails.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockPrepare.mockImplementationOnce(() => {
      throw new Error('pdf boom')
    })
    render(<ComplianceReportDialog open onClose={onClose} project={createProject()} />)

    await user.click(screen.getByRole('button', { name: /Generate PDF/i }))

    // Button returns to its enabled 'Generate PDF' state so the user can retry.
    await waitFor(() => expect(screen.getByRole('button', { name: /Generate PDF/i })).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
    expect(mockDownload).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})
