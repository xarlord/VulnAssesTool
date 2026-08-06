import type { AppSettings, Project } from '@@/types'
import { toast } from '@/components/Toaster'
import { needsRefresh, refreshVulnerabilityData } from './refreshService'

/** How often the scheduler wakes to check whether any project is due for a refresh (ms). */
export const AUTO_REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000

export interface AutoRefreshSchedulerDeps {
  getProjects: () => Project[]
  getSettings: () => AppSettings
  updateProject: (id: string, updates: Partial<Project>) => void
}

/**
 * Detect whether the device is currently running on battery. Uses the (deprecated, Chromium-only)
 * Battery Status API and FAILS OPEN: an unknown/unsupported battery state (Firefox/Safari, or a
 * rejected promise) is treated as "not on battery" so auto-refresh keeps working there rather than
 * being silently disabled everywhere.
 */
async function isOnBattery(): Promise<boolean> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean }> }
  if (typeof nav.getBattery !== 'function') {
    return false
  }
  try {
    const battery = await nav.getBattery()
    return battery.charging === false
  } catch {
    return false
  }
}

/** Refresh one project's vulnerability data and surface any newly-appeared critical findings. */
async function refreshProject(
  project: Project,
  updateProject: AutoRefreshSchedulerDeps['updateProject'],
): Promise<void> {
  const previousCriticalIds = new Set(
    (project.vulnerabilities ?? []).filter((v) => v.severity === 'critical').map((v) => v.id),
  )

  const result = await refreshVulnerabilityData(project.components ?? [])
  if (!result.success) {
    return
  }

  updateProject(project.id, {
    vulnerabilities: result.vulnerabilities,
    lastVulnDataRefresh: new Date(),
  })

  const newCriticals = result.vulnerabilities.filter((v) => v.severity === 'critical' && !previousCriticalIds.has(v.id))
  if (newCriticals.length > 0) {
    toast.warning(
      'New critical vulnerability',
      `${newCriticals.length} new critical vulnerabilit${newCriticals.length === 1 ? 'y' : 'ies'} found in ${project.name}.`,
    )
  }
}

/**
 * Start the in-app automatic vulnerability-refresh scheduler (FR-03.6). Every
 * AUTO_REFRESH_CHECK_INTERVAL_MS, while the tab is open, it re-reads live settings/projects and —
 * when auto-refresh is enabled and the battery guard allows — refreshes every project whose
 * autoRefreshInterval has elapsed (via the existing needsRefresh primitive). Returns a stop
 * function; call it on unmount.
 *
 * Scope note: this only runs while a browser tab is open — true tab-closed background refresh would
 * need a service worker or a server-side per-project scheduler (out of scope). Multiple open tabs
 * each run their own scheduler; duplicate refreshes are harmless because refreshes are idempotent.
 */
export function startAutoRefreshScheduler(deps: AutoRefreshSchedulerDeps): () => void {
  const { getProjects, getSettings, updateProject } = deps
  // Guards against overlapping runs: a refresh sweep can outlast the check interval, so skip a
  // tick if the previous one is still in flight rather than launching a second concurrent sweep.
  let running = false

  const tick = async (): Promise<void> => {
    if (running) {
      return
    }
    const settings = getSettings()
    if (!settings.autoRefresh) {
      return
    }
    if (settings.pauseOnBattery && (await isOnBattery())) {
      return
    }

    running = true
    try {
      for (const project of getProjects()) {
        if (needsRefresh(project, settings.autoRefreshInterval)) {
          await refreshProject(project, updateProject)
        }
      }
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, AUTO_REFRESH_CHECK_INTERVAL_MS)

  return () => clearInterval(timer)
}
