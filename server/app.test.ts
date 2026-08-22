/**
 * Integration tests for the app's own (non-router) endpoints.
 *
 * createApp() mounts three handlers of its own before delegating to the routers, and none of
 * them had a test. The unmatched-/api/* handler is the interesting one: it exists purely so a
 * typo'd or removed endpoint returns JSON 404 rather than falling through to the SPA fallback,
 * which would answer with `200 text/html` and make the client's `response.json()` throw on a
 * page of markup. That is a contract between server and client that nothing was holding down.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createTestApp } from './test-utils/testApp.js'

describe('createApp built-in endpoints', () => {
  let app: Express

  beforeAll(async () => {
    ;({ app } = await createTestApp())
  })

  describe('GET /api/health', () => {
    it('reports service status, database readiness and uptime', async () => {
      const response = await request(app).get('/api/health')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('ok')
      // Readiness probes branch on this, so it has to be a real boolean, not undefined.
      expect(typeof response.body.db).toBe('boolean')
      expect(typeof response.body.uptime).toBe('number')
      expect(response.body.version).toBeTruthy()
    })

    it('is reachable without auth', async () => {
      // Health has to answer before a client has a token, so it is mounted ahead of
      // authMiddleware. A 401 here would make the app unmonitorable.
      const response = await request(app).get('/api/health')

      expect(response.status).not.toBe(401)
    })
  })

  describe('GET /api/handshake', () => {
    it('hands out the server token', async () => {
      const response = await request(app).get('/api/handshake')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(typeof response.body.token).toBe('string')
      expect(response.body.token.length).toBeGreaterThan(0)
    })
  })

  describe('unmatched /api/* routes', () => {
    it('answers with JSON 404, not the SPA HTML fallback', async () => {
      const response = await request(app).get('/api/there-is-no-such-endpoint')

      expect(response.status).toBe(404)
      // The content type is the whole point: HTML here means response.json() throws in the
      // client instead of surfacing a clean "Not found".
      expect(response.type).toBe('application/json')
      expect(response.body).toEqual({ success: false, error: 'Not found' })
    })

    it('applies to every method, not just GET', async () => {
      const response = await request(app).post('/api/there-is-no-such-endpoint').send({})

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })

    it('still routes a real endpoint rather than swallowing it', async () => {
      // Guards the other direction: the catch-all is mounted last, so it must not shadow
      // the routers registered above it.
      const response = await request(app).get('/api/health')

      expect(response.status).toBe(200)
    })
  })
})
