import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Server } from 'node:http'

// --- Mock setup ---

const { mockGetServerToken, wssMockRef } = vi.hoisted(() => {
  const mockGetServerToken = vi.fn()
  const wssMockRef: {
    value: {
      on: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
    } | null
  } = { value: null }
  return { mockGetServerToken, wssMockRef }
})

vi.mock('ws', () => ({
  WebSocketServer: class {
    on = vi.fn()
    close = vi.fn()
    constructor() {
      wssMockRef.value = this
    }
  },
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
    CLOSING: 2,
    CONNECTING: 0,
  },
}))

vi.mock('./middleware/auth.js', () => ({
  getServerToken: mockGetServerToken,
}))

// Static import — module loaded after mocks are registered
import { initWebSocketServer, broadcast, getConnectedClientCount, shutdownWebSocket } from './websocket'

// --- Helpers ---

/** Creates a mock WebSocket client with vi.fn() methods. */
function createMockClient() {
  return {
    readyState: 1 as number, // WebSocket.OPEN
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
  }
}

/**
 * Retrieves an event handler registered on the mock WebSocketServer.
 * E.g. getWssHandler('connection') returns the connection callback.
 */
function getWssHandler(eventName: string): ((...args: unknown[]) => void) | undefined {
  if (!wssMockRef.value) return undefined
  const calls = wssMockRef.value.on.mock.calls as Array<[string, (...args: unknown[]) => void]>
  const match = calls.find((c) => c[0] === eventName)
  return match?.[1]
}

/**
 * Retrieves an event handler registered on a mock client via ws.on().
 */
function getClientHandler(
  mockClient: ReturnType<typeof createMockClient>,
  eventName: string,
): ((...args: unknown[]) => void) | undefined {
  const calls = mockClient.on.mock.calls as Array<[string, (...args: unknown[]) => void]>
  const match = calls.find((c) => c[0] === eventName)
  return match?.[1]
}

/** Minimal mock HTTP server for initWebSocketServer parameter. */
const mockServer = {} as Server

// --- Tests ---

