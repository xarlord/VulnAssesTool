/**
 * Express application factory.
 *
 * Split out of index.ts so the app can be constructed without the side effects of
 * startServer() (port binding, DB init, WebSocket) — integration tests import createApp()
 * directly and drive it with supertest. index.ts owns process lifecycle; this owns wiring.
 */

import express from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDev } from './config.js'
import { authMiddleware, getServerToken } from './middleware/auth.js'
import { isDatabaseReady } from './database/initialize.js'
import { sanitizeErrorMessage } from './database/ipcRequestValidator.js'
import { databaseRouter } from './routes/database.js'
import { storageRoutes } from './routes/storage.js'
import { intelligenceRoutes } from './routes/intelligence.js'
import { backupRoutes } from './routes/backup.js'
import { containerRoutes } from './routes/container.js'
import { projectRouter } from './routes/projects.js'
import { sbomRoutes } from './routes/sbom.js'
import { osvRoutes } from './routes/osv.js'
import { makeDefaultLimiter, makeContainerLimiter } from './middleware/rateLimit.js'

const currentFilename = fileURLToPath(import.meta.url)
const currentDirname = path.dirname(currentFilename)

export function createApp(): express.Express {
  const app = express()

  app.use(helmet())
  // gzip/deflate responses — search results, project payloads, and SBOM JSON
  // are large and compress well over the wire.
  app.use(compression())
  app.use(
    cors({
      // In production the app is served same-origin, so disable cross-origin entirely rather than
      // letting `undefined` fall through to cors' allow-any-origin — which, with credentials:true,
      // is an invalid and unsafe combination.
      origin: isDev() ? 'http://localhost:3000' : false,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '10mb' }))

  // 1. Static assets — no auth needed (HTML, JS, CSS, images)
  const staticDir = path.join(currentDirname, '..', 'renderer')
  if (!isDev() && existsSync(staticDir)) {
    app.use(express.static(staticDir))
  }

  // 2. Public API routes — no auth required
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      db: isDatabaseReady(),
      uptime: process.uptime(),
      version: '2.0.0-web',
    })
  })

  app.get('/api/handshake', (_req, res) => {
    res.json({ success: true, token: getServerToken() })
  })

  // 3. Protected API routes — auth middleware
  app.use('/api', authMiddleware)

  // A fresh limiter per mount (see makeDefaultLimiter/makeContainerLimiter) so each route
  // group has its own bucket instead of sharing one across all of them.
  app.use('/api/database', makeDefaultLimiter(), databaseRouter)
  app.use('/api/intelligence', makeDefaultLimiter(), intelligenceRoutes)
  app.use('/api/storage', makeDefaultLimiter(), storageRoutes)
  app.use('/api/backup', makeDefaultLimiter(), backupRoutes)
  // Container scans and Syft SBOM generation are expensive/long-running, so cap them with the
  // tighter dedicated limiter instead of only the 60/min default.
  app.use('/api/container', makeContainerLimiter(), containerRoutes)
  app.use('/api/projects', makeDefaultLimiter(), projectRouter)
  app.use('/api/sbom', makeContainerLimiter(), sbomRoutes)
  app.use('/api/osv', makeDefaultLimiter(), osvRoutes)

  // Unmatched /api/* must be a JSON 404. Otherwise the SPA fallback below serves index.html
  // (HTTP 200 HTML) for a typo'd/removed endpoint, and the client's response.json() throws on it.
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' })
  })

  // 4. SPA fallback — must be LAST. Serves index.html for all
  //    non-API, non-static GET requests (client-side routing).
  if (!isDev() && existsSync(staticDir)) {
    app.get('/{*path}', makeDefaultLimiter(), (_req, res) => {
      const indexPath = path.join(staticDir, 'index.html')
      if (existsSync(indexPath)) {
        res.sendFile(indexPath)
      } else {
        res.status(404).json({ error: 'Frontend not built. Run npm run build first.' })
      }
    })
  }

  // Terminal error handler: turn any uncaught throw or malformed-body error into a sanitized JSON
  // 500 instead of Express's default HTML page (which leaks the stack trace when not in prod).
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server] Unhandled error:', err)
    if (res.headersSent) return
    // Honor a status the error carries (e.g. express.json() attaches 400 to a malformed-body
    // SyntaxError); otherwise treat it as an internal 500.
    const e = err as { status?: unknown; statusCode?: unknown }
    const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : 500
    res.status(status).json({ success: false, error: sanitizeErrorMessage(err) })
  })

  return app
}
