import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppSettings, Project, Vulnerability } from '@@/types'

// Keep needsRefresh/getNextRefreshTime REAL (they are the wiring under test); stub only the
// network-touching refreshVulnerabilityData.
vi.mock('./refreshService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./refreshService')>()
  return { ...actual, refreshVulnerabilityData: vi.fn() }
})
vi.mock('@/components/Toaster', () => ({
  toast: { warning: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { refreshVulnerabilityData } from './refreshService'
import { toast } from '@/components/Toaster'
import { startAutoRefreshScheduler, AUTO_REFRESH_CHECK_INTERVAL_MS } from './autoRefreshScheduler'

const NOW = '2026-01-10T00:00:00Z'
const refresh = vi.mocked(refreshVulnerabilityData)

const makeSettings = (overrides: Partial<AppSettings> = {}): AppSettings =>
  ({ autoRefresh: true, autoRefreshInterval: 24, pauseOnBattery: false, ...overrides }) as unknown as AppSettings

const makeProject = (overrides: Partial<Project> = {}): Project =>
  ({
    id: 'p1',
    name: 'Project One',
    components: [{ id: 'c1', name: 'lib', version: '1.0.0', purl: 'pkg:npm/lib@1.0.0' }],
    vulnerabilities: [],
    // 9 days before NOW — well past the 24h interval, so needsRefresh() returns true by default.
    lastVulnDataRefresh: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as unknown as Project

const okResult = (vulnerabilities: Vulnerability[] = []) => ({
  success: true as const,
  vulnerabilities,
  vulnerabilitiesFound: vulnerabilities.length,
  componentsScanned: 1,
  cached: 0,
  fetched: 1,
  duration: 1,
})

const setBattery = (charging: boolean) => {
  Object.defineProperty(navigator, 'getBattery', {
    configurable: true,
    value: vi.fn().mockResolvedValue({ charging }),
  })
}
const clearBattery = () => {
  if ('getBattery' in navigator) {
    delete (navigator as unknown as Record<string, unknown>).getBattery
  }
}

describe('startAutoRefreshScheduler (FR-03.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    refresh.mockReset()
    refresh.mockResolvedValue(okResult())
    vi.mocked(toast.warning).mockReset()
    clearBattery()
  })
  afterEach(() => {
    vi.useRealTimers()
    clearBattery()
  })

  it('does not refresh any project while auto-refresh is disabled (pins the broken default)', async () => {
    // WHY: today's default (autoRefresh off + no scheduler) never refreshes; this guards that a
    // future scheduler still respects the off switch instead of refreshing unconditionally.
    const stop = startAutoRefreshScheduler({
      getProjects: () => [makeProject()],
      getSettings: () => makeSettings({ autoRefresh: false }),
      updateProject: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_CHECK_INTERVAL_MS)
    expect(refresh).not.toHaveBeenCalled()
    stop()
  })

  it('refreshes a project once its autoRefreshInterval has elapsed', async () => {
    const updateProject = vi.fn()
    const stop = startAutoRefreshScheduler({
      getProjects: () => [makeProject()],
      getSettings: () => makeSettings(),
      updateProject,
    })
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_CHECK_INTERVAL_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ vulnerabilities: [], lastVulnDataRefresh: expect.any(Date) }),
    )
    stop()
  })

  it('does not refresh again before the interval has elapsed', async () => {
    // Project was refreshed exactly at NOW, so needsRefresh() must return false on this tick.
    const stop = startAutoRefreshScheduler({
      getProjects: () => [makeProject({ lastVulnDataRefresh: NOW })],
      getSettings: () => makeSettings(),
      updateProject: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_CHECK_INTERVAL_MS)
    expect(refresh).not.toHaveBeenCalled()
    stop()
  })

  it('skips the scheduled refresh when pauseOnBattery is on and the device is on battery', async () => {
    setBattery(false) // charging:false === running on battery
    const stop = startAutoRefreshScheduler({
      getProjects: () => [makeProject()],
      getSettings: () => makeSettings({ pauseOnBattery: true }),
      updateProject: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_CHECK_INTERVAL_MS)
    expect(refresh).not.toHaveBeenCalled()
    stop()
  })

  it('still refreshes when pauseOnBattery is on but the device is plugged in', async () => {
    setBattery(true) // charging:true === on AC power
    const stop = startAutoRefreshScheduler({
      getProjects: () => [makeProject()],
      getSettings: () => makeSettings({ pauseOnBattery: true }),
      updateProject: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_CHECK_INTERVAL_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
    stop()
  })

  it('fires a toast when a scheduled refresh surfaces a NEW critical vulnerability', async () => {
    refresh.mockResolvedValue(okResult([{ id: 'CVE-2026-9999', severity: 'critical' } as unknown as Vulnerability]))
    const stop = startAutoRefreshScheduler({
      getProjects: () => [makeProject({ vulnerabilities: [] })], // no critical known before
      getSettings: () => makeSettings(),
      updateProject: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_CHECK_INTERVAL_MS)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not re-notify for a critical that was already present before the refresh', async () => {
    // WHY: the notification must fire only on NEWLY-appeared criticals, not on every refresh that
    // still contains a previously-known one — otherwise it becomes noise on every interval.
    const known = { id: 'CVE-2026-1111', severity: 'critical' } as unknown as Vulnerability
    refresh.mockResolvedValue(okResult([known]))
    const stop = startAutoRefreshScheduler({
      getProjects: () => [makeProject({ vulnerabilities: [known] })],
      getSettings: () => makeSettings(),
      updateProject: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_CHECK_INTERVAL_MS)
    expect(toast.warning).not.toHaveBeenCalled()
    stop()
  })
})
