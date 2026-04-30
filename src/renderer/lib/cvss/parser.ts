import type { CvssBreakdown, CvssMetrics, CvssScores, CvssMetricExplanation } from '@@/types'
import { CVSS_METRIC_VALUES } from '@@/constants'

/**
 * CVSS Vector Parser
 * Parses CVSS v3.1 vector strings into structured data
 */

/**
 * Parse CVSS v3.1 vector string into metrics
 * @param vectorString - CVSS vector string (e.g., "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
 * @returns Parsed CVSS breakdown or null if invalid
 */
export function parseCvssVector(vectorString: string): CvssBreakdown | null {
  // Validate format
  if (!vectorString || !vectorString.startsWith('CVSS:3.')) {
    return null
  }

  try {
    const parts = vectorString.split('/')
    if (parts.length < 9) {
      return null
    }

    // Extract version
    const versionMatch = parts[0].match(/CVSS:3.([01])/)
    const version = versionMatch ? (versionMatch[1] === '0' ? '3.0' : '3.1') : '3.1'

    // Parse metrics
    const metrics: CvssMetrics = {
      attackVector: parseMetricValue(parts, 'AV') as CvssMetrics['attackVector'],
      attackComplexity: parseMetricValue(parts, 'AC') as CvssMetrics['attackComplexity'],
      privilegesRequired: parseMetricValue(parts, 'PR') as CvssMetrics['privilegesRequired'],
      userInteraction: parseMetricValue(parts, 'UI') as CvssMetrics['userInteraction'],
      scope: parseMetricValue(parts, 'S') as CvssMetrics['scope'],
      confidentialityImpact: parseMetricValue(parts, 'C') as CvssMetrics['confidentialityImpact'],
      integrityImpact: parseMetricValue(parts, 'I') as CvssMetrics['integrityImpact'],
      availabilityImpact: parseMetricValue(parts, 'A') as CvssMetrics['availabilityImpact'],
    }

    // Calculate scores
    const scores = calculateBaseScore(metrics)

    // Determine severity
    const severity = getSeverityFromScore(scores.baseScore)

    // Generate explanations
    const explanations = generateMetricExplanations(metrics)

    return {
      vectorString,
      version: version as '3.0' | '3.1',
      metrics,
      scores,
      severity,
      explanations,
    }
  } catch (error) {
    console.error('Error parsing CVSS vector:', error)
    return null
  }
}

/**
 * Parse a specific metric value from the vector parts
 */
function parseMetricValue(parts: string[], prefix: string): string {
  const part = parts.find((p) => p.startsWith(prefix + ':'))
  if (!part) {
    throw new Error(`Missing metric: ${prefix}`)
  }

  const value = part.split(':')[1]
  const mappingKey = prefix === 'S' ? 'scope' : prefix

  // Map to full name
  const mapping = (CVSS_METRIC_VALUES as any)[mappingKey]
  return mapping[value] || value
}

/**
 * Calculate CVSS base score from metrics
 * Based on CVSS v3.1 specification
 */
function calculateBaseScore(metrics: CvssMetrics): CvssScores {
  // Impact sub-score calculation
  const impactSubScore = calculateImpactSubScore(metrics)

  // Exploitability sub-score calculation
  const exploitabilitySubScore = calculateExploitabilitySubScore(metrics)

  // Base score calculation
  let baseScore: number
  if (impactSubScore <= 0) {
    baseScore = 0
  } else if (metrics.scope === 'Changed') {
    baseScore = Math.min(10, 1.08 * (impactSubScore + exploitabilitySubScore))
  } else {
    baseScore = Math.min(10, impactSubScore + exploitabilitySubScore)
  }

  // Round to 1 decimal place
  baseScore = Math.round(baseScore * 10) / 10

  return {
    baseScore,
    impactSubScore: Math.round(impactSubScore * 10) / 10,
    exploitabilitySubScore: Math.round(exploitabilitySubScore * 10) / 10,
  }
}

