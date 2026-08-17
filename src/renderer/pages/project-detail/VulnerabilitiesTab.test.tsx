import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VulnerabilitiesTab } from './VulnerabilitiesTab'
import type { Component, Project, ProjectStatistics, SbomFile, Vulnerability } from '@@/types'

// react-virtuoso (VirtualList) renders nothing in jsdom's zero-height container, so the per-row
// search/sort/bulk-select assertions below need it rendered eagerly — same shim ProjectDetail uses.
vi.mock('@/components/VirtualList', () => ({
  VirtualList: ({ items, renderItem }: { items: unknown[]; renderItem: (item: unknown) => React.ReactNode }) => (
    <>
      {items.map((item, index) => (
        <React.Fragment key={index}>{renderItem(item)}</React.Fragment>
      ))}
    </>
  ),
}))

// Mock the CSV export pipeline so the bulk-select "Export Selected" test can assert the exact
// vulnerabilities handed to the exporter without touching the DOM download machinery (FR-04.1).
vi.mock('@/lib/export/csv', () => ({
  exportVulnerabilitiesToCsv: vi.fn(() => 'csv-content'),
  buildComponentMap: vi.fn(() => new Map()),
  downloadCsv: vi.fn(),
  generateFilename: vi.fn(() => 'vulns.csv'),
}))
const { exportVulnerabilitiesToCsv } = await import('@/lib/export/csv')

// Mock the toast module (same pattern as ComponentVulnerabilitiesPopup.test.tsx) so the
// preset-save/load/delete and copy-to-clipboard tests can assert on the exact toast message
// without rendering <Toaster/> or touching the real notification store.
vi.mock('@/components/Toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
const { toast } = await import('@/components/Toaster')

// These tests cover FR-08.3's patch-availability and exploit-status filters. The exploit-status
// path had ZERO coverage — an inverted preset-load or a broken "Clear" reset would ship silently
// (the review-diff graph proved this by injecting the bug and watching the full suite stay green).
// Assertions key on the per-severity group HEADINGS, which render outside VirtualList, so they
// don't depend on virtual-scroll layout in jsdom.

function makeVuln(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'CVE-2024-0001',
    source: 'nvd',
    severity: 'high',
    description: 'test vuln',
    references: [],
    affectedComponents: ['comp-1'],
    ...overrides,
  }
}

function makeProject(vulnerabilities: Vulnerability[]): Project {
  const statistics: ProjectStatistics = {
    totalVulnerabilities: vulnerabilities.length,
    criticalCount: vulnerabilities.filter((v) => v.severity === 'critical').length,
    highCount: vulnerabilities.filter((v) => v.severity === 'high').length,
    mediumCount: 0,
    lowCount: 0,
    totalComponents: 1,
    vulnerableComponents: 1,
  }
  return {
    id: 'p1',
    name: 'Test Project',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sbomFiles: [],
    components: [],
    vulnerabilities,
    statistics,
  }
}

// A critical vuln that is patched AND known-exploited (KEV); a high vuln that is neither.
// Neither has matchQuality, so the default "hide low-confidence" toggle never touches them.
const patchedExploited = makeVuln({
  id: 'CVE-CRIT',
  severity: 'critical',
  isKev: true,
  patchInfo: { patchAvailability: 'available' },
})
const unpatchedClean = makeVuln({ id: 'CVE-HIGH', severity: 'high' })

function renderTab() {
  const project = makeProject([patchedExploited, unpatchedClean])
  return render(<VulnerabilitiesTab project={project} projectId="test-proj" onViewVulnerability={vi.fn()} />)
}

function criticalGroup() {
  return screen.queryByRole('heading', { name: 'Critical' })
}
function highGroup() {
  return screen.queryByRole('heading', { name: 'High' })
}

