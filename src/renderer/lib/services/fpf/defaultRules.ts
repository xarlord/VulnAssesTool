/**
 * Default IVI Suppression Rules
 *
 * Pre-built suppression rules for common automotive infotainment false positives.
 * These rules are based on typical IVI system configurations where certain
 * features or interfaces are disabled.
 *
 * All rules include:
 * - Clear reason for ISO 21434 audit trail
 * - Severity limits (never suppress critical/high without review)
 * - Optional expiration dates for periodic review
 *
 * @module fpf/defaultRules
 */

import type { SuppressionRule } from '../../../../shared/types/fpf'

/**
 * Default IVI suppression rules
 *
 * These rules are merged with user-defined rules in the system configuration.
 * User rules take precedence over default rules.
 */
export const DEFAULT_SUPPRESSION_RULES: SuppressionRule[] = [
  // ============================================================================
  // ETHERNET/MDIO DISABLED
  // ============================================================================

  {
    id: 'IVI-ETH-001',
    cpePattern: 'cpe:2.3:*:*:ethernet:*:*:*:*:*:*:*',
    reason: 'Ethernet interface is disabled in this IVI configuration - no external network exposure',
    severityLimit: ['medium', 'low'],
    notes: 'Applies when IVI uses only cellular/WiFi for connectivity, no wired ethernet port',
  },
  {
    id: 'IVI-ETH-002',
    cpePattern: 'cpe:2.3:*:*:mdio:*:*:*:*:*:*:*',
    reason: 'MDIO interface disabled - ethernet PHY not present in this configuration',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-ETH-003',
    cpePattern: 'cpe:2.3:*:*:phy:*:*:*:*:*:*:*',
    reason: 'Network PHY disabled - no ethernet hardware in this IVI variant',
    severityLimit: ['medium', 'low'],
    notes: 'Only applies to ethernet PHY, not WiFi/Cellular PHYs',
  },

  // ============================================================================
  // BLUETOOTH AUDIO-ONLY MODE
  // ============================================================================

  {
    id: 'IVI-BT-001',
    cpePattern: 'cpe:2.3:*:*:bluetooth:*:*:*:*:*:*:*',
    reason: 'Bluetooth configured for audio-only (A2DP/HFP) - data profiles disabled',
    severityLimit: ['medium', 'low'],
    notes: 'SPP, PAN, and other data profiles are disabled. Audio streaming only.',
  },
  {
    id: 'IVI-BT-002',
    cpePattern: 'cpe:2.3:*:*:bluez:*:*:*:*:*:*:*',
    reason: 'Bluez stack configured for audio streaming only - OBEX/SPP disabled',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-BT-003',
    cpePattern: 'cpe:2.3:*:qualcomm:bluetooth:*:*:*:*:*:*:*',
    reason: 'Qualcomm Bluetooth chip in audio-only mode - no data transfer capability',
    severityLimit: ['medium', 'low'],
  },

  // ============================================================================
  // OPENSSL INTERNAL-ONLY
  // ============================================================================

  {
    id: 'IVI-SSL-001',
    cpePattern: 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*',
    reason: 'OpenSSL used for internal communication only - not exposed to external interfaces',
    severityLimit: ['medium', 'low'],
    notes: 'Used for IPC encryption and internal TLS. No external-facing TLS termination.',
  },
  {
    id: 'IVI-SSL-002',
    cpePattern: 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:automotive:*',
    reason: 'OpenSSL internal-only for automotive secure messaging',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-SSL-003',
    cpePattern: 'cpe:2.3:*:*:libssl:*:*:*:*:*:*:*',
    reason: 'libssl used internally for component communication',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-SSL-004',
    cpePattern: 'cpe:2.3:*:*:libcrypto:*:*:*:*:*:*:*',
    reason: 'libcrypto used for internal cryptographic operations only',
    severityLimit: ['medium', 'low'],
  },

  // ============================================================================
  // DISABLED CODECS
  // ============================================================================

  {
    id: 'IVI-CODEC-001',
    cpePattern: 'cpe:2.3:*:*:opus:*:*:*:*:*:*:*',
    reason: 'Opus codec disabled - no voice-over-IP functionality in this configuration',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-CODEC-002',
    cpePattern: 'cpe:2.3:*:*:flac:*:*:*:*:*:*:*',
    reason: 'FLAC codec disabled - only MP3/AAC playback supported',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-CODEC-003',
    cpePattern: 'cpe:2.3:*:*:vorbis:*:*:*:*:*:*:*',
    reason: 'Vorbis codec disabled - not used in this IVI configuration',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-CODEC-004',
    cpePattern: 'cpe:2.3:*:*:theora:*:*:*:*:*:*:*',
    reason: 'Theora video codec disabled - only H.264/H.265 supported',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-CODEC-005',
    cpePattern: 'cpe:2.3:*:*:ffmpeg:*:*:*:*:*:*:*',
    reason: 'FFmpeg specific decoders disabled - using hardware decoder only',
    severityLimit: ['medium', 'low'],
    notes: 'FFmpeg library may be present but vulnerable codecs are disabled',
  },

  // ============================================================================
  // DISABLED NETWORK SERVICES
  // ============================================================================

  {
    id: 'IVI-NET-001',
    cpePattern: 'cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*',
    reason: 'Apache HTTP server disabled - no web server functionality',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-NET-002',
    cpePattern: 'cpe:2.3:a:nginx:nginx:*:*:*:*:*:*:*',
    reason: 'Nginx disabled - no reverse proxy or web server in use',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-NET-003',
    cpePattern: 'cpe:2.3:*:*:dnsmasq:*:*:*:*:*:*:*',
    reason: 'DNS masquerading disabled - using carrier DNS only',
    severityLimit: ['medium', 'low'],
  },

  // ============================================================================
  // DISABLED DEVELOPMENT/DEBUG FEATURES
  // ============================================================================

  {
    id: 'IVI-DEV-001',
    cpePattern: 'cpe:2.3:*:*:gdb:*:*:*:*:*:*:*',
    reason: 'GDB debugger not present in production builds',
    severityLimit: ['high', 'medium', 'low'],
    notes: 'Debug tools removed from production firmware',
  },
  {
    id: 'IVI-DEV-002',
    cpePattern: 'cpe:2.3:*:*:strace:*:*:*:*:*:*:*',
    reason: 'strace not included in production builds',
    severityLimit: ['high', 'medium', 'low'],
  },
  {
    id: 'IVI-DEV-003',
    cpePattern: 'cpe:2.3:*:*:valgrind:*:*:*:*:*:*:*',
    reason: 'Valgrind not included in production builds',
    severityLimit: ['high', 'medium', 'low'],
  },

  // ============================================================================
  // DISABLED SCRIPTING ENGINES
  // ============================================================================

  {
    id: 'IVI-SCRIPT-001',
    cpePattern: 'cpe:2.3:a:python:python:*:*:*:*:*:*:*',
    reason: 'Python runtime disabled - no user script execution',
    severityLimit: ['medium', 'low'],
    notes: 'Python may be present for internal tools but not exposed',
  },
  {
    id: 'IVI-SCRIPT-002',
    cpePattern: 'cpe:2.3:*:*:lua:*:*:*:*:*:*:*',
    reason: 'Lua scripting disabled - no user scripts supported',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-SCRIPT-003',
    cpePattern: 'cpe:2.3:*:*:javascript:*:*:*:*:*:*:*',
    reason: 'JavaScript engine disabled - no web content rendering',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-SCRIPT-004',
    cpePattern: 'cpe:2.3:a:nodejs:node.js:*:*:*:*:*:*:*',
    reason: 'Node.js not present - no server-side JavaScript',
    severityLimit: ['medium', 'low'],
  },

  // ============================================================================
  // DISABLED FILE FORMATS
  // ============================================================================

  {
    id: 'IVI-FILE-001',
    cpePattern: 'cpe:2.3:*:*:pdfium:*:*:*:*:*:*:*',
    reason: 'PDF rendering disabled - no document viewer functionality',
    severityLimit: ['medium', 'low'],
  },
  {
    id: 'IVI-FILE-002',
    cpePattern: 'cpe:2.3:*:*:libxml2:*:*:*:*:*:*:*',
    reason: 'XML parsing for specific formats only - DTD/XSLT disabled',
    severityLimit: ['medium', 'low'],
    notes: 'Only used for internal configuration parsing',
  },

  // ============================================================================
  // ANDROID-SPECIFIC (if Android Automotive)
  // ============================================================================

  {
    id: 'IVI-ANDROID-001',
    cpePattern: 'cpe:2.3:a:google:android:*:*:*:*:*:*:*',
    reason: 'Android component disabled or sandboxed - not accessible from IVI',
    severityLimit: ['medium', 'low'],
    notes: 'For hybrid systems where Android runs in separate VM/container',
  },

  // ============================================================================
  // GENIVI/AGL SPECIFIC
  // ============================================================================

  {
    id: 'IVI-AGL-001',
    cpePattern: 'cpe:2.3:*:automotivelinux:automotive_grade_linux:*:*:*:*:*:*:*',
    reason: 'AGL component in minimal configuration - unused services disabled',
    severityLimit: ['medium', 'low'],
  },
]