/**
 * Calculate impact sub-score
 */
function calculateImpactSubScore(metrics: CvssMetrics): number {
  const iss = calculateIss(metrics)

  if (metrics.scope === 'Changed') {
    return 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
  } else {
    return 6.42 * iss
  }
}

/**
 * Calculate Impact Sub-Score (ISS)
 */
function calculateIss(metrics: CvssMetrics): number {
  const c = getImpactValue(metrics.confidentialityImpact)
  const i = getImpactValue(metrics.integrityImpact)
  const a = getImpactValue(metrics.availabilityImpact)

  return 1 - (1 - c) * (1 - i) * (1 - a)
}

/**
 * Get numerical value for impact metric
 */
function getImpactValue(impact: string): number {
  switch (impact) {
    case 'High':
      return 0.56
    case 'Low':
      return 0.22
    case 'None':
      return 0.0
    default:
      return 0.0
  }
}

/**
 * Calculate exploitability sub-score
 */
function calculateExploitabilitySubScore(metrics: CvssMetrics): number {
  const av = getAttackVectorValue(metrics.attackVector)
  const ac = getAttackComplexityValue(metrics.attackComplexity)
  const pr = getPrivilegesRequiredValue(metrics.privilegesRequired, metrics.scope)
  const ui = getUserInteractionValue(metrics.userInteraction)

  return 8.22 * av * ac * pr * ui
}

/**
 * Get numerical value for attack vector
 */
function getAttackVectorValue(av: string): number {
  switch (av) {
    case 'Network':
      return 0.85
    case 'Adjacent':
      return 0.62
    case 'Local':
      return 0.55
    case 'Physical':
      return 0.2
    default:
      return 0.0
  }
}

/**
 * Get numerical value for attack complexity
 */
function getAttackComplexityValue(ac: string): number {
  switch (ac) {
    case 'Low':
      return 0.77
    case 'High':
      return 0.44
    default:
      return 0.0
  }
}

/**
 * Get numerical value for privileges required
 */
function getPrivilegesRequiredValue(pr: string, scope: string): number {
  if (scope === 'Changed') {
    switch (pr) {
      case 'None':
        return 0.85
      case 'Low':
        return 0.68
      case 'High':
        return 0.5
      default:
        return 0.0
    }
  } else {
    switch (pr) {
      case 'None':
        return 0.85
      case 'Low':
        return 0.62
      case 'High':
        return 0.27
      default:
        return 0.0
    }
  }
}

/**
 * Get numerical value for user interaction
 */
function getUserInteractionValue(ui: string): number {
  switch (ui) {
    case 'None':
      return 0.85
    case 'Required':
      return 0.62
    default:
      return 0.0
  }
}

/**
 * Get severity from CVSS score
 */
export function getSeverityFromScore(score: number): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  if (score >= 9.0) return 'critical'
  if (score >= 7.0) return 'high'
  if (score >= 4.0) return 'medium'
  if (score > 0) return 'low'
  return 'none'
}

/**
 * Generate human-readable explanations for each metric
 */
