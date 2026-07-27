import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { Express } from 'express'
import { createTestApp } from '../test-utils/testApp'

// Integration tests for /api/storage (NFR-08 — every API endpoint covered). storage.ts has no
// network/CLI dependency (SR-01.1 secure key storage is pure local filesystem + Node crypto), so
// per the "mock only truly external things" guidance these run entirely against the real Express
// app + a throwaway DATA_DIR from the harness: the exact behaviour the renderer's serverAdapter
// depends on (encrypted-at-rest round trips, and every validation error degrading to
// `{ success: false }` rather than throwing).
//
// NOTE ON COVERAGE GAP: /available, GET /migration and POST /migrate wrap calls to
// isSafeStorageAvailable/needsMigration/migratePlaintextKeys, which are hard-coded stubs in
// server/services/storage/secureStorage.ts (always return true / false / {success:true}) — they
// contain no branch that can throw. Their catch blocks are therefore currently dead code; exercising
// them would require mocking away the exact (trivial) logic under test, which would assert nothing
// about real behaviour. Per the task's "don't fake a passing assertion" rule, only the reachable
// success path is covered for those three; this is a genuine gap in the *route*, not a gap in these
// tests, and should be revisited if those stubs ever grow real failure modes.

let app: Express
let dataDir: string
let credentialsPath: string

beforeAll(async () => {
  // /api/storage sits behind the default rate limiter (60 req/min/IP). A beforeEach that resets
  // all three key types between many tests easily exceeds that in a fast local run, so — like the
  // existing e2e config (.env.e2e) — raise the cap for this controlled, single-IP test run.
  process.env.RATE_LIMIT_MAX = '1000000'
  ;({ app, dataDir } = await createTestApp())
  credentialsPath = path.join(dataDir, 'credentials.json')
})

afterAll(() => {
  delete process.env.RATE_LIMIT_MAX
  rmSync(dataDir, { recursive: true, force: true })
})

beforeEach(async () => {
  // The secure-storage module caches its credential store in memory for the life of the process,
  // so deleting credentials.json on disk between tests would NOT reset in-memory state. Go through
  // the real delete endpoint for all three key types to guarantee each test starts from a clean,
  // known slate regardless of test order.
  await request(app).post('/api/storage/keys/delete').send({ keyType: 'nvd' })
  await request(app).post('/api/storage/keys/delete').send({ keyType: 'osv' })
  await request(app).post('/api/storage/keys/delete').send({ keyType: 'github' })
})

const validNvdKey = 'a1b2c3d4-e5f6-4788-9900-aabbccddeeff'

describe('GET /api/storage/available', () => {
  // The renderer gates "save an API key" UI on this flag — it must report availability so the
  // UI doesn't offer a feature that silently fails.
  it('reports secure storage as available', async () => {
    const res = await request(app).get('/api/storage/available')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, isAvailable: true })
  })
})

