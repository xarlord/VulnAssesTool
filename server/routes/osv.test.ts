import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response } from 'express'
import { validateOsvQueryRequest, handleOsvQuery, handleOsvVulnById } from './osv'
import { ValidationError } from '../database/ipcRequestValidator.js'

// The /api/osv proxy is the only path through which the browser reaches OSV (CORS blocks a direct
// call). These tests pin the two behaviours a regression would silently break: request validation
// (a non-string purl must be rejected, not forwarded) and upstream status/body passthrough,
// including the 400/502 error mapping.

interface MockRes {
  statusCode: number
  body: unknown
  status: (code: number) => MockRes
  json: (payload: unknown) => MockRes
}

function mockRes(): MockRes {
  const res = { statusCode: 200, body: undefined } as MockRes
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

function asReq(value: { body?: unknown; params?: Record<string, string> }): Request {
  return value as unknown as Request
}
function asRes(res: MockRes): Response {
  return res as unknown as Response
}

describe('validateOsvQueryRequest', () => {
  it('accepts and normalizes a well-formed request', () => {
    const result = validateOsvQueryRequest({ package: { purl: 'pkg:npm/lodash@4.17.21' }, extra: 'dropped' })
    expect(result).toEqual({ package: { purl: 'pkg:npm/lodash@4.17.21' } })
  })

  it('rejects a missing package', () => {
    expect(() => validateOsvQueryRequest({})).toThrow(ValidationError)
  })

  it('rejects a non-string purl (must not be forwarded upstream)', () => {
    expect(() => validateOsvQueryRequest({ package: { purl: 123 } })).toThrow(ValidationError)
    expect(() => validateOsvQueryRequest({ package: {} })).toThrow(ValidationError)
  })
})

describe('handleOsvQuery', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards a valid query and passes the upstream status + body through', async () => {
    const upstreamBody = { vulns: [{ id: 'GHSA-xxxx' }] }
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      json: async () => upstreamBody,
    } as unknown as Response)
    const res = mockRes()

    await handleOsvQuery(asReq({ body: { package: { purl: 'pkg:npm/lodash@4.17.21' } } }), asRes(res))

    // Only the validated shape is forwarded to the fixed upstream URL.
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.osv.dev/v1/query')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ package: { purl: 'pkg:npm/lodash@4.17.21' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(upstreamBody)
  })

  it('passes a non-200 upstream status straight through (does not coerce to 200)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 404,
      json: async () => ({ code: 5, message: 'not found' }),
    } as unknown as Response)
    const res = mockRes()

    await handleOsvQuery(asReq({ body: { package: { purl: 'pkg:npm/ghost@0.0.0' } } }), asRes(res))

    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for an invalid request without calling upstream', async () => {
    const res = mockRes()

    await handleOsvQuery(asReq({ body: { package: { purl: 123 } } }), asRes(res))

    expect(res.statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 502 when the upstream fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const res = mockRes()

    await handleOsvQuery(asReq({ body: { package: { purl: 'pkg:npm/lodash@4.17.21' } } }), asRes(res))

    expect(res.statusCode).toBe(502)
  })
})

describe('handleOsvVulnById', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('proxies the lookup and URL-encodes the id in the upstream path', async () => {
    const upstreamBody = { id: 'OSV-2024-1', summary: 'x' }
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      json: async () => upstreamBody,
    } as unknown as Response)
    const res = mockRes()

    // An id with a slash must not escape the /vulns/ path segment.
    await handleOsvVulnById(asReq({ params: { id: 'OSV/2024/1' } }), asRes(res))

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.osv.dev/v1/vulns/OSV%2F2024%2F1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(upstreamBody)
  })

  it('returns 502 when the upstream fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const res = mockRes()

    await handleOsvVulnById(asReq({ params: { id: 'OSV-2024-1' } }), asRes(res))

    expect(res.statusCode).toBe(502)
  })
})
