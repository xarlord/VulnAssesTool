/**
 * OSV Proxy Route
 *
 * The browser cannot call api.osv.dev directly (CORS), so the client sends
 * OSV queries to this same-origin endpoint and the server forwards them to
 * the real OSV API. Mirrors the proxy pattern used for CVE data, where the
 * server — not the renderer — makes the external call.
 */

import { Router, type Request, type Response } from 'express'
import { ValidationError, sanitizeErrorMessage } from '../database/ipcRequestValidator.js'

const OSV_UPSTREAM_URL = 'https://api.osv.dev/v1'

interface OsvQueryRequest {
  package: {
    purl: string
  }
}

export function validateOsvQueryRequest(request: unknown): OsvQueryRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const req = request as Record<string, unknown>
  const pkg = req.package
  if (!pkg || typeof pkg !== 'object') {
    throw new ValidationError('Missing or invalid package', 'package')
  }

  const purl = (pkg as Record<string, unknown>).purl
  if (!purl || typeof purl !== 'string') {
    throw new ValidationError('Missing or invalid package.purl', 'purl')
  }

  return { package: { purl } }
}

/**
 * POST /query — validate the {package:{purl}} body, forward it to OSV, and pass the
 * upstream status/body straight through. Validation failures are 400; upstream/network
 * failures are 502. Exported for unit testing.
 */
export async function handleOsvQuery(req: Request, res: Response): Promise<void> {
  try {
    const validatedRequest = validateOsvQueryRequest(req.body)

    const upstreamResponse = await fetch(`${OSV_UPSTREAM_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validatedRequest),
      // Bound the upstream call so a slow/hung OSV endpoint can't keep the request and socket
      // open indefinitely (the resulting AbortError is handled below as a 502).
      signal: AbortSignal.timeout(10_000),
    })

    const data: unknown = await upstreamResponse.json()
    res.status(upstreamResponse.status).json(data)
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: sanitizeErrorMessage(error) })
      return
    }
    res.status(502).json({ error: sanitizeErrorMessage(error) })
  }
}

/**
 * GET /vulns/:id — proxy a single OSV vulnerability lookup. The id is URL-encoded to
 * keep it from escaping the upstream path. Exported for unit testing.
 */
export async function handleOsvVulnById(req: Request, res: Response): Promise<void> {
  try {
    const upstreamResponse = await fetch(`${OSV_UPSTREAM_URL}/vulns/${encodeURIComponent(String(req.params.id))}`, {
      signal: AbortSignal.timeout(10_000),
    })
    const data: unknown = await upstreamResponse.json()
    res.status(upstreamResponse.status).json(data)
  } catch (error) {
    res.status(502).json({ error: sanitizeErrorMessage(error) })
  }
}

const router = Router()
router.post('/query', handleOsvQuery)
router.get('/vulns/:id', handleOsvVulnById)

export { router as osvRoutes }
