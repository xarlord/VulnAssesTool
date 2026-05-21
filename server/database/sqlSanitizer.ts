/**
 * SQL Injection Prevention Module
 * Provides input sanitization for SQL queries
 */

/**
 * Sanitize user input for SQL queries
 * This prevents SQL injection by escaping special characters
 *
 * @param input - Raw user input
 * @returns Sanitized input safe for SQL queries
 */
export function sanitizeSqlInput(input: string): string {
  if (typeof input !== 'string') {
    return ''
  }

  // Remove SQL injection patterns
  let sanitized = input

  // Escape single quotes
  sanitized = sanitized.replace(/'/g, "''")

  // Remove common SQL injection patterns
  const sqlPatterns = [
    /(--)|(#)/gi, // Comments
    /(;|(\/\*)|(\*\/))/gi, // Multi-line comments and statement separators
    /(\b(ALTER|CREATE|DELETE|DROP|EXEC|EXECUTE|INSERT|INSERT\s+INTO|SELECT|UNION|UPDATE)\b)/gi, // SQL keywords
    /(\b(XP_|SP_)\w+)/gi, // Extended stored procedures
    /(\b(OR|AND)\s+\s*[\s\d]+=)/gi, // Boolean-based SQL injection
  ]

  for (const pattern of sqlPatterns) {
    sanitized = sanitized.replace(pattern, '')
  }

  // Limit length to prevent buffer overflow attacks
  const maxLength = 1000
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  return sanitized.trim()
}

/**
 * Validate CVE ID format (complete CVE IDs only)
 * Prevents injection via CVE ID parameter
 *
 * @param cveId - The CVE ID to validate
 * @returns true if valid complete CVE ID format
 */
export function isValidCveId(cveId: string): boolean {
  // CVE ID format: CVE-YYYY-NNNNN (4-7 digits after year for complete IDs)
  const cveIdPattern = /^CVE-\d{4}-\d{4,7}$/i
  return cveIdPattern.test(cveId)
}

/**
 * Check if string looks like a CVE pattern (complete or partial)
 * Useful for allowing CVE-like text searches while still validating exact CVE IDs
 *
 * @param query - The query string to check
 * @returns true if the query looks like a CVE pattern (complete or partial)
 */
export function isCvePattern(query: string): boolean {
  // CVE pattern: CVE-YYYY-NNNN... (at least 1 digit after year)
  // This allows partial CVE IDs like "CVE-2024-123" for text searches
  const cvePattern = /^CVE-\d{4}-\d{1,7}$/i
  return cvePattern.test(query)
}

/**
 * Check if string is a complete CVE ID
 * Complete CVE IDs have 4-7 digits after the year
 *
 * @param cveId - The CVE ID to check
 * @returns true if the string is a complete CVE ID
 */
export function isCompleteCveId(cveId: string): boolean {
  return isValidCveId(cveId)
}

/**
 * Validate and sanitize CPE string
 *
 * @param cpeString - The CPE string to validate
 * @returns Sanitized CPE string or empty string if invalid
 */
export function sanitizeCpeString(cpeString: string): string {
  if (typeof cpeString !== 'string') {
    return ''
  }

  // Basic CPE 2.3 format validation
  // cpe:2.3:part:vendor:product:version:update:edition:language:sw_edition:target_sw:target_hw:other
  // Allows: alphanumeric, hyphens, underscores, dots, asterisks (wildcards), and tildes
  // The pattern validates the basic structure with at least 4 components after cpe:2.3
  const cpePattern = /^cpe:2\.3:[aoh]:[^:]+:[^:]+(:[^:]*){0,10}$/i

  if (!cpePattern.test(cpeString)) {
    return ''
  }

  // Check for dangerous characters that could be used for injection
  const dangerousChars = /['";\\]/
  if (dangerousChars.test(cpeString)) {
    return ''
  }

  // Limit length
  const maxLength = 256
  if (cpeString.length > maxLength) {
    return ''
  }

  return cpeString
}

/**
 * Validate search query
 * Prevents injection via search parameter
 *
 * @param query - The search query to validate
 * @returns true if valid search query
 */
export function isValidSearchQuery(query: string): boolean {
  if (typeof query !== 'string') {
    return false
  }

  // Check for SQL injection patterns
  const dangerousPatterns = [
    /(--)|(#)/gi,
    /(;)|(\/\*)|(\*\/)/gi,
    /(\b(OR|AND)\s+\s*[\s\d]+=)/gi,
    /('|(\\)|(-){2})|(;)/gi,
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      return false
    }
  }

  // Limit length
  return query.length <= 500
}

/**
 * Sanitize LIKE clause pattern
 * Escapes special characters in LIKE patterns
 *
 * @param pattern - Raw LIKE pattern
 * @returns Escaped pattern
 */
export function escapeLikePattern(pattern: string): string {
  // Escape backslashes FIRST, then LIKE wildcards
  // Order matters: if we escape % first, the added \ will be re-escaped
  return pattern.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