describe('POST /api/storage/keys/set', () => {
  // Success: the key must actually be persisted, encrypted, under DATA_DIR — this is the contract
  // that stops a plaintext API key from ever reaching disk (SR-01.1).
  it('stores a valid key and persists it encrypted to credentials.json', async () => {
    const res = await request(app).post('/api/storage/keys/set').send({ keyType: 'osv', apiKey: 'osv-secret-key-123' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(existsSync(credentialsPath)).toBe(true)
    const raw = readFileSync(credentialsPath, 'utf-8')
    expect(raw).not.toContain('osv-secret-key-123')
  })

  it('accepts a UUID-formatted NVD key', async () => {
    const res = await request(app).post('/api/storage/keys/set').send({ keyType: 'nvd', apiKey: validNvdKey })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })

  // Validation errors never reach the storage layer, and the route never sets a 4xx status for
  // them (see storage.ts) — the contract callers rely on is success:false in the body.
  it('rejects a missing keyType', async () => {
    const res = await request(app).post('/api/storage/keys/set').send({ apiKey: 'some-key' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
  })

  it('rejects an unknown keyType', async () => {
    const res = await request(app).post('/api/storage/keys/set').send({ keyType: 'aws', apiKey: 'x' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
  })

  it('rejects a missing apiKey', async () => {
    const res = await request(app).post('/api/storage/keys/set').send({ keyType: 'osv' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
  })

  // NVD keys must be UUID-shaped — this stops obviously wrong keys from being stored and only
  // failing later when a scan tries to use them.
  it('rejects a non-UUID NVD key', async () => {
    const res = await request(app).post('/api/storage/keys/set').send({ keyType: 'nvd', apiKey: 'not-a-uuid' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/storage/keys/get', () => {
  // Round trip: a key set via /keys/set must come back byte-identical via /keys/get, otherwise
  // downstream NVD/OSV/GitHub calls silently use a corrupted credential.
  it('returns a previously stored key', async () => {
    await request(app).post('/api/storage/keys/set').send({ keyType: 'github', apiKey: 'gh-token-abc' }).expect(200)
    const res = await request(app).post('/api/storage/keys/get').send({ keyType: 'github' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, apiKey: 'gh-token-abc' })
  })

  it('returns apiKey:null when no key has been stored (not an error)', async () => {
    const res = await request(app).post('/api/storage/keys/get').send({ keyType: 'osv' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, apiKey: null })
  })

  it('rejects an invalid keyType', async () => {
    const res = await request(app).post('/api/storage/keys/get').send({ keyType: 'bogus' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.apiKey).toBeNull()
  })
})

describe('POST /api/storage/keys/delete', () => {
  // Deleting a key must make it unrecoverable via GET — a stale credential left behind after
  // "delete" would be a security bug, not just a UX bug.
  it('deletes a stored key so a subsequent get returns null', async () => {
    await request(app).post('/api/storage/keys/set').send({ keyType: 'osv', apiKey: 'to-be-deleted' }).expect(200)
    const del = await request(app).post('/api/storage/keys/delete').send({ keyType: 'osv' })
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ success: true })
    const get = await request(app).post('/api/storage/keys/get').send({ keyType: 'osv' })
    expect(get.body.apiKey).toBeNull()
  })

  it('is a no-op success when no key exists for that type', async () => {
    const res = await request(app).post('/api/storage/keys/delete').send({ keyType: 'github' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })

  it('rejects an invalid keyType', async () => {
    const res = await request(app).post('/api/storage/keys/delete').send({ keyType: 'bogus' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/storage/keys/has', () => {
  // Used by the renderer to render a "key configured" badge without ever exposing the key itself.
  it('reports true once a key is set and false after deletion', async () => {
    await request(app).post('/api/storage/keys/set').send({ keyType: 'nvd', apiKey: validNvdKey }).expect(200)
    const hasAfterSet = await request(app).post('/api/storage/keys/has').send({ keyType: 'nvd' })
    expect(hasAfterSet.body).toEqual({ success: true, hasKey: true })

    await request(app).post('/api/storage/keys/delete').send({ keyType: 'nvd' }).expect(200)
    const hasAfterDelete = await request(app).post('/api/storage/keys/has').send({ keyType: 'nvd' })
    expect(hasAfterDelete.body).toEqual({ success: true, hasKey: false })
  })

  it('rejects an invalid keyType', async () => {
    const res = await request(app).post('/api/storage/keys/has').send({ keyType: 'bogus' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.hasKey).toBe(false)
  })
})

describe('GET /api/storage/migration', () => {
  // Gates a one-time "migrate your plaintext keys" prompt. See NOTE ON COVERAGE GAP above: the
  // current implementation always reports false, so only that success path is reachable.
  it('reports the current migration status', async () => {
    const res = await request(app).get('/api/storage/migration')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, needsMigration: false })
  })
})

describe('POST /api/storage/migrate', () => {
  // See NOTE ON COVERAGE GAP above: the current implementation is a no-op stub, so only that
  // success path is reachable.
  it('runs the migration and reports the (empty) result', async () => {
    const res = await request(app).post('/api/storage/migrate')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, migrated: [], failed: [] })
  })
})

describe('GET /api/storage/keys/all', () => {
  // Used by a settings page that needs to show which of the three providers already have a key
  // configured, in one request instead of three.
  it('returns all three keys, reflecting what has been stored', async () => {
    await request(app).post('/api/storage/keys/set').send({ keyType: 'nvd', apiKey: validNvdKey }).expect(200)
    await request(app).post('/api/storage/keys/set').send({ keyType: 'osv', apiKey: 'osv-key' }).expect(200)

    const res = await request(app).get('/api/storage/keys/all')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      keys: { nvd: validNvdKey, osv: 'osv-key', github: null },
    })
  })

  it('returns all-null keys when nothing has been stored', async () => {
    const res = await request(app).get('/api/storage/keys/all')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      keys: { nvd: null, osv: null, github: null },
    })
  })
})
