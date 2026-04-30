/**
 * Health Dashboard Library
 *
 * Provides health scoring and trend analysis for components and projects.
 */

// Health score calculations
export { calculateComponentHealth, calculateProjectHealth, getHealthColor, getHealthChartColor } from './healthScore'

// Trend calculations
export {
  calculateTrend,
  calculateTrendFromHistory,
  calculateTrendPercentage,
  getTrendIcon,
  getTrendColor,
} from './trends'

// Types
export type { ComponentHealth, HealthFactors, ProjectHealthSummary } from '@@/types'
