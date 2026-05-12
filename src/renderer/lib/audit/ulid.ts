/**
 * ULID Generator
 * Generates time-ordered unique identifiers (Universally Unique Lexicographically Sortable Identifier)
 * Format: 01ARZ3NDEKTSV4RRFFQ69G5FAV
 * - 10 characters: Time-encoded (48 bits)
 * - 16 characters: Random (80 bits)
 * Based on: https://github.com/ulid/spec
 */

/**
 * Encoding characters for ULID (Crockford's Base32)
 */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Generate a random ULID
 * @returns ULID string
 */
export function ulid(): string {
  const now = Date.now()
  const timeChars = encodeTime(now)
  const randomChars = encodeRandom(16)

  return timeChars + randomChars
}

/**
 * Encode time to first 10 characters of ULID
 * @param now - Current timestamp in milliseconds
 * @returns 10-character encoded time string
 */
function encodeTime(now: number): string {
  let encoded = ''
  let time = now

  for (let i = 9; i >= 0; i--) {
    const mod = time % 32
    encoded = ENCODING[mod] + encoded
    time = Math.floor(time / 32)
  }

  return encoded
}

/**
 * Generate random characters for ULID
 * @param length - Number of random characters to generate
 * @returns Random string of specified length
 */
function encodeRandom(length: number): string {
  let encoded = ''
  const randomBytes = new Uint8Array(length)

  // Generate random bytes
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes)
  } else {
    // Fallback for older environments
    for (let i = 0; i < length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256)
    }
  }

  for (let i = 0; i < length; i++) {
    const mod = randomBytes[i] % 32
    encoded += ENCODING[mod]
  }

  return encoded
}

/**
 * Extract timestamp from ULID
 * @param ulid - ULID string
 * @returns Timestamp in milliseconds
 */
export function getUlidTimestamp(ulidValue: string): number {
  let time = 0

  for (let i = 0; i < 10; i++) {
    const charIndex = ENCODING.indexOf(ulidValue[i])
    if (charIndex === -1) {
      throw new Error(`Invalid ULID character: ${ulidValue[i]}`)
    }
    time = time * 32 + charIndex
  }

  return time
}

/**
 * Validate ULID format
 * @param ulid - String to validate
 * @returns True if valid ULID
 */
export function isValidUlid(ulidValue: string): boolean {
  if (ulidValue.length !== 26) {
    return false
  }

  for (const char of ulidValue) {
    if (!ENCODING.includes(char)) {
      return false
    }
  }

  return true
}

/**
 * Convert ULID to Date
 * @param ulid - ULID string
 * @returns Date object
 */
export function ulidToDate(ulidValue: string): Date {
  const timestamp = getUlidTimestamp(ulidValue)
  return new Date(timestamp)
}
