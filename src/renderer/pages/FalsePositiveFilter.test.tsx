import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Project, Vulnerability, Component } from '@@/types'
import type { SystemConfig, FilterBatchResult, FilterResult, MissFilterDetectionConfig } from '@@/types/fpf'
import type { FilteredVulnerability } from '@/components/FPF/FilteredItemsReview'
import type { MissFilterItem } from '@/components/FPF/MissFilterPanel'

const { mockFilterBatch, mockToastSuccess, mockToastError, mockToastInfo } = vi.hoisted(() => ({
  mockFilterBatch: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
}))

// Stub the heavy FPF sub-components so these tests isolate the *page's* own
// orchestration — the routing guard, tab switching, and the empty-review state —
// from the sub-components' internals (which have their own concerns/coverage).
// Each stub keeps its original "<Name> stub" marker (existing tests assert on it)
// and additionally renders the callback props as buttons/derived data so the
// page's own wiring (handlers + the memos that feed them) can be exercised.
vi.mock('@/components/FPF/FilterDashboard', () => ({
  FilterDashboard: (props: {
    config: SystemConfig | null
    filterResult: FilterBatchResult | null
    onRunFilter: () => void
    onConfigure: () => void
    onExportReport: () => void
  }) => (
    <div>
      FilterDashboard stub
      <span data-testid="dashboard-config-name">{props.config ? props.config.project.name : 'none'}</span>
      <span data-testid="has-results">{props.filterResult ? 'yes' : 'no'}</span>
      <button onClick={props.onRunFilter}>Run Filter</button>
      <button onClick={props.onConfigure}>Configure</button>
      <button onClick={props.onExportReport}>Export Report</button>
    </div>
  ),
}))
vi.mock('@/components/FPF/FilteredItemsReview', () => ({
  FilteredItemsReview: (props: {
    items: FilteredVulnerability[]
    onUndo: (vulnerabilityId: string) => void
    onLlmAnalysis: (vulnerabilityId: string) => void
    onExport: (items: FilteredVulnerability[]) => void
  }) => (
    <div>
      FilteredItemsReview stub
      {props.items.map((item) => (
        <div key={item.vulnerabilityId} data-testid={`review-item-${item.vulnerabilityId}`}>
          {[
            item.cveId,
            item.severity,
            item.cvssScore,
            item.componentName,
            item.componentVersion,
            item.filteredBy,
            item.action,
          ].join('|')}
          <button onClick={() => props.onUndo(item.vulnerabilityId)}>{`Undo ${item.vulnerabilityId}`}</button>
        </div>
      ))}
      <button onClick={() => props.onLlmAnalysis('any-vuln-id')}>Request LLM Analysis</button>
      <button onClick={() => props.onExport(props.items)}>Export All Items</button>
      <button onClick={() => props.onExport([])}>Export No Items</button>
    </div>
  ),
}))
vi.mock('@/components/FPF/ConfigWizard', () => ({
  ConfigWizard: (props: { onSave: (config: SystemConfig) => void; onCancel: () => void }) => (
    <div>
      ConfigWizard stub
      <button
        onClick={() =>
          props.onSave({
            project: { name: 'Renamed Project', version: '2.0.0', tier: 'production' },
            cybersecurity: { attackSurface: 'intermediate', safetyRelated: false },
            interfaces: {},
            services: {},
            features: {},
            suppressionRules: [],
          })
        }
      >
        Save Config
      </button>
      <button onClick={props.onCancel}>Cancel Config</button>
    </div>
  ),
}))
vi.mock('@/components/FPF/MissFilterPanel', () => ({
  MissFilterPanel: (props: {
    items: MissFilterItem[]
    config: MissFilterDetectionConfig
    onConfigChange: (config: MissFilterDetectionConfig) => void
    onFlag: (itemId: string) => void
    onUnflag: (itemId: string) => void
    onThresholdChange: (threshold: number) => void
  }) => (
    <div>
      MissFilterPanel stub
      <span data-testid="mf-count">{props.items.length}</span>
      {props.items.map((item) => (
        <div key={item.id} data-testid={`mf-item-${item.vulnerabilityId}`}>
          {[item.cveId, item.detectionReason, String(item.isFlagged)].join('|')}
          <button onClick={() => props.onFlag(item.id)}>{`Flag ${item.id}`}</button>
          <button onClick={() => props.onUnflag(item.id)}>{`Unflag ${item.id}`}</button>
        </div>
      ))}
      {/* A caller passing an id that is already stripped bare (e.g. "mf-0-" with
          nothing after it) must fall back to the raw id instead of flagging "" —
          see the handleMissFlag comment in the page. No real item's id looks like
          this (idx is always followed by a real vulnerability id), so this button
          simulates that degenerate input directly rather than via a rendered item. */}
      <button onClick={() => props.onFlag('mf-0-')}>Flag Bare Stripped Id</button>
      <button onClick={() => props.onUnflag('mf-0-')}>Unflag Bare Stripped Id</button>
      <button onClick={() => props.onConfigChange({ ...props.config, enabled: false })}>Disable Miss Filter</button>
      <button onClick={() => props.onThresholdChange(20)}>Lower Threshold To 20</button>
    </div>
  ),
}))
vi.mock('@/components/Toaster', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    info: mockToastInfo,
    warning: vi.fn(),
  },
}))
vi.mock('@/lib/services/fpf/falsePositiveFilter', () => ({
  // A plain class (not vi.fn().mockImplementation(<arrow fn>)) because the page
  // calls `new FalsePositiveFilter(config)` — an arrow function isn't constructible.
  FalsePositiveFilter: class {
    filterBatch = mockFilterBatch
  },
}))

