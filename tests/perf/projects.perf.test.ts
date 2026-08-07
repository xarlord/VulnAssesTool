/**
 * FR-01.1 / NFR-02.1 — 1,000+ concurrent project capacity.
 *
 * PRD.md requires the app to "support minimum 1,000 concurrent projects". Before this file,
 * zero test in the repo exercised the store's project actions past a handful of fixtures — a
 * silent cap, an accidental O(n^2) blowup, or a truncating slice() introduced anywhere in
 * addProject/updateProject/deleteProject would have shipped undetected.
 *
 * WHY this guards intent (Rule 9): the risk isn't "does the array grow" (any array does) — it's
 * whether a FUTURE change (e.g. a defensive `.slice(0, N)`, a Set-based dedup keyed wrong, or a
 * pagination shortcut that only returns page 1) silently truncates the collection at scale. This
 * test creates 1,000 real projects through the real addProject action, then specifically checks a
 * project in the MIDDLE and one at the very END are both present, updatable, and deletable —
 * positions a length-only check or an off-by-one page-size cap could still pass while being
 * broken. A soft wall-clock budget is a secondary canary against an accidental O(n^2) regression
 * in the per-write zustand `persist` serialization (partialize already strips components/
 * vulnerabilities per project, so this measures the store's own overhead, not payload size).
 *
 * This is shared evidence for both FR-01.1 and NFR-02.1 (same underlying PRD claim) — see
 * docs/reports/prd-remediation-plan.md's FR-01.1 section; do not duplicate this test there.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Project } from '@@/types'

// The store's project actions fire real (fire-and-forget) network calls on delete, and
// conditionally on update — mock them so 1,000 iterations don't each attempt a real fetch
// against a nonexistent server, matching the exact mock shape useStore.test.ts already uses.
vi.mock('@/lib/api/projectPersistence', () => ({
  saveProjectToServer: vi.fn().mockResolvedValue(undefined),
  loadProjectFromServer: vi.fn().mockResolvedValue(null),
  deleteProjectFromServer: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/refresh', () => ({
  refreshVulnerabilityData: vi.fn(),
}))

vi.mock('@/lib/settings', () => ({
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  setDefaultProfile: vi.fn(),
  getProfiles: vi.fn(() => []),
  switchProfile: vi.fn(),
  initializeProfiles: vi.fn(),
  exportSettingsToFile: vi.fn(),
  importSettingsFromFile: vi.fn(),
}))

const { useStore } = await import('@/store/useStore')

function createLocalStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null,
  }
}

const PROJECT_COUNT = 1_000
// Generous canary, not a tight perf budget: the store's zustand `persist` middleware
// re-serializes the whole project list on every set() call, so 1,000 sequential writes are
// already inherently ~O(n^2) by design (measured ~6s on a dev machine) — this only guards
// against a further, much worse multiplicative regression (e.g. O(n^3)). The correctness
// assertions in the test body below are the real, machine-independent signal this test exists for.
const TIME_BUDGET_MS = 20_000

function makeProject(i: number): Project {
  return {
    id: `perf-project-${i}`,
    name: `Perf Project ${i}`,
    description: 'FR-01.1 capacity fixture',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 0,
      vulnerableComponents: 0,
    },
  }
}

describe('FR-01.1 — 1,000 concurrent projects', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    useStore.getState().resetStore()
  })

  afterEach(() => {
    useStore.getState().resetStore()
    vi.unstubAllGlobals()
  })

  it('creates, updates, and deletes across 1,000 projects with no truncation, within budget', () => {
    const start = performance.now()

    for (let i = 0; i < PROJECT_COUNT; i++) {
      useStore.getState().addProject(makeProject(i))
    }

    // Correctness at scale, not just "the array grew": no cap/slice silently dropped rows.
    expect(useStore.getState().projects).toHaveLength(PROJECT_COUNT)

    // A middle and a last project are both individually retrievable — a page-size cap or an
    // off-by-one slice would still pass a bare `.length` check while failing this.
    const middleId = 'perf-project-500'
    const lastId = `perf-project-${PROJECT_COUNT - 1}`
    expect(useStore.getState().projects.find((p) => p.id === middleId)).toBeDefined()
    expect(useStore.getState().projects.find((p) => p.id === lastId)).toBeDefined()

    // Update lands on the exact target project, not a neighbor, at scale.
    useStore.getState().updateProject(middleId, { name: 'Renamed Middle Project' })
    expect(useStore.getState().projects.find((p) => p.id === middleId)?.name).toBe('Renamed Middle Project')
    expect(useStore.getState().projects.find((p) => p.id === lastId)?.name).toBe(`Perf Project ${PROJECT_COUNT - 1}`)

    // Delete removes exactly one project, leaving the rest intact.
    useStore.getState().deleteProject(lastId)
    expect(useStore.getState().projects).toHaveLength(PROJECT_COUNT - 1)
    expect(useStore.getState().projects.find((p) => p.id === lastId)).toBeUndefined()
    expect(useStore.getState().projects.find((p) => p.id === middleId)).toBeDefined()

    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(TIME_BUDGET_MS)
  })
})