function generateMetricExplanations(metrics: CvssMetrics): CvssMetricExplanation[] {
  return [
    {
      metric: 'Attack Vector',
      value: metrics.attackVector,
      description: ATTACK_VECTOR_EXPLANATIONS[metrics.attackVector],
      implications: ATTACK_VECTOR_IMPLICATIONS[metrics.attackVector],
      example: ATTACK_VECTOR_EXAMPLES[metrics.attackVector],
    },
    {
      metric: 'Attack Complexity',
      value: metrics.attackComplexity,
      description: ATTACK_COMPLEXITY_EXPLANATIONS[metrics.attackComplexity],
      implications: ATTACK_COMPLEXITY_IMPLICATIONS[metrics.attackComplexity],
      example: ATTACK_COMPLEXITY_EXAMPLES[metrics.attackComplexity],
    },
    {
      metric: 'Privileges Required',
      value: metrics.privilegesRequired,
      description: PRIVILEGES_REQUIRED_EXPLANATIONS[metrics.privilegesRequired],
      implications: PRIVILEGES_REQUIRED_IMPLICATIONS[metrics.privilegesRequired],
      example: PRIVILEGES_REQUIRED_EXAMPLES[metrics.privilegesRequired],
    },
    {
      metric: 'User Interaction',
      value: metrics.userInteraction,
      description: USER_INTERACTION_EXPLANATIONS[metrics.userInteraction],
      implications: USER_INTERACTION_IMPLICATIONS[metrics.userInteraction],
      example: USER_INTERACTION_EXAMPLES[metrics.userInteraction],
    },
    {
      metric: 'Scope',
      value: metrics.scope,
      description: SCOPE_EXPLANATIONS[metrics.scope],
      implications: SCOPE_IMPLICATIONS[metrics.scope],
      example: SCOPE_EXAMPLES[metrics.scope],
    },
    {
      metric: 'Confidentiality Impact',
      value: metrics.confidentialityImpact,
      description: IMPACT_EXPLANATIONS[metrics.confidentialityImpact],
      implications: CONFIDENTIALITY_IMPLICATIONS[metrics.confidentialityImpact],
      example: CONFIDENTIALITY_EXAMPLES[metrics.confidentialityImpact],
    },
    {
      metric: 'Integrity Impact',
      value: metrics.integrityImpact,
      description: IMPACT_EXPLANATIONS[metrics.integrityImpact],
      implications: INTEGRITY_IMPLICATIONS[metrics.integrityImpact],
      example: INTEGRITY_EXAMPLES[metrics.integrityImpact],
    },
    {
      metric: 'Availability Impact',
      value: metrics.availabilityImpact,
      description: IMPACT_EXPLANATIONS[metrics.availabilityImpact],
      implications: AVAILABILITY_IMPLICATIONS[metrics.availabilityImpact],
      example: AVAILABILITY_EXAMPLES[metrics.availabilityImpact],
    },
  ]
}

// Metric explanations
const ATTACK_VECTOR_EXPLANATIONS = {
  Network:
    'This vulnerability can be exploited over the network without requiring access to the target system or local network.',
  Adjacent: 'The vulnerability requires access to the local network or adjacent network segment.',
  Local: 'The vulnerability can only be exploited by local access to the target system.',
  Physical: 'The vulnerability requires physical access to the target device.',
}

const ATTACK_VECTOR_IMPLICATIONS = {
  Network: 'Highest risk - attackers can exploit remotely from anywhere in the world.',
  Adjacent: 'High risk - requires network proximity but can be exploited from within the same network.',
  Local: 'Medium risk - requires local access such as terminal or shell access.',
  Physical: 'Lower risk - requires physical device access, limiting attack surface.',
}

const ATTACK_VECTOR_EXAMPLES = {
  Network: 'A remote code execution vulnerability in a web server accessible from the internet.',
  Adjacent: 'A WiFi protocol vulnerability exploitable from the same local network.',
  Local: 'A privilege escalation vulnerability requiring a local user account.',
  Physical: 'An attacker needing to plug in a USB device to exploit a vulnerability.',
}

const ATTACK_COMPLEXITY_EXPLANATIONS = {
  Low: 'Specialized access conditions or extenuating circumstances do not exist. The attacker can expect repeatable success.',
  High: "A successful attack depends on conditions outside the attacker's control, making exploitation difficult or unlikely.",
}

const ATTACK_COMPLEXITY_IMPLICATIONS = {
  Low: 'Higher exploitability - attacks are reliable and can be automated.',
  High: 'Lower exploitability - attacks may fail or require specific timing/circumstances.',
}

