/**
 * Express API Server — Entry Point
 *
 * Replaces Electron's main process. Serves the built React frontend
 * as static files and exposes REST + WebSocket API.
 *
 * Production:  Single origin on port 3001 (static + API + WebSocket)
 * Development: Express on :3001, Vite on :3000 (Vite proxies /api and /ws)
 */

import express from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config, initializePaths, isDev } from './config.js'
import { authMiddleware, getServerToken } from './middleware/auth.js'
import { initWebSocketServer, shutdownWebSocket } from './websocket.js'
import { initializeDatabase, closeDatabase } from './database/initialize.js'
import { databaseRouter } from './routes/database.js'
import { storageRoutes } from './routes/storage.js'
import { intelligenceRoutes } from './routes/intelligence.js'
import { backupRoutes } from './routes/backup.js'
import { containerRoutes } from './routes/container.js'
import { projectRouter } from './routes/projects.js'
import { sbomRoutes } from './routes/sbom.js'
import { defaultLimiter } from './middleware/rateLimit.js'

const currentFilename = fileURLToPath(import.meta.url)
const currentDirname = path.dirname(currentFilename)

function ensureDataDirectories(): void {
  const dirs = [config.DATA_DIR, config.BACKUP_DIR, config.LOG_DIR]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}

function createApp(): express.Express {
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

async function startServer(): Promise<void> {
  initializePaths()
  ensureDataDirectories()

  const token = getServerToken()
  if (isDev()) {
    console.log(`[Auth] Dev mode — auth skipped`)
  } else {
    console.log(`[Auth] Server token: ${token.substring(0, 8)}...`)
  }

  const app = createApp()
  const server = createServer(app)

  initWebSocketServer(server)

  await initializeDatabase()

  server.listen(config.PORT, config.HOST, () => {
    console.log(`\n=== VulnAssessTool Web Server ===`)
    console.log(`Environment: ${config.NODE_ENV}`)
    console.log(`Listening:   http://${config.HOST}:${config.PORT}`)
    console.log(`Data dir:    ${config.DATA_DIR}`)
    console.log(`WebSocket:   ws://${config.HOST}:${config.PORT}/ws`)
    console.log(`================================\n`)
  })

  const shutdown = async (): Promise<void> => {
    console.log('\n[Server] Shutting down...')
    shutdownWebSocket()
    await closeDatabase()
    server.close(() => {
      console.log('[Server] Shutdown complete.')
      process.exit(0)
    })
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.')
      process.exit(1)
    }, 10_000)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startServer()
