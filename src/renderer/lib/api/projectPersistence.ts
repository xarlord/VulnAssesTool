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
