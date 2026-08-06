/**
 * Health Dashboard Library
 *
 * Provides health scoring and trend analysis for components and projects.
 */

// Health score calculations
export {
  calculateComponentHealth,
  calculateProjectHealth,
  getHealthColor,
  getHealthChartColor,
  getHealthCategory,
} from './healthScore'

// Trend calculations
export {
  calculateTrend,
  calculateTrendFromHistory,
  calculateTrendPercentage,
  getTrendIcon,
  getTrendColor,
} from './trends'

// Score-history persistence (FR-05.3 trend line)
export { getHealthHistory, recordHealthScore, mergeTodaySnapshot, type HealthSnapshot } from './healthHistory'

// Types
export type { ComponentHealth, HealthFactors, ProjectHealthSummary } from '@@/types'