/**
 * Match a CPE string against a suppression rule
 *
 * @param rule - Suppression rule to check
 * @param cpe - CPE string to match
 * @param severity - Vulnerability severity
 * @returns true if the rule matches and applies to this severity
 */
export function matchSuppressionRule(
  rule: SuppressionRule,
  cpe: string,
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none',
): boolean {
  if (!cpe) {
    return false
  }

  // Check severity limit
  if (!rule.severityLimit.includes(severity as 'critical' | 'high' | 'medium' | 'low')) {
    return false
  }

  // Normalize CPE strings for comparison
  const normalizedCpe = cpe.toLowerCase()
  const normalizedPattern = rule.cpePattern.toLowerCase()

  // Simple wildcard matching for CPE patterns
  // Pattern: cpe:2.3:*:vendor:product:...
  // Wildcards (*) match any value in that position
  return matchCPEPattern(normalizedCpe, normalizedPattern)
}

/**
 * Match a CPE string against a pattern with wildcards
 *
 * @param cpe - Normalized CPE string
 * @param pattern - CPE pattern with wildcards
 * @returns true if the CPE matches the pattern
 */
export function matchCPEPattern(cpe: string, pattern: string): boolean {
  const cpeParts = cpe.split(':')
  const patternParts = pattern.split(':')

  // Pattern must have at least the CPE prefix
  if (patternParts.length < 4) {
    return false
  }

  // CPE must have at least same number of parts
  if (cpeParts.length < patternParts.length) {
    return false
  }

  // Check each part
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const cpePart = cpeParts[i] ?? ''

    // Wildcard matches anything
    if (patternPart === '*') {
      continue
    }

    // Exact match required
    if (patternPart !== cpePart) {
      return false
    }
  }

  return true
}

