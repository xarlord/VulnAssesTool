import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VulnerabilitiesTab } from './VulnerabilitiesTab'
import type { Project, ProjectStatistics, Vulnerability } from '@@/types'

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
