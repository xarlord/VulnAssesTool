/**
 * Layout Store Types
 * Phase 3: UX Excellence - Dashboard Widget Layout Management
 */

/**
 * Widget identifier types for dashboard components
 */
export type WidgetId =
  | 'statistics-cards'
  | 'recent-projects'
  | 'vulnerability-chart'
  | 'kev-alerts'
  | 'epss-summary'
  | 'severity-distribution'
  | 'project-health'
  | 'quick-actions'

/**
 * Configuration for a single dashboard widget
 */
export interface WidgetConfig {
  /** Unique identifier for the widget */
  id: WidgetId
  /** X position in grid units */
  x: number
  /** Y position in grid units */
  y: number
  /** Width in grid units */
  width: number
  /** Height in grid units */
  height: number
  /** Whether the widget is visible */
  visible: boolean
  /** Minimum width constraint (optional) */
  minWidth?: number
  /** Minimum height constraint (optional) */
  minHeight?: number
  /** Maximum width constraint (optional) */
  maxWidth?: number
  /** Maximum height constraint (optional) */
  maxHeight?: number
}

/**
 * Predefined layout preset
 */
export interface LayoutPreset {
  /** Unique identifier for the preset */
  id: string
  /** Display name for the preset */
  name: string
  /** Widget configurations for this preset */
  widgets: WidgetConfig[]
  /** Whether this is a built-in default preset */
  isDefault?: boolean
  /** Whether this is a user-created preset */
  isCustom?: boolean
  /** Creation timestamp (for custom presets) */
  createdAt?: string
}

/**
 * Layout state for the Zustand store
 */
export interface LayoutState {
  /** Currently active layout preset ID */
  activeLayoutId: string
  /** All available layout presets */
  layouts: LayoutPreset[]
  /** Current widget configurations (mirrors active layout) */
  widgets: WidgetConfig[]

  // Widget manipulation actions
  /** Update a widget's position */
  updateWidgetPosition: (id: WidgetId, x: number, y: number) => void
  /** Update a widget's size */
  updateWidgetSize: (id: WidgetId, width: number, height: number) => void
  /** Toggle a widget's visibility */
  toggleWidgetVisibility: (id: WidgetId) => void
  /** Update all widget configurations at once */
  updateWidgets: (widgets: WidgetConfig[]) => void

  // Layout management actions
  /** Set the active layout by ID */
  setActiveLayout: (layoutId: string) => void
  /** Save current configuration as a new preset */
  saveCurrentLayout: (name: string) => void
  /** Update an existing custom layout */
  updateLayout: (layoutId: string, name?: string) => void
  /** Delete a custom layout preset */
  deleteLayout: (layoutId: string) => void
  /** Reset to default layout */
  resetToDefault: () => void
  /** Get a specific layout by ID */
  getLayoutById: (layoutId: string) => LayoutPreset | undefined
  /** Get the default layout */
  getDefaultLayout: () => LayoutPreset

  // Utility actions
  /** Reset store to initial state (for testing) */
  resetStore: () => void
}

/**
 * Grid configuration for the dashboard layout
 */
export interface GridConfig {
  /** Number of columns in the grid */
  columns: number
  /** Number of rows in the grid (0 for auto) */
  rows: number
  /** Gap between widgets in pixels */
  gap: number
  /** Breakpoint for responsive behavior */
  breakpoint: number
}

/**
 * Default grid configuration
 */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 12,
  rows: 0, // Auto-grow
  gap: 16,
  breakpoint: 768,
}
