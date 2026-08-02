/**
 * Express API Server — Entry Point
 *
 * Replaces Electron's main process. Serves the built React frontend
 * as static files and exposes REST + WebSocket API.
 *
 * Production:  Single origin on port 3001 (static + API + WebSocket)
 * Development: Express on :3001, Vite on :3000 (Vite proxies /api and /ws)
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import { config, initializePaths, isDev } from './config.js'
import { getServerToken } from './middleware/auth.js'
import { initWebSocketServer, shutdownWebSocket } from './websocket.js'
import { initializeDatabase, closeDatabase } from './database/initialize.js'
import { createApp } from './app.js'

function ensureDataDirectories(): void {
  const dirs = [config.DATA_DIR, config.BACKUP_DIR, config.LOG_DIR]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
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

  // Without an 'error' listener, a bind failure (e.g. port already in use) is rethrown as an
  // uncaught exception with a raw stack trace instead of a clear message.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Port ${config.PORT} is already in use.`)
    } else {
      console.error('[Server] Failed to bind:', err)
    }
    process.exit(1)
  })

  server.listen(config.PORT, config.HOST, () => {
    console.log(`\n=== VulnAssessTool Web Server ===`)
    console.log(`Environment: ${config.NODE_ENV}`)
    console.log(`Listening:   http://${config.HOST}:${config.PORT}`)
    console.log(`Data dir:    ${config.DATA_DIR}`)
    console.log(`WebSocket:   ws://${config.HOST}:${config.PORT}/ws`)
    console.log(`================================\n`)
  })

  let isShuttingDown = false
  const shutdown = async (): Promise<void> => {
    // Re-entrancy guard: SIGINT+SIGTERM (or a double Ctrl+C) must not run this twice —
    // that would call closeDatabase() on an already-closing connection and start a second timer.
    if (isShuttingDown) return
    isShuttingDown = true
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

startServer().catch((error) => {
  console.error('[Server] Failed to start:', error)
  process.exit(1)
})
