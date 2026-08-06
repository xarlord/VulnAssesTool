/**
 * Executive dashboard layout model (FR-06.3).
 *
 * Describes which widgets render, in what order, and at what size — the data the
 * ExecutiveDashboard grid renders from and that DashboardLayoutEditor mutates.
 * Named "DashboardLayoutProfile" (not "Profile") to avoid colliding with the
 * unrelated settings-profile concept in useStore.
 */

/** One id per dashboard widget. */
export type DashboardWidgetId =
  | 'risk-gauge'
  | 'compliance-status'
  | 'team-productivity'
  | 'project-health-comparison'
  | 'vulnerability-trend-chart'
  | 'top-critical-vulnerabilities'
  | 'action-items'

/** Discrete size presets (the "resize" control) mapped to grid column/row spans. */
export type WidgetSizePreset = 'small' | 'medium' | 'large'

export const WIDGET_SIZE_CLASSES: Record<WidgetSizePreset, string> = {
  small: 'col-span-3 row-span-4',
  medium: 'col-span-6 row-span-4',
  large: 'col-span-9 row-span-4',
}

/** Human-readable labels for the editor UI. */
export const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  'risk-gauge': 'Overall Risk Level',
  'compliance-status': 'Compliance Status',
  'team-productivity': 'Team Productivity',
  'project-health-comparison': 'Project Health Comparison',
  'vulnerability-trend-chart': 'Vulnerability Trends',
  'top-critical-vulnerabilities': 'Top Critical Vulnerabilities',
  'action-items': 'Action Items',
}

export interface DashboardWidgetSlot {
  id: DashboardWidgetId
  visible: boolean
  size: WidgetSizePreset
}

export interface DashboardLayoutProfile {
  id: string
  name: string
  widgets: DashboardWidgetSlot[]
}

export const DEFAULT_DASHBOARD_LAYOUT_PROFILE_ID = 'default'

/**
 * Seeded to reproduce the dashboard's original hardcoded order/sizes exactly, so
 * existing users see zero visual change until they customize.
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetSlot[] = [
  { id: 'risk-gauge', visible: true, size: 'small' },
  { id: 'compliance-status', visible: true, size: 'small' },
  { id: 'team-productivity', visible: true, size: 'small' },
  { id: 'project-health-comparison', visible: true, size: 'medium' },
  { id: 'vulnerability-trend-chart', visible: true, size: 'small' },
  { id: 'top-critical-vulnerabilities', visible: true, size: 'large' },
  { id: 'action-items', visible: true, size: 'large' },
]

/** A fresh copy of the built-in "Default" profile (deep-copied slots). */
export function createDefaultDashboardProfile(): DashboardLayoutProfile {
  return {
    id: DEFAULT_DASHBOARD_LAYOUT_PROFILE_ID,
    name: 'Default',
    widgets: DEFAULT_DASHBOARD_LAYOUT.map((slot) => ({ ...slot })),
  }
}
