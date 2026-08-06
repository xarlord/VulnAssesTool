import { Router, type Request, type Response } from 'express'
import { config } from '../config.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'

export const projectRouter = Router()

const PROJECTS_DIR = path.join(config.DATA_DIR, 'projects')

function ensureProjectsDir(): void {
  if (!existsSync(PROJECTS_DIR)) {
    mkdirSync(PROJECTS_DIR, { recursive: true })
  }
}

function projectPath(projectId: string): string {
  // Callers validate with isSafeId first; additionally route the id through path.basename so
  // the constructed filename is provably free of path-traversal segments (a barrier static
  // analysis recognizes, not just the charset check it can't trace).
  return path.join(PROJECTS_DIR, `${path.basename(projectId)}.json`)
}

// A project id is used verbatim as a filename. The old sanitizeId() STRIPPED disallowed
// characters, which is lossy and non-injective — distinct ids like `a/b` and `ab` (or two
// ids that reduce to empty) collapsed onto the same file and silently overwrote each other.
// Validate instead: accept only an already-safe charset, otherwise reject with 400.
function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && /^[a-zA-Z0-9_-]+$/.test(id)
}

interface ProjectData {
  id: string
  name: string
  description?: string
  vulnerabilities: unknown[]
  components: unknown[]
  dependencyGraph?: unknown
  lastScanAt?: string
  updatedAt?: string
  statistics?: Record<string, unknown>
  allowedLicenses?: string[]
}

/**
 * POST / — save a project as `<id>.json` on disk, where `id` comes from the request body.
 * The id is validated against a safe filename charset (`isSafeId`) rather than sanitized,
 * since stripping characters is lossy and could let two distinct ids collide on one file.
 * Responds 400 if `id` is missing or unsafe, 500 if the write fails.
 */
projectRouter.post('/', (req: Request, res: Response) => {
  try {
    ensureProjectsDir()
    const data = req.body as ProjectData
    if (!data.id) {
      res.status(400).json({ success: false, error: 'Project ID required' })
      return
    }
    if (!isSafeId(data.id)) {
      res.status(400).json({ success: false, error: 'Invalid project ID' })
      return
    }
    const filePath = projectPath(data.id)
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save project',
    })
  }
})

/**
 * GET /:projectId — load a project's JSON file from disk. Responds `{ success: true, data:
 * null }` if the project doesn't exist (not an error), 400 if `projectId` fails the safe-id
 * check, 500 if reading/parsing the file fails.
 */
projectRouter.get('/:projectId', (req: Request, res: Response) => {
  try {
    ensureProjectsDir()
    const projectId = req.params.projectId
    if (!isSafeId(projectId)) {
      res.status(400).json({ success: false, error: 'Invalid project ID' })
      return
    }
    const filePath = projectPath(projectId)
    if (!existsSync(filePath)) {
      res.json({ success: true, data: null })
      return
    }
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as ProjectData
    res.json({ success: true, data })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load project',
    })
  }
})

/**
 * DELETE /:projectId — delete a project's JSON file from disk if it exists. Responds 400
 * if `projectId` fails the safe-id check, 500 if deletion fails; deleting an already-absent
 * project still succeeds.
 */
projectRouter.delete('/:projectId', (req: Request, res: Response) => {
  try {
    ensureProjectsDir()
    const projectId = req.params.projectId
    if (!isSafeId(projectId)) {
      res.status(400).json({ success: false, error: 'Invalid project ID' })
      return
    }
    const filePath = projectPath(projectId)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete project',
    })
  }
})

/**
 * GET / — list all saved projects by reading every `.json` file in the projects
 * directory. Files that fail to parse are silently skipped rather than failing the whole
 * request. Responds 500 if the directory itself can't be read.
 */
projectRouter.get('/', (_req: Request, res: Response) => {
  try {
    ensureProjectsDir()
    const files = readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'))
    const projects: ProjectData[] = []
    for (const file of files) {
      try {
        const raw = readFileSync(path.join(PROJECTS_DIR, file), 'utf-8')
        const data = JSON.parse(raw) as ProjectData
        projects.push(data)
      } catch {
        // skip corrupt files
      }
    }
    res.json({ success: true, data: projects })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list projects',
    })
  }
})
