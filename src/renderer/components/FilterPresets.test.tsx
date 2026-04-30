import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FilterPresets, CvssRangeSlider, MultiSelectFilter } from './FilterPresets'
import type { FilterPreset } from '@@/types'

describe('FilterPresets', () => {
  const mockPresets: FilterPreset[] = [
    {
      id: '1',
      name: 'Critical Only',
      filters: { severity: ['critical'] },
    },
    {
      id: '2',
      name: 'High and Critical',
      filters: { severity: ['critical', 'high'] },
    },
  ]

  const mockCurrentFilters = {
    severity: ['critical'],
  }

  beforeEach(() => {
    // Mock window.confirm
    global.confirm = vi.fn(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render dropdown button', () => {
    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Filter presets')).toBeInTheDocument()
  })

  it('should open dropdown when clicked', async () => {
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    expect(screen.getByText('Filter Presets')).toBeInTheDocument()
    expect(screen.getByText('Critical Only')).toBeInTheDocument()
  })

  it('should show empty state when no presets', async () => {
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={[]}
        currentFilters={{}}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    expect(screen.getByText('No saved presets')).toBeInTheDocument()
  })

  it('should load preset when clicked', async () => {
    const onLoadPreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={{}}
        onSavePreset={vi.fn()}
        onLoadPreset={onLoadPreset}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    await user.click(screen.getByText('Critical Only'))

    expect(onLoadPreset).toHaveBeenCalledWith('1')
  })

  it('should show save dialog when Save Current is clicked', async () => {
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    await user.click(screen.getByText('Save Current'))

    expect(screen.getByPlaceholderText('Preset name...')).toBeInTheDocument()
  })

  it('should save preset with name', async () => {
    const onSavePreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={onSavePreset}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    await user.click(screen.getByText('Save Current'))

    const input = screen.getByPlaceholderText('Preset name...')
    await user.type(input, 'My Preset')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSavePreset).toHaveBeenCalledWith('My Preset', mockCurrentFilters)
  })

  it('should not save preset with empty name', async () => {
    const onSavePreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={onSavePreset}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    await user.click(screen.getByText('Save Current'))

    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()
  })

  it('should delete preset with confirmation', async () => {
    const onDeletePreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={{}}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={onDeletePreset}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))

    const deleteButtons = screen.getAllByLabelText(/Delete preset/)
    await user.click(deleteButtons[0])

    expect(global.confirm).toHaveBeenCalledWith('Delete preset "Critical Only"?')
    expect(onDeletePreset).toHaveBeenCalledWith('1')
  })

  it('should highlight active preset', async () => {
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))

    // Check icon should be present for active preset
    const checkIcons = screen.getAllByRole('generic').filter((el) => el.querySelector('svg[class*="h-4"]'))
    expect(checkIcons.length).toBeGreaterThan(0)
  })

  it('should close dropdown when clicking outside', async () => {
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    expect(screen.getByText('Filter Presets')).toBeInTheDocument()

    // Click outside
    fireEvent.mouseDown(document.body)

    // After clicking outside, dropdown closes
    expect(screen.queryByText('Filter Presets')).not.toBeInTheDocument()
  })

  // TC-PRESET-001: Save Filter Preset
  it('TC-PRESET-001: should save filter preset with name and current filters', async () => {
    const onSavePreset = vi.fn()
    const complexFilters = {
      severity: ['critical', 'high'],
      cvssScore: [7.0, 10.0],
      status: ['open', 'in-progress'],
    }
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={complexFilters}
        onSavePreset={onSavePreset}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    await user.click(screen.getByText('Save Current'))

    const input = screen.getByPlaceholderText('Preset name...')
    await user.clear(input)
    await user.type(input, 'High Severity Critical')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSavePreset).toHaveBeenCalledWith('High Severity Critical', complexFilters)
    expect(onSavePreset).toHaveBeenCalledTimes(1)

    // Dropdown should close after save
    expect(screen.queryByPlaceholderText('Preset name...')).not.toBeInTheDocument()
  })

  // TC-PRESET-002: Load Filter Preset
  it('TC-PRESET-002: should load filter preset and apply filters', async () => {
    const onLoadPreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={{}}
        onSavePreset={vi.fn()}
        onLoadPreset={onLoadPreset}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))

    // Click on "High and Critical" preset
    const presetButtons = screen.getAllByText('High and Critical')
    await user.click(presetButtons[0])

    expect(onLoadPreset).toHaveBeenCalledWith('2')
    expect(onLoadPreset).toHaveBeenCalledTimes(1)

    // Dropdown should close after loading
    expect(screen.queryByText('Filter Presets')).not.toBeInTheDocument()
  })

  // TC-PRESET-003: Delete Filter Preset
  it('TC-PRESET-003: should delete filter preset with confirmation', async () => {
    const onDeletePreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={{}}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={onDeletePreset}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))

    // Find and click delete button for the first preset
    const deleteButtons = screen.getAllByLabelText(/Delete preset/)
    await user.click(deleteButtons[0])

    expect(global.confirm).toHaveBeenCalledWith('Delete preset "Critical Only"?')
    expect(onDeletePreset).toHaveBeenCalledWith('1')
    expect(onDeletePreset).toHaveBeenCalledTimes(1)
  })

  // TC-PRESET-004: Duplicate Preset Name
  it('TC-PRESET-004: should allow saving preset with duplicate name', async () => {
    const onSavePreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={onSavePreset}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    await user.click(screen.getByText('Save Current'))

    // Try to save with a name that already exists
    const input = screen.getByPlaceholderText('Preset name...')
    await user.clear(input)
    await user.type(input, 'Critical Only')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Component allows duplicate names (validation is handled by parent)
    expect(onSavePreset).toHaveBeenCalledWith('Critical Only', mockCurrentFilters)
    expect(onSavePreset).toHaveBeenCalledTimes(1)
  })

  // Additional test: Cancel save operation
  it('should cancel save operation when Cancel is clicked', async () => {
    const onSavePreset = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={mockCurrentFilters}
        onSavePreset={onSavePreset}
        onLoadPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))
    await user.click(screen.getByText('Save Current'))

    const input = screen.getByPlaceholderText('Preset name...')
    await user.type(input, 'My Preset')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSavePreset).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Preset name...')).not.toBeInTheDocument()
  })

  // Additional test: Delete preset cancelled by user
  it('should not delete preset when user cancels confirmation', async () => {
    const onDeletePreset = vi.fn()
    const user = userEvent.setup()

    // Mock confirm to return false (user cancels)
    global.confirm = vi.fn(() => false)

    render(
      <FilterPresets
        presets={mockPresets}
        currentFilters={{}}
        onSavePreset={vi.fn()}
        onLoadPreset={vi.fn()}
        onDeletePreset={onDeletePreset}
      />,
    )

    await user.click(screen.getByLabelText('Filter presets'))

    const deleteButtons = screen.getAllByLabelText(/Delete preset/)
    await user.click(deleteButtons[0])

    expect(global.confirm).toHaveBeenCalledWith('Delete preset "Critical Only"?')
    expect(onDeletePreset).not.toHaveBeenCalled()
  })
})

