/**
 * WebSocket Server
 *
 * Provides real-time event broadcasting to connected clients.
 * Replaces Electron's mainWindow.webContents.send() pattern.
 */

import type { Server } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { getServerToken } from './middleware/auth.js'

interface ClientInfo {
  ws: WebSocket
  authenticated: boolean
  isAlive: boolean
}

const clients = new Set<ClientInfo>()
const lastEvents = new Map<string, unknown>()
const MAX_LAST_EVENTS = 50
let wss: WebSocketServer | null = null

/** Constant-time comparison of a client-supplied token against the server token. */
function tokenMatches(token: string): boolean {
  const provided = Buffer.from(token)
  const expected = Buffer.from(getServerToken())
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    const client: ClientInfo = { ws, authenticated: false, isAlive: true }
    clients.add(client)

    // Liveness: the heartbeat sets isAlive=false before each ping; a live peer answers with a
    // pong and flips it back. A peer that never pongs is terminated (see the heartbeat below).
    ws.on('pong', () => {
      client.isAlive = true
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (msg.type === 'auth' && typeof msg.token === 'string' && tokenMatches(msg.token)) {
          client.authenticated = true
          ws.send(JSON.stringify({ type: 'auth-ok' }))

          for (const [eventType, eventData] of lastEvents) {
            ws.send(JSON.stringify({ type: eventType, data: eventData }))
          }
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      clients.delete(client)
    })

    ws.on('error', () => {
      clients.delete(client)
    })
  })

  const heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        clients.delete(client)
        continue
      }
      // A client that didn't pong since the last tick is presumed dead — terminate it so a
      // silently-dropped peer (sleep, network partition) can't accumulate in `clients` forever.
      if (!client.isAlive) {
        client.ws.terminate()
        clients.delete(client)
        continue
      }
      client.isAlive = false
      client.ws.ping()
    }
  }, 30_000)

  wss.on('close', () => {
    clearInterval(heartbeatInterval)
  })
}

export function broadcast(type: string, data: unknown): void {
  lastEvents.set(type, data)
  if (lastEvents.size > MAX_LAST_EVENTS) {
    const firstKey = lastEvents.keys().next().value
    if (firstKey !== undefined) lastEvents.delete(firstKey)
  }

  const message = JSON.stringify({ type, data })
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN && client.authenticated) {
      client.ws.send(message)
    }
  }
}

export function getConnectedClientCount(): number {
  return clients.size
}

export function shutdownWebSocket(): void {
  for (const client of clients) {
    client.ws.close()
  }
  clients.clear()
  wss?.close()
  wss = null
}
