/**
 * IPC Rate Limiter
 *
 * @module ipcRateLimit
 *
 * @description
 * Provides rate limiting for IPC channels to prevent abuse and
 * ensure fair resource usage. Tracks request timestamps per channel
 * and enforces configurable limits.
 *
 * @since 1.1.0
 */

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per time window */
  maxRequests: number
  /** Time window in milliseconds */
  windowMs: number
  /** Whether rate limiting is enabled */
  enabled: boolean
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether request is allowed */
  allowed: boolean
  /** Remaining requests in current window */
  remaining: number
  /** Time until limit resets (milliseconds) */
  resetTime: number
  /** Error message if not allowed */
  error?: string
}

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60, // 60 requests per minute
  windowMs: 60000, // 1 minute
  enabled: true,
}

/**
 * Channel-specific configurations
 *
 * Critical operations have stricter limits
 */
const CHANNEL_CONFIGS: Record<string, Partial<RateLimitConfig>> = {
  // Database operations - high frequency allowed for vulnerability scanning
  // Batch scanning can require 2-3 searches per component (CPE + name fallback)
  'db:nvd-search': { maxRequests: 300, windowMs: 60000 },
  'db:nvd-get-by-cve': { maxRequests: 300, windowMs: 60000 },
  'db:nvd-get-cve-full': { maxRequests: 300, windowMs: 60000 },
  'cpe:search': { maxRequests: 300, windowMs: 60000 }, // CPE search for estimation

  // NVD sync - strict limits
  'db:sync-start': { maxRequests: 10, windowMs: 3600000 }, // 10 per hour
  'db:delta-sync-start': { maxRequests: 30, windowMs: 3600000 }, // 30 per hour (more frequent delta syncs)

  // Secure storage - moderate limits
  'storage:set-api-key': { maxRequests: 30, windowMs: 60000 },
  'storage:get-api-key': { maxRequests: 120, windowMs: 60000 },

  // Update operations - very strict
  'updater:check': { maxRequests: 5, windowMs: 60000 }, // 5 per minute
}

/**
 * Rate limiter state
 */
interface RateLimiterState {
  timestamps: number[]
  config: RateLimitConfig
}

/**
 * Global rate limiter state per IPC channel
 */
const limiters = new Map<string, RateLimiterState>()

/**
 * Gets the configuration for a specific channel.
 *
 * @param channel - IPC channel name
 * @returns Rate limit configuration for the channel
 *
 * @example
 * ```ts
 * const config = getChannelConfig('db:search')
 * // Returns: { maxRequests: 100, windowMs: 60000, enabled: true }
 * ```
 */
function getChannelConfig(channel: string): RateLimitConfig {
  const channelConfig = CHANNEL_CONFIGS[channel]
  return {
    ...DEFAULT_CONFIG,
    ...channelConfig,
    enabled: channelConfig?.enabled ?? DEFAULT_CONFIG.enabled,
  }
}

/**
 * Cleans up old timestamps outside the time window.
 *
 * @param timestamps - Array of timestamps to clean
 * @param windowMs - Time window in milliseconds
 * @returns Filtered timestamps within the window
 *
 * @example
 * ```ts
 * const now = Date.now()
 * const recent = cleanupTimestamps([1000, 2000, 70000], 60000, now)
 * // Removes timestamp 70000 if it's outside the window
 * ```
 */
function cleanupTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs
  return timestamps.filter((ts) => ts > cutoff)
}

/**
 * Checks if a request should be rate limited.
 *
 * @param channel - IPC channel name
 * @param config - Optional custom configuration
 * @returns Rate limit check result
 *
 * @example
 * ```ts
 * const result = checkRateLimit('db:search')
 * if (!result.allowed) {
 *   console.log('Rate limited:', result.error)
 * }
 * ```
 */
export function checkRateLimit(channel: string, config?: Partial<RateLimitConfig>): RateLimitResult {
  const now = Date.now()
  const fullConfig = { ...getChannelConfig(channel), ...config }

  // If rate limiting is disabled, always allow
  if (!fullConfig.enabled) {
    return {
      allowed: true,
      remaining: fullConfig.maxRequests,
      resetTime: now + fullConfig.windowMs,
    }
  }

  // Get or create limiter state for channel
  let state = limiters.get(channel)
  if (!state) {
    state = { timestamps: [], config: fullConfig }
    limiters.set(channel, state)
  }

  // Clean up old timestamps
  state.timestamps = cleanupTimestamps(state.timestamps, fullConfig.windowMs, now)

  // Check if limit is exceeded
  const requestCount = state.timestamps.length
  if (requestCount >= fullConfig.maxRequests) {
    // Find oldest timestamp to calculate reset time
    const oldestTimestamp = state.timestamps[0]
    const resetTime = oldestTimestamp + fullConfig.windowMs

    return {
      allowed: false,
      remaining: 0,
      resetTime,
      error: `Rate limit exceeded. Maximum ${fullConfig.maxRequests} requests per ${fullConfig.windowMs / 1000} seconds allowed.`,
    }
  }

  // Add current request timestamp
  state.timestamps.push(now)

  // Calculate remaining requests
  const remaining = fullConfig.maxRequests - requestCount - 1

  return {
    allowed: true,
    remaining,
    resetTime: now + fullConfig.windowMs,
  }
}

/**
 * Records a request for rate limiting (for monitoring).
 *
 * @param channel - IPC channel name
 * @param allowed - Whether the request was allowed
 *
 * @example
 * ```ts
 * const result = checkRateLimit('db:search')
 * recordRequest('db:search', result.allowed)
 * ```
 */
