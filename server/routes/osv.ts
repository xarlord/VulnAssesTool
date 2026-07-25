/**
 * OSV Proxy Route
 *
 * The browser cannot call api.osv.dev directly (CORS), so the client sends
 * OSV queries to this same-origin endpoint and the server forwards them to
 * the real OSV API. Mirrors the proxy pattern used for CVE data, where the
 * server — not the renderer — makes the external call.
 */

import { Router } from 'express'
import { ValidationError, sanitizeErrorMessage } from '../database/ipcRequestValidator.js'

const OSV_UPSTREAM_URL = 'https://api.osv.dev/v1'

interface OsvQueryRequest {
  package: {
    purl: string
  }
}

function validateOsvQueryRequest(request: unknown): OsvQueryRequest {
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

const router = Router()

router.post('/query', async (req, res) => {
  try {
    const validatedRequest = validateOsvQueryRequest(req.body)

    const upstreamResponse = await fetch(`${OSV_UPSTREAM_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validatedRequest),
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
})

router.get('/vulns/:id', async (req, res) => {
  try {
    const upstreamResponse = await fetch(`${OSV_UPSTREAM_URL}/vulns/${encodeURIComponent(req.params.id)}`)
    const data: unknown = await upstreamResponse.json()
    res.status(upstreamResponse.status).json(data)
  } catch (error) {
    res.status(502).json({ error: sanitizeErrorMessage(error) })
  }
})

export { router as osvRoutes }
