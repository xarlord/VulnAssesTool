/**
 * Calculate trend based on current and previous scores
 * @param currentScore - Current health score (0-100)
 * @param previousScore - Previous health score (0-100)
 * @returns Trend direction: improving, stable, degrading, or unknown
 */
export function calculateTrend(
  currentScore: number,
  previousScore?: number,
): 'improving' | 'stable' | 'degrading' | 'unknown' {
  // If no previous score, trend is unknown
  if (previousScore === undefined || previousScore === null) {
    return 'unknown'
  }

  const difference = currentScore - previousScore

  // If score improved by more than 5 points, it's improving
  if (difference > 5) {
    return 'improving'
  }

  // If score degraded by more than 5 points, it's degrading
  if (difference < -5) {
    return 'degrading'
  }

  // Otherwise, it's stable (within 5 points)
  return 'stable'
}

/**
 * Calculate trend for multiple data points
 * @param scores - Array of historical scores, oldest first
 * @returns Overall trend direction
 */
export function calculateTrendFromHistory(scores: number[]): 'improving' | 'stable' | 'degrading' | 'unknown' {
  if (scores.length < 2) {
    return 'unknown'
  }

  // Get the oldest and most recent scores
  const oldestScore = scores[0]
  const newestScore = scores[scores.length - 1]

  return calculateTrend(newestScore, oldestScore)
}

/**
 * Calculate trend percentage change
 * @param currentScore - Current health score
 * @param previousScore - Previous health score
 * @returns Percentage change (positive for improvement, negative for degradation)
 */
export function calculateTrendPercentage(currentScore: number, previousScore?: number): number | null {
  if (previousScore === undefined || previousScore === null || previousScore === 0) {
    return null
  }

  return ((currentScore - previousScore) / previousScore) * 100
}

/**
 * Get trend icon component name
 * @param trend - Trend direction
 * @returns Lucide icon name for the trend
 */
export function getTrendIcon(trend: 'improving' | 'stable' | 'degrading' | 'unknown'): string {
  switch (trend) {
    case 'improving':
      return 'TrendingUp'
    case 'degrading':
      return 'TrendingDown'
    case 'stable':
      return 'Minus'
    case 'unknown':
      return 'HelpCircle'
  }
}

/**
 * Get trend color class
 * @param trend - Trend direction
 * @returns Tailwind color class for the trend
 */
export function getTrendColor(trend: 'improving' | 'stable' | 'degrading' | 'unknown'): string {
  switch (trend) {
    case 'improving':
      return 'text-green-600'
    case 'degrading':
      return 'text-red-600'
    case 'stable':
      return 'text-gray-600'
    case 'unknown':
      return 'text-gray-400'
  }
}
