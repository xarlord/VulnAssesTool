import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VulnerabilitiesTab } from './VulnerabilitiesTab'
import type { Project, ProjectStatistics, Vulnerability } from '@@/types'

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
})
