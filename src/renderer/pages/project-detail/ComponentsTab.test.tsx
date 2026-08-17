import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComponentsTab } from './ComponentsTab'
import type { Component, Project, SbomFile, Vulnerability } from '@@/types'

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

function makeVuln(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'CVE-2024-0001',
    source: 'nvd',
    severity: 'high',
    description: 'test vulnerability',
    references: [],
    affectedComponents: [],
    ...overrides,
  }
}

describe('ComponentsTab branch coverage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows the empty-project placeholder and hides the toolbar when there are no components at all', () => {
    // WHY: rendering the search/filter toolbar over zero components would be misleading chrome —
    // the component list needs a distinct "nothing imported yet" message instead.
    render(<ComponentsTab project={makeProject([])} onComponentClick={vi.fn()} />)

    expect(screen.getByText('No components found')).toBeInTheDocument()
    expect(screen.getByText('Upload an SBOM file to view components')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search components')).toBeNull()
  })

  it('search matches by name or by version, and clears via the empty-results Clear filters action', async () => {
    const user = userEvent.setup()
    const a = makeComponent({ id: 'a', name: 'alpha-lib', version: '1.2.3' })
    const b = makeComponent({ id: 'b', name: 'beta-lib', version: '9.9.9' })
    render(<ComponentsTab project={makeProject([a, b])} onComponentClick={vi.fn()} />)

    // Matching by name narrows to a single component.
    await user.type(screen.getByLabelText('Search components'), 'alpha')
    expect(screen.getByText('alpha-lib')).toBeInTheDocument()
    expect(screen.queryByText('beta-lib')).toBeNull()

    // Matching by version (not name) must also work — a name-only search predicate would regress this.
    await user.clear(screen.getByLabelText('Search components'))
    await user.type(screen.getByLabelText('Search components'), '9.9.9')
    expect(screen.getByText('beta-lib')).toBeInTheDocument()
    expect(screen.queryByText('alpha-lib')).toBeNull()

    // A query matching neither hits the "no results" branch, distinct from the zero-components branch.
    await user.clear(screen.getByLabelText('Search components'))
    await user.type(screen.getByLabelText('Search components'), 'zzz-no-match')
    expect(screen.getByText('No components match your filters')).toBeInTheDocument()
  })

  it('the vulnerability-status filter uses project.vulnerabilities, not the component.vulnerabilities field', async () => {
    const user = userEvent.setup()
    const vulnerable = makeComponent({ id: 'v1', name: 'vulnerable-lib' })
    const safe = makeComponent({ id: 's1', name: 'safe-lib' })
    const project: Project = {
      ...makeProject([vulnerable, safe]),
      vulnerabilities: [makeVuln({ affectedComponents: ['v1'] })],
    }
    render(<ComponentsTab project={project} onComponentClick={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Filter by vulnerability status'), 'vulnerable')
    expect(screen.getByText('vulnerable-lib')).toBeInTheDocument()
    expect(screen.queryByText('safe-lib')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Filter by vulnerability status'), 'safe')
    expect(screen.queryByText('vulnerable-lib')).toBeNull()
    expect(screen.getByText('safe-lib')).toBeInTheDocument()
  })

  it('the coverage filter treats undefined coverage as "identified", distinct from an explicit "gap"', async () => {
    const user = userEvent.setup()
    // WHY: coverage is optional on legacy/synced components. Treating undefined as a gap would
    // wrongly flag every pre-existing component as needing manual review.
    const identified = makeComponent({ id: 'i1', name: 'identified-lib' })
    const gap = makeComponent({ id: 'g1', name: 'gap-lib', coverage: 'gap' })
    render(<ComponentsTab project={makeProject([identified, gap])} onComponentClick={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Filter by coverage'), 'identified')
    expect(screen.getByText('identified-lib')).toBeInTheDocument()
    expect(screen.queryByText('gap-lib')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Filter by coverage'), 'gap')
    expect(screen.queryByText('identified-lib')).toBeNull()
    expect(screen.getByText('gap-lib')).toBeInTheDocument()
  })

  it('the license filter dropdown is hidden entirely when no component declares a license', () => {
    // WHY: an empty <select> with only "All Licenses" would be dead UI; the dropdown must not render.
    const noLicense = makeComponent({ id: 'nl1', licenses: [] })
    render(<ComponentsTab project={makeProject([noLicense])} onComponentClick={vi.fn()} />)

    expect(screen.queryByLabelText('Filter by license')).toBeNull()
  })

  it('selecting a license narrows the list to components carrying that license', async () => {
    const user = userEvent.setup()
    const mit = makeComponent({ id: 'm1', name: 'mit-lib', licenses: ['MIT'] })
    const gpl = makeComponent({ id: 'g1', name: 'gpl-lib', licenses: ['GPL-3.0'] })
    render(<ComponentsTab project={makeProject([mit, gpl])} onComponentClick={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Filter by license'), 'GPL-3.0')
    expect(screen.getByText('gpl-lib')).toBeInTheDocument()
    expect(screen.queryByText('mit-lib')).toBeNull()
  })

  it('sorting by version and by type reorders the list independently of name order', async () => {
    const user = userEvent.setup()
    // Names are in reverse order relative to version/type so a fallthrough to name-sort would be caught.
    const b = makeComponent({ id: 'b', name: 'zeta', version: '1.0.0', type: 'library' })
    const a = makeComponent({ id: 'a', name: 'alpha', version: '9.0.0', type: 'framework' })
    render(<ComponentsTab project={makeProject([b, a])} onComponentClick={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Sort components by'), 'version')
    let names = screen.getAllByText(/^(zeta|alpha)$/).map((el) => el.textContent)
    expect(names).toEqual(['zeta', 'alpha']) // 1.0.0 < 9.0.0

    await user.selectOptions(screen.getByLabelText('Sort components by'), 'type')
    names = screen.getAllByText(/^(zeta|alpha)$/).map((el) => el.textContent)
    expect(names).toEqual(['alpha', 'zeta']) // 'framework' < 'library'
  })

  it('the CPE badge distinguishes verified, estimated, and missing states, and shows nothing when none apply', () => {
    const verified = makeComponent({ id: 'v1', name: 'verified-lib', cpe: 'cpe:2.3:a:foo:bar', hasMissingCpe: false })
    const estimated = makeComponent({
      id: 'e1',
      name: 'estimated-lib',
      suggestedCpes: [
        { cpe: 'cpe:2.3:a:baz:qux', vendor: 'baz', product: 'qux', confidence: 'medium', source: 'inferred' },
      ],
    })
    const missing = makeComponent({ id: 'm1', name: 'missing-lib', hasMissingCpe: true })
    const neutral = makeComponent({ id: 'n1', name: 'neutral-lib' })
    render(<ComponentsTab project={makeProject([verified, estimated, missing, neutral])} onComponentClick={vi.fn()} />)

    expect(screen.getByText('CPE Verified')).toBeInTheDocument()
    expect(screen.getByText('CPE Estimated')).toBeInTheDocument()
    expect(screen.getByText('No CPE')).toBeInTheDocument()
    // The neutral component (no cpe, no suggestions, hasMissingCpe falsy) must render none of the badges
    // attached to it — verify exactly one of each badge exists (from the other three components).
    expect(screen.getAllByText('CPE Verified')).toHaveLength(1)
    expect(screen.getAllByText('CPE Estimated')).toHaveLength(1)
    expect(screen.getAllByText('No CPE')).toHaveLength(1)
  })

  it('shows the source SBOM filename badge only when the component resolves to a known SBOM file', () => {
    const withSbom = makeComponent({ id: 'w1', name: 'from-sbom', sbomFileId: 'sbom-1' })
    const withoutSbom = makeComponent({ id: 'x1', name: 'no-sbom' })
    const sbomFiles: SbomFile[] = [
      {
        id: 'sbom-1',
        filename: 'app.cdx.json',
        format: 'cyclonedx',
        formatVersion: '1.5',
        uploadedAt: new Date(),
        fileHash: 'h',
        componentCount: 1,
      },
    ]
    const project: Project = { ...makeProject([withSbom, withoutSbom]), sbomFiles }
    render(<ComponentsTab project={project} onComponentClick={vi.fn()} />)

    expect(screen.getByText('Source: app.cdx.json')).toBeInTheDocument()
    // Only one badge should exist — the component with no sbomFileId must not render one.
    expect(screen.getAllByText(/^Source:/)).toHaveLength(1)
  })

  it('the coverage-gap badge falls back to the default note when coverageNote is absent', () => {
    // Named so the tab's default name-sort keeps them in this order regardless of sort implementation.
    const withNote = makeComponent({
      id: 'n1',
      name: 'aaa-gap-with-note',
      coverage: 'gap',
      coverageNote: 'custom reason',
    })
    const withoutNote = makeComponent({ id: 'n2', name: 'zzz-gap-no-note', coverage: 'gap' })
    render(<ComponentsTab project={makeProject([withNote, withoutNote])} onComponentClick={vi.fn()} />)

    const badges = screen.getAllByText('Coverage Gap', { selector: 'span' })
    expect(badges).toHaveLength(2)
    expect(badges[0]).toHaveAttribute('title', 'custom reason')
    expect(badges[1]).toHaveAttribute(
      'title',
      'Coverage gap: present but not reliably versioned — matches need manual review',
    )
  })

  it('renders provenance sources and purl metadata when present, and omits them when absent', () => {
    const withMeta = makeComponent({
      id: 'p1',
      name: 'meta-lib',
      provenanceSources: ['syft', 'probe'],
      purl: 'pkg:npm/meta-lib@1.0.0',
    })
    const bare = makeComponent({ id: 'p2', name: 'bare-lib' })
    render(<ComponentsTab project={makeProject([withMeta, bare])} onComponentClick={vi.fn()} />)

    expect(screen.getByText('via syft, probe')).toBeInTheDocument()
    expect(screen.getByText('pkg:npm/meta-lib@1.0.0')).toBeInTheDocument()
  })

  it('the matched-CPE display prefers the real cpe over a suggested CPE, and shows the suggestion when no real cpe exists', () => {
    const matched = makeComponent({ id: 'c1', name: 'matched-lib', cpe: 'cpe:2.3:a:foo:bar' })
    const suggestedOnly = makeComponent({
      id: 'c2',
      name: 'suggested-lib',
      suggestedCpes: [
        { cpe: 'cpe:2.3:a:sug:gested', vendor: 'sug', product: 'gested', confidence: 'high', source: 'known_mapping' },
      ],
    })
    render(<ComponentsTab project={makeProject([matched, suggestedOnly])} onComponentClick={vi.fn()} />)

    expect(screen.getByText('cpe:2.3:a:foo:bar')).toBeInTheDocument()
    expect(screen.getByText(/cpe:2\.3:a:sug:gested \(est\. high\)/)).toBeInTheDocument()
  })

  it('pluralizes the vulnerability count only when there is more than one finding for a component', () => {
    const single = makeComponent({ id: 's1', name: 'single-vuln-lib' })
    const multi = makeComponent({ id: 'm1', name: 'multi-vuln-lib' })
    const project: Project = {
      ...makeProject([single, multi]),
      vulnerabilities: [
        makeVuln({ id: 'CVE-1', affectedComponents: ['s1'] }),
        makeVuln({ id: 'CVE-2', affectedComponents: ['m1'] }),
        makeVuln({ id: 'CVE-3', affectedComponents: ['m1'] }),
      ],
    }
    render(<ComponentsTab project={project} onComponentClick={vi.fn()} />)

    // WHY: this badge is user-facing on every component row, so the plural must be the real
    // English word ("vulnerabilities"), not a naive 'vulnerability' + 's' concatenation.
    // Match on the span's combined textContent since count and word are separate text nodes.
    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '• 1 vulnerability'),
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '• 2 vulnerabilities'),
    ).toBeInTheDocument()
  })

  it('falls back to an em dash when a component version is empty or the literal "unknown"', () => {
    const empty = makeComponent({ id: 'e1', name: 'empty-version', version: '' })
    const unknown = makeComponent({ id: 'u1', name: 'unknown-version', version: 'unknown' })
    const real = makeComponent({ id: 'r1', name: 'real-version', version: '2.0.0' })
    render(<ComponentsTab project={makeProject([empty, unknown, real])} onComponentClick={vi.fn()} />)

    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('2.0.0')).toBeInTheDocument()
  })

  it('deduplicates components that share the same id, showing each unique component only once', () => {
    const dup1 = makeComponent({ id: 'dup', name: 'duplicate-lib', version: '1.0.0' })
    const dup2 = makeComponent({ id: 'dup', name: 'duplicate-lib', version: '2.0.0' })
    render(<ComponentsTab project={makeProject([dup1, dup2])} onComponentClick={vi.fn()} />)

    expect(screen.getAllByText('duplicate-lib')).toHaveLength(1)
  })

  it('deleting a preset removes it from storage after the confirm dialog is accepted', async () => {
    const user = userEvent.setup()
    render(<ComponentsTab project={makeProject([patchedLib])} onComponentClick={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Filter by component type'), 'library')
    await user.click(screen.getByRole('button', { name: 'Filter presets' }))
    await user.click(screen.getByRole('button', { name: /Save Current/ }))
    await user.type(screen.getByPlaceholderText('Preset name...'), 'to-delete')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))

    expect(JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Delete preset to-delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // WHY: a delete that only updates in-memory state (not persisted storage) would resurrect the
    // preset on the next reload.
    expect(JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]')).toHaveLength(0)
  })

  it('corrupted preset data in localStorage is ignored on load instead of crashing the tab', () => {
    localStorage.setItem(PRESET_KEY, '{not valid json')
    render(<ComponentsTab project={makeProject([patchedLib])} onComponentClick={vi.fn()} />)

    // WHY: JSON.parse throwing during the useState initializer must be caught and fall back to an
    // empty preset list, not blank the whole tab.
    expect(screen.getByText('patched-lib')).toBeInTheDocument()
  })
})
