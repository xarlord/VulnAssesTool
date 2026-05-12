import type { CvssBreakdown } from '@@/types'

/**
 * Get severity color class
 */
export function getSeverityColorClass(severity: string): string {
  const colors = {
    critical: 'text-red-600 bg-red-100',
    high: 'text-orange-600 bg-orange-100',
    medium: 'text-yellow-600 bg-yellow-100',
    low: 'text-green-600 bg-green-100',
    none: 'text-gray-600 bg-gray-100',
  }
  return colors[severity as keyof typeof colors] || colors.none
}

/**
 * Get severity badge color (hex)
 */
export function getSeverityColorHex(severity: string): string {
  const colors = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#16a34a',
    none: '#6b7280',
  }
  return colors[severity as keyof typeof colors] || colors.none
}

/**
 * Get metric radar chart data
 */
export function getRadarChartData(breakdown: CvssBreakdown) {
  const { metrics } = breakdown

  return [
    {
      metric: 'Attack Vector',
      value: getMetricNumericValue(metrics.attackVector, 'attackVector'),
      maxValue: 1.0,
    },
    {
      metric: 'Attack Complexity',
      value: getMetricNumericValue(metrics.attackComplexity, 'attackComplexity'),
      maxValue: 1.0,
    },
    {
      metric: 'Privileges Required',
      value: getMetricNumericValue(metrics.privilegesRequired, 'privilegesRequired'),
      maxValue: 1.0,
    },
    {
      metric: 'User Interaction',
      value: getMetricNumericValue(metrics.userInteraction, 'userInteraction'),
      maxValue: 1.0,
    },
    {
      metric: 'Scope',
      value: metrics.scope === 'Changed' ? 1.0 : 0.5,
      maxValue: 1.0,
    },
    {
      metric: 'Confidentiality',
      value: getMetricNumericValue(metrics.confidentialityImpact, 'impact'),
      maxValue: 1.0,
    },
    {
      metric: 'Integrity',
      value: getMetricNumericValue(metrics.integrityImpact, 'impact'),
      maxValue: 1.0,
    },
    {
      metric: 'Availability',
      value: getMetricNumericValue(metrics.availabilityImpact, 'impact'),
      maxValue: 1.0,
    },
  ]
}

/**
 * Get numeric value for radar chart visualization
 */
function getMetricNumericValue(value: string, metricType: string): number {
  const mappings: Record<string, Record<string, number>> = {
    attackVector: {
      Network: 1.0,
      Adjacent: 0.75,
      Local: 0.5,
      Physical: 0.25,
    },
    attackComplexity: {
      Low: 1.0,
      High: 0.5,
    },
    privilegesRequired: {
      None: 1.0,
      Low: 0.66,
      High: 0.33,
    },
    userInteraction: {
      None: 1.0,
      Required: 0.5,
    },
    impact: {
      High: 1.0,
      Low: 0.5,
      None: 0.0,
    },
  }

  return mappings[metricType]?.[value] || 0.0
}

/**
 * CVSS Vector Value Labels - Maps abbreviations to full text descriptions
 */
export const CVSS_VECTOR_LABELS: Record<string, Record<string, string>> = {
  AV: {
    N: 'Network',
    A: 'Adjacent',
    L: 'Local',
    P: 'Physical',
  },
  AC: {
    L: 'Low',
    H: 'High',
  },
  PR: {
    N: 'None',
    L: 'Low',
    H: 'High',
  },
  UI: {
    N: 'None',
    R: 'Required',
  },
  S: {
    U: 'Unchanged',
    C: 'Changed',
  },
  C: {
    H: 'High',
    L: 'Low',
    N: 'None',
  },
  I: {
    H: 'High',
    L: 'Low',
    N: 'None',
  },
  A: {
    H: 'High',
    L: 'Low',
    N: 'None',
  },
}

/**
 * CVSS Metric Names - Maps abbreviations to full metric names
 */
export const CVSS_METRIC_NAMES: Record<string, string> = {
  AV: 'Attack Vector',
  AC: 'Attack Complexity',
  PR: 'Privileges Required',
  UI: 'User Interaction',
  S: 'Scope',
  C: 'Confidentiality',
  I: 'Integrity',
  A: 'Availability',
}

/**
 * Get full label for a CVSS vector value
 * @param abbreviation - The metric abbreviation (e.g., 'AV', 'AC')
 * @param value - The value abbreviation (e.g., 'N', 'L')
 * @returns Full text label (e.g., 'Network', 'Low')
 */
export function getCvssVectorLabel(abbreviation: string, value: string): string {
  return CVSS_VECTOR_LABELS[abbreviation]?.[value] || value
}

/**
 * Format CVSS vector string for display
 */
export function formatCvssVector(vectorString: string): Array<{
  abbreviation: string
  value: string
  label: string
  fullLabel: string
}> {
  if (!vectorString || !vectorString.startsWith('CVSS:3.')) {
    return []
  }

  const parts = vectorString.split('/')
  const result = []

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    const [abbreviation, value] = part.split(':')
    const label = CVSS_METRIC_NAMES[abbreviation]
    const fullLabel = getCvssVectorLabel(abbreviation, value)

    if (label) {
      result.push({ abbreviation, value, label, fullLabel })
    }
  }

  return result
}

/**
 * Compare two CVSS scores and return the difference
 */
export function compareCvssScores(
  score1: number,
  score2: number,
): {
  difference: number
  percentChange: number
  improved: boolean | null
} {
  const difference = score2 - score1
  const percentChange = score1 !== 0 ? (difference / score1) * 100 : 0

  let improved: boolean | null = null
  if (difference !== 0) {
    improved = difference < 0 // Lower score is better
  }

  return {
    difference: Math.round(difference * 10) / 10,
    percentChange: Math.round(percentChange),
    improved,
  }
}

/**
 * Get remediation priority based on CVSS score
 */
export function getRemediationPriority(score: number): 'immediate' | 'high' | 'medium' | 'low' {
  if (score >= 9.0) return 'immediate'
  if (score >= 7.0) return 'high'
  if (score >= 4.0) return 'medium'
  return 'low'
}

/**
 * Get recommended actions based on CVSS metrics
 */
export function getRecommendedActions(breakdown: CvssBreakdown): string[] {
  const actions: string[] = []
  const { metrics, severity } = breakdown

  // Severity-based actions
  if (severity === 'critical' || severity === 'high') {
    actions.push('Patch or remediate immediately')
    actions.push('Monitor for exploit attempts')
  }

  // Attack vector based
  if (metrics.attackVector === 'Network') {
    actions.push('Restrict network access if possible')
    actions.push('Implement network-level protections')
  }

  // User interaction based
  if (metrics.userInteraction === 'Required') {
    actions.push('Educate users on security awareness')
    actions.push('Implement email filtering and anti-phishing')
  }

  // Impact based
  if (metrics.confidentialityImpact === 'High') {
    actions.push('Review data exposure risks')
  }

  if (metrics.availabilityImpact === 'High') {
    actions.push('Prepare business continuity plan')
  }

  return actions
}
