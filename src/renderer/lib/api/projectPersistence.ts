import { apiGet, apiPost, apiDelete } from '../platform/httpClient'
import type { ProjectStatistics } from '../../../shared/types'

interface ProjectPersistData {
  id: string
  name: string
  description?: string
  vulnerabilities: unknown[]
  components: unknown[]
  dependencyGraph?: unknown
  lastScanAt?: string
  updatedAt?: string
  statistics?: ProjectStatistics
  allowedLicenses?: string[]
}

export async function saveProjectToServer(data: ProjectPersistData): Promise<void> {
  await apiPost('/projects', data)
}

export async function loadProjectFromServer(projectId: string): Promise<ProjectPersistData | null> {
  const result = await apiGet<{ success: boolean; data: ProjectPersistData | null }>(`/projects/${projectId}`)
  return result.data
}

export async function deleteProjectFromServer(projectId: string): Promise<void> {
  await apiDelete(`/projects/${projectId}`)
}

/** A project row without its heavy arrays: what `GET /projects?summary=1` returns. */
export interface ProjectSummaryData {
  id: string
  name: string
  description?: string
  lastScanAt?: string
  updatedAt?: string
  createdAt?: string
  statistics?: ProjectStatistics
  allowedLicenses?: string[]
  componentCount?: number
  vulnerabilityCount?: number
}

/**
 * List every project the SERVER knows about, without vulnerabilities/components.
 *
 * Summary mode matters: the full list embeds all scan data (measured 18 MB across 40 real
 * projects), far too heavy to pull on boot. The arrays for one project are fetched on demand by
 * loadProjectFromServer when its detail page opens.
 */
export async function loadProjectSummariesFromServer(): Promise<ProjectSummaryData[]> {
  const result = await apiGet<{ success: boolean; data: ProjectSummaryData[] }>('/projects?summary=1')
  return Array.isArray(result.data) ? result.data : []
}
