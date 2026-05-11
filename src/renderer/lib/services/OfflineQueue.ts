/**
 * OfflineQueue Service
 *
 * Provides offline request queuing capabilities to enable full offline functionality.
 * When the application is offline, API requests are queued and persisted to localStorage.
 * When connectivity is restored, queued requests are automatically replayed.
 *
 * Features:
 * - Automatic online/offline detection via navigator.onLine and events
 * - Request queue persistence to localStorage
 * - Configurable retry policies with exponential backoff
 * - Sync-on-reconnect with progress tracking
 * - Event-based notifications for UI updates
 *
 * @module OfflineQueue
 */

/**
 * Represents a queued request
 */
export interface QueuedRequest {
  /** Unique identifier for the request */
  id: string
  /** Type of request (used for routing to appropriate handler) */
  type: RequestType
  /** The request payload */
  payload: unknown
  /** Timestamp when the request was queued */
  timestamp: number
  /** Number of retry attempts */
  retryCount: number
  /** Maximum number of retries allowed */
  maxRetries: number
  /** Priority (higher = more important, processed first) */
  priority: number
  /** Optional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Types of requests that can be queued
 */
export type RequestType =
  | 'nvd-sync'
  | 'vulnerability-scan'
  | 'cve-lookup'
  | 'cpe-search'
  | 'project-save'
  | 'settings-sync'
  | 'custom'

/**
 * Result of processing a queued request
 */
export interface RequestResult {
  /** The original request ID */
  requestId: string
  /** Whether the request succeeded */
  success: boolean
  /** Response data (if successful) */
  data?: unknown
  /** Error message (if failed) */
  error?: string
  /** Whether the request should be retried */
  shouldRetry: boolean
}

/**
 * Handler function type for processing requests
 */
export type RequestHandler = (request: QueuedRequest) => Promise<RequestResult>

/**
 * Configuration options for the OfflineQueue
 */
export interface OfflineQueueConfig {
  /** Maximum number of requests to keep in the queue (default: 100) */
  maxQueueSize?: number
  /** Default maximum retries per request (default: 3) */
  defaultMaxRetries?: number
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelay?: number
  /** Maximum delay for retries in ms (default: 30000) */
  retryMaxDelay?: number
  /** Delay between processing queued requests in ms (default: 100) */
  processInterval?: number
  /** Storage key for persisting the queue (default: 'vuln-assess-offline-queue') */
  storageKey?: string
  /** Whether to auto-process queue on reconnect (default: true) */
  autoProcessOnReconnect?: boolean
}

/**
 * Event types emitted by the OfflineQueue
 */
export type OfflineQueueEventType =
  | 'online'
  | 'offline'
  | 'queue-changed'
  | 'sync-started'
  | 'sync-progress'
  | 'sync-completed'
  | 'sync-error'
  | 'request-processed'

/**
 * Event data for OfflineQueue events
 */
export interface OfflineQueueEvent {
  type: OfflineQueueEventType
  /** Current online status */
  isOnline: boolean
  /** Current queue length */
  queueLength: number
  /** For sync events: progress percentage (0-100) */
  progress?: number
  /** For sync events: total requests to process */
  total?: number
  /** For sync events: processed count */
  processed?: number
  /** For request-processed: the request and result */
  request?: QueuedRequest
  result?: RequestResult
  /** For error events: the error message */
  error?: string
}

/**
 * Event listener callback type
 */
export type OfflineQueueEventListener = (event: OfflineQueueEvent) => void

/**
 * Statistics about the offline queue
 */
export interface QueueStats {
  /** Current online status */
  isOnline: boolean
  /** Number of requests in the queue */
  queueLength: number
  /** Number of requests by type */
  byType: Record<RequestType, number>
  /** Oldest request timestamp (ms since epoch) */
  oldestRequest?: number
  /** Total retry attempts across all requests */
  totalRetries: number
  /** Number of requests at max retries */
  atMaxRetries: number
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<OfflineQueueConfig> = {
  maxQueueSize: 100,
  defaultMaxRetries: 3,
  retryBaseDelay: 1000,
  retryMaxDelay: 30000,
  processInterval: 100,
  storageKey: 'vuln-assess-offline-queue',
  autoProcessOnReconnect: true,
}

/**
 * OfflineQueue class for managing offline request queuing
 */
export class OfflineQueue {
  private config: Required<OfflineQueueConfig>
  private queue: QueuedRequest[] = []
  private handlers: Map<RequestType, RequestHandler> = new Map()
  private listeners: Set<OfflineQueueEventListener> = new Set()
  private isOnline: boolean
  private isProcessing: boolean = false
  private processTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(config: OfflineQueueConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

    // Initialize from storage
    this.loadFromStorage()

    // Set up online/offline event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
    if (this.processTimeout) {
      clearTimeout(this.processTimeout)
      this.processTimeout = null
    }
  }

