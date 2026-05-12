/**
 * Risk Score Calculation Service
 *
 * Calculates composite risk scores for vulnerability prioritization.
 * Combines KEV status, EPSS percentile, and severity into a single 0-100 score.
 *
 * Formula: KEV(0/50) + EPSS percentile(0-30) + Severity(5-20) = 0-100
 *
 * @module riskScore
 */

/**
 * Severity levels matching CVE severity
 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'

/**
 * Input for risk score calculation
 */
export interface RiskScoreInput {
  /** Whether the CVE is in CISA KEV catalog */
  isKev: boolean
  /** EPSS percentile (0.0 to 1.0), or null if not available */
  epssPercentile: number | null
  /** CVE severity level */
  severity: Severity
}

/**
 * Result of risk score calculation
 */
export interface RiskScoreResult {
  /** Total risk score (0-100) */
  score: number
  /** Individual factor contributions */
  factors: {
    /** KEV contribution (0 or 50) */
    kev: number
    /** EPSS contribution (0-30) */
    epss: number
    /** Severity contribution (0-20) */
    severity: number
  }
  /** Human-readable breakdown */
  breakdown: string
  /** Risk level classification */
  level: RiskLevel
}

/**
 * Risk level classification
 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

/**
 * Severity point values
 */
const SEVERITY_POINTS: Record<Severity, number> = {
  CRITICAL: 20,
  HIGH: 15,
  MEDIUM: 10,
  LOW: 5,
  NONE: 0,
}

/**
 * KEV point value (actively exploited)
 */
const KEV_POINTS = 50

/**
 * Maximum EPSS points
 */
const MAX_EPSS_POINTS = 30

/**
 * Calculate composite risk score
 *
 * @param input - Risk score input parameters
 * @returns Risk score result with breakdown
 */
export function calculateRiskScore(input: RiskScoreInput): RiskScoreResult {
  // KEV: 50 points if actively exploited
  const kevPoints = input.isKev ? KEV_POINTS : 0

  // EPSS: 0-30 points based on percentile
  const epssPoints = input.epssPercentile !== null ? Math.round(input.epssPercentile * MAX_EPSS_POINTS) : 0

  // Severity: Critical=20, High=15, Medium=10, Low=5, None=0
  const severityPoints = SEVERITY_POINTS[input.severity] || 0

  // Total (capped at 100)
  const total = Math.min(100, kevPoints + epssPoints + severityPoints)

  // Determine risk level
  const level = getRiskLevel(total, input.isKev)

  // Generate breakdown string
  const breakdown = generateBreakdown(kevPoints, epssPoints, severityPoints, input)

  return {
    score: total,
    factors: {
      kev: kevPoints,
      epss: epssPoints,
      severity: severityPoints,
    },
    breakdown,
    level,
  }
}

/**
 * Get risk level classification from score
 */
export function getRiskLevel(score: number, isKev: boolean = false): RiskLevel {
  // KEV entries are always at least high risk
  if (isKev) {
    if (score >= 70) return 'critical'
    return 'high'
  }

  if (score >= 70) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

/**
 * Generate human-readable breakdown string
 */
function generateBreakdown(
  kevPoints: number,
  epssPoints: number,
  severityPoints: number,
  input: RiskScoreInput,
): string {
  const parts: string[] = []

  if (kevPoints > 0) {
    parts.push(`KEV(+${kevPoints})`)
  }

  if (input.epssPercentile !== null) {
    const percentileDisplay = Math.round(input.epssPercentile * 100)
    parts.push(`EPSS ${percentileDisplay}%(+${epssPoints})`)
  } else {
    parts.push(`EPSS N/A(+0)`)
  }

  parts.push(`${input.severity}(+${severityPoints})`)

  const total = Math.min(100, kevPoints + epssPoints + severityPoints)
  return `${parts.join(' + ')} = ${total}`
}

/**
 * Get color for risk level
 */
export function getRiskLevelColor(level: RiskLevel): string {
  switch (level) {
    case 'critical':
      return '#dc2626' // Red
    case 'high':
      return '#f97316' // Orange
    case 'medium':
      return '#eab308' // Yellow
    case 'low':
      return '#22c55e' // Green
    default:
      return '#6b7280' // Gray
  }
}

/**
 * Get Tailwind CSS classes for risk level
 */
export function getRiskLevelClasses(level: RiskLevel): {
  bg: string
  text: string
  border: string
} {
  switch (level) {
    case 'critical':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-300',
        border: 'border-red-300 dark:border-red-700',
      }
    case 'high':
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-300 dark:border-orange-700',
      }
    case 'medium':
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-700 dark:text-yellow-300',
        border: 'border-yellow-300 dark:border-yellow-700',
      }
    case 'low':
      return {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-300',
        border: 'border-green-300 dark:border-green-700',
      }
    default:
      return {
        bg: 'bg-gray-100 dark:bg-gray-800',
        text: 'text-gray-700 dark:text-gray-300',
        border: 'border-gray-300 dark:border-gray-600',
      }
  }
}

/**
 * Compare two vulnerabilities by risk score (for sorting)
 */
export function compareByRiskScore(a: RiskScoreInput & { id: string }, b: RiskScoreInput & { id: string }): number {
  const scoreA = calculateRiskScore(a)
  const scoreB = calculateRiskScore(b)

  // Higher score first
  if (scoreA.score !== scoreB.score) {
    return scoreB.score - scoreA.score
  }

  // Tie-breaker: KEV first
  if (a.isKev !== b.isKev) {
    return a.isKev ? -1 : 1
  }

  // Tie-breaker: Higher EPSS percentile
  const epssA = a.epssPercentile || 0
  const epssB = b.epssPercentile || 0
  if (epssA !== epssB) {
    return epssB - epssA
  }

  // Tie-breaker: Severity
  const severityOrder: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE']
  return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
}

/**
 * Sort an array of vulnerabilities by risk score
 */
export function sortByRiskScore<T extends RiskScoreInput>(vulnerabilities: T[]): T[] {
  return [...vulnerabilities].sort((a, b) => {
    const scoreA = calculateRiskScore(a)
    const scoreB = calculateRiskScore(b)
    return scoreB.score - scoreA.score
  })
}

/**
 * Get risk score badge text
 */
export function getRiskBadgeText(result: RiskScoreResult): string {
  if (result.factors.kev > 0) {
    return `${result.score} KEV`
  }
  return String(result.score)
}

/**
 * Format EPSS percentile for display
 */
export function formatEpssPercentile(percentile: number | null): string {
  if (percentile === null) {
    return 'N/A'
  }
  return `${Math.round(percentile * 100)}%`
}

/**
 * Get EPSS color class based on percentile
 */
export function getEpssColorClass(percentile: number | null): string {
  if (percentile === null) {
    return 'text-muted-foreground'
  }

  const pct = percentile * 100
  if (pct >= 80) {
    return 'text-red-600 dark:text-red-400'
  }
  if (pct >= 50) {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  return 'text-green-600 dark:text-green-400'
}