/**
 * Get all default rules that match a given CPE
 *
 * @param cpe - CPE string to match
 * @returns Array of matching suppression rules
 */
export function getMatchingDefaultRules(cpe: string): SuppressionRule[] {
  return DEFAULT_SUPPRESSION_RULES.filter((rule) => matchSuppressionRule(rule, cpe, 'medium'))
}

/**
 * Validate a suppression rule
 *
 * @param rule - Rule to validate
 * @returns Object with valid status and any error messages
 */
export function validateSuppressionRule(rule: SuppressionRule): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check required fields
  if (!rule.id || rule.id.trim() === '') {
    errors.push('Rule ID is required')
  }

  if (!rule.cpePattern || rule.cpePattern.trim() === '') {
    errors.push('CPE pattern is required')
  }

  if (!rule.reason || rule.reason.trim() === '') {
    errors.push('Reason is required')
  }

  // Validate CPE pattern format
  if (rule.cpePattern && !rule.cpePattern.startsWith('cpe:2.3:')) {
    errors.push('CPE pattern must start with "cpe:2.3:"')
  }

  // Validate severity limit
  if (!rule.severityLimit || rule.severityLimit.length === 0) {
    errors.push('At least one severity must be specified in severityLimit')
  }

  // Validate expiration date if present
  if (rule.expires) {
    const expiryDate = new Date(rule.expires)
    if (isNaN(expiryDate.getTime())) {
      errors.push('Invalid expiration date format')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Create a custom suppression rule
 *
 * @param id - Unique rule identifier
 * @param cpePattern - CPE pattern to match
 * @param reason - Reason for suppression
 * @param severityLimit - Severities this rule applies to
 * @param options - Additional options
 * @returns SuppressionRule object
 */
export function createSuppressionRule(
  id: string,
  cpePattern: string,
  reason: string,
  severityLimit: ('critical' | 'high' | 'medium' | 'low')[],
  options?: {
    expires?: string
    approvedBy?: string
    notes?: string
  },
): SuppressionRule {
  return {
    id,
    cpePattern,
    reason,
    severityLimit,
    ...options,
  }
}
