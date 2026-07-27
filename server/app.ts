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
import { databaseRouter } from './routes/database.js'
import { storageRoutes } from './routes/storage.js'
import { intelligenceRoutes } from './routes/intelligence.js'
import { backupRoutes } from './routes/backup.js'
import { containerRoutes } from './routes/container.js'
import { projectRouter } from './routes/projects.js'
import { sbomRoutes } from './routes/sbom.js'
import { osvRoutes } from './routes/osv.js'
import { defaultLimiter } from './middleware/rateLimit.js'

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
      origin: isDev() ? 'http://localhost:3000' : undefined,
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
      db: false,
      uptime: process.uptime(),
      version: '2.0.0-web',
    })
  })

  app.get('/api/handshake', (_req, res) => {
    res.json({ success: true, token: getServerToken() })
  })

  // 3. Protected API routes — auth middleware
  app.use('/api', authMiddleware)

  app.use('/api/database', defaultLimiter, databaseRouter)
  app.use('/api/intelligence', defaultLimiter, intelligenceRoutes)
  app.use('/api/storage', defaultLimiter, storageRoutes)
  app.use('/api/backup', defaultLimiter, backupRoutes)
  app.use('/api/container', defaultLimiter, containerRoutes)
  app.use('/api/projects', defaultLimiter, projectRouter)
  app.use('/api/sbom', defaultLimiter, sbomRoutes)
  app.use('/api/osv', defaultLimiter, osvRoutes)

  // 3. SPA fallback — must be LAST. Serves index.html for all
  //    non-API, non-static GET requests (client-side routing).
  if (!isDev() && existsSync(staticDir)) {
    app.get('/{*path}', (_req, res) => {
      const indexPath = path.join(staticDir, 'index.html')
      if (existsSync(indexPath)) {
        res.sendFile(indexPath)
      } else {
        res.status(404).json({ error: 'Frontend not built. Run npm run build first.' })
      }
    })
  }

  return app
}
