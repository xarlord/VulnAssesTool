/**
 * NVD Rate Limiter
 * Enforces NVD API rate limits (5 requests per 30 seconds without API key,
 * 50 requests per 30 seconds with API key)
 */

export interface RateLimiterOptions {
  requestsPerWindow?: number // Default: 5 without API key, 50 with key
  windowMs?: number // Default: 30000 (30 seconds)
  maxRetries?: number // Default: 5
  initialRetryDelay?: number // Default: 1000ms
}

interface QueuedRequest {
  execute: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timestamp: number
  priority?: number // Higher priority = executed first
}

export class RateLimiter {
  private requests: number[] = [] // Timestamps of recent requests
  private queue: QueuedRequest[] = []
  private processing = false
  private options: Required<RateLimiterOptions>

  constructor(options: RateLimiterOptions = {}) {
    this.options = {
      requestsPerWindow: options.requestsPerWindow || 5,
      windowMs: options.windowMs || 30000,
      maxRetries: options.maxRetries || 5,
      initialRetryDelay: options.initialRetryDelay || 1000,
    }
  }

  /**
   * Execute a request with rate limiting and retry logic
   */
  async execute<T>(requestFn: () => Promise<T>, priority?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: requestFn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
        priority,
      })

      this.processQueue()
    })
  }

  /**
   * Process the queue of pending requests
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    while (this.queue.length > 0) {
      // Sort by priority (highest first)
      this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0))

      const now = Date.now()
      const windowStart = now - this.options.windowMs

      // Remove old timestamps outside the window
      this.requests = this.requests.filter((t) => t > windowStart)

      // Check if we can make a request
      if (this.requests.length < this.options.requestsPerWindow) {
        const item = this.queue.shift()
        if (!item) break

        try {
          const result = await this.executeWithRetry(item.execute)
          item.resolve(result)
          this.requests.push(Date.now())
        } catch (error) {
          item.reject(error as Error)
        }
      } else {
        // Wait until the oldest request expires
        const oldestRequest = this.requests[0]
        const waitTime = oldestRequest + this.options.windowMs - now + 100

        if (waitTime > 0) {
          await this.delay(waitTime)
        }
      }
    }

    this.processing = false
  }

  /**
   * Execute a request with exponential backoff retry
   */
  private async executeWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await requestFn()
      } catch (error) {
        lastError = error as Error

        // Don't retry client errors (4xx)
        if (error instanceof Error && this.isClientError(error)) {
          throw error
        }

        // Retry for server errors (5xx) and rate limits (429)
        if (attempt < this.options.maxRetries) {
          const delay = this.options.initialRetryDelay * Math.pow(2, attempt)
          console.warn(
            `Request failed (attempt ${attempt + 1}/${this.options.maxRetries + 1}), retrying in ${delay}ms:`,
            lastError.message,
          )
          await this.delay(delay)
        }
      }
    }

    throw lastError || new Error('Request failed after max retries')
  }

  /**
   * Check if error is a client error (4xx) that shouldn't be retried
   */
  private isClientError(error: Error): boolean {
    // Check for common client error patterns
    const message = error.message.toLowerCase()
    return (
      message.includes('http 400') ||
      message.includes('http 401') ||
      message.includes('http 403') ||
      message.includes('http 404') ||
      message.includes('forbidden') ||
      message.includes('not found')
    )
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length
  }

  /**
   * Get time until next request can be made
   */
  getTimeUntilNextRequest(): number {
    const now = Date.now()
    const windowStart = now - this.options.windowMs
    this.requests = this.requests.filter((t) => t > windowStart)

    if (this.requests.length < this.options.requestsPerWindow) {
      return 0
    }

    const oldestRequest = this.requests[0]
    return Math.max(0, oldestRequest + this.options.windowMs - now)
  }

  /**
   * Reset the rate limiter (clear queue and request history)
   */
  reset(): void {
    this.queue = []
    this.requests = []
    this.processing = false
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Create a rate limiter for NVD API
 */
export function createNvdRateLimiter(hasApiKey: boolean): RateLimiter {
  // With API key: 50 req/30s
  // Without API key: 5 req/30s
  return new RateLimiter({
    requestsPerWindow: hasApiKey ? 50 : 5,
    windowMs: 30000,
    maxRetries: 5,
    initialRetryDelay: 1000,
  })
}
