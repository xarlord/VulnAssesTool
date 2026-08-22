/**
 * Unit tests for the project persistence API wrapper.
 *
 * This module had no tests at all. What it encodes is the client half of the project
 * REST contract — which verb goes to which path — and getting one of those wrong is the
 * kind of defect that only shows up as data silently not saving. The `summary=1` query
 * in particular is load-bearing: the full list embeds every scan (measured 18 MB across
 * 40 projects), so dropping the parameter would pull all of it on every boot.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveProjectToServer,
  loadProjectFromServer,
  deleteProjectFromServer,
  loadProjectSummariesFromServer,
} from './projectPersistence'
import { apiGet, apiPost, apiDelete } from '../platform/httpClient'

vi.mock('../platform/httpClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))

const mockApiGet = vi.mocked(apiGet)
const mockApiPost = vi.mocked(apiPost)
const mockApiDelete = vi.mocked(apiDelete)

const project = {
  id: 'proj-1',
  name: 'Test Project',
  vulnerabilities: [],
  components: [],
}

describe('projectPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('saveProjectToServer', () => {
    it('POSTs the whole project to /projects', async () => {
      mockApiPost.mockResolvedValue(undefined)

      await saveProjectToServer(project)

      expect(mockApiPost).toHaveBeenCalledWith('/projects', project)
    })

    it('propagates a failed save rather than swallowing it', async () => {
      // A silently-swallowed write is worse than a loud one: the user keeps editing a
      // project the server never received.
      mockApiPost.mockRejectedValue(new Error('500 Internal Server Error'))

      await expect(saveProjectToServer(project)).rejects.toThrow('500 Internal Server Error')
    })
  })

  describe('loadProjectFromServer', () => {
    it('GETs the project by id and unwraps the envelope', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: project })

      await expect(loadProjectFromServer('proj-1')).resolves.toEqual(project)
      expect(mockApiGet).toHaveBeenCalledWith('/projects/proj-1')
    })

    it('returns null for a project the server does not have', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: null })

      await expect(loadProjectFromServer('missing')).resolves.toBeNull()
    })
  })

  describe('deleteProjectFromServer', () => {
    it('DELETEs the project by id', async () => {
      mockApiDelete.mockResolvedValue(undefined)

      await deleteProjectFromServer('proj-1')

      expect(mockApiDelete).toHaveBeenCalledWith('/projects/proj-1')
    })
  })

  describe('loadProjectSummariesFromServer', () => {
    it('requests summary mode, not the full project list', async () => {
      const summaries = [{ id: 'proj-1', name: 'Test Project', componentCount: 3 }]
      mockApiGet.mockResolvedValue({ success: true, data: summaries })

      await expect(loadProjectSummariesFromServer()).resolves.toEqual(summaries)
      expect(mockApiGet).toHaveBeenCalledWith('/projects?summary=1')
    })

    it('returns an empty list when the server sends a non-array payload', async () => {
      // Boot hydration maps over this result. A malformed response must degrade to
      // "no server projects", never throw during startup.
      mockApiGet.mockResolvedValue({ success: false, data: null })

      await expect(loadProjectSummariesFromServer()).resolves.toEqual([])
    })
  })
})
