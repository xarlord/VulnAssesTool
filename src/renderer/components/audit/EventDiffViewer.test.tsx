/**
 * Event Diff Viewer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventDiffViewer } from './EventDiffViewer'
import { useAuditStore } from '@/lib/audit'
import type { AuditEvent } from '@/lib/audit'

describe('EventDiffViewer', () => {
  let mockEvent: AuditEvent

  beforeEach(() => {
    useAuditStore.getState()._resetStore()

    mockEvent = {
      id: 'test-event-1',
      timestamp: new Date('2024-01-01T12:00:00Z'),
      sessionId: 'session-1',
      actionType: 'UPDATE',
      entityType: 'project',
      entityId: 'project-1',
      previousState: {
        name: 'Old Name',
        description: 'Old Description',
        count: 5,
      },
      newState: {
        name: 'New Name',
        description: 'New Description',
        count: 10,
      },
      metadata: {
        description: 'Updated project details',
        isBulkOperation: false,
      },
    }
  })

  it('should render event diff viewer', () => {
    render(<EventDiffViewer event={mockEvent} />)

    expect(screen.getByText('State Changes')).toBeInTheDocument()
  })

  it('should show details button', () => {
    render(<EventDiffViewer event={mockEvent} />)

    expect(screen.getByText('Show Details')).toBeInTheDocument()
  })

  it('should show "Hide Details" when expanded', async () => {
    render(<EventDiffViewer event={mockEvent} />)

    const showButton = screen.getByText('Show Details')
    await userEvent.click(showButton)

    expect(screen.getByText('Hide Details')).toBeInTheDocument()
  })

  it('should display state changes when expanded', async () => {
    render(<EventDiffViewer event={mockEvent} />)

    const showButton = screen.getByText('Show Details')
    await userEvent.click(showButton)

    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
  })

  it('should display JSON formatted state data', async () => {
    render(<EventDiffViewer event={mockEvent} />)

    const showButton = screen.getByText('Show Details')
    await userEvent.click(showButton)

    // Should show JSON content
    expect(screen.getByText(/Old Name/)).toBeInTheDocument()
    expect(screen.getByText(/New Name/)).toBeInTheDocument()
  })

  it('should display metadata section when metadata exists', async () => {
    render(<EventDiffViewer event={mockEvent} />)

    const showButton = screen.getByText('Show Details')
    await userEvent.click(showButton)

    expect(screen.getByText('Additional Metadata')).toBeInTheDocument()
  })

  it('should display description from metadata', async () => {
    render(<EventDiffViewer event={mockEvent} />)

    const showButton = screen.getByText('Show Details')
    await userEvent.click(showButton)

    expect(screen.getByText('Updated project details')).toBeInTheDocument()
  })

  it('should display bulk operation status', async () => {
    render(<EventDiffViewer event={mockEvent} />)

    const showButton = screen.getByText('Show Details')
    await userEvent.click(showButton)

    expect(screen.getByText('Bulk Operation')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  describe('CREATE events', () => {
    beforeEach(() => {
      mockEvent = {
        ...mockEvent,
        actionType: 'CREATE',
        previousState: undefined,
        newState: { name: 'New Project' },
        metadata: { description: 'Created new project' },
      }
    })

    it('should show N/A for previous state on CREATE', async () => {
      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      expect(screen.getByText(/N\/A.*Creation/)).toBeInTheDocument()
    })

    it('should show new state for CREATE', async () => {
      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      expect(screen.getByText('After')).toBeInTheDocument()
      expect(screen.getByText(/New Project/)).toBeInTheDocument()
    })
  })

  describe('DELETE events', () => {
    beforeEach(() => {
      mockEvent = {
        ...mockEvent,
        actionType: 'DELETE',
        previousState: { name: 'Deleted Project' },
        newState: undefined,
        metadata: { description: 'Deleted project' },
      }
    })

    it('should show previous state for DELETE', async () => {
      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      expect(screen.getByText('Before')).toBeInTheDocument()
      expect(screen.getByText(/Deleted Project/)).toBeInTheDocument()
    })

    it('should show N/A for new state on DELETE', async () => {
      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      expect(screen.getByText(/N\/A.*Deletion/)).toBeInTheDocument()
    })
  })

  describe('Events without state changes', () => {
    beforeEach(() => {
      mockEvent = {
        ...mockEvent,
        previousState: undefined,
        newState: undefined,
        metadata: { description: 'Simple action' },
      }
    })

    it('should show message when no state data', () => {
      render(<EventDiffViewer event={mockEvent} />)

      expect(screen.getByText(/No state changes recorded for this event/)).toBeInTheDocument()
    })

    it('should not expand when no state data', async () => {
      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      // Should show the message, not Before/After
      expect(screen.getByText(/No state change data available for this event/)).toBeInTheDocument()
      expect(screen.queryByText('Before')).not.toBeInTheDocument()
      expect(screen.queryByText('After')).not.toBeInTheDocument()
    })
  })

  describe('Metadata display', () => {
    it('should display related entity count', async () => {
      mockEvent = {
        ...mockEvent,
        metadata: {
          ...mockEvent.metadata,
          relatedEntityIds: ['entity-1', 'entity-2', 'entity-3'],
        },
      }

      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      expect(screen.getByText(/Related Entities/)).toBeInTheDocument()
      expect(screen.getByText(/3 item\(s\)/)).toBeInTheDocument()
    })

    it('should display bulk item count', async () => {
      mockEvent = {
        ...mockEvent,
        metadata: {
          ...mockEvent.metadata,
          isBulkOperation: true,
          bulkItemCount: 15,
        },
      }

      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      expect(screen.getByText('Items Affected')).toBeInTheDocument()
      expect(screen.getByText('15')).toBeInTheDocument()
    })

    it('should not display metadata section when empty', () => {
      mockEvent = {
        ...mockEvent,
        metadata: undefined,
      }

      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      userEvent.click(showButton)

      expect(screen.queryByText('Additional Metadata')).not.toBeInTheDocument()
    })
  })

  describe('Toggle behavior', () => {
    it('should collapse when clicking hide details', async () => {
      render(<EventDiffViewer event={mockEvent} />)

      const showButton = screen.getByText('Show Details')
      await userEvent.click(showButton)

      expect(screen.getByText('Before')).toBeInTheDocument()

      const hideButton = screen.getByText('Hide Details')
      await userEvent.click(hideButton)

      expect(screen.queryByText('Before')).not.toBeInTheDocument()
      expect(screen.getByText('Show Details')).toBeInTheDocument()
    })
  })
})
