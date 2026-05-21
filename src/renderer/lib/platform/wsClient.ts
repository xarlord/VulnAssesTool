type WsEventHandler = (data: unknown) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<WsEventHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private stopped = false

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    this.stopped = false
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host || '127.0.0.1:3001'
    const url = `${protocol}//${host}/ws`

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
      const token = localStorage.getItem('vat-server-token')
      if (token) {
        this.ws?.send(JSON.stringify({ type: 'auth', token }))
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.type === 'auth-ok') return
        if (msg.type && msg.data !== undefined) {
          const handlers = this.listeners.get(msg.type as string)
          if (handlers) {
            for (const handler of handlers) {
              handler(msg.data)
            }
          }
        }
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }

  on(eventType: string, handler: WsEventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)?.add(handler)

    return () => {
      const handlers = this.listeners.get(eventType)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.listeners.delete(eventType)
        }
      }
    }
  }

  disconnect(): void {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.listeners.clear()
  }
}

export const wsClient = new WebSocketClient()
