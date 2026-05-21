/**
 * WebSocket Server
 *
 * Provides real-time event broadcasting to connected clients.
 * Replaces Electron's mainWindow.webContents.send() pattern.
 */

import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { getServerToken } from './middleware/auth.js'

interface ClientInfo {
  ws: WebSocket
  authenticated: boolean
}

const clients = new Set<ClientInfo>()
const lastEvents = new Map<string, unknown>()
let wss: WebSocketServer | null = null

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    const client: ClientInfo = { ws, authenticated: false }
    clients.add(client)

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (msg.type === 'auth' && msg.token === getServerToken()) {
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
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping()
      } else {
        clients.delete(client)
      }
    }
  }, 30_000)

  wss.on('close', () => {
    clearInterval(heartbeatInterval)
  })
}

export function broadcast(type: string, data: unknown): void {
  lastEvents.set(type, data)

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
