/**
 * Utility functions for formatting vulnerability IDs
 *
 * Implements CVE-first naming convention:
 * - CVE IDs are shown as primary identifier
 * - OSV/GHSA IDs are shown as "Also known as" aliases
 */

import type { Vulnerability } from '@@/types'

/**
 * Format a vulnerability ID for display with CVE-first naming
 *
 * @param vuln - The vulnerability object
 * @returns Object with primary display ID and aliases
 */
export function formatVulnerabilityId(vuln: Vulnerability): {
  /** The primary ID to display (preferably CVE) */
  primaryId: string
  /** Aliases to show as "Also known as" (OSV, GHSA, etc.) */
  aliases: string[]
  /** True if the primary ID is a CVE */
  isCvePrimary: boolean
} {
  const id = vuln.id

  // If the ID is already a CVE, use it as primary
  if (id.startsWith('CVE-')) {
    // Filter out the primary ID from aliases
    const otherAliases = (vuln.aliases || []).filter((a) => a !== id)
    return {
      primaryId: id,
      aliases: otherAliases,
      isCvePrimary: true,
    }
  }

  // If the ID is OSV/GHSA, check if there's a CVE alias
  const cveAlias = (vuln.aliases || []).find((a) => a.startsWith('CVE-'))

  if (cveAlias) {
    // Use CVE as primary, show original ID and other aliases
    const otherAliases = [id, ...(vuln.aliases || []).filter((a) => a !== cveAlias)]
    return {
      primaryId: cveAlias,
      aliases: otherAliases,
      isCvePrimary: true,
    }
  }

  // No CVE available, use original ID as primary
  return {
    primaryId: id,
    aliases: vuln.aliases || [],
    isCvePrimary: false,
  }
}

/**
 * Format aliases for "Also known as" display
 *
 * @param aliases - Array of alias strings
 * @param maxDisplay - Maximum number of aliases to display inline
 * @returns Formatted aliases info
 */
export function formatAliases(
  aliases: string[],
  maxDisplay: number = 3,
): {
  /** Aliases to display inline */
  displayAliases: string[]
  /** Number of remaining aliases not displayed */
  remainingCount: number
  /** Text for the "Also known as" label */
  akaLabel: string
} {
  const displayAliases = aliases.slice(0, maxDisplay)
  const remainingCount = aliases.length - maxDisplay

  // Determine appropriate label based on alias types
  const hasCve = aliases.some((a) => a.startsWith('CVE-'))
  const hasGhsa = aliases.some((a) => a.startsWith('GHSA-'))
  const hasOsv = aliases.some((a) => a.startsWith('OSV-'))

  let akaLabel = 'Also known as'
  if (hasGhsa && !hasCve) {
    akaLabel = 'GitHub Advisory'
  } else if (hasOsv && !hasCve && !hasGhsa) {
    akaLabel = 'OSV ID'
  }

  return {
    displayAliases,
    remainingCount,
    akaLabel,
  }
}

/**
 * Get a short display version of a vulnerability ID
 * Useful for compact displays like badges
 *
 * @param vuln - The vulnerability object
 * @param showAlias - Whether to show the first alias in parentheses
 * @returns Short display string
 */
export function getShortVulnDisplay(vuln: Vulnerability, showAlias: boolean = false): string {
  const { primaryId, aliases } = formatVulnerabilityId(vuln)

  if (showAlias && aliases.length > 0) {
    // Find a meaningful alias (prefer non-CVE if primary is CVE)
    const aliasToShow = aliases.find((a) => !a.startsWith('CVE-')) || aliases[0]
    return `${primaryId} (${aliasToShow})`
  }

  return primaryId
}
