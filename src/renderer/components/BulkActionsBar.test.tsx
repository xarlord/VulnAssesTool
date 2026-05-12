import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BulkActionsBar, CheckboxSelectAll, CheckboxItem } from './BulkActionsBar'

describe('BulkActionsBar', () => {
  beforeEach(() => {
    // Mock window.confirm
    global.confirm = vi.fn(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * TC-BULK-001: Select All Projects
   * P1 - Priority 1
   * Tests the select all functionality via CheckboxSelectAll component
   */
  it('TC-BULK-001: should select all projects when select all checkbox is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<CheckboxSelectAll checked={false} onChange={onChange} label="Select all projects" />)

    const checkbox = screen.getByLabelText('Select all projects')
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    expect(onChange).toHaveBeenCalledWith(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  /**
   * TC-BULK-002: Select Individual Projects
   * P1 - Priority 1
   * Tests the individual project selection functionality via CheckboxItem component
   */
  it('TC-BULK-002: should select individual project when project checkbox is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<CheckboxItem checked={false} onChange={onChange} id="project-1" />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    expect(onChange).toHaveBeenCalledWith(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  /**
   * TC-BULK-003: Bulk Delete Projects
   * P1 - Priority 1
   * Tests bulk deletion of selected projects with confirmation
   */
  it('TC-BULK-003: should bulk delete selected projects with confirmation', async () => {
    const onAction = vi.fn()
    const confirmMock = vi.fn(() => true)
    global.confirm = confirmMock
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={3} onAction={onAction} onClearSelection={vi.fn()} />)

    const deleteButton = screen.getByText('Delete')
    expect(deleteButton).toBeInTheDocument()

    await user.click(deleteButton)

    expect(confirmMock).toHaveBeenCalledWith('Are you sure you want to delete 3 items? This action cannot be undone.')
    expect(onAction).toHaveBeenCalledWith('delete')
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  /**
   * TC-BULK-004: Bulk Export Projects
   * P1 - Priority 1
   * Tests bulk export of selected projects
   */
  it('TC-BULK-004: should bulk export selected projects', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={5} onAction={onAction} onClearSelection={vi.fn()} />)

    const exportButton = screen.getByText('Export')
    expect(exportButton).toBeInTheDocument()
    expect(exportButton).not.toBeDisabled()

    await user.click(exportButton)

    expect(onAction).toHaveBeenCalledWith('export')
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  /**
   * TC-BULK-005: Cancel Bulk Selection
   * P1 - Priority 1
   * Tests clearing the bulk selection
   */
  it('TC-BULK-005: should cancel bulk selection when clear button is clicked', async () => {
    const onClearSelection = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={4} onAction={vi.fn()} onClearSelection={onClearSelection} />)

    const clearButton = screen.getByText('Clear selection')
    expect(clearButton).toBeInTheDocument()
    expect(screen.getByText('4 items selected')).toBeInTheDocument()

    await user.click(clearButton)

    expect(onClearSelection).toHaveBeenCalledTimes(1)
  })

  it('should not render when no items are selected', () => {
    const { container } = render(<BulkActionsBar selectedCount={0} onAction={vi.fn()} onClearSelection={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render when items are selected', () => {
    render(<BulkActionsBar selectedCount={5} onAction={vi.fn()} onClearSelection={vi.fn()} />)

    expect(screen.getByText('5 items selected')).toBeInTheDocument()
  })

  it('should show singular form when one item is selected', () => {
    render(<BulkActionsBar selectedCount={1} onAction={vi.fn()} onClearSelection={vi.fn()} />)

    expect(screen.getByText('1 item selected')).toBeInTheDocument()
  })

  it('should call onClearSelection when clear button is clicked', async () => {
    const onClearSelection = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={3} onAction={vi.fn()} onClearSelection={onClearSelection} />)

    await user.click(screen.getByText('Clear selection'))
    expect(onClearSelection).toHaveBeenCalledTimes(1)
  })

  it('should show confirmation dialog for delete action', async () => {
    const confirmMock = vi.fn(() => false)
    global.confirm = confirmMock
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={2} onAction={onAction} onClearSelection={vi.fn()} />)

    await user.click(screen.getByText('Delete'))
    expect(confirmMock).toHaveBeenCalledWith('Are you sure you want to delete 2 items? This action cannot be undone.')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('should call onAction with delete when confirmed', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={1} onAction={onAction} onClearSelection={vi.fn()} />)

    await user.click(screen.getByText('Delete'))
    expect(onAction).toHaveBeenCalledWith('delete')
  })

  it('should call onAction with export', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={3} onAction={onAction} onClearSelection={vi.fn()} />)

    await user.click(screen.getByText('Export'))
    expect(onAction).toHaveBeenCalledWith('export')
  })

  it('should show confirmation dialog for dismiss action', async () => {
    const confirmMock = vi.fn(() => false)
    global.confirm = confirmMock
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={2} onAction={onAction} onClearSelection={vi.fn()} />)

    await user.click(screen.getByText('Dismiss'))
    expect(confirmMock).toHaveBeenCalledWith('Are you sure you want to dismiss 2 items?')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('should disable all actions when disabled prop is true', async () => {
    const onAction = vi.fn()
    const onClearSelection = vi.fn()
    const user = userEvent.setup()

    render(<BulkActionsBar selectedCount={2} onAction={onAction} onClearSelection={onClearSelection} disabled={true} />)

    await user.click(screen.getByText('Delete'))
    await user.click(screen.getByText('Export'))
    await user.click(screen.getByText('Dismiss'))
    await user.click(screen.getByText('Clear selection'))

    expect(onAction).not.toHaveBeenCalled()
    expect(onClearSelection).not.toHaveBeenCalled()
  })

  it('should only render specified actions', () => {
    render(
      <BulkActionsBar selectedCount={2} onAction={vi.fn()} onClearSelection={vi.fn()} actions={['delete', 'export']} />,
    )

    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument()
  })

  it('should render custom className', () => {
    const { container } = render(
      <BulkActionsBar selectedCount={2} onAction={vi.fn()} onClearSelection={vi.fn()} className="custom-class" />,
    )

    const bar = container.firstChild as HTMLElement
    expect(bar.classList.contains('custom-class')).toBe(true)
  })
})

describe('CheckboxSelectAll', () => {
  it('should render checkbox with label', () => {
    render(<CheckboxSelectAll checked={false} onChange={vi.fn()} label="Select all items" />)

    expect(screen.getByLabelText('Select all items')).toBeInTheDocument()
    expect(screen.getByText('Select all items')).toBeInTheDocument()
  })

  it('should call onChange when clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<CheckboxSelectAll checked={false} onChange={onChange} />)

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('should set indeterminate state', () => {
    render(<CheckboxSelectAll checked={false} onChange={vi.fn()} indeterminate={true} />)

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.indeterminate).toBe(true)
  })

  it('should be disabled when disabled prop is true', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<CheckboxSelectAll checked={false} onChange={onChange} disabled={true} />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeDisabled()

    await user.click(checkbox)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('CheckboxItem', () => {
  it('should render checkbox', () => {
    render(<CheckboxItem checked={false} onChange={vi.fn()} id="test-item" />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeInTheDocument()
  })

  it('should call onChange when clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<CheckboxItem checked={false} onChange={onChange} id="test-item" />)

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('should be checked when checked prop is true', () => {
    render(<CheckboxItem checked={true} onChange={vi.fn()} id="test-item" />)

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('should be disabled when disabled prop is true', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<CheckboxItem checked={false} onChange={onChange} id="test-item" disabled={true} />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeDisabled()

    await user.click(checkbox)
    expect(onChange).not.toHaveBeenCalled()
  })
})
