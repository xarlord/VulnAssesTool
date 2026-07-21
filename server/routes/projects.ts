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
  return path.join(PROJECTS_DIR, `${projectId}.json`)
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
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

projectRouter.post('/', (req: Request, res: Response) => {
  try {
    ensureProjectsDir()
    const data = req.body as ProjectData
    if (!data.id) {
      res.status(400).json({ success: false, error: 'Project ID required' })
      return
    }
    const safeId = sanitizeId(data.id)
    const filePath = projectPath(safeId)
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save project',
    })
  }
})

projectRouter.get('/:projectId', (req: Request, res: Response) => {
  try {
    ensureProjectsDir()
    const safeId = sanitizeId(req.params.projectId as string)
    const filePath = projectPath(safeId)
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

projectRouter.delete('/:projectId', (req: Request, res: Response) => {
  try {
    ensureProjectsDir()
    const safeId = sanitizeId(req.params.projectId as string)
    const filePath = projectPath(safeId)
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
