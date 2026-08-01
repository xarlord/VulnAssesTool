import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
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

describe('NFR-02.1 scale — 1,000+ projects', () => {
  // WHY (Rule 9): the PRD requires handling 1,000+ projects. GET /api/projects reads and parses
  // every project file on each call, so this guard fails loudly if a regression introduces an
  // in-memory/listing cap or an O(n^2) directory scan that drops or loses projects at scale.
  //
  // Files are SEEDED DIRECTLY rather than via 1,000 POSTs on purpose: createApp() mounts the real
  // rate-limiting middleware, so a burst of 1,000 POSTs returns 429 by design (a correct
  // protection unrelated to storage scale). The POST/write contract is already covered by the
  // tests above; the scale risk lives in the read/list path exercised here. Assertions are exact
  // counts / distinct ids, so slowness can only time the test out — never yield a false red.
  it('lists 1,000 stored projects without loss', async () => {
    const count = 1000
    mkdirSync(projectsDir, { recursive: true })
    for (let i = 0; i < count; i++) {
      writeFileSync(
        path.join(projectsDir, `scale-${i}.json`),
        JSON.stringify({ id: `scale-${i}`, name: `Project ${i}`, vulnerabilities: [], components: [] }),
        'utf-8',
      )
    }

    const listed = await request(app).get('/api/projects')
    expect(listed.status).toBe(200)
    // Every stored project must come back — no cap, no lossy directory scan.
    expect(listed.body.data).toHaveLength(count)
    // Distinct ids across the full set (and the first/last boundaries) prove nothing was dropped
    // or coalesced somewhere in the middle of the 1,000-file scan.
    const ids = new Set((listed.body.data as Array<{ id: string }>).map((p) => p.id))
    expect(ids.size).toBe(count)
    expect(ids.has('scale-0')).toBe(true)
    expect(ids.has('scale-999')).toBe(true)
  }, 60000)
})
