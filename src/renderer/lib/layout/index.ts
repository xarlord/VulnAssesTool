/**
 * Layout Library
 * Phase 3: UX Excellence - Dashboard Widget Layout Management
 *
 * Provides comprehensive layout management for dashboard widgets
 * Features:
 * - Widget position and size persistence
 * - Multiple layout presets (default, compact, detailed)
 * - User-created custom layouts
 * - LocalStorage persistence
 * - Responsive grid configuration
 */

// Export types
export * from './types'

// Export store
export { useLayoutStore, useActiveLayout, useVisibleWidgets, useCustomLayouts, useBuiltinPresets } from './layoutStore'