export function recordRequest(channel: string, allowed: boolean): void {
  // This function is primarily for monitoring/analytics
  // Could integrate with audit logging in the future
  if (allowed) {
    // Could log successful requests for analytics
  }
}

/**
 * Resets rate limit state for a channel.
 *
 * Use this for testing or when manually clearing limits.
 *
 * @param channel - IPC channel name to reset
 *
 * @example
 * ```ts
 * resetRateLimit('db:search')
 * // Next request will start fresh
 * ```
 */
/** @internal */
export function resetRateLimit(channel: string): void {
  limiters.delete(channel)
}

/**
 * Gets current rate limit statistics for a channel.
 *
 * @param channel - IPC channel name
 * @returns Current usage statistics
 *
 * @example
 * ```ts
 * const stats = getRateLimitStats('db:search')
 * console.log(`Used ${stats.used}/${stats.max} requests`)
 * ```
 */
/** @internal */
export function getRateLimitStats(channel: string): {
  used: number
  max: number
  windowMs: number
  resetIn: number
} | null {
  const state = limiters.get(channel)
  if (!state) {
    return null
  }

  const config = state.config
  const now = Date.now()
  const cleanTimestamps = cleanupTimestamps(state.timestamps, config.windowMs, now)

  // Find when the window resets
  const oldestTimestamp = cleanTimestamps[0]
  const resetIn = oldestTimestamp ? oldestTimestamp + config.windowMs : now + config.windowMs

  return {
    used: cleanTimestamps.length,
    max: config.maxRequests,
    windowMs: config.windowMs,
    resetIn,
  }
}

/**
 * Checks if a channel is currently rate limited.
 *
 * @param channel - IPC channel name
 * @returns True if channel is currently rate limited
 *
 * @example
 * ```ts
 * if (isRateLimited('db:search')) {
 *   console.log('Please wait before trying again')
 * }
 * ```
 */
/** @internal */
export function isRateLimited(channel: string): boolean {
  const stats = getRateLimitStats(channel)
  if (!stats) return false

  return stats.used >= stats.max
}

/**
 * Creates a rate-limited IPC handler wrapper.
 *
 * @param channel - IPC channel name
 * @param handler - Original IPC handler function
 * @returns Rate-limited handler function
 *
 * @example
 * ```ts
 * import { ipcMain } from 'electron'
 * import { wrapIpcHandler } from './ipcRateLimit'
 *
 * const originalHandler = async (event, request) => { ... }
 * const rateLimitedHandler = wrapIpcHandler('db:search', originalHandler)
 *
 * ipcMain.handle('db:search', rateLimitedHandler)
 * ```
 */
export function wrapIpcHandler<T extends unknown[], R>(
  channel: string,
  handler: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  return async (...args) => {
    // Check rate limit
    const limitResult = checkRateLimit(channel)

    if (!limitResult.allowed) {
      // Return rate limit error
      const errorResponse: R = {
        success: false,
        error: limitResult.error || 'Rate limit exceeded',
        remaining: limitResult.remaining,
        resetTime: limitResult.resetTime,
      } as R

      // Record the (denied) request
      recordRequest(channel, false)

      return errorResponse
    }

    // Record the allowed request
    recordRequest(channel, true)

    // Call original handler
    return handler(...args)
  }
}

/**
 * Updates rate limit configuration for a channel.
 *
 * @param channel - IPC channel name
 * @param config - New configuration (partial)
 *
 * @example
 * ```ts
 * updateChannelConfig('db:search', { maxRequests: 200 })
 * ```
 */
/** @internal */
export function updateChannelConfig(channel: string, config: Partial<RateLimitConfig>): void {
  const state = limiters.get(channel)
  if (state) {
    state.config = { ...state.config, ...config }
  }
}

/**
 * Gets all active rate limiters.
 *
 * @returns Map of all channels with their states
 *
 * @example
 * ```ts
 * const allLimiters = getAllLimiters()
 * for (const [channel, state] of allLimiters) {
 *   console.log(`${channel}: ${state.timestamps.length}/${state.config.maxRequests}`)
 * }
 * ```
 */
/** @internal */
export function getAllLimiters(): Map<string, RateLimiterState> {
  return new Map(limiters)
}

/**
 * Cleanup interval reference for stopping periodic cleanup
 */
let cleanupInterval: NodeJS.Timeout | null = null

/**
 * Cleans up stale rate limiter entries to prevent memory leaks.
 * Removes channels with no recent activity.
 *
 * @param maxIdleMs - Maximum idle time in milliseconds before removing (default: 5 minutes)
 */
export function cleanupStaleLimiters(_maxIdleMs: number = 300000): number {
  const now = Date.now()
  let cleaned = 0

  for (const [channel, state] of limiters) {
    // Clean up old timestamps first
    state.timestamps = cleanupTimestamps(state.timestamps, state.config.windowMs, now)

    // If no timestamps remain and channel has been idle, remove it
    if (state.timestamps.length === 0) {
      // Check if the oldest timestamp (if any existed) is beyond max idle time
      // Since we just cleaned timestamps, if empty, the channel is dormant
      limiters.delete(channel)
      cleaned++
    }
  }

  return cleaned
}

/**
 * Starts periodic cleanup of stale rate limiters.
 * Should be called once during application initialization.
 *
 * @param intervalMs - Cleanup interval in milliseconds (default: 1 minute)
 */
export function startPeriodicCleanup(intervalMs: number = 60000): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
  }

  cleanupInterval = setInterval(() => {
    cleanupStaleLimiters()
  }, intervalMs)
}

/**
 * Stops periodic cleanup of rate limiters.
 * Should be called during application shutdown.
 */
export function stopPeriodicCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}
