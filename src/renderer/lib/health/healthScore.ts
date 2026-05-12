import type { Component, Vulnerability, ComponentHealth, HealthFactors, ProjectHealthSummary } from '@@/types'

/**
 * Calculate the health score for a single component
 * @param component - The component to assess
 * @param vulnerabilities - List of vulnerabilities affecting this component
 * @returns ComponentHealth object with score and factors
 */
export function calculateComponentHealth(component: Component, vulnerabilities: Vulnerability[]): ComponentHealth {
  const factors: HealthFactors = {
    vulnerabilityScore: calculateVulnerabilityScore(vulnerabilities),
    ageScore: calculateAgeScore(vulnerabilities),
    patchScore: calculatePatchScore(component, vulnerabilities),
    versionScore: calculateVersionScore(component),
  }

  const score = Math.max(
    0,
    Math.min(100, 100 - (factors.vulnerabilityScore + factors.ageScore + factors.patchScore + factors.versionScore)),
  )

  const category = getHealthCategory(score)

  return {
    componentId: component.id,
    score,
    category,
    factors,
    trend: 'unknown', // Will be calculated separately
    lastCalculated: new Date(),
  }
}

/**
 * Calculate vulnerability score (0-40 points penalty)
 * Critical: -15 each, High: -10, Medium: -5, Low: -2
 */
function calculateVulnerabilityScore(vulnerabilities: Vulnerability[]): number {
  let score = 0

  for (const vuln of vulnerabilities) {
    switch (vuln.severity) {
      case 'critical':
        score += 15
        break
      case 'high':
        score += 10
        break
      case 'medium':
        score += 5
        break
      case 'low':
        score += 2
        break
      case 'none':
      default:
        break
    }
  }

  // Cap at 40
  return Math.min(40, score)
}

/**
 * Calculate age score (0-20 points penalty)
 * Oldest vuln < 30 days: 0, 30-90: -5, 90-180: -10, >180: -20
 */
function calculateAgeScore(vulnerabilities: Vulnerability[]): number {
  if (vulnerabilities.length === 0) {
    return 0
  }

  const now = Date.now()
  const dayInMs = 24 * 60 * 60 * 1000

  // Find the oldest vulnerability
  let oldestAge = 0
  for (const vuln of vulnerabilities) {
    if (vuln.publishedAt) {
      const age = now - new Date(vuln.publishedAt).getTime()
      oldestAge = Math.max(oldestAge, age)
    }
  }

  const daysOld = Math.floor(oldestAge / dayInMs)

  if (daysOld < 30) {
    return 0
  } else if (daysOld < 90) {
    return 5
  } else if (daysOld < 180) {
    return 10
  } else {
    return 20
  }
}

/**
 * Calculate patch score (0-20 points penalty)
 * Patch available: -5, Unknown: -10, No patch: -15
 */
function calculatePatchScore(component: Component, vulnerabilities: Vulnerability[]): number {
  if (vulnerabilities.length === 0) {
    return 0
  }

  // Check if component has patch info
  if (component.patchInfo?.hasFixAvailable) {
    return 5
  }

  // Check vulnerabilities for patch information
  let hasPatchAvailable = false
  let patchUnknown = false
  let noPatchAvailable = false

  for (const vuln of vulnerabilities) {
    if (vuln.patchInfo) {
      switch (vuln.patchInfo.patchAvailability) {
        case 'available':
          hasPatchAvailable = true
          break
        case 'partial':
        case 'upstream':
          hasPatchAvailable = true
          break
        case 'investigating':
          patchUnknown = true
          break
        case 'none':
          noPatchAvailable = true
          break
      }
    } else {
      // No patch info means unknown
      patchUnknown = true
    }
  }

  if (hasPatchAvailable) {
    return 5
  } else if (patchUnknown) {
    return 10
  } else if (noPatchAvailable) {
    return 15
  }

  return 10 // Default to unknown
}

/**
 * Calculate version score (0-20 points penalty)
 * Latest: 0, 1-2 behind: -5, 3-5 behind: -10, 5+ behind: -20
 * Note: This is a simplified version. In a real implementation,
 * you would query a package registry to determine the latest version.
 */
function calculateVersionScore(component: Component): number {
  // Since we don't have access to package registry in this implementation,
  // we'll use a heuristic based on patch info
  if (component.patchInfo?.recommendedVersion) {
    // If there's a recommended version, assume we're behind
    const current = component.version
    const recommended = component.patchInfo.recommendedVersion

    // Simple version comparison (works for semver)
    const currentParts = current.split('.').map(Number)
    const recommendedParts = recommended.split('.').map(Number)

    let versionsBehind = 0
    for (let i = 0; i < Math.max(currentParts.length, recommendedParts.length); i++) {
      const curr = currentParts[i] || 0
      const rec = recommendedParts[i] || 0
      if (rec > curr) {
        versionsBehind += rec - curr
      }
    }

    if (versionsBehind === 0) {
      return 0
    } else if (versionsBehind <= 2) {
      return 5
    } else if (versionsBehind <= 5) {
      return 10
    } else {
      return 20
    }
  }

  // If no patch info, assume latest (0 penalty)
  return 0
}

/**
 * Get health category from score
 */
function getHealthCategory(score: number): ComponentHealth['category'] {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 50) return 'fair'
  if (score >= 25) return 'poor'
  return 'critical'
}

/**
 * Calculate project health summary from component health scores
 * @param componentHealths - Array of component health scores
 * @returns ProjectHealthSummary with overall statistics
 */
export function calculateProjectHealth(componentHealths: ComponentHealth[]): ProjectHealthSummary {
  if (componentHealths.length === 0) {
    return {
      averageScore: 100,
      totalComponents: 0,
      distribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        critical: 0,
      },
      trend: 'unknown',
      lastCalculated: new Date(),
    }
  }

  const totalScore = componentHealths.reduce((sum, h) => sum + h.score, 0)
  const averageScore = totalScore / componentHealths.length

  const distribution = {
    excellent: componentHealths.filter((h) => h.category === 'excellent').length,
    good: componentHealths.filter((h) => h.category === 'good').length,
    fair: componentHealths.filter((h) => h.category === 'fair').length,
    poor: componentHealths.filter((h) => h.category === 'poor').length,
    critical: componentHealths.filter((h) => h.category === 'critical').length,
  }

  // Calculate overall trend based on component trends
  const improvingCount = componentHealths.filter((h) => h.trend === 'improving').length
  const degradingCount = componentHealths.filter((h) => h.trend === 'degrading').length

  let trend: ProjectHealthSummary['trend'] = 'stable'
  if (improvingCount > degradingCount * 1.5) {
    trend = 'improving'
  } else if (degradingCount > improvingCount * 1.5) {
    trend = 'degrading'
  }

  return {
    averageScore,
    totalComponents: componentHealths.length,
    distribution,
    trend,
    lastCalculated: new Date(),
  }
}

/**
 * Get color for health category
 */
export function getHealthColor(category: ComponentHealth['category']): string {
  switch (category) {
    case 'excellent':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'good':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'fair':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'poor':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'critical':
      return 'text-red-600 bg-red-50 border-red-200'
  }
}

/**
 * Get chart color for health category
 */
export function getHealthChartColor(category: ComponentHealth['category']): string {
  switch (category) {
    case 'excellent':
      return '#22c55e'
    case 'good':
      return '#3b82f6'
    case 'fair':
      return '#eab308'
    case 'poor':
      return '#f97316'
    case 'critical':
      return '#ef4444'
  }
}