const ATTACK_COMPLEXITY_EXAMPLES = {
  Low: 'A simple buffer overflow that triggers every time with a specific input.',
  High: 'A race condition that requires precise timing and specific system state to exploit.',
}

const PRIVILEGES_REQUIRED_EXPLANATIONS = {
  None: 'No privileges are required to exploit this vulnerability.',
  Low: 'Attacker requires basic user permissions that are typically available to most users.',
  High: 'Attacker requires elevated privileges that are only available to administrators or special users.',
}

const PRIVILEGES_REQUIRED_IMPLICATIONS = {
  None: 'Highest risk - any attacker can exploit without authentication.',
  Low: 'Medium risk - requires user-level access but not admin privileges.',
  High: 'Lower risk - requires administrative or special access to exploit.',
}

const PRIVILEGES_REQUIRED_EXAMPLES = {
  None: 'An unauthenticated remote code execution vulnerability.',
  Low: 'A vulnerability requiring a regular user account to exploit.',
  High: 'A privilege escalation vulnerability that requires admin access to trigger.',
}

const USER_INTERACTION_EXPLANATIONS = {
  None: 'The vulnerability can be exploited without any user interaction.',
  Required: 'Successful exploitation requires some action from the user, such as clicking a link or opening a file.',
}

const USER_INTERACTION_IMPLICATIONS = {
  None: 'Higher risk - attacker can exploit without user awareness or action.',
  Required: 'Lower risk - requires social engineering or user mistake to succeed.',
}

const USER_INTERACTION_EXAMPLES = {
  None: 'A wormable vulnerability that spreads automatically.',
  Required: 'A phishing attack where the user must open a malicious attachment.',
}

const SCOPE_EXPLANATIONS = {
  Unchanged: 'An exploited vulnerability can only affect resources managed by the same authority.',
  Changed: 'An exploited vulnerability can affect resources beyond the scope of the vulnerable component.',
}

const SCOPE_IMPLICATIONS = {
  Unchanged: 'Impact is limited to the vulnerable component and its direct resources.',
  Changed: 'Impact can spread to other components, systems, or security scopes.',
}

const SCOPE_EXAMPLES = {
  Unchanged: 'A vulnerability in a web application that only affects that application.',
  Changed: 'A vulnerability in a browser that can escape and affect the operating system.',
}

const IMPACT_EXPLANATIONS = {
  High: 'Total loss of confidentiality, integrity, or availability.',
  Low: 'Partial loss of confidentiality, integrity, or availability.',
  None: 'No loss of confidentiality, integrity, or availability.',
}

const CONFIDENTIALITY_IMPLICATIONS = {
  High: 'All sensitive data is exposed to the attacker.',
  Low: 'Some data is exposed but critical information remains protected.',
  None: 'No data is exposed.',
}

const CONFIDENTIALITY_EXAMPLES = {
  High: 'An attacker can read all user passwords and personal information.',
  Low: 'An attacker can read some non-sensitive application data.',
  None: 'The vulnerability does not expose any data.',
}

const INTEGRITY_IMPLICATIONS = {
  High: 'Complete modification or destruction of data is possible.',
  Low: 'Attacker can modify some data but critical systems remain intact.',
  None: 'No data modification is possible.',
}

const INTEGRITY_EXAMPLES = {
  High: 'An attacker can modify any database record or file.',
  Low: 'An attacker can modify non-critical application settings.',
  None: 'The vulnerability does not allow data modification.',
}

const AVAILABILITY_IMPLICATIONS = {
  High: 'Complete service shutdown or denial of service.',
  Low: 'Performance degradation or limited functionality loss.',
  None: 'No impact on service availability.',
}

const AVAILABILITY_EXAMPLES = {
  High: 'A vulnerability that crashes the entire application or server.',
  Low: "A vulnerability that slows down certain operations but doesn't crash the system.",
  None: 'The vulnerability does not affect system availability.',
}
