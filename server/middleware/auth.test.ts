import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { Request, Response, NextFunction } from 'express'

// --- Mock config only (non-node module — works fine) ---

const { mockIsDev, mockConfig } = vi.hoisted(() => ({
  mockIsDev: vi.fn(),
  mockConfig: { TOKEN_PATH: '' },
}))

vi.mock('../config.js', () => ({
  config: mockConfig,
  isDev: mockIsDev,
}))

// Import auth after config mock is registered.
// Uses REAL node:fs and node:crypto (no browser-external stubs).
import { loadOrCreateToken, getServerToken, authMiddleware } from './auth'

// --- Helpers ---

function createMockReq(overrides: Record<string, unknown> = {}) {
  return {
    path: '/api/data',
    headers: {} as Record<string, string>,
    ...overrides,
  }
}

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }
}

function tokenPath(): string {
  return mockConfig.TOKEN_PATH
}

// --- Tests ---

describe('Auth Middleware', () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'))
    mockConfig.TOKEN_PATH = path.join(tempDir, '.server-token')
    mockIsDev.mockReturnValue(false)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  // ------------------------------------------------------------------ //
  // loadOrCreateToken                                                   //
  // ------------------------------------------------------------------ //
  describe('loadOrCreateToken', () => {
    it('should generate a new 64-char hex token when no file exists', () => {
      const token = loadOrCreateToken()

      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect(fs.existsSync(tokenPath())).toBe(true)
    })

    it('should persist the generated token to disk', () => {
      const token = loadOrCreateToken()
      const fileContent = fs.readFileSync(tokenPath(), 'utf-8').trim()

      expect(fileContent).toBe(token)
    })

    it('should read existing valid token from file', () => {
      // First call generates
      const firstToken = loadOrCreateToken()

      // Second call should read from file
      const secondToken = loadOrCreateToken()

      expect(secondToken).toBe(firstToken)
    })

    it('should create the parent directory if missing', () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep')
      mockConfig.TOKEN_PATH = path.join(nestedDir, '.server-token')

      const token = loadOrCreateToken()

      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect(fs.existsSync(nestedDir)).toBe(true)
    })

    it('should regenerate when file content has wrong length', () => {
      const firstToken = loadOrCreateToken()

      // Corrupt the file with wrong-length content
      fs.writeFileSync(tokenPath(), 'tooshort', 'utf-8')

      const newToken = loadOrCreateToken()

      expect(newToken).toMatch(/^[0-9a-f]{64}$/)
      expect(newToken).not.toBe('tooshort')
      // Should overwrite with new valid token
      expect(fs.readFileSync(tokenPath(), 'utf-8').trim()).toBe(newToken)
    })

    it('should regenerate when file content is empty', () => {
      loadOrCreateToken()
      fs.writeFileSync(tokenPath(), '', 'utf-8')

      const token = loadOrCreateToken()

      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should handle file with leading/trailing whitespace', () => {
      const original = loadOrCreateToken()
      // Add whitespace around the token
      fs.writeFileSync(tokenPath(), '  ' + original + '\n', 'utf-8')

      const token = loadOrCreateToken()

      expect(token).toBe(original)
    })
  })

  // ------------------------------------------------------------------ //
  // getServerToken                                                      //
  // ------------------------------------------------------------------ //
  describe('getServerToken', () => {
    it('should return a valid hex token', () => {
      const token = getServerToken()

      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should cache the token across calls', () => {
      const token1 = getServerToken()
      const token2 = getServerToken()

      expect(token1).toBe(token2)
    })
  })

  // ------------------------------------------------------------------ //
  // authMiddleware                                                      //
  // ------------------------------------------------------------------ //
  describe('authMiddleware', () => {
    let serverToken: string

    beforeEach(() => {
      // Populate the internal serverToken cache
      serverToken = getServerToken()
    })

    // ---- Dev mode bypass ----

    it('should call next() in dev mode regardless of path', () => {
      mockIsDev.mockReturnValue(true)

      const req = createMockReq({ path: '/api/protected' })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    // ---- Skip paths ----

    it('should skip auth for /health (mount-relative; Express strips the /api prefix)', () => {
      const req = createMockReq({ path: '/health' })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should skip auth for /handshake (mount-relative)', () => {
      const req = createMockReq({ path: '/handshake' })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(next).toHaveBeenCalled()
    })

    it('should skip auth for sub-paths of skip paths', () => {
      const req = createMockReq({ path: '/health/details' })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(next).toHaveBeenCalled()
    })

    it('should skip auth for /handshake sub-paths', () => {
      const req = createMockReq({ path: '/handshake/initialize' })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(next).toHaveBeenCalled()
    })

    // ---- Missing / invalid auth header ----

    it('should return 401 when no auth header is present', () => {
      const req = createMockReq()
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('should return 401 when auth header does not start with Bearer', () => {
      const req = createMockReq({
        headers: { authorization: 'Basic abc123' },
      })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      })
    })

    // ---- Invalid token ----

    it('should return 403 when Bearer token is empty string', () => {
      const req = createMockReq({
        headers: { authorization: 'Bearer ' },
      })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token',
      })
    })

    it('should return 403 when token does not match', () => {
      const req = createMockReq({
        headers: { authorization: 'Bearer wrong-token-value' },
      })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token',
      })
      expect(next).not.toHaveBeenCalled()
    })

    // ---- Valid token ----

    it('should call next() when token matches', () => {
      const req = createMockReq({
        headers: { authorization: `Bearer ${serverToken}` },
      })
      const res = createMockRes()
      const next = vi.fn()

      authMiddleware(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })
  })
})