describe('WebSocket Server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wssMockRef.value = null
    mockGetServerToken.mockReturnValue('test-server-token')
  })

  afterEach(() => {
    shutdownWebSocket()
  })

  // ------------------------------------------------------------------ //
  // initWebSocketServer                                                 //
  // ------------------------------------------------------------------ //
  describe('initWebSocketServer', () => {
    it('should create a WebSocketServer instance', () => {
      initWebSocketServer(mockServer)
      expect(wssMockRef.value).not.toBeNull()
    })

    it('should register connection and close handlers on wss', () => {
      initWebSocketServer(mockServer)
      expect(wssMockRef.value?.on).toHaveBeenCalledWith('connection', expect.any(Function))
      expect(wssMockRef.value?.on).toHaveBeenCalledWith('close', expect.any(Function))
    })

    it('should start with zero connected clients', () => {
      initWebSocketServer(mockServer)
      expect(getConnectedClientCount()).toBe(0)
    })
  })

  // ------------------------------------------------------------------ //
  // Client connection & disconnection                                   //
  // ------------------------------------------------------------------ //
  describe('client connection', () => {
    beforeEach(() => {
      initWebSocketServer(mockServer)
    })

    it('should add client to set on connection', () => {
      const handler = getWssHandler('connection')
      expect(handler).toBeDefined()
      handler?.(createMockClient())

      expect(getConnectedClientCount()).toBe(1)
    })

    it('should track multiple connected clients', () => {
      const handler = getWssHandler('connection')
      handler?.(createMockClient())
      handler?.(createMockClient())
      handler?.(createMockClient())

      expect(getConnectedClientCount()).toBe(3)
    })

    it('should remove client when its close event fires', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      expect(getConnectedClientCount()).toBe(1)

      const closeHandler = getClientHandler(client, 'close')
      closeHandler?.()

      expect(getConnectedClientCount()).toBe(0)
    })

    it('should remove client when its error event fires', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      const errorHandler = getClientHandler(client, 'error')
      errorHandler?.()

      expect(getConnectedClientCount()).toBe(0)
    })
  })

  // ------------------------------------------------------------------ //
  // Client authentication                                               //
  // ------------------------------------------------------------------ //
  describe('client authentication', () => {
    beforeEach(() => {
      initWebSocketServer(mockServer)
    })

    it('should authenticate client with valid token', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      const msgHandler = getClientHandler(client, 'message')
      expect(msgHandler).toBeDefined()
      msgHandler?.(Buffer.from(JSON.stringify({ type: 'auth', token: 'test-server-token' })))

      expect(client.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth-ok' }))
    })

    it('should NOT authenticate client with wrong token', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      const msgHandler = getClientHandler(client, 'message')
      msgHandler?.(Buffer.from(JSON.stringify({ type: 'auth', token: 'wrong-token' })))

      expect(client.send).not.toHaveBeenCalled()
    })

    it('should ignore non-auth message types', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      const msgHandler = getClientHandler(client, 'message')
      msgHandler?.(Buffer.from(JSON.stringify({ type: 'ping' })))

      expect(client.send).not.toHaveBeenCalled()
    })

    it('should ignore malformed JSON messages gracefully', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      const msgHandler = getClientHandler(client, 'message')
      // Should not throw
      msgHandler?.(Buffer.from('not-valid-json'))
      msgHandler?.(Buffer.from(''))

      expect(client.send).not.toHaveBeenCalled()
    })
  })

  // ------------------------------------------------------------------ //
  // Last-event replay                                                   //
  // ------------------------------------------------------------------ //
  describe('last-event replay', () => {
    beforeEach(() => {
      initWebSocketServer(mockServer)
    })

    it('should replay stored events when client authenticates', () => {
      // Broadcast some events before any client connects
      broadcast('scan-progress', { percent: 50 })
      broadcast('scan-complete', { count: 10 })

      // Connect a new client
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      // Authenticate — should trigger replay
      const msgHandler = getClientHandler(client, 'message')
      msgHandler?.(Buffer.from(JSON.stringify({ type: 'auth', token: 'test-server-token' })))

      // Collect all sent messages
      const sentTypes = (client.send.mock.calls as Array<[string]>).map((call) => JSON.parse(call[0]).type)

      expect(sentTypes).toContain('auth-ok')
      expect(sentTypes).toContain('scan-progress')
      expect(sentTypes).toContain('scan-complete')
    })

    it('should replay only the latest event for a given type', () => {
      broadcast('progress', { step: 1 })
      broadcast('progress', { step: 2 }) // overwrites previous

      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      const msgHandler = getClientHandler(client, 'message')
      msgHandler?.(Buffer.from(JSON.stringify({ type: 'auth', token: 'test-server-token' })))

      const progressMessages = (client.send.mock.calls as Array<[string]>)
        .map((call) => JSON.parse(call[0]))
        .filter((msg: Record<string, unknown>) => msg.type === 'progress')

      // Only the latest value should be replayed
      expect(progressMessages).toHaveLength(1)
      expect(progressMessages[0].data).toEqual({ step: 2 })
    })

    it('should NOT replay events for unauthenticated client', () => {
      broadcast('test-event', { value: 42 })

      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      // Don't authenticate — just verify no data was sent
      expect(client.send).not.toHaveBeenCalled()
    })
  })

  // ------------------------------------------------------------------ //
  // broadcast                                                           //
  // ------------------------------------------------------------------ //
  describe('broadcast', () => {
    beforeEach(() => {
      initWebSocketServer(mockServer)
    })

    it('should send to authenticated clients with OPEN readyState', () => {
      const handler = getWssHandler('connection')

      // Create authenticated client
      const authClient = createMockClient()
      handler?.(authClient)
      const authMsgHandler = getClientHandler(authClient, 'message')
      authMsgHandler?.(Buffer.from(JSON.stringify({ type: 'auth', token: 'test-server-token' })))

      // Create unauthenticated client
      const unauthClient = createMockClient()
      handler?.(unauthClient)

      // Clear replay messages from authClient
      authClient.send.mockClear()

      // Broadcast
      broadcast('test-event', { payload: 'hello' })

      expect(authClient.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test-event', data: { payload: 'hello' } }))
      expect(unauthClient.send).not.toHaveBeenCalled()
    })

    it('should NOT send to authenticated clients with non-OPEN readyState', () => {
      const handler = getWssHandler('connection')

      const client = createMockClient()
      handler?.(client)

      // Authenticate
      const msgHandler = getClientHandler(client, 'message')
      msgHandler?.(Buffer.from(JSON.stringify({ type: 'auth', token: 'test-server-token' })))

      // Mark as CLOSED
      client.readyState = 3
      client.send.mockClear()

      broadcast('closed-event', { ignored: true })

      expect(client.send).not.toHaveBeenCalled()
    })

    it('should store event for future replay', () => {
      broadcast('stored-event', { kept: true })

      // Verify by connecting and authenticating a new client
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      const msgHandler = getClientHandler(client, 'message')
      msgHandler?.(Buffer.from(JSON.stringify({ type: 'auth', token: 'test-server-token' })))

      const sentMessages = (client.send.mock.calls as Array<[string]>).map((call) => JSON.parse(call[0]))

      expect(sentMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'stored-event',
            data: { kept: true },
          }),
        ]),
      )
    })
  })

  // ------------------------------------------------------------------ //
  // Heartbeat                                                           //
  // ------------------------------------------------------------------ //
  describe('heartbeat', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      initWebSocketServer(mockServer)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should ping open clients every 30 seconds', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      vi.advanceTimersByTime(30_000)

      expect(client.ping).toHaveBeenCalled()
    })

    it('should remove clients with non-OPEN readyState during heartbeat', () => {
      const handler = getWssHandler('connection')
      const client = createMockClient()
      handler?.(client)

      expect(getConnectedClientCount()).toBe(1)

      // Mark client as closed
      client.readyState = 3

      vi.advanceTimersByTime(30_000)

      expect(getConnectedClientCount()).toBe(0)
    })

    it('should continue pinging remaining clients after removal', () => {
      const handler = getWssHandler('connection')

      const openClient = createMockClient()
      const closedClient = createMockClient()
      handler?.(openClient)
      handler?.(closedClient)

      expect(getConnectedClientCount()).toBe(2)

      // Close one client
      closedClient.readyState = 3

      vi.advanceTimersByTime(30_000)

      expect(getConnectedClientCount()).toBe(1)
      expect(openClient.ping).toHaveBeenCalled()
    })
  })

  // ------------------------------------------------------------------ //
  // shutdownWebSocket                                                   //
  // ------------------------------------------------------------------ //
  describe('shutdownWebSocket', () => {
    it('should close all connected clients', () => {
      initWebSocketServer(mockServer)

      const handler = getWssHandler('connection')
      const client1 = createMockClient()
      const client2 = createMockClient()
      handler?.(client1)
      handler?.(client2)

      expect(getConnectedClientCount()).toBe(2)

      shutdownWebSocket()

      expect(client1.close).toHaveBeenCalled()
      expect(client2.close).toHaveBeenCalled()
      expect(getConnectedClientCount()).toBe(0)
    })

    it('should close the WebSocket server', () => {
      initWebSocketServer(mockServer)
      const wssClose = wssMockRef.value?.close

      shutdownWebSocket()

      expect(wssClose).toHaveBeenCalled()
    })

    it('should handle shutdown when no server is initialized', () => {
      // shutdownWebSocket without init — should not throw
      expect(() => shutdownWebSocket()).not.toThrow()
      expect(getConnectedClientCount()).toBe(0)
    })
  })
})