describe('CvssRangeSlider', () => {
  it('should render slider with current values', () => {
    render(<CvssRangeSlider value={[5.0, 8.0]} onChange={vi.fn()} />)

    expect(screen.getByText('CVSS Score Range')).toBeInTheDocument()
    expect(screen.getByText('5.0 - 8.0')).toBeInTheDocument()
  })

  it('should call onChange with new min value', async () => {
    const onChange = vi.fn()

    render(<CvssRangeSlider value={[5.0, 8.0]} onChange={onChange} />)

    const sliders = screen.getAllByRole('slider')

    // Instead of clicking, we need to trigger a change event
    // This simulates dragging the slider to a new value
    fireEvent.change(sliders[0], { target: { value: '3.0' } })

    expect(onChange).toHaveBeenCalledWith([3.0, 8.0])
  })

  it('should call onChange with new max value', async () => {
    const onChange = vi.fn()

    render(<CvssRangeSlider value={[5.0, 8.0]} onChange={onChange} />)

    const sliders = screen.getAllByRole('slider')

    // Trigger change event on the max slider
    fireEvent.change(sliders[1], { target: { value: '9.0' } })

    expect(onChange).toHaveBeenCalledWith([5.0, 9.0])
  })

  it('should display scale markers', () => {
    render(<CvssRangeSlider value={[0, 10]} onChange={vi.fn()} />)

    expect(screen.getByText('0.0')).toBeInTheDocument()
    expect(screen.getByText('5.0')).toBeInTheDocument()
    expect(screen.getByText('10.0')).toBeInTheDocument()
  })
})

describe('MultiSelectFilter', () => {
  const options = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ]

  it('should render with label', () => {
    render(<MultiSelectFilter label="Severity" options={options} selected={[]} onChange={vi.fn()} />)

    expect(screen.getByText('Severity')).toBeInTheDocument()
  })

  it('should show selected count', () => {
    render(<MultiSelectFilter label="Severity" options={options} selected={['critical', 'high']} onChange={vi.fn()} />)

    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('should show All when nothing selected', () => {
    render(<MultiSelectFilter label="Severity" options={options} selected={[]} onChange={vi.fn()} />)

    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('should open dropdown when clicked', async () => {
    const user = userEvent.setup()

    render(<MultiSelectFilter label="Severity" options={options} selected={[]} onChange={vi.fn()} />)

    await user.click(screen.getByText('Severity'))
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('should select option when checkbox is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<MultiSelectFilter label="Severity" options={options} selected={[]} onChange={onChange} />)

    await user.click(screen.getByText('Severity'))
    const checkbox = screen.getAllByRole('checkbox')[0]
    await user.click(checkbox)

    expect(onChange).toHaveBeenCalledWith(['critical'])
  })

  it('should deselect option when already selected', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<MultiSelectFilter label="Severity" options={options} selected={['critical']} onChange={onChange} />)

    await user.click(screen.getByText('Severity'))
    const checkbox = screen.getAllByRole('checkbox')[0]
    await user.click(checkbox)

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('should select all when Select All is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<MultiSelectFilter label="Severity" options={options} selected={[]} onChange={onChange} />)

    await user.click(screen.getByText('Severity'))
    await user.click(screen.getByText('Select All'))

    expect(onChange).toHaveBeenCalledWith(['critical', 'high', 'medium', 'low'])
  })

  it('should deselect all when all are selected and Deselect All is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <MultiSelectFilter
        label="Severity"
        options={options}
        selected={['critical', 'high', 'medium', 'low']}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByText('Severity'))
    await user.click(screen.getByText('Deselect All'))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('should close dropdown when clicking outside', async () => {
    const user = userEvent.setup()

    render(<MultiSelectFilter label="Severity" options={options} selected={[]} onChange={vi.fn()} />)

    await user.click(screen.getByText('Severity'))
    expect(screen.getByText('Critical')).toBeInTheDocument()

    // Click outside
    fireEvent.mouseDown(document.body)

    // Dropdown should close after clicking outside
    expect(screen.queryByText('Critical')).not.toBeInTheDocument()
  })
})
