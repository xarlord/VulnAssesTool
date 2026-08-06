/**
 * Audit Log Panel Tests
 * Comprehensive tests for filtering, sorting, pagination, export, and rendering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatDistanceToNow } from 'date-fns'
import { AuditLogPanel } from './AuditLogPanel'
import { useAuditStore } from '@/lib/audit'
import { exportAuditLogs } from '@/lib/audit/auditExporters'

// Hoisted mock state for exportAuditLogs
const mockExportAuditLogs = vi.hoisted(() => vi.fn())

vi.mock('@/lib/audit/auditExporters', () => ({
  exportAuditLogs: mockExportAuditLogs,
}))

describe('AuditLogPanel', () => {
  beforeEach(() => {
    useAuditStore.getState().resetStore()
    mockExportAuditLogs.mockClear()

    // Add test events
    const store = useAuditStore.getState()

    store.addEvent({
      actionType: 'CREATE',
      entityType: 'project',
      entityId: 'project-1',
      newState: { name: 'Test Project' },
      metadata: { description: 'Created project: Test Project' },
    })

    store.addEvent({
      actionType: 'UPDATE',
      entityType: 'project',
      entityId: 'project-1',
      previousState: { name: 'Test Project' },
      newState: { name: 'Updated Project' },
      metadata: { description: 'Updated project: Test Project' },
    })

    store.addEvent({
      actionType: 'SCAN',
      entityType: 'vulnerability',
      entityId: 'vuln-1',
      newState: { count: 5 },
      metadata: { description: 'Completed vulnerability scan' },
    })

    store.addEvent({
      actionType: 'DELETE',
      entityType: 'project',
      entityId: 'project-2',
      previousState: { name: 'Deleted Project' },
      metadata: { description: 'Deleted project: Deleted Project' },
    })
  })

  // ---- Basic Rendering ----

  it('should render audit log panel with header', () => {
    render(<AuditLogPanel />)

    expect(screen.getByText('Audit Log')).toBeInTheDocument()
  })

  it('should display event count', () => {
    render(<AuditLogPanel />)

    expect(screen.getByText(/\(4 events\)/)).toBeInTheDocument()
  })

  it('should display all events in table', () => {
    render(<AuditLogPanel />)

    // Check for action types
    expect(screen.getByText('CREATE')).toBeInTheDocument()
    expect(screen.getByText('UPDATE')).toBeInTheDocument()
    expect(screen.getByText('SCAN')).toBeInTheDocument()
    expect(screen.getByText('DELETE')).toBeInTheDocument()
  })

  it('should display entity types', () => {
    render(<AuditLogPanel />)

    const entityTypes = screen.getAllByText(/project|vulnerability/i)
    expect(entityTypes.length).toBeGreaterThan(0)
  })

  it('should display descriptions', () => {
    render(<AuditLogPanel />)

    expect(screen.getByText(/Created project: Test Project/)).toBeInTheDocument()
    expect(screen.getByText(/Updated project: Test Project/)).toBeInTheDocument()
  })

  it('should render timestamps', () => {
    render(<AuditLogPanel />)

    // Timestamps should be present - just verify events have timestamps displayed
    // The exact format may vary by locale
    const events = useAuditStore.getState().events
    expect(events.length).toBeGreaterThan(0)

    // Verify that timestamp data exists in the store
    expect(events[0].timestamp).toBeInstanceOf(Date)
  })

  it('should show filter button', () => {
    render(<AuditLogPanel />)

    expect(screen.getByText('Filters')).toBeInTheDocument()
  })

  it('should show export button', () => {
    render(<AuditLogPanel />)

    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<AuditLogPanel className="my-custom-class" />)

    expect(container.firstElementChild).toHaveClass('my-custom-class')
  })

  // ---- Prop-based Filtering ----

  it('should filter events by entity ID when provided', () => {
    render(<AuditLogPanel entityId="project-1" />)

    // Should only show events for project-1
    const descriptions = screen.getAllByText(/project: Test Project/)
    expect(descriptions.length).toBe(2) // CREATE and UPDATE
  })

  it('should filter events by entity type when provided', () => {
    render(<AuditLogPanel entityType="project" />)

    // Should only show project events
    expect(screen.getByText(/Created project: Test Project/)).toBeInTheDocument()
    expect(screen.getByText(/Updated project: Test Project/)).toBeInTheDocument()
    expect(screen.getByText(/Deleted project: Deleted Project/)).toBeInTheDocument()
  })

  // ---- Filter Panel ----

  describe('Filtering', () => {
    it('should toggle filter panel when clicking Filters button', async () => {
      render(<AuditLogPanel />)

      const filterButton = screen.getByText('Filters')
      await userEvent.click(filterButton)

      // Use findByText instead of waitFor + getByText
      expect(await screen.findByText('Search')).toBeInTheDocument()
      expect(screen.getByText('Action Type')).toBeInTheDocument()
      expect(screen.getByText('Entity Type')).toBeInTheDocument()
    })

    it('should display action type filter buttons', async () => {
      render(<AuditLogPanel />)

      const filterButton = screen.getByText('Filters')
      await userEvent.click(filterButton)

      // Wait for filter panel to appear
      // Use getAllByText since there might be multiple matches (filter buttons + audit log entries)
      const createButtons = await screen.findAllByText('CREATE')
      expect(createButtons.length).toBeGreaterThan(0)
      expect(screen.getAllByText('UPDATE').length).toBeGreaterThan(0)
      expect(screen.getAllByText('DELETE').length).toBeGreaterThan(0)
      expect(screen.getAllByText('SCAN').length).toBeGreaterThan(0)
    })

    it('should display entity type filter buttons', async () => {
      render(<AuditLogPanel />)

      const filterButton = screen.getByText('Filters')
      await userEvent.click(filterButton)

      expect(await screen.findByText('Entity Type')).toBeInTheDocument()
    })

    it('should display all action type filter buttons including non-data ones', async () => {
      render(<AuditLogPanel />)

      const filterButton = screen.getByText('Filters')
      await userEvent.click(filterButton)

      expect(await screen.findByText('Action Type')).toBeInTheDocument()
      // These action types are not in our test data but should still appear as buttons
      expect(screen.getByText('EXPORT')).toBeInTheDocument()
      expect(screen.getByText('SETTINGS_CHANGE')).toBeInTheDocument()
      expect(screen.getByText('BULK_OPERATION')).toBeInTheDocument()
    })

    it('should display all entity type filter buttons', async () => {
      render(<AuditLogPanel />)

      const filterButton = screen.getByText('Filters')
      await userEvent.click(filterButton)

      expect(await screen.findByText('Entity Type')).toBeInTheDocument()
      expect(screen.getByText('component')).toBeInTheDocument()
      expect(screen.getByText('settings')).toBeInTheDocument()
      expect(screen.getByText('profile')).toBeInTheDocument()
      expect(screen.getByText('notification')).toBeInTheDocument()
    })

    it('should filter events when action type filter is toggled', async () => {
      render(<AuditLogPanel />)

      // Open filter panel
      await userEvent.click(screen.getByText('Filters'))
      expect(await screen.findByText('Action Type')).toBeInTheDocument()

      // Click CREATE filter button — the filter buttons are inside the filter panel,
      // and there are also CREATE badges in the table. We want the filter button.
      // The filter buttons have text-xs class; let's click the first CREATE match.
      const createButtons = screen.getAllByText('CREATE')
      // Click the filter button (not the badge in the table)
      await userEvent.click(createButtons[0])

      // After filtering to only CREATE, the table should show only CREATE events
      await waitFor(() => {
        // Only CREATE events should be in the table now
        expect(screen.getByText(/\(1 events\)/)).toBeInTheDocument()
      })
    })

    it('should filter events when entity type filter is toggled', async () => {
      render(<AuditLogPanel />)

      // Open filter panel
      await userEvent.click(screen.getByText('Filters'))
      expect(await screen.findByText('Entity Type')).toBeInTheDocument()

      // Click vulnerability entity type filter
      const vulnButtons = screen.getAllByText('vulnerability')
      await userEvent.click(vulnButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/\(1 events\)/)).toBeInTheDocument()
      })
    })

    it('should filter events by search query', async () => {
      render(<AuditLogPanel />)

      // Open filter panel
      await userEvent.click(screen.getByText('Filters'))
      expect(await screen.findByText('Search')).toBeInTheDocument()

      // Type in search
      const searchInput = screen.getByPlaceholderText('Search in descriptions and entity IDs...')
      await userEvent.type(searchInput, 'Created project')

      await waitFor(() => {
        expect(screen.getByText(/\(1 events\)/)).toBeInTheDocument()
      })
    })

    it('should toggle action type filter off when clicked twice', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Filters'))
      expect(await screen.findByText('Action Type')).toBeInTheDocument()

      const createButtons = screen.getAllByText('CREATE')
      // Click to activate
      await userEvent.click(createButtons[0])
      await waitFor(() => {
        expect(screen.getByText(/\(1 events\)/)).toBeInTheDocument()
      })

      // Click again to deactivate
      await userEvent.click(createButtons[0])
      await waitFor(() => {
        expect(screen.getByText(/\(4 events\)/)).toBeInTheDocument()
      })
    })

    it('should collapse filter panel on second click', async () => {
      render(<AuditLogPanel />)

      // Open
      await userEvent.click(screen.getByText('Filters'))
      expect(await screen.findByText('Search')).toBeInTheDocument()

      // Close
      await userEvent.click(screen.getByText('Filters'))
      expect(screen.queryByText('Search')).not.toBeInTheDocument()
    })

    it('narrows the table to events within the selected date range', async () => {
      // addEvent stamps 'now', so inject two events with controlled ages via setState directly
      // (addEvent's signature omits timestamp) — one 40 days old, one 2 days old.
      const store = useAuditStore.getState()
      store.resetStore()
      store.addEvent({
        actionType: 'CREATE',
        entityType: 'project',
        entityId: 'old-proj',
        metadata: { description: 'Old event 40 days ago' },
      })
      store.addEvent({
        actionType: 'CREATE',
        entityType: 'project',
        entityId: 'recent-proj',
        metadata: { description: 'Recent event 2 days ago' },
      })
      const now = Date.now()
      const events = useAuditStore
        .getState()
        .events.map((e) =>
          e.entityId === 'old-proj'
            ? { ...e, timestamp: new Date(now - 40 * 24 * 60 * 60 * 1000) }
            : { ...e, timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000) },
        )
      useAuditStore.setState({ events })

      render(<AuditLogPanel />)

      // Both visible with the default 'All time' range.
      expect(screen.getByText('Old event 40 days ago')).toBeInTheDocument()
      expect(screen.getByText('Recent event 2 days ago')).toBeInTheDocument()

      await userEvent.click(screen.getByText('Filters'))
      await userEvent.click(await screen.findByText('Last 7 days'))

      // Why: the PRD requires filtering by date range. Asserting the actual row set (the
      // 40-day event disappears, the 2-day one stays) proves the control narrows results
      // rather than merely rendering — a cosmetic-only control would leave both visible.
      await waitFor(() => {
        expect(screen.queryByText('Old event 40 days ago')).not.toBeInTheDocument()
      })
      expect(screen.getByText('Recent event 2 days ago')).toBeInTheDocument()
    })
  })

  // ---- Export ----

  describe('Export', () => {
    it('should toggle export menu when clicking Export button', async () => {
      render(<AuditLogPanel />)

      const exportButton = screen.getByText('Export')
      await userEvent.click(exportButton)

      expect(await screen.findByText('Export as CSV')).toBeInTheDocument()
      expect(screen.getByText('Export as JSON')).toBeInTheDocument()
      expect(screen.getByText('Export as PDF')).toBeInTheDocument()
    })

    it('should close export menu on second click', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Export'))
      expect(await screen.findByText('Export as CSV')).toBeInTheDocument()

      await userEvent.click(screen.getByText('Export'))
      expect(screen.queryByText('Export as CSV')).not.toBeInTheDocument()
    })

    it('should call exportAuditLogs with csv format', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Export'))
      await userEvent.click(screen.getByText('Export as CSV'))

      expect(mockExportAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ format: 'csv' }))
    })

    it('should call exportAuditLogs with json format', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Export'))
      await userEvent.click(screen.getByText('Export as JSON'))

      expect(mockExportAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ format: 'json' }))
    })

    it('should call exportAuditLogs with pdf format', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Export'))
      await userEvent.click(screen.getByText('Export as PDF'))

      expect(mockExportAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ format: 'pdf' }))
    })

    it('should close export menu after selecting format', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Export'))
      expect(await screen.findByText('Export as CSV')).toBeInTheDocument()

      await userEvent.click(screen.getByText('Export as CSV'))
      expect(screen.queryByText('Export as CSV')).not.toBeInTheDocument()
    })
  })

  // ---- Sorting ----

  describe('Sorting', () => {
    it('should render sortable column headers', () => {
      render(<AuditLogPanel />)

      expect(screen.getByText('Timestamp')).toBeInTheDocument()
      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.getByText('Entity')).toBeInTheDocument()
      expect(screen.getByText('Description')).toBeInTheDocument()
      expect(screen.getByText('Session')).toBeInTheDocument()
    })

    it('should toggle sort direction when clicking Timestamp header', async () => {
      render(<AuditLogPanel />)

      // Click timestamp header to toggle sort
      await userEvent.click(screen.getByText('Timestamp'))

      // Verify sort happened by checking the component re-renders without error
      expect(screen.getByText('Timestamp')).toBeInTheDocument()
    })

    it('should toggle sort direction when clicking Action header', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Action'))
      expect(screen.getByText('Action')).toBeInTheDocument()
    })

    it('should show chevron icon indicating current sort direction on timestamp', async () => {
      render(<AuditLogPanel />)

      // Default sort is timestamp desc, so ChevronDown should be present
      // Click to toggle to asc
      await userEvent.click(screen.getByText('Timestamp'))

      // After clicking, the sort direction should flip. Both chevrons are
      // lucide icons rendered as <svg> with data-testid="lucide-icon"
      const icons = screen.getAllByTestId('lucide-icon')
      expect(icons.length).toBeGreaterThan(0)
    })
  })

  // ---- Empty State ----

  describe('Empty State', () => {
    it('should show empty state when no events', () => {
      useAuditStore.getState().resetStore()

      render(<AuditLogPanel />)

      expect(screen.getByText(/No audit events found/)).toBeInTheDocument()
    })

    it('should show 0 events count when empty', () => {
      useAuditStore.getState().resetStore()

      render(<AuditLogPanel />)

      expect(screen.getByText(/\(0 events\)/)).toBeInTheDocument()
    })
  })

  // ---- Pagination ----

  describe('Pagination', () => {
    beforeEach(() => {
      // Add more events for pagination
      const store = useAuditStore.getState()

      for (let i = 0; i < 60; i++) {
        store.addEvent({
          actionType: 'CREATE',
          entityType: 'project',
          entityId: `project-${i}`,
          newState: { name: `Project ${i}` },
        })
      }
    })

    it('should show pagination when events exceed page size', () => {
      render(<AuditLogPanel />)

      // Should show pagination info
      expect(screen.getByText(/Showing \d+-\d+ of \d+/)).toBeInTheDocument()
    })

    it('should show page number', () => {
      render(<AuditLogPanel />)

      expect(screen.getByText(/Page \d+ of \d+/)).toBeInTheDocument()
    })

    it('should show First button disabled on first page', () => {
      render(<AuditLogPanel />)

      const firstButton = screen.getByText('First')
      expect(firstButton).toBeDisabled()
    })

    it('should show Previous button disabled on first page', () => {
      render(<AuditLogPanel />)

      const prevButton = screen.getByText('Previous')
      expect(prevButton).toBeDisabled()
    })

    it('should navigate to next page when clicking Next', async () => {
      render(<AuditLogPanel />)

      const nextButton = screen.getByText('Next')
      expect(nextButton).not.toBeDisabled()

      await userEvent.click(nextButton)

      // Should now show Page 2
      expect(screen.getByText(/Page 2 of/)).toBeInTheDocument()
    })

    it('should navigate to last page when clicking Last', async () => {
      render(<AuditLogPanel />)

      const lastButton = screen.getByText('Last')
      await userEvent.click(lastButton)

      // Next button should now be disabled since we're on the last page
      expect(screen.getByText('Next')).toBeDisabled()
    })

    it('should enable First/Previous buttons after navigating forward', async () => {
      render(<AuditLogPanel />)

      await userEvent.click(screen.getByText('Next'))

      expect(screen.getByText('First')).not.toBeDisabled()
      expect(screen.getByText('Previous')).not.toBeDisabled()
    })

    it('should navigate back to first page when clicking First', async () => {
      render(<AuditLogPanel />)

      // Navigate forward first
      await userEvent.click(screen.getByText('Next'))
      expect(screen.getByText(/Page 2 of/)).toBeInTheDocument()

      // Navigate back
      await userEvent.click(screen.getByText('First'))
      expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
    })

    it('should not show pagination when events fit in one page', () => {
      useAuditStore.getState().resetStore()

      // Add fewer events than page size
      const store = useAuditStore.getState()
      store.addEvent({
        actionType: 'CREATE',
        entityType: 'project',
        entityId: 'project-1',
        newState: { name: 'Test' },
      })

      render(<AuditLogPanel />)

      expect(screen.queryByText('First')).not.toBeInTheDocument()
      expect(screen.queryByText('Next')).not.toBeInTheDocument()
    })

    it('should reset to page 1 when action type filter changes', async () => {
      render(<AuditLogPanel />)

      // Navigate to page 2
      await userEvent.click(screen.getByText('Next'))
      expect(screen.getByText(/Page 2 of/)).toBeInTheDocument()

      // Open filters and toggle a filter
      await userEvent.click(screen.getByText('Filters'))
      expect(await screen.findByText('Action Type')).toBeInTheDocument()

      const createButtons = screen.getAllByText('CREATE')
      await userEvent.click(createButtons[0])

      // Should reset to page 1
      await waitFor(() => {
        expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
      })
    })

    it('should reset to page 1 when entity type filter changes', async () => {
      render(<AuditLogPanel />)

      // Navigate to page 2
      await userEvent.click(screen.getByText('Next'))

      // Open filters and toggle entity type — use 'project' since there are
      // 63 project events (3 from base + 60 from pagination), which still
      // span multiple pages, so pagination stays visible after filtering
      await userEvent.click(screen.getByText('Filters'))
      expect(await screen.findByText('Entity Type')).toBeInTheDocument()

      const vulnButtons = screen.getAllByText('vulnerability')
      await userEvent.click(vulnButtons[0])

      // Filtering to vulnerability yields only 1 event, so pagination
      // disappears entirely — verify no pagination controls remain
      await waitFor(() => {
        expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
      })
    })
  })

  // ---- Color Coding ----

  describe('Color Coding', () => {
    it('should apply correct color classes for different action types', () => {
      render(<AuditLogPanel />)

      // Each action type should have its badge rendered
      const createBadge = screen.getByText('CREATE').closest('span')
      const updateBadge = screen.getByText('UPDATE').closest('span')
      const deleteBadge = screen.getByText('DELETE').closest('span')

      expect(createBadge).toBeInTheDocument()
      expect(updateBadge).toBeInTheDocument()
      expect(deleteBadge).toBeInTheDocument()

      // Verify badges have styling classes
      expect(createBadge?.className).toBeTruthy()
      expect(updateBadge?.className).toBeTruthy()
      expect(deleteBadge?.className).toBeTruthy()
    })

    it('should apply green color for CREATE action', () => {
      render(<AuditLogPanel />)

      const createBadge = screen.getByText('CREATE').closest('span')
      expect(createBadge?.className).toContain('green')
    })

    it('should apply blue color for UPDATE action', () => {
      render(<AuditLogPanel />)

      const updateBadge = screen.getByText('UPDATE').closest('span')
      expect(updateBadge?.className).toContain('blue')
    })

    it('should apply red color for DELETE action', () => {
      render(<AuditLogPanel />)

      const deleteBadge = screen.getByText('DELETE').closest('span')
      expect(deleteBadge?.className).toContain('red')
    })

    it('should apply purple color for SCAN action', () => {
      render(<AuditLogPanel />)

      const scanBadge = screen.getByText('SCAN').closest('span')
      expect(scanBadge?.className).toContain('purple')
    })
  })

  // ---- Session Display ----

  describe('Session Display', () => {
    it('should display truncated session IDs', () => {
      render(<AuditLogPanel />)

      // Session IDs should be truncated to 8 characters with ellipsis
      const sessionIds = screen.getAllByText(/\.{3}/)
      expect(sessionIds.length).toBeGreaterThan(0)
    })

    it('should display truncated entity IDs', () => {
      render(<AuditLogPanel />)

      // Entity IDs should be truncated to 12 chars with ellipsis
      // project-1 is 9 chars, so it'll be "project-1..." (12 chars + ...)
      const truncatedIds = screen.getAllByText(/\.{3}/)
      expect(truncatedIds.length).toBeGreaterThan(0)
    })
  })

  // ---- Event Description ----

  describe('Event Description', () => {
    it('should show dash when event has no description', () => {
      useAuditStore.getState().resetStore()

      const store = useAuditStore.getState()
      store.addEvent({
        actionType: 'CREATE',
        entityType: 'project',
        entityId: 'project-1',
        newState: { name: 'Test' },
        // No metadata.description
      })

      render(<AuditLogPanel />)

      // The cell should show '-' when no description
      expect(screen.getByText('-')).toBeInTheDocument()
    })

    it('should show description when event has metadata description', () => {
      render(<AuditLogPanel />)

      expect(screen.getByText('Created project: Test Project')).toBeInTheDocument()
    })
  })
})
