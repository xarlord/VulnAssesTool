/**
 * AuditExportDialog Tests (FR-07.3)
 *
 * The dialog's export logic (auditExporters.ts) is already covered in isolation; this closes
 * the report's "zero test file" gap by pinning the dialog's own contract: the options a user
 * picks (format / date range / include-full-state / anonymize) reach exportAuditLogs unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditExportDialog } from './AuditExportDialog'

interface StatsState {
  getStatistics: () => { totalEvents: number }
}

// The dialog reads only exportAuditLogs + useAuditStore(getStatistics) from @/lib/audit.
vi.mock('@/lib/audit', () => ({
  exportAuditLogs: vi.fn(),
  useAuditStore: (selector: (state: StatsState) => unknown) => selector({ getStatistics: () => ({ totalEvents: 3 }) }),
}))

const { exportAuditLogs } = await import('@/lib/audit')

describe('AuditExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to JSON and switches the export format when another is chosen', async () => {
    const user = userEvent.setup()
    render(<AuditExportDialog open onOpenChange={vi.fn()} />)

    // The footer action encodes the currently-selected format.
    expect(screen.getByRole('button', { name: /Export JSON/i })).toBeInTheDocument()

    await user.click(screen.getByText('CSV'))
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()

    await user.click(screen.getByText('PDF'))
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeInTheDocument()
  })

  it('passes the selected date range and default options to exportAuditLogs', async () => {
    const user = userEvent.setup()
    render(<AuditExportDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByText('Last 7 days'))
    await user.click(screen.getByRole('button', { name: /Export JSON/i }))

    // Why: a date-scoped compliance export must actually carry that scope through to the
    // exporter — a dialog that discards the selection would silently export everything.
    // start/end are computed from Date.now() inside the component, so match fuzzily.
    expect(exportAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'json',
        includeFullState: false,
        anonymize: false,
        filter: expect.objectContaining({
          dateRange: expect.objectContaining({ start: expect.any(Date), end: expect.any(Date) }),
        }),
      }),
    )
  })

  it('reflects the Include full state and Anonymize toggles in the export call', async () => {
    const user = userEvent.setup()
    render(<AuditExportDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Include full state data'))
    await user.click(screen.getByLabelText('Anonymize sensitive data'))
    await user.click(screen.getByRole('button', { name: /Export JSON/i }))

    expect(exportAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ includeFullState: true, anonymize: true }))
  })

  it('omits the date-range filter entirely when "All time" stays selected', async () => {
    const user = userEvent.setup()
    render(<AuditExportDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Export JSON/i }))

    const options = vi.mocked(exportAuditLogs).mock.calls[0][0]
    expect(options.filter).toBeUndefined()
  })
})