import { FalsePositiveFilterPage } from './FalsePositiveFilter'
import { useStore } from '@/store/useStore'

const mockProject = {
  id: 'proj-1',
  name: 'Alpha Firmware',
  description: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  components: [],
  vulnerabilities: [],
  sbomFiles: [],
} as unknown as Project

function renderFpf(projectId: string) {
  return render(
    <MemoryRouter initialEntries={[`/project/${projectId}/fpf`]}>
      <Routes>
        <Route path="/project/:projectId/fpf" element={<FalsePositiveFilterPage />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// Renders at a route with no :projectId segment at all (distinct from an
// unmatched-but-present id — see the "no :projectId param" test below).
function renderFpfWithoutProjectIdParam() {
  return render(
    <MemoryRouter initialEntries={['/fpf']}>
      <Routes>
        <Route path="/fpf" element={<FalsePositiveFilterPage />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function makeVuln(overrides: Partial<Vulnerability> & { id: string }): Vulnerability {
  return {
    source: 'nvd',
    severity: 'medium',
    description: 'test vulnerability',
    references: [],
    affectedComponents: [],
    ...overrides,
  } as unknown as Vulnerability
}

function makeComponent(overrides: Partial<Component> & { id: string }): Component {
  return {
    name: 'component',
    version: '1.0.0',
    type: 'library',
    licenses: [],
    vulnerabilities: [],
    ...overrides,
  } as unknown as Component
}

function makeFilterResult(
  overrides: Partial<FilterResult> & { vulnerabilityId: string; componentId: string },
): FilterResult {
  return {
    action: 'kept',
    tier: 1,
    filterType: 'disabled_interface',
    reason: 'default reason',
    confidence: 90,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function makeBatchResult(results: FilterResult[]): FilterBatchResult {
  const bucket = { filtered: 0, kept: 0, escalated: 0 }
  return {
    total: results.length,
    filtered: results.filter((r) => r.action === 'filtered').length,
    kept: results.filter((r) => r.action === 'kept').length,
    escalated: results.filter((r) => r.action === 'escalated').length,
    bySeverity: { critical: { ...bucket }, high: { ...bucket }, medium: { ...bucket }, low: { ...bucket } },
    results,
    processingTimeMs: 5,
  }
}

// A project + batch-result pair designed to jointly exercise the page's derived
// data (resultToReviewItem, missFilterItems) across their documented fallbacks:
//  - CVE-KEV-RECENT: real vuln + real component, filtered, KEV + recently published,
//    high confidence (>= 70) — a miss-filter candidate purely because of the KEV flag.
//  - CVE-LOW-CONF: real vuln (no cvssScore) but component id 'comp-missing-id' has no
//    match, kept, empty `reason` (falls back to filterType), old publish date, low
//    confidence (< 70) — a miss-filter candidate purely because of low confidence.
//  - CVE-DOES-NOT-EXIST: a stale result referencing a vulnerability id that is no
//    longer in the project — resultToReviewItem must still render it (severity/score
//    fallbacks), but missFilterItems must silently drop it (no vuln to reason about).
//  - CVE-HIGH-CONF: real vuln, no publish date, not KEV, high confidence — correctly
//    NOT a miss-filter candidate.
//  - 'mf-0-': a vulnerability id that is itself shaped like an already-stripped
//    miss-filter element id, used to prove handleMissFlag's fallback (see the mock
//    above) resolves to the right vulnerability instead of an empty id.
const compA = makeComponent({ id: 'comp-a', name: 'openssl, inc', version: '1.0.0' })
const compB = makeComponent({ id: 'comp-b', name: 'lib"quoted"', version: '2.0.0' })

const vulnKevRecent = makeVuln({
  id: 'CVE-KEV-RECENT',
  severity: 'critical',
  cvssScore: 9.8,
  affectedComponents: ['comp-a'],
  publishedAt: new Date(),
  isKev: true,
})
const vulnLowConfOld = makeVuln({
  id: 'CVE-LOW-CONF',
  severity: 'medium',
  cvssScore: undefined,
  affectedComponents: [],
  publishedAt: new Date('2000-01-01'),
  isKev: false,
})
const vulnHighConfKept = makeVuln({
  id: 'CVE-HIGH-CONF',
  severity: 'low',
  cvssScore: 3.1,
  affectedComponents: ['comp-missing'],
  publishedAt: undefined,
  isKev: false,
})
const vulnEdgeId = makeVuln({
  id: 'mf-0-',
  severity: 'high',
  cvssScore: 7.2,
  affectedComponents: ['comp-a'],
  publishedAt: undefined,
  isKev: false,
})

const richProject = {
  id: 'proj-rich',
  name: 'Rich Project',
  description: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  components: [compA, compB],
  vulnerabilities: [vulnKevRecent, vulnLowConfOld, vulnHighConfKept, vulnEdgeId],
  sbomFiles: [],
} as unknown as Project

const resultFiltered = makeFilterResult({
  vulnerabilityId: 'CVE-KEV-RECENT',
  componentId: 'comp-a',
  action: 'filtered',
  reason: 'Matched rule: disabled, safe',
  confidence: 95,
  tier: 1,
  filterType: 'disabled_interface',
})
const resultKeptLowConfidence = makeFilterResult({
  vulnerabilityId: 'CVE-LOW-CONF',
  componentId: 'comp-missing-id',
  action: 'kept',
  reason: '',
  confidence: 40,
  tier: 2,
  filterType: 'version_mismatch',
})
const resultEscalatedStale = makeFilterResult({
  vulnerabilityId: 'CVE-DOES-NOT-EXIST',
  componentId: 'comp-a',
  action: 'escalated',
  reason: 'Escalated for review',
  confidence: 80,
  tier: 3,
  filterType: 'attack_path_blocked',
})
const resultHighConfidenceNotFlagged = makeFilterResult({
  vulnerabilityId: 'CVE-HIGH-CONF',
  componentId: 'comp-b',
  action: 'kept',
  reason: 'High confidence\nreal positive',
  confidence: 92,
  tier: 1,
  filterType: 'internal_only',
})
const resultEdgeCase = makeFilterResult({
  vulnerabilityId: 'mf-0-',
  componentId: 'comp-a',
  action: 'kept',
  reason: 'Edge case id needs the itemId fallback',
  confidence: 30,
  tier: 2,
  filterType: 'version_mismatch',
})

const richBatchResult = makeBatchResult([
  resultFiltered,
  resultKeptLowConfidence,
  resultEscalatedStale,
  resultHighConfidenceNotFlagged,
  resultEdgeCase,
])

describe('FalsePositiveFilterPage', () => {
  beforeEach(() => {
    useStore.getState().resetStore()
    useStore.setState({ projects: [mockProject] })
    mockFilterBatch.mockReset()
    mockToastSuccess.mockClear()
    mockToastError.mockClear()
    mockToastInfo.mockClear()
  })

  it('guards a missing project with an empty state instead of crashing', () => {
    // A stale/bad :projectId must not render the filter against `undefined` — it
    // shows a recoverable "No Project Selected" state with a way back.
    renderFpf('does-not-exist')
    expect(screen.getByRole('heading', { name: /No Project Selected/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Go to Dashboard/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('renders the four filter tabs and defaults to the dashboard for a valid project', () => {
    renderFpf('proj-1')
    expect(screen.getByText(/Project: Alpha Firmware/)).toBeInTheDocument()
    for (const name of ['Dashboard', 'Review Filtered', 'Configuration', 'Miss-Filter Detection']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    // Dashboard is the default tab.
    expect(screen.getByText('FilterDashboard stub')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to the Configuration tab on click', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }))
    expect(screen.getByText('ConfigWizard stub')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the empty "No Filter Results" state on the Review tab before any filter runs', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Review Filtered' }))
    // No batch result yet, so the page (not a sub-component) renders the empty state.
    expect(screen.getByRole('heading', { name: /No Filter Results/i })).toBeInTheDocument()
    expect(screen.queryByText('FilteredItemsReview stub')).not.toBeInTheDocument()
  })

  it('treats a route with no :projectId param the same as a missing project, not just a mismatched one', () => {
    // useParams() returns projectId=undefined here, exercising the ternary's other
    // branch from the "mismatched id" case above (which yields a truthy, unmatched string).
    renderFpfWithoutProjectIdParam()
    expect(screen.getByRole('heading', { name: /No Project Selected/i })).toBeInTheDocument()
  })

  it('navigates back to the dashboard when "Go to Dashboard" is clicked from the no-project state', async () => {
    renderFpf('does-not-exist')
    await userEvent.click(screen.getByRole('button', { name: /Go to Dashboard/i }))
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('opens the configuration wizard via the dashboard’s own Configure action, not only the tab button', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('button', { name: 'Configure' }))
    expect(screen.getByText('ConfigWizard stub')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows an info toast and exports nothing when Export Report is used before any filter has run', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('button', { name: 'Export Report' }))
    expect(mockToastInfo).toHaveBeenCalledWith('Nothing to Export', expect.stringContaining('Run the filter first'))
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it('runs the filter but stays on the dashboard tab when there are no results to review', async () => {
    // A batch result with zero entries must not force the user into an empty Review tab.
    mockFilterBatch.mockResolvedValueOnce(makeBatchResult([]))
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('button', { name: 'Run Filter' }))

    await waitFor(() => expect(screen.getByTestId('has-results')).toHaveTextContent('yes'))
    expect(screen.getByText('FilterDashboard stub')).toBeInTheDocument()
    expect(screen.queryByText('FilteredItemsReview stub')).not.toBeInTheDocument()
  })

  it('surfaces the real error message and recovers when the filter run rejects with an Error', async () => {
    mockFilterBatch.mockRejectedValueOnce(new Error('Tier 2 attack graph build failed'))
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('button', { name: 'Run Filter' }))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Filter Failed', 'Tier 2 attack graph build failed'),
    )
    // The page recovers to a clickable state instead of getting stuck mid-filter.
    expect(screen.getByRole('button', { name: 'Run Filter' })).toBeInTheDocument()
  })

  it('falls back to a generic error message when the filter run rejects with a non-Error value', async () => {
    // filterBatch is async infrastructure code; a thrown string/object is as plausible
    // as a real Error, and the user must still get an actionable message either way.
    mockFilterBatch.mockRejectedValueOnce('a raw string rejection, not an Error instance')
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('button', { name: 'Run Filter' }))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Filter Failed', 'Failed to run the false-positive filter.'),
    )
  })

  it('saves a new configuration and returns to the dashboard tab with it applied', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Config' }))

    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    // Proves handleConfigSave actually replaced the config, not just switched tabs.
    expect(screen.getByTestId('dashboard-config-name')).toHaveTextContent('Renamed Project')
  })

  it('returns to the dashboard tab without saving when the config wizard is cancelled', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Config' }))

    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    // The auto-generated default config (from the project name) is still in place.
    expect(screen.getByTestId('dashboard-config-name')).toHaveTextContent('Alpha Firmware')
  })

  describe('after a successful filter run with mixed and edge-case results', () => {
    beforeEach(async () => {
      useStore.setState({ projects: [richProject] })
      mockFilterBatch.mockResolvedValueOnce(richBatchResult)
      renderFpf('proj-rich')
      await userEvent.click(screen.getByRole('button', { name: 'Run Filter' }))
      // A non-empty result set auto-switches to the Review tab.
      await screen.findByText('FilteredItemsReview stub')
    })

    it('derives review-item fields using the documented fallbacks for missing vulns/components/reasons', () => {
      // Full match: severity/score from the vuln, name/version from the component, reason as-is.
      expect(screen.getByTestId('review-item-CVE-KEV-RECENT').textContent).toContain(
        'CVE-KEV-RECENT|critical|9.8|openssl, inc|1.0.0|Matched rule: disabled, safe|filtered',
      )
      // No cvssScore on the vuln, and componentId 'comp-missing-id' matches nothing, and an
      // empty `reason` falls back to filterType — three fallbacks on one item.
      expect(screen.getByTestId('review-item-CVE-LOW-CONF').textContent).toContain(
        'CVE-LOW-CONF|medium|0|comp-missing-id|unknown|version_mismatch|kept',
      )
      // A stale result referencing a vulnerability no longer in the project still renders
      // (severity/score fall back) instead of crashing the review list.
      expect(screen.getByTestId('review-item-CVE-DOES-NOT-EXIST').textContent).toContain(
        'CVE-DOES-NOT-EXIST|medium|0|openssl, inc|1.0.0|Escalated for review|escalated',
      )
    })

    it('undoing an item flips only that item’s action to kept (undoneIds override)', async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Undo CVE-KEV-RECENT' }))
      expect(mockToastSuccess).toHaveBeenCalledWith('Filter Undone', expect.stringContaining('CVE-KEV-RECENT'))

      await waitFor(() =>
        expect(screen.getByTestId('review-item-CVE-KEV-RECENT').textContent).toContain(
          'CVE-KEV-RECENT|critical|9.8|openssl, inc|1.0.0|Matched rule: disabled, safe|kept',
        ),
      )
      // A different item's action is untouched by the undo.
      expect(screen.getByTestId('review-item-CVE-DOES-NOT-EXIST').textContent).toContain(
        'CVE-DOES-NOT-EXIST|medium|0|openssl, inc|1.0.0|Escalated for review|escalated',
      )
    })

    it('exports a CSV report from the dashboard, quoting a comma-containing field correctly', async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Dashboard' }))

      // jsdom's Blob polyfill here has no .text()/.arrayBuffer(), so capture the raw
      // CSV string from the Blob constructor call instead of reading it back off the
      // instance. spyOn (no mockImplementation) still constructs a real Blob.
      const blobSpy = vi.spyOn(globalThis, 'Blob')
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
      const clickSpy = vi.fn()
      const anchor = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
      const realCreateElement = document.createElement.bind(document)
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => (tag === 'a' ? anchor : realCreateElement(tag)))

      await userEvent.click(screen.getByRole('button', { name: 'Export Report' }))

      expect(anchor.download).toMatch(/^fpf-filter-results-\d{4}-\d{2}-\d{2}\.csv$/)
      expect(clickSpy).toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith('Report Exported', expect.stringContaining('5 items'))

      expect(blobSpy).toHaveBeenCalledTimes(1)
      const [parts] = blobSpy.mock.calls[0]
      const csvText = String(parts[0])
      // The reason contains a comma, so escapeCsvField must wrap the whole field in quotes.
      expect(csvText).toContain('"Matched rule: disabled, safe"')

      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
      blobSpy.mockRestore()
    })

    it('exports nothing for an empty selection but exports a CSV for a non-empty one', async () => {
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
      const clickSpy = vi.fn()
      const anchor = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
      const realCreateElement = document.createElement.bind(document)
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => (tag === 'a' ? anchor : realCreateElement(tag)))

      await userEvent.click(screen.getByRole('button', { name: 'Export No Items' }))
      expect(createObjectURLSpy).not.toHaveBeenCalled()
      expect(mockToastSuccess).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: 'Export All Items' }))
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith('Exported', expect.stringContaining('5 items'))

      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })

    it('shows a "planned for a future release" notice when LLM analysis is requested from the review tab', async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Request LLM Analysis' }))
      expect(mockToastInfo).toHaveBeenCalledWith('LLM Analysis Unavailable', expect.stringContaining('future release'))
    })

    it('flags KEV and low-confidence results as miss-filter candidates while excluding stale/high-confidence ones', async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Miss-Filter Detection' }))

      expect(screen.getByTestId('mf-count')).toHaveTextContent('3')
      expect(screen.getByTestId('mf-item-CVE-KEV-RECENT').textContent).toContain('Known exploit (CISA KEV)')
      expect(screen.getByTestId('mf-item-CVE-LOW-CONF').textContent).toContain('Low confidence (40%)')
      expect(screen.getByTestId('mf-item-mf-0-').textContent).toContain('Low confidence (30%)')
      // A stale result (no matching vuln) and a normal high-confidence/non-KEV result are
      // correctly NOT surfaced as miss-filter candidates.
      expect(screen.queryByTestId('mf-item-CVE-DOES-NOT-EXIST')).not.toBeInTheDocument()
      expect(screen.queryByTestId('mf-item-CVE-HIGH-CONF')).not.toBeInTheDocument()
    })

    it('flags and unflags a miss-filter item through its normal encoded id', async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Miss-Filter Detection' }))

      await userEvent.click(screen.getByRole('button', { name: /^Flag mf-\d+-CVE-LOW-CONF$/ }))
      expect(screen.getByTestId('mf-item-CVE-LOW-CONF').textContent).toContain('CVE-LOW-CONF|Low confidence (40%)|true')

      await userEvent.click(screen.getByRole('button', { name: /^Unflag mf-\d+-CVE-LOW-CONF$/ }))
      expect(screen.getByTestId('mf-item-CVE-LOW-CONF').textContent).toContain(
        'CVE-LOW-CONF|Low confidence (40%)|false',
      )
    })

    it('falls back to the raw id instead of an empty one when a flag id has already been stripped bare', async () => {
      // Documented edge case (see the mock and handleMissFlag's comment): an id of
      // exactly "mf-0-" strips to "", and `vulnId || itemId` must use the itemId instead
      // of flagging "" — proven here because a real vulnerability is literally named 'mf-0-'.
      await userEvent.click(screen.getByRole('tab', { name: 'Miss-Filter Detection' }))
      expect(screen.getByTestId('mf-item-mf-0-').textContent).toContain('mf-0-|Low confidence (30%)|false')

      await userEvent.click(screen.getByRole('button', { name: 'Flag Bare Stripped Id' }))
      expect(screen.getByTestId('mf-item-mf-0-').textContent).toContain('mf-0-|Low confidence (30%)|true')

      await userEvent.click(screen.getByRole('button', { name: 'Unflag Bare Stripped Id' }))
      expect(screen.getByTestId('mf-item-mf-0-').textContent).toContain('mf-0-|Low confidence (30%)|false')
    })

    it('excludes an item from the miss-filter queue once the user has undone it', async () => {
      // Undoing is on the (already active) Review tab.
      await userEvent.click(screen.getByRole('button', { name: 'Undo CVE-KEV-RECENT' }))

      await userEvent.click(screen.getByRole('tab', { name: 'Miss-Filter Detection' }))
      expect(screen.queryByTestId('mf-item-CVE-KEV-RECENT')).not.toBeInTheDocument()
      expect(screen.getByTestId('mf-count')).toHaveTextContent('2')
    })

    it('lowers the confidence threshold to drop borderline items while keeping the KEV-flagged one', async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Miss-Filter Detection' }))
      expect(screen.getByTestId('mf-count')).toHaveTextContent('3')

      await userEvent.click(screen.getByRole('button', { name: 'Lower Threshold To 20' }))

      // CVE-LOW-CONF (40%) and 'mf-0-' (30%) no longer qualify as low-confidence at a
      // threshold of 20; CVE-KEV-RECENT stays because of its KEV flag, not confidence.
      await waitFor(() => expect(screen.getByTestId('mf-count')).toHaveTextContent('1'))
      expect(screen.getByTestId('mf-item-CVE-KEV-RECENT')).toBeInTheDocument()
      expect(screen.queryByTestId('mf-item-CVE-LOW-CONF')).not.toBeInTheDocument()
      expect(screen.queryByTestId('mf-item-mf-0-')).not.toBeInTheDocument()
    })

    it('empties the miss-filter queue when detection is disabled via the config callback', async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Miss-Filter Detection' }))
      expect(screen.getByTestId('mf-count')).toHaveTextContent('3')

      await userEvent.click(screen.getByRole('button', { name: 'Disable Miss Filter' }))

      await waitFor(() => expect(screen.getByTestId('mf-count')).toHaveTextContent('0'))
    })
  })
})
