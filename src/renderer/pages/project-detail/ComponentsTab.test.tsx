import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComponentsTab } from './ComponentsTab'
import type { Component, Project } from '@@/types'

// react-virtuoso renders nothing in jsdom's zero-height container; render items eagerly so the
// filtered component rows are assertable (same shim ProjectDetail/VulnerabilitiesTab tests use).
vi.mock('@/components/VirtualList', () => ({
  VirtualList: ({ items, renderItem }: { items: unknown[]; renderItem: (item: unknown) => React.ReactNode }) => (
    <>
      {items.map((item, index) => (
        <React.Fragment key={index}>{renderItem(item)}</React.Fragment>
      ))}
    </>
  ),
}))

vi.mock('@/components/Toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: 'c1',
    name: 'lodash',
    version: '4.17.21',
    type: 'library',
    licenses: ['MIT'],
    vulnerabilities: [],
    ...overrides,
  }
}

function makeProject(components: Component[]): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sbomFiles: [],
    components,
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: components.length,
      vulnerableComponents: 0,
    },
  }
}

const patchedLib = makeComponent({
  id: 'c-patched',
  name: 'patched-lib',
  type: 'library',
  patchInfo: { hasFixAvailable: true, fixedVersions: ['2.0.0'], vulnerableVersions: ['1.0.0'] },
})
const unpatchedFramework = makeComponent({ id: 'c-unpatched', name: 'unpatched-lib', type: 'framework' })

const PRESET_KEY = 'component-filter-presets-proj-1'

describe('ComponentsTab patch filter and presets (FR-08.2)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('patch-availability filter narrows to components with vs without a fix available', async () => {
    const user = userEvent.setup()
    render(<ComponentsTab project={makeProject([patchedLib, unpatchedFramework])} onComponentClick={vi.fn()} />)

    expect(screen.getByText('patched-lib')).toBeInTheDocument()
    expect(screen.getByText('unpatched-lib')).toBeInTheDocument()

    // WHY: an inverted patch predicate would show the wrong components with no red test.
    await user.selectOptions(screen.getByLabelText('Filter by patch availability'), 'available')
    expect(screen.getByText('patched-lib')).toBeInTheDocument()
    expect(screen.queryByText('unpatched-lib')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Filter by patch availability'), 'unavailable')
    expect(screen.queryByText('patched-lib')).toBeNull()
    expect(screen.getByText('unpatched-lib')).toBeInTheDocument()
  })

  it('saves a filter preset carrying type+patch and reloading re-applies exactly those', async () => {
    const user = userEvent.setup()
    const first = render(
      <ComponentsTab project={makeProject([patchedLib, unpatchedFramework])} onComponentClick={vi.fn()} />,
    )

    await user.selectOptions(screen.getByLabelText('Filter by component type'), 'library')
    await user.selectOptions(screen.getByLabelText('Filter by patch availability'), 'available')

    // Save via the real FilterPresets UI.
    await user.click(screen.getByRole('button', { name: 'Filter presets' }))
    await user.click(screen.getByRole('button', { name: /Save Current/ }))
    await user.type(screen.getByPlaceholderText('Preset name...'), 'lib-patched')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))

    // The persisted preset must carry BOTH dimensions — a preset that silently drops patch would
    // reload as a plain type filter.
    const stored = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]')
    expect(stored[0].filters.componentType).toEqual(['library'])
    expect(stored[0].filters.hasPatch).toBe(true)

    // Simulate a reload: unmount and remount with localStorage populated, then Load the preset.
    first.unmount()
    render(<ComponentsTab project={makeProject([patchedLib, unpatchedFramework])} onComponentClick={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Filter presets' }))
    // Anchor to the load button; the row's delete button is named "Delete preset lib-patched".
    await user.click(screen.getByRole('button', { name: /^lib-patched/ }))

    // Narrowed to exactly the library+patched component; the framework (wrong type) is hidden.
    expect(screen.getByText('patched-lib')).toBeInTheDocument()
    expect(screen.queryByText('unpatched-lib')).toBeNull()
    expect(screen.getByLabelText('Filter by patch availability')).toHaveValue('available')
    expect(screen.getByLabelText('Filter by component type')).toHaveValue('library')
  })

  it('"Clear filters" resets the patch filter back to All', async () => {
    const user = userEvent.setup()
    // Only an unpatched component, so selecting "Has Patch" empties the list and reveals Clear.
    render(<ComponentsTab project={makeProject([unpatchedFramework])} onComponentClick={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Filter by patch availability'), 'available')
    expect(screen.getByText('No components match your filters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByLabelText('Filter by patch availability')).toHaveValue('all')
    expect(screen.getByText('unpatched-lib')).toBeInTheDocument()
  })
})
