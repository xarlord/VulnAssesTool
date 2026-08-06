import rateLimit from 'express-rate-limit'

// The per-window request cap can be raised via the RATE_LIMIT_MAX env var. This
// exists for controlled runs (e.g. E2E) that share a single client IP and issue
// hundreds of /api calls per minute, which would otherwise trip the production
// caps. When the env var is unset (production), the hardened defaults below apply.
const RATE_LIMIT_OVERRIDE = process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : null

function maxFor(defaultMax: number): number {
  return RATE_LIMIT_OVERRIDE !== null && Number.isFinite(RATE_LIMIT_OVERRIDE) ? RATE_LIMIT_OVERRIDE : defaultMax
}

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: maxFor(300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many search requests, please try again later' },
})

export const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: maxFor(10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many sync requests, please try again later' },
})

// Factories, not singletons: the container and default limiters are each mounted on
// several route groups. A single shared instance keys one IP-based bucket across ALL those
// groups, so heavy traffic on one feature throttles the others. Call the factory once per
// mount so each route group gets its own independent bucket.
export function makeContainerLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxFor(5),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many container scan requests' },
  })
}

export function makeDefaultLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxFor(60),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later' },
  })
}
