import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { Express } from 'express'
import { createTestApp } from '../test-utils/testApp'

// Integration tests for /api/projects (NFR-08 — every API endpoint covered). These drive the
// real Express app with supertest, so routing, JSON parsing, and the filesystem-backed handlers
// are all exercised end-to-end against a throwaway DATA_DIR. They pin the persistence contract
// the renderer's serverAdapter depends on, plus the id sanitization that stops path traversal.

let app: Express
let dataDir: string
let projectsDir: string

beforeAll(async () => {
  ;({ app, dataDir } = await createTestApp())
  projectsDir = path.join(dataDir, 'projects')
})

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

beforeEach(() => {
  // Isolate each test — handlers recreate the projects dir on demand.
  if (existsSync(projectsDir)) rmSync(projectsDir, { recursive: true, force: true })
})

const sampleProject = { id: 'proj-1', name: 'Sample', vulnerabilities: [], components: [] }

describe('POST /api/projects', () => {
  it('persists a project and returns success', async () => {
    const res = await request(app).post('/api/projects').send(sampleProject)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(existsSync(path.join(projectsDir, 'proj-1.json'))).toBe(true)
  })

  it('rejects a project with no id (400, not written)', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'no id' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('sanitizes the id so it cannot escape the projects directory', async () => {
    // "../../etc/passwd" must reduce to a flat, safe filename — never traverse out of projectsDir.
    await request(app)
      .post('/api/projects')
      .send({ ...sampleProject, id: '../../etc/passwd' })
      .expect(200)
    // The only file written stays inside projectsDir (sanitized to a-zA-Z0-9_-).
    expect(existsSync(path.join(projectsDir, 'etcpasswd.json'))).toBe(true)
    expect(existsSync(path.join(dataDir, '..', 'etc', 'passwd.json'))).toBe(false)
  })
})

describe('GET /api/projects/:projectId', () => {
  it('returns a previously saved project', async () => {
    await request(app).post('/api/projects').send(sampleProject).expect(200)
    const res = await request(app).get('/api/projects/proj-1')
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ id: 'proj-1', name: 'Sample' })
  })

  it('returns data:null for a project that does not exist (not a 404)', async () => {
    const res = await request(app).get('/api/projects/missing')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: null })
  })
})

describe('GET /api/projects', () => {
  it('lists all saved projects', async () => {
    await request(app)
      .post('/api/projects')
      .send({ ...sampleProject, id: 'a' })
      .expect(200)
    await request(app)
      .post('/api/projects')
      .send({ ...sampleProject, id: 'b' })
      .expect(200)
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body.data.map((p: { id: string }) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('returns an empty list when nothing is saved', async () => {
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: [] })
  })
})

describe('DELETE /api/projects/:projectId', () => {
  it('removes a saved project', async () => {
    await request(app).post('/api/projects').send(sampleProject).expect(200)
    await request(app).delete('/api/projects/proj-1').expect(200)
    expect(existsSync(path.join(projectsDir, 'proj-1.json'))).toBe(false)
    const res = await request(app).get('/api/projects/proj-1')
    expect(res.body.data).toBeNull()
  })

  it('is a no-op (still success) when the project does not exist', async () => {
    const res = await request(app).delete('/api/projects/never-existed')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})