describe('VulnerabilitiesTab advanced filters (FR-08.3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  async function openAdvancedFilters(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /Advanced Filters/i }))
  }

  it('shows both severity groups before any advanced filter is applied', () => {
    renderTab()
    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeInTheDocument()
  })

  it('patch-availability filter narrows to patched / unpatched vulns', async () => {
    const user = userEvent.setup()
    renderTab()
    await openAdvancedFilters(user)

    // Has Patch -> only the patched critical vuln survives.
    await user.selectOptions(screen.getByLabelText('Patch Availability'), 'available')
    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeNull()

    // No Patch -> only the unpatched high vuln survives.
    await user.selectOptions(screen.getByLabelText('Patch Availability'), 'unavailable')
    expect(criticalGroup()).toBeNull()
    expect(highGroup()).toBeInTheDocument()
  })

  it('exploit-status filter narrows to KEV / non-KEV vulns', async () => {
    const user = userEvent.setup()
    renderTab()
    await openAdvancedFilters(user)

    // Exploited (KEV) -> only the KEV critical vuln survives.
    await user.selectOptions(screen.getByLabelText('Exploit Status'), 'exploited')
    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeNull()

    // Not Exploited -> only the non-KEV high vuln survives.
    await user.selectOptions(screen.getByLabelText('Exploit Status'), 'not-exploited')
    expect(criticalGroup()).toBeNull()
    expect(highGroup()).toBeInTheDocument()
  })

  it('"Clear Advanced Filters" resets both the patch and exploit filters', async () => {
    const user = userEvent.setup()
    renderTab()
    await openAdvancedFilters(user)

    await user.selectOptions(screen.getByLabelText('Patch Availability'), 'available')
    await user.selectOptions(screen.getByLabelText('Exploit Status'), 'not-exploited')
    // The two filters now contradict (patched+exploited vs not-exploited), hiding everything.
    expect(criticalGroup()).toBeNull()
    expect(highGroup()).toBeNull()

    await user.click(screen.getByRole('button', { name: /Clear Advanced Filters/i }))

    // Both filters reset to 'all' -> both groups return, and the selects show 'all'.
    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLSelectElement>('Patch Availability').value).toBe('all')
    expect(screen.getByLabelText<HTMLSelectElement>('Exploit Status').value).toBe('all')
  })

  // The CVSS-range and Source filters were previously verified only through the preset-load
  // path (ProjectDetail.test.tsx), where FilterPresets is fully stub-mocked — so no test drove
  // the real CvssRangeSlider / MultiSelectFilter DOM and watched the list narrow. These do.

  it('CVSS range max slider narrows to vulns within the range', async () => {
    const user = userEvent.setup()
    const crit = makeVuln({ id: 'CVE-CRIT-98', severity: 'critical', cvssScore: 9.8 })
    const high = makeVuln({ id: 'CVE-HIGH-40', severity: 'high', cvssScore: 4.0 })
    render(
      <VulnerabilitiesTab project={makeProject([crit, high])} projectId="test-proj" onViewVulnerability={vi.fn()} />,
    )

    await openAdvancedFilters(user)
    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeInTheDocument()

    // Drag the MAX slider (index 1; index 0 is min) down to 5 → the 9.8 critical falls outside
    // [0,5], the 4.0 high stays. WHY: must fail if onChange={setCvssRange} or handleMaxChange's
    // boundary guard regresses — the preset-load test bypasses the slider entirely.
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[1], { target: { value: '5' } })

    expect(criticalGroup()).toBeNull()
    expect(highGroup()).toBeInTheDocument()
  })

  it('Source multi-select filter narrows to the selected source', async () => {
    const user = userEvent.setup()
    const nvdVuln = makeVuln({ id: 'CVE-NVD-1', severity: 'critical', source: 'nvd' })
    const osvVuln = makeVuln({ id: 'CVE-OSV-1', severity: 'high', source: 'osv' })
    render(
      <VulnerabilitiesTab
        project={makeProject([nvdVuln, osvVuln])}
        projectId="test-proj"
        onViewVulnerability={vi.fn()}
      />,
    )

    await openAdvancedFilters(user)
    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeInTheDocument()

    // Open the real Source dropdown and select OSV only → only the OSV (high) vuln remains.
    await user.click(screen.getByRole('button', { name: /Source/ }))
    await user.click(screen.getByLabelText('OSV'))

    expect(criticalGroup()).toBeNull()
    expect(highGroup()).toBeInTheDocument()
  })

  it('Reference Tags multi-select filter narrows to vulns carrying the tag', async () => {
    const user = userEvent.setup()
    const withPatchRef = makeVuln({
      id: 'CVE-WITH-PATCH',
      severity: 'critical',
      references: [{ url: 'https://example.com/fix', tags: ['Patch'] }],
    })
    const noRefs = makeVuln({ id: 'CVE-NO-REFS', severity: 'high', references: [] })
    render(
      <VulnerabilitiesTab
        project={makeProject([withPatchRef, noRefs])}
        projectId="test-proj"
        onViewVulnerability={vi.fn()}
      />,
    )

    await openAdvancedFilters(user)
    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeInTheDocument()

    // Select the 'Patch Available' reference tag → only the vuln whose references carry a Patch
    // tag survives. WHY: this is the assertion the mislabeled ProjectDetail preset test could
    // never make (it loaded a source filter), so a broken referenceTagFilter predicate shipped green.
    await user.click(screen.getByRole('button', { name: /Reference Tags/ }))
    await user.click(screen.getByLabelText('Patch Available'))

    expect(criticalGroup()).toBeInTheDocument()
    expect(highGroup()).toBeNull()
  })
})

