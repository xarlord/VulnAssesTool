/**
 * Tests for the dashboard layout model (FR-06.3).
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  WIDGET_SIZE_CLASSES,
  WIDGET_LABELS,
  createDefaultDashboardProfile,
} from './dashboardLayout'

describe('dashboardLayout (FR-06.3)', () => {
  it('DEFAULT_DASHBOARD_LAYOUT lists exactly the widgets ExecutiveDashboard renders, in order', () => {
    // Regression anchor: if this drifts from what ExecutiveDashboard.tsx renders,
    // existing users' first dashboard view silently changes shape.
    expect(DEFAULT_DASHBOARD_LAYOUT.map((slot) => slot.id)).toEqual([
      'risk-gauge',
      'compliance-status',
      'team-productivity',
      'project-health-comparison',
      'vulnerability-trend-chart',
      'top-critical-vulnerabilities',
      'action-items',
    ])
  })

  it('every default slot is visible and maps to a defined size class', () => {
    for (const slot of DEFAULT_DASHBOARD_LAYOUT) {
      expect(slot.visible).toBe(true)
      expect(WIDGET_SIZE_CLASSES[slot.size]).toBeDefined()
      expect(WIDGET_LABELS[slot.id]).toBeTruthy()
    }
  })

  it('createDefaultDashboardProfile returns an independent deep copy of the slots', () => {
    const a = createDefaultDashboardProfile()
    const b = createDefaultDashboardProfile()
    a.widgets[0].visible = false
    // Mutating one copy must not affect another or the shared constant.
    expect(b.widgets[0].visible).toBe(true)
    expect(DEFAULT_DASHBOARD_LAYOUT[0].visible).toBe(true)
  })
})