  /**
   * Handle online event
   */
  private handleOnline = (): void => {
    this.isOnline = true
    this.emit({ type: 'online', isOnline: true, queueLength: this.queue.length })

    if (this.config.autoProcessOnReconnect && this.queue.length > 0) {
      this.processQueue()
    }
  }

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    this.isOnline = false
    this.emit({ type: 'offline', isOnline: false, queueLength: this.queue.length })
  }

  /**
   * Register a handler for a specific request type
   */
  registerHandler(type: RequestType, handler: RequestHandler): void {
    this.handlers.set(type, handler)
  }

  /**
   * Unregister a handler for a specific request type
   */
  unregisterHandler(type: RequestType): void {
    this.handlers.delete(type)
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: OfflineQueueEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: OfflineQueueEventListener): void {
    this.listeners.delete(listener)
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: OfflineQueueEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[OfflineQueue] Error in event listener:', error)
      }
    }
  }

  /**
   * Generate a unique request ID
   */
  private generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(this.config.storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as QueuedRequest[]
        if (Array.isArray(parsed)) {
          this.queue = parsed
        }
      }
    } catch (error) {
      console.error('[OfflineQueue] Error loading from storage:', error)
      this.queue = []
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.queue))
    } catch (error) {
      console.error('[OfflineQueue] Error saving to storage:', error)
    }
  }

  /**
   * Add a request to the queue
   *
   * @param type - The type of request
   * @param payload - The request payload
   * @param options - Optional settings (priority, maxRetries, metadata)
   * @returns The queued request ID, or null if processed immediately
   */
  async enqueue(
    type: RequestType,
    payload: unknown,
    options: {
      priority?: number
      maxRetries?: number
      metadata?: Record<string, unknown>
      processImmediately?: boolean
    } = {},
  ): Promise<string | null> {
    // If online and processImmediately is true, try to process directly
    if (this.isOnline && options.processImmediately !== false) {
      const handler = this.handlers.get(type)
      if (handler) {
        try {
          const result = await handler({
            id: this.generateId(),
            type,
            payload,
            timestamp: Date.now(),
            retryCount: 0,
            maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
            priority: options.priority ?? 0,
            metadata: options.metadata,
          })

          if (result.success) {
            return null // Processed successfully, no need to queue
          }
        } catch {
          // Handler failed, queue the request
        }
      }
    }

    // Create the queued request
    const request: QueuedRequest = {
      id: this.generateId(),
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
      priority: options.priority ?? 0,
      metadata: options.metadata,
    }

    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove lowest priority item to make room
      const lowestPriorityIndex = this.queue.reduce(
        (minIdx, req, idx, arr) => (req.priority < arr[minIdx].priority ? idx : minIdx),
        0,
      )
      this.queue.splice(lowestPriorityIndex, 1)
    }

    // Insert in priority order (higher priority first)
    const insertIndex = this.queue.findIndex((req) => req.priority < request.priority)
    if (insertIndex === -1) {
      this.queue.push(request)
    } else {
      this.queue.splice(insertIndex, 0, request)
    }

    this.saveToStorage()
    this.emit({ type: 'queue-changed', isOnline: this.isOnline, queueLength: this.queue.length })

    return request.id
  }

  /**
   * Remove a request from the queue by ID
   */
  dequeue(requestId: string): boolean {
    const index = this.queue.findIndex((req) => req.id === requestId)
    if (index === -1) return false

    this.queue.splice(index, 1)
    this.saveToStorage()
    this.emit({ type: 'queue-changed', isOnline: this.isOnline, queueLength: this.queue.length })

    return true
  }

  /**
   * Get a request by ID
   */
  getRequest(requestId: string): QueuedRequest | undefined {
    return this.queue.find((req) => req.id === requestId)
  }

  /**
   * Get all requests in the queue
   */
  getQueue(): QueuedRequest[] {
    return [...this.queue]
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const byType: Record<RequestType, number> = {
      'nvd-sync': 0,
      'vulnerability-scan': 0,
      'cve-lookup': 0,
      'cpe-search': 0,
      'project-save': 0,
      'settings-sync': 0,
      custom: 0,
    }

    let oldestRequest: number | undefined
    let totalRetries = 0
    let atMaxRetries = 0

    for (const req of this.queue) {
      byType[req.type]++
      totalRetries += req.retryCount
      if (req.retryCount >= req.maxRetries) atMaxRetries++
      if (oldestRequest === undefined || req.timestamp < oldestRequest) {
        oldestRequest = req.timestamp
      }
    }

    return {
      isOnline: this.isOnline,
      queueLength: this.queue.length,
      byType,
      oldestRequest,
      totalRetries,
      atMaxRetries,
    }
  }

  /**
   * Calculate delay for retry with exponential backoff
   */
  private getRetryDelay(retryCount: number): number {
    const delay = this.config.retryBaseDelay * Math.pow(2, retryCount)
    return Math.min(delay, this.config.retryMaxDelay)
  }

  /**
   * Process the queue (sync-on-reconnect)
   * Failed requests are retried immediately with exponential backoff delay.
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || !this.isOnline || this.queue.length === 0) {
      return
    }

    this.isProcessing = true
    const total = this.queue.length
    let processed = 0

    this.emit({
      type: 'sync-started',
      isOnline: this.isOnline,
      queueLength: total,
      total,
      processed: 0,
      progress: 0,
    })

    const permanentlyFailed: QueuedRequest[] = []

    while (this.queue.length > 0) {
      const request = this.queue.shift()
      if (!request) break

      // Check if we have a handler for this request type
      const handler = this.handlers.get(request.type)
      if (!handler) {
        console.warn(`[OfflineQueue] No handler for request type: ${request.type}`)
        permanentlyFailed.push(request)
        processed++
        continue
      }

      // Try to process the request with retries
      let success = false
      let lastResult: RequestResult | null = null

      while (request.retryCount <= request.maxRetries) {
        try {
          lastResult = await handler(request)

          this.emit({
            type: 'request-processed',
            isOnline: this.isOnline,
            queueLength: this.queue.length,
            request,
            result: lastResult,
          })

          if (lastResult.success) {
            success = true
            break
          } else if (!lastResult.shouldRetry || request.retryCount >= request.maxRetries) {
            // Should not retry or max retries reached
            break
          }

          // Increment retry count and wait before retry
          request.retryCount++
          if (request.retryCount <= request.maxRetries) {
            const delay = this.getRetryDelay(request.retryCount)
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        } catch (error) {
          console.error(`[OfflineQueue] Error processing request ${request.id}:`, error)
          lastResult = { requestId: request.id, success: false, error: String(error), shouldRetry: false }

          request.retryCount++
          if (request.retryCount <= request.maxRetries) {
            const delay = this.getRetryDelay(request.retryCount)
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }
      }

      if (!success) {
        console.error(
          `[OfflineQueue] Request ${request.id} failed permanently after ${request.retryCount} retries:`,
          lastResult?.error,
        )
        permanentlyFailed.push(request)
      }

      processed++

      // Emit progress
      const progress = Math.round((processed / total) * 100)
      this.emit({
        type: 'sync-progress',
        isOnline: this.isOnline,
        queueLength: this.queue.length,
        total,
        processed,
        progress,
      })

      // Small delay between requests to avoid overwhelming the server
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.config.processInterval))
      }
    }

    this.saveToStorage()

    this.emit({
      type: 'sync-completed',
      isOnline: this.isOnline,
      queueLength: 0,
      total,
      processed,
      progress: 100,
    })

    this.isProcessing = false
  }

  /**
   * Clear the entire queue
   */
  clearQueue(): void {
    this.queue = []
    this.saveToStorage()
    this.emit({ type: 'queue-changed', isOnline: this.isOnline, queueLength: 0 })
  }

  /**
   * Check if currently online
   */
  getIsOnline(): boolean {
    return this.isOnline
  }

  /**
   * Check if currently processing the queue
   */
  getIsProcessing(): boolean {
    return this.isProcessing
  }

  /**
   * Force an online/offline status update
   * Useful for testing or manual override
   */
  setOnlineStatus(isOnline: boolean): void {
    if (this.isOnline !== isOnline) {
      this.isOnline = isOnline

      if (isOnline) {
        this.handleOnline()
      } else {
        this.handleOffline()
      }
    }
  }

  /**
   * Retry a specific failed request
   */
  async retryRequest(requestId: string): Promise<boolean> {
    const request = this.getRequest(requestId)
    if (!request) return false

    const handler = this.handlers.get(request.type)
    if (!handler) return false

    try {
      const result = await handler(request)
      if (result.success) {
        this.dequeue(requestId)
        return true
      }
    } catch (error) {
      console.error(`[OfflineQueue] Error retrying request ${requestId}:`, error)
    }

    return false
  }
}

/**
 * Create a singleton instance of the OfflineQueue
 */
let defaultInstance: OfflineQueue | null = null

/**
 * Get the default OfflineQueue instance
 */
export function getOfflineQueue(config?: OfflineQueueConfig): OfflineQueue {
  if (!defaultInstance) {
    defaultInstance = new OfflineQueue(config)
  }
  return defaultInstance
}

/**
 * Reset the default instance (useful for testing)
 */
export function resetOfflineQueue(): void {
  if (defaultInstance) {
    defaultInstance.destroy()
    defaultInstance = null
  }
}