describe('VulnerabilitiesTab search, sort and bulk-select (FR-04.1)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(exportVulnerabilitiesToCsv).mockClear()
  })

  const log4shell = makeVuln({
    id: 'CVE-2021-44228',
    severity: 'critical',
    cvssScore: 9.8,
    publishedAt: new Date('2021-12-10'),
    description: 'Log4Shell remote code execution via JNDI lookup',
  })
  const bufferBug = makeVuln({
    id: 'CVE-2022-99999',
    severity: 'high',
    cvssScore: 5.0,
    publishedAt: new Date('2022-06-01'),
    description: 'Unrelated buffer over-read',
  })
  const mediumBug = makeVuln({
    id: 'CVE-2020-11111',
    severity: 'medium',
    cvssScore: 4.0,
    publishedAt: new Date('2020-01-01'),
    description: 'Old medium issue',
  })

  function renderThree() {
    return render(
      <VulnerabilitiesTab
        project={makeProject([log4shell, bufferBug, mediumBug])}
        projectId="test-proj"
        onViewVulnerability={vi.fn()}
      />,
    )
  }

  it('search box narrows to vulnerabilities matching a CVE-ID substring', async () => {
    const user = userEvent.setup()
    renderThree()

    // Proves the box is wired into the filter pipeline, not decorative.
    await user.type(screen.getByLabelText('Search vulnerabilities'), '44228')

    expect(screen.queryByRole('heading', { name: 'Critical' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'High' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Medium' })).toBeNull()
  })

  it('search box matches a keyword present only in the description', async () => {
    const user = userEvent.setup()
    renderThree()

    await user.type(screen.getByLabelText('Search vulnerabilities'), 'jndi')

    // 'jndi' appears only in the critical vuln's description.
    expect(screen.queryByRole('heading', { name: 'Critical' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'High' })).toBeNull()
  })

  it('sorting by Publication Date collapses severity groups into one newest-first section', async () => {
    const user = userEvent.setup()
    renderThree()

    await user.selectOptions(screen.getByLabelText('Sort by'), 'date')

    // The severity grouping is replaced by a single flat section — proves the dropdown reorders
    // rather than being cosmetic.
    expect(screen.getByRole('heading', { name: /All vulnerabilities \(newest first\)/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Critical' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'High' })).toBeNull()

    // Newest (2022) renders before oldest (2020) in DOM order.
    const ids = screen.getAllByText(/CVE-20\d\d-\d+/).map((el) => el.textContent)
    expect(ids.indexOf('CVE-2022-99999')).toBeLessThan(ids.indexOf('CVE-2020-11111'))
  })

  it('exports exactly the selected vulnerabilities, not the whole list', async () => {
    const user = userEvent.setup()
    renderThree()

    await user.click(screen.getByLabelText('Select CVE-2021-44228'))
    await user.click(screen.getByLabelText('Select CVE-2020-11111'))

    await user.click(screen.getByRole('button', { name: /Export Selected \(2\)/ }))

    // Catches 'selection ignored, exports everything (or nothing)'.
    expect(exportVulnerabilitiesToCsv).toHaveBeenCalledTimes(1)
    const exported = vi.mocked(exportVulnerabilitiesToCsv).mock.calls[0][0]
    expect(exported.map((v) => v.id).sort()).toEqual(['CVE-2020-11111', 'CVE-2021-44228'])
  })

  it('"Clear" empties the selection and hides the bulk-action toolbar', async () => {
    const user = userEvent.setup()
    renderThree()

    await user.click(screen.getByLabelText('Select CVE-2021-44228'))
    expect(screen.getByRole('button', { name: /Export Selected \(1\)/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('button', { name: /Export Selected/ })).toBeNull()
  })

  // The severity dropdown (an exact-match filter) is a different control from the default
  // severity GROUPING — nothing previously drove it away from 'all', so an inverted or
  // no-op predicate here could ship green.
  it('the severity dropdown narrows to an exact severity, not just the default grouping', async () => {
    const user = userEvent.setup()
    renderThree()

    await user.selectOptions(screen.getByLabelText('Filter by severity'), 'critical')

    expect(screen.getByRole('heading', { name: 'Critical' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'High' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Medium' })).toBeNull()
  })

  it('sorting by CVSS Score collapses severity groups into one highest-score-first section', async () => {
    const user = userEvent.setup()
    renderThree()

    await user.selectOptions(screen.getByLabelText('Sort by'), 'cvss')

    expect(screen.getByRole('heading', { name: /All vulnerabilities \(highest CVSS first\)/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Critical' })).toBeNull()

    // Highest CVSS (9.8) renders before the 5.0 vuln, which renders before the 4.0 vuln.
    const ids = screen.getAllByText(/CVE-20\d\d-\d+/).map((el) => el.textContent)
    expect(ids.indexOf('CVE-2021-44228')).toBeLessThan(ids.indexOf('CVE-2022-99999'))
    expect(ids.indexOf('CVE-2022-99999')).toBeLessThan(ids.indexOf('CVE-2020-11111'))
  })

  it('"Clear all filters" resets the severity dropdown and search box, not just the advanced filters', async () => {
    const user = userEvent.setup()
    renderThree()

    // Severity narrows to Critical, then the search term matches nothing -> zero results, even
    // though the project has vulnerabilities. Distinguishes this from the empty-project state.
    await user.selectOptions(screen.getByLabelText('Filter by severity'), 'critical')
    await user.type(screen.getByLabelText('Search vulnerabilities'), 'zzz-nonexistent')
    expect(screen.getByText('No vulnerabilities match the current filters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))

    expect(screen.getByRole('heading', { name: 'Critical' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'High' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Medium' })).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLSelectElement>('Filter by severity').value).toBe('all')
    expect(screen.getByLabelText<HTMLInputElement>('Search vulnerabilities').value).toBe('')
  })

  // A rescan can replace project.vulnerabilities while a prior selection is still held in state.
  // Without the `selected.length === 0` guard, exporting would either throw or silently ship an
  // empty CSV — this proves the stale selection is a no-op instead.
  it('exporting a selection that went stale after the project updated (e.g. a rescan) does nothing', async () => {
    const user = userEvent.setup()
    const { rerender } = renderThree()

    await user.click(screen.getByLabelText('Select CVE-2021-44228'))
    expect(screen.getByRole('button', { name: /Export Selected \(1\)/ })).toBeInTheDocument()

    // Simulate a rescan: the project's vulnerability list no longer contains the selected CVE.
    rerender(
      <VulnerabilitiesTab project={makeProject([bufferBug])} projectId="test-proj" onViewVulnerability={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /Export Selected \(1\)/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Export Selected/ }))

    expect(exportVulnerabilitiesToCsv).not.toHaveBeenCalled()
  })

  it('the export-complete toast uses singular wording for exactly one selected vulnerability', async () => {
    const user = userEvent.setup()
    renderThree()

    await user.click(screen.getByLabelText('Select CVE-2021-44228'))
    await user.click(screen.getByRole('button', { name: /Export Selected \(1\)/ }))

    expect(toast.success).toHaveBeenCalledWith('Export Complete', 'Exported 1 selected vulnerability to CSV.')
  })

  // Distinguishes "never scanned" from "scanned, but filters matched nothing" (covered above) —
  // conflating them would tell a user to adjust filters when they actually need to run a scan.
  it('shows the true empty-project state, not the filtered-to-zero state, when there are no vulnerabilities at all', () => {
    render(<VulnerabilitiesTab project={makeProject([])} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    expect(screen.getByText('No vulnerabilities found')).toBeInTheDocument()
    expect(screen.getByText('Run a vulnerability scan to check for security issues')).toBeInTheDocument()
    expect(screen.queryByText('No vulnerabilities match the current filters')).toBeNull()
    // The filter/sort toolbar only makes sense once there's something to filter.
    expect(screen.queryByLabelText('Search vulnerabilities')).toBeNull()
  })

  // toggleVulnSelected must be a real toggle, not a one-way "add to selection" — otherwise
  // unchecking a box would silently leave it selected (and exported) forever.
  it('clicking an already-selected checkbox deselects it instead of only ever adding', async () => {
    const user = userEvent.setup()
    renderThree()

    const checkbox = screen.getByLabelText('Select CVE-2021-44228')
    await user.click(checkbox)
    expect(screen.getByRole('button', { name: /Export Selected \(1\)/ })).toBeInTheDocument()

    await user.click(checkbox)

    expect(screen.queryByRole('button', { name: /Export Selected/ })).toBeNull()
  })
})

// The save/load/delete preset flow (FR-08.3's "Save filter presets") had ZERO coverage: no test
// ever drove FilterPresets' real save/load/delete callbacks from within VulnerabilitiesTab, so a
// broken handleSavePreset/handleLoadPreset/handleDeletePreset — or a corrupted localStorage entry
// crashing the tab on mount — would ship silently.
describe('VulnerabilitiesTab filter presets (FR-08.3)', () => {
  const presetsKey = 'vuln-filter-presets-test-proj'

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(toast.success).mockClear()
  })

  function renderTwo() {
    const crit = makeVuln({ id: 'CVE-P-CRIT', severity: 'critical', cvssScore: 9.0 })
    const high = makeVuln({ id: 'CVE-P-HIGH', severity: 'high', cvssScore: 5.0 })
    return render(
      <VulnerabilitiesTab project={makeProject([crit, high])} projectId="test-proj" onViewVulnerability={vi.fn()} />,
    )
  }

  async function openPresetsMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Filter presets' }))
  }

  it('restores filter presets saved in localStorage so they survive a reload', async () => {
    localStorage.setItem(
      presetsKey,
      JSON.stringify([{ id: 'p1', name: 'Critical Only', filters: { severity: ['critical'] } }]),
    )
    const user = userEvent.setup()
    renderTwo()

    await openPresetsMenu(user)
    // Anchored: the delete button's accessible name ("Delete preset Critical Only") also
    // contains this substring, so an unanchored regex would match two elements.
    expect(screen.getByRole('button', { name: /^Critical Only/ })).toBeInTheDocument()
  })

  it('a corrupted saved-presets entry is ignored instead of crashing the tab', async () => {
    localStorage.setItem(presetsKey, '{not valid json')
    const user = userEvent.setup()
    renderTwo()

    await openPresetsMenu(user)
    expect(screen.getByText('No saved presets')).toBeInTheDocument()
  })

  it('saving the current filters as a preset makes them reloadable, and deleting removes them again', async () => {
    const user = userEvent.setup()
    renderTwo()

    // Set every filter dimension so the saved preset carries all of them.
    await user.selectOptions(screen.getByLabelText('Filter by severity'), 'critical')
    await user.click(screen.getByRole('button', { name: /Advanced Filters/i }))
    await user.selectOptions(screen.getByLabelText('Patch Availability'), 'available')
    await user.selectOptions(screen.getByLabelText('Exploit Status'), 'exploited')
    fireEvent.change(screen.getAllByRole('slider')[1], { target: { value: '8' } })
    await user.click(screen.getByRole('button', { name: /Source/ }))
    await user.click(screen.getByLabelText('NVD'))

    await openPresetsMenu(user)
    await user.click(screen.getByRole('button', { name: /Save Current/ }))
    await user.type(screen.getByPlaceholderText('Preset name...'), 'My Preset')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(toast.success).toHaveBeenCalledWith('Preset Saved', expect.stringContaining('My Preset'))

    // Reset every filter to its default before loading, so restoration isn't a false positive.
    await user.selectOptions(screen.getByLabelText('Filter by severity'), 'all')
    await user.click(screen.getByRole('button', { name: /Clear Advanced Filters/i }))
    expect(screen.getByLabelText<HTMLSelectElement>('Patch Availability').value).toBe('all')
    expect(screen.getByText('0.0 - 10.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Source/ })).toHaveTextContent('All')

    // Clicking the severity select / "Clear Advanced Filters" happened outside the Presets
    // dropdown, which auto-closes on any outside click — reopen it to load the preset.
    await openPresetsMenu(user)
    await user.click(screen.getByRole('button', { name: /^My Preset/ }))

    expect(screen.getByLabelText<HTMLSelectElement>('Filter by severity').value).toBe('critical')
    expect(screen.getByLabelText<HTMLSelectElement>('Patch Availability').value).toBe('available')
    expect(screen.getByLabelText<HTMLSelectElement>('Exploit Status').value).toBe('exploited')
    expect(screen.getByText('0.0 - 8.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Source/ })).toHaveTextContent('1 selected')
    expect(toast.success).toHaveBeenCalledWith('Preset Loaded', expect.stringContaining('My Preset'))

    // Loading closed the dropdown; reopen it to delete the preset.
    await openPresetsMenu(user)
    await user.click(screen.getByLabelText('Delete preset My Preset'))
    // The confirm dialog is portaled outside the dropdown's DOM subtree, so confirming also
    // registers as an "outside click" and closes the dropdown — reopen it once more to check.
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await openPresetsMenu(user)

    expect(screen.getByText('No saved presets')).toBeInTheDocument()
  })

  it('loading a preset that only turned patch/exploit filters OFF restores that exact state, leaving severity and CVSS untouched', async () => {
    localStorage.setItem(
      presetsKey,
      JSON.stringify([{ id: 'p2', name: 'Off Preset', filters: { hasPatch: false, exploited: false } }]),
    )
    const user = userEvent.setup()
    renderTwo()
    await user.click(screen.getByRole('button', { name: /Advanced Filters/i }))

    await openPresetsMenu(user)
    await user.click(screen.getByRole('button', { name: /^Off Preset/ }))

    expect(screen.getByLabelText<HTMLSelectElement>('Patch Availability').value).toBe('unavailable')
    expect(screen.getByLabelText<HTMLSelectElement>('Exploit Status').value).toBe('not-exploited')
    // The preset never set these, so they're untouched at their defaults.
    expect(screen.getByLabelText<HTMLSelectElement>('Filter by severity').value).toBe('all')
    expect(screen.getByText('0.0 - 10.0')).toBeInTheDocument()
  })

  it('loading a preset saved with multiple severities (an older schema) falls back to "All" rather than guessing one', async () => {
    localStorage.setItem(
      presetsKey,
      JSON.stringify([{ id: 'p3', name: 'Legacy Multi', filters: { severity: ['critical', 'high'] } }]),
    )
    const user = userEvent.setup()
    renderTwo()

    await openPresetsMenu(user)
    await user.click(screen.getByRole('button', { name: /^Legacy Multi/ }))

    expect(screen.getByLabelText<HTMLSelectElement>('Filter by severity').value).toBe('all')
  })
})

// isNameOnlyMatch/isHighRiskVuln drive a default-on noise filter that hides low-confidence matches
// on coverage-gap components. None of the existing tests give a vuln matchQuality, so this whole
// hide/reveal/banner path — the tab's main defense against silently dropping a real finding — had
// zero coverage.
describe('VulnerabilitiesTab low-confidence match visibility', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function makeGapComponent(id = 'comp-gap'): Component {
    return {
      id,
      name: 'unversioned-lib',
      version: '',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
      coverage: 'gap',
    }
  }

  it('hides a name-only match on a non-high-risk finding by default, and the Reveal link brings it back', async () => {
    const user = userEvent.setup()
    const hiddenVuln = makeVuln({
      id: 'CVE-HIDDEN',
      severity: 'medium',
      affectedComponents: ['comp-gap'],
      matchQuality: { 'comp-gap': 'name-only' },
    })
    const project = makeProject([hiddenVuln])
    project.components = [makeGapComponent()]
    render(<VulnerabilitiesTab project={project} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    expect(screen.queryByRole('heading', { name: 'Medium' })).toBeNull()
    expect(screen.getByText(/low-confidence \(name-only\) match/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(screen.getByRole('heading', { name: 'Medium' })).toBeInTheDocument()
    expect(screen.queryByText(/low-confidence \(name-only\) match/)).toBeNull()
  })

  it('unchecking "Hide low-confidence" also restores hidden name-only matches (same effect as Reveal)', async () => {
    const user = userEvent.setup()
    const hiddenVuln = makeVuln({
      id: 'CVE-HIDDEN-2',
      severity: 'low',
      affectedComponents: ['comp-gap'],
      matchQuality: { 'comp-gap': 'name-only' },
    })
    const project = makeProject([hiddenVuln])
    project.components = [makeGapComponent()]
    render(<VulnerabilitiesTab project={project} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    expect(screen.queryByRole('heading', { name: 'Low' })).toBeNull()

    await user.click(screen.getByLabelText('Hide low-confidence name-only matches'))

    expect(screen.getByRole('heading', { name: 'Low' })).toBeInTheDocument()
  })

  it('never hides a name-only match that is high-risk (KEV), and warns it was kept despite low confidence', () => {
    const kevNameOnly = makeVuln({
      id: 'CVE-KEV-NAMEONLY',
      severity: 'critical',
      isKev: true,
      affectedComponents: ['comp-gap'],
      matchQuality: { 'comp-gap': 'name-only' },
    })
    const project = makeProject([kevNameOnly])
    project.components = [makeGapComponent()]
    render(<VulnerabilitiesTab project={project} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    // Still shown despite the default hide-toggle...
    expect(screen.getByRole('heading', { name: 'Critical' })).toBeInTheDocument()
    // ...and the tab says why, so the low match confidence is never silently lost.
    expect(screen.getByText(/1 high-risk finding kept visible despite low match confidence/)).toBeInTheDocument()
  })

  it('pluralizes both banners correctly when more than one component/finding is affected', () => {
    const hidden1 = makeVuln({
      id: 'CVE-HIDDEN-A',
      severity: 'medium',
      affectedComponents: ['comp-gap-1'],
      matchQuality: { 'comp-gap-1': 'name-only' },
    })
    const hidden2 = makeVuln({
      id: 'CVE-HIDDEN-B',
      severity: 'low',
      affectedComponents: ['comp-gap-2'],
      matchQuality: { 'comp-gap-2': 'name-only' },
    })
    const kev1 = makeVuln({
      id: 'CVE-KEV-A',
      severity: 'critical',
      isKev: true,
      affectedComponents: ['comp-gap-1'],
      matchQuality: { 'comp-gap-1': 'name-only' },
    })
    const kev2 = makeVuln({
      id: 'CVE-KEV-B',
      severity: 'high',
      isKev: true,
      affectedComponents: ['comp-gap-2'],
      matchQuality: { 'comp-gap-2': 'name-only' },
    })
    const project = makeProject([hidden1, hidden2, kev1, kev2])
    project.components = [makeGapComponent('comp-gap-1'), makeGapComponent('comp-gap-2')]
    render(<VulnerabilitiesTab project={project} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    expect(screen.getByText(/2 components with coverage gaps/)).toBeInTheDocument()
    expect(screen.getByText(/have 2 low-confidence \(name-only\) matches hidden/)).toBeInTheDocument()
    expect(screen.getByText(/2 high-risk findings kept visible despite low match confidence/)).toBeInTheDocument()
  })
})

// The per-row expand/collapse panel, the multi-source label, the copy-to-clipboard flow and the
// "View Details" wiring all render only for optional Vulnerability fields the shared makeVuln()
// fixture never sets and no existing test exercises (no row was ever expanded or copied).
describe('VulnerabilitiesTab row details, copy-to-clipboard and view-details wiring', () => {
  const richVuln = makeVuln({
    id: 'CVE-2023-RICH',
    severity: 'high',
    cvssScore: 7.5,
    sources: ['nvd', 'osv'],
    riskScore: 62,
    aliases: ['GHSA-aaaa-bbbb-cccc', 'GHSA-dddd-eeee-ffff', 'OSV-2023-9999'],
    cwes: ['CWE-79', 'CWE-89'],
    references: [
      { source: 'nvd', url: 'https://example.com/exploit', tags: ['Exploit'] },
      { source: 'nvd', url: 'https://example.com/patch', tags: ['Patch'] },
      { source: 'nvd', url: 'https://example.com/mitigation', tags: ['Mitigation'] },
      { source: 'nvd', url: 'https://example.com/advisory', tags: ['Third Party Advisory'] },
      // 5th (still within the slice(0, 5) shown inline) — long enough to trigger truncation.
      { source: 'nvd', url: 'https://example.com/' + 'x'.repeat(90) },
      // 6th — pushed past the inline limit, so it's the one summarized as "+1 more references".
      { source: 'nvd', url: 'https://example.com/no-tags' },
    ],
  })

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  function renderRich(onViewVulnerability: (vuln: Vulnerability) => void = vi.fn()) {
    return render(
      <VulnerabilitiesTab
        project={makeProject([richVuln])}
        projectId="test-proj"
        onViewVulnerability={onViewVulnerability}
      />,
    )
  }

  it('collapsed rows show CWE/exploit/patch/mitigation badges, combined sources and truncated aliases at a glance', () => {
    renderRich()

    expect(screen.getByText('CWE-79')).toBeInTheDocument()
    expect(screen.getByText('Exploit')).toBeInTheDocument()
    expect(screen.getByText('Patch')).toBeInTheDocument()
    expect(screen.getByText('Mitigation')).toBeInTheDocument()
    expect(screen.getByText('NVD + OSV')).toBeInTheDocument()
    // 3 aliases -> first two shown inline, "+1" for the rest.
    expect(screen.getByText(/\+1\)/)).toBeInTheDocument()
  })

  it('shows every alias inline, with no "+N" suffix, when there are two or fewer', () => {
    const vuln = makeVuln({ id: 'CVE-2024-TWOALIAS', aliases: ['GHSA-one', 'GHSA-two'] })
    render(<VulnerabilitiesTab project={makeProject([vuln])} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    expect(screen.getByText('(aka: GHSA-one, GHSA-two)')).toBeInTheDocument()
  })

  it('pluralizes the affected-component count once a vulnerability touches more than one component', () => {
    const vuln = makeVuln({ id: 'CVE-2024-MULTICOMP', affectedComponents: ['comp-1', 'comp-2'] })
    render(<VulnerabilitiesTab project={makeProject([vuln])} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    expect(screen.getByText('2 components')).toBeInTheDocument()
  })

  it('attributes a vulnerability to the SBOM file its affected component came from', () => {
    const sbomFiles: SbomFile[] = [
      {
        id: 'sbom-1',
        filename: 'frontend.cdx.json',
        format: 'cyclonedx',
        formatVersion: '1.5',
        uploadedAt: new Date('2026-01-01'),
        fileHash: 'hash1',
        componentCount: 1,
      },
    ]
    const components: Component[] = [
      {
        id: 'comp-a',
        name: 'lib-a',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
        sbomFileId: 'sbom-1',
      },
    ]
    const vuln = makeVuln({ id: 'CVE-2024-SBOM', affectedComponents: ['comp-a'] })
    const project = makeProject([vuln])
    project.sbomFiles = sbomFiles
    project.components = components
    render(<VulnerabilitiesTab project={project} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    // Exactly one contributing SBOM -> no "+N" summary suffix.
    expect(screen.getByText('From: frontend.cdx.json')).toBeInTheDocument()
  })

  it('summarizes with a "+N" suffix when a vulnerability spans components from more than one SBOM file', () => {
    const sbomFiles: SbomFile[] = [
      {
        id: 'sbom-1',
        filename: 'frontend.cdx.json',
        format: 'cyclonedx',
        formatVersion: '1.5',
        uploadedAt: new Date('2026-01-01'),
        fileHash: 'hash1',
        componentCount: 1,
      },
      {
        id: 'sbom-2',
        filename: 'backend.cdx.json',
        format: 'cyclonedx',
        formatVersion: '1.5',
        uploadedAt: new Date('2026-01-01'),
        fileHash: 'hash2',
        componentCount: 1,
      },
    ]
    const components: Component[] = [
      {
        id: 'comp-a',
        name: 'lib-a',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
        sbomFileId: 'sbom-1',
      },
      {
        id: 'comp-b',
        name: 'lib-b',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
        sbomFileId: 'sbom-2',
      },
    ]
    const vuln = makeVuln({ id: 'CVE-2024-SBOM2', affectedComponents: ['comp-a', 'comp-b'] })
    const project = makeProject([vuln])
    project.sbomFiles = sbomFiles
    project.components = components
    render(<VulnerabilitiesTab project={project} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    expect(screen.getByText('From: frontend.cdx.json +1')).toBeInTheDocument()
  })

  it('expanding a row reveals a CWE deep link and tagged references, with a "+N more" for extras and a truncated long URL', async () => {
    const user = userEvent.setup()
    renderRich()

    await user.click(screen.getByRole('button', { name: 'Expand details' }))

    expect(screen.getByRole('link', { name: /CWE-79/ })).toHaveAttribute(
      'href',
      'https://cwe.mitre.org/data/definitions/79.html',
    )
    // Only 5 of the 6 references render inline; the 6th is summarized.
    expect(screen.getByText('+1 more references')).toBeInTheDocument()
    // The >80-char URL is truncated with an ellipsis rather than rendered in full.
    expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse details' }))
    expect(screen.queryByText('+1 more references')).toBeNull()
  })

  it('reference tags outside the common set (Vendor Advisory, or an unrecognized tag) still render instead of crashing', async () => {
    const user = userEvent.setup()
    const vuln = makeVuln({
      id: 'CVE-TAGCOLOR',
      cwes: ['CWE-1'], // gives it hasDetails so the expand panel has something to show
      references: [
        { source: 'nvd', url: 'https://example.com/vendor', tags: ['Vendor Advisory'] },
        { source: 'nvd', url: 'https://example.com/other', tags: ['Release Notes'] },
      ],
    })
    render(<VulnerabilitiesTab project={makeProject([vuln])} projectId="test-proj" onViewVulnerability={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Expand details' }))

    expect(screen.getByText('Vendor Advisory')).toBeInTheDocument()
    expect(screen.getByText('Release Notes')).toBeInTheDocument()
  })

  it('"View Details" opens the detail view for the exact vulnerability clicked', async () => {
    const user = userEvent.setup()
    const onView = vi.fn()
    renderRich(onView)

    await user.click(screen.getByRole('button', { name: 'View Details' }))

    expect(onView).toHaveBeenCalledWith(richVuln)
  })

  it('copying a vulnerability ID writes it to the clipboard and flips the button to "Copied"', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    // jsdom exposes navigator.clipboard as a getter-only accessor; redefine the whole
    // property descriptor rather than assigning into it (same pattern as NvdCveDetailModal.test.tsx).
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true })
    renderRich()

    await user.click(screen.getByLabelText('Copy CVE-2023-RICH to clipboard'))

    expect(writeText).toHaveBeenCalledWith('CVE-2023-RICH')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Copied CVE-2023-RICH to clipboard')
  })

  it('a failed clipboard write reports an error and leaves the button reading "Copy"', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    // jsdom exposes navigator.clipboard as a getter-only accessor; redefine the whole
    // property descriptor rather than assigning into it (same pattern as NvdCveDetailModal.test.tsx).
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true })
    renderRich()

    await user.click(screen.getByLabelText('Copy CVE-2023-RICH to clipboard'))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard'))
    expect(screen.queryByText('Copied')).toBeNull()
  })

  // Regression guard for the clearTimeout(copiedVulnIdTimerRef.current) call: without it, an
  // earlier copy's 2s reset timer would still fire and wipe the newer "Copied" indicator early.
  it('copying a second vulnerability before the first "Copied" indicator expires does not let it get reset early', async () => {
    vi.useFakeTimers()
    try {
      const writeText = vi.fn().mockResolvedValue(undefined)
      // jsdom exposes navigator.clipboard as a getter-only accessor; redefine the whole
      // property descriptor rather than assigning into it (same pattern as NvdCveDetailModal.test.tsx).
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true })
      const vulnA = makeVuln({ id: 'CVE-TIMER-A' })
      const vulnB = makeVuln({ id: 'CVE-TIMER-B' })
      render(
        <VulnerabilitiesTab
          project={makeProject([vulnA, vulnB])}
          projectId="test-proj"
          onViewVulnerability={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByLabelText('Copy CVE-TIMER-A to clipboard'))
      await act(async () => {
        await Promise.resolve()
      })
      expect(screen.getAllByText('Copied')).toHaveLength(1)

      act(() => {
        vi.advanceTimersByTime(1000) // halfway through A's 2s reset window
      })

      fireEvent.click(screen.getByLabelText('Copy CVE-TIMER-B to clipboard'))
      await act(async () => {
        await Promise.resolve()
      })
      expect(screen.getAllByText('Copied')).toHaveLength(1) // now B's row, not A's

      // This is A's original 2000ms mark. Without clearing A's timer, it would fire here and
      // wipe copiedVulnId even though B was copied only 1s ago.
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getAllByText('Copied')).toHaveLength(1)

      act(() => {
        vi.advanceTimersByTime(1050) // past B's own 2000ms window
      })
      expect(screen.queryByText('Copied')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
