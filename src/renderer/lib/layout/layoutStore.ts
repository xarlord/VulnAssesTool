/**
 * Layout Store - Zustand store with localStorage persistence
 * Manages dashboard widget layout persistence for Phase 3: UX Excellence
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LayoutState, LayoutPreset, WidgetConfig, WidgetId } from './types'

/**
 * Generate a unique ID for custom layouts
 */
const generateLayoutId = (): string => {
  return `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Default layout preset - Standard dashboard view
 */
const DEFAULT_LAYOUT: LayoutPreset = {
  id: 'default',
  name: 'Default',
  isDefault: true,
  widgets: [
    // Statistics cards row (top) - Full width
    {
      id: 'statistics-cards',
      x: 0,
      y: 0,
      width: 12,
      height: 1,
      visible: true,
      minWidth: 6,
      minHeight: 1,
    },
    // Recent projects (left column) - 6 columns
    {
      id: 'recent-projects',
      x: 0,
      y: 1,
      width: 6,
      height: 3,
      visible: true,
      minWidth: 4,
      minHeight: 2,
    },
    // Vulnerability chart (right column) - 6 columns
    {
      id: 'vulnerability-chart',
      x: 6,
      y: 1,
      width: 6,
      height: 3,
      visible: true,
      minWidth: 4,
      minHeight: 2,
    },
  ],
}

/**
 * Compact layout preset - Condensed view for smaller screens
 */
const COMPACT_LAYOUT: LayoutPreset = {
  id: 'compact',
  name: 'Compact',
  isDefault: false,
  widgets: [
    // Statistics cards - Full width, minimal height
    {
      id: 'statistics-cards',
      x: 0,
      y: 0,
      width: 12,
      height: 1,
      visible: true,
      minWidth: 6,
      minHeight: 1,
    },
    // Recent projects - Full width, stacked
    {
      id: 'recent-projects',
      x: 0,
      y: 1,
      width: 12,
      height: 2,
      visible: true,
      minWidth: 4,
      minHeight: 1,
    },
    // Vulnerability chart - Full width, stacked
    {
      id: 'vulnerability-chart',
      x: 0,
      y: 3,
      width: 12,
      height: 2,
      visible: true,
      minWidth: 4,
      minHeight: 1,
    },
    // KEV alerts - Hidden in compact by default
    {
      id: 'kev-alerts',
      x: 0,
      y: 5,
      width: 12,
      height: 2,
      visible: false,
      minWidth: 4,
      minHeight: 1,
    },
  ],
}

/**
 * Detailed layout preset - Expanded view with all widgets
 */
const DETAILED_LAYOUT: LayoutPreset = {
  id: 'detailed',
  name: 'Detailed',
  isDefault: false,
  widgets: [
    // Statistics cards row (top) - Full width
    {
      id: 'statistics-cards',
      x: 0,
      y: 0,
      width: 12,
      height: 1,
      visible: true,
      minWidth: 6,
      minHeight: 1,
    },
    // Recent projects (left) - 4 columns
    {
      id: 'recent-projects',
      x: 0,
      y: 1,
      width: 4,
      height: 4,
      visible: true,
      minWidth: 3,
      minHeight: 2,
    },
    // Vulnerability chart (center) - 4 columns
    {
      id: 'vulnerability-chart',
      x: 4,
      y: 1,
      width: 4,
      height: 4,
      visible: true,
      minWidth: 3,
      minHeight: 2,
    },
    // KEV alerts (right) - 4 columns
    {
      id: 'kev-alerts',
      x: 8,
      y: 1,
      width: 4,
      height: 2,
      visible: true,
      minWidth: 3,
      minHeight: 1,
    },
    // EPSS summary - Below KEV
    {
      id: 'epss-summary',
      x: 8,
      y: 3,
      width: 4,
      height: 2,
      visible: true,
      minWidth: 3,
      minHeight: 1,
    },
    // Severity distribution - Second row
    {
      id: 'severity-distribution',
      x: 0,
      y: 5,
      width: 6,
      height: 3,
      visible: true,
      minWidth: 4,
      minHeight: 2,
    },
    // Project health - Second row right
    {
      id: 'project-health',
      x: 6,
      y: 5,
      width: 6,
      height: 3,
      visible: true,
      minWidth: 4,
      minHeight: 2,
    },
  ],
}

/**
 * All built-in presets
 */
const BUILTIN_PRESETS: LayoutPreset[] = [DEFAULT_LAYOUT, COMPACT_LAYOUT, DETAILED_LAYOUT]

/**
 * Create the layout store with localStorage persistence
 */
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeLayoutId: 'default',
      layouts: [...BUILTIN_PRESETS],
      widgets: [...DEFAULT_LAYOUT.widgets],

      // Widget manipulation actions
      updateWidgetPosition: (id: WidgetId, x: number, y: number) => {
        set((state) => ({
          widgets: state.widgets.map((widget) => (widget.id === id ? { ...widget, x, y } : widget)),
        }))
      },

      updateWidgetSize: (id: WidgetId, width: number, height: number) => {
        set((state) => {
          const widget = state.widgets.find((w) => w.id === id)
          if (!widget) return state

          // Apply min/max constraints
          const constrainedWidth = Math.max(widget.minWidth ?? 1, Math.min(widget.maxWidth ?? 12, width))
          const constrainedHeight = Math.max(widget.minHeight ?? 1, Math.min(widget.maxHeight ?? 10, height))

          return {
            widgets: state.widgets.map((w) =>
              w.id === id ? { ...w, width: constrainedWidth, height: constrainedHeight } : w,
            ),
          }
        })
      },

      toggleWidgetVisibility: (id: WidgetId) => {
        set((state) => ({
          widgets: state.widgets.map((widget) => (widget.id === id ? { ...widget, visible: !widget.visible } : widget)),
        }))
      },

      updateWidgets: (widgets: WidgetConfig[]) => {
        set({ widgets })
      },

      // Layout management actions
      setActiveLayout: (layoutId: string) => {
        const layout = get().layouts.find((l) => l.id === layoutId)
        if (layout) {
          set({
            activeLayoutId: layoutId,
            widgets: [...layout.widgets],
          })
        }
      },

      saveCurrentLayout: (name: string) => {
        const newLayout: LayoutPreset = {
          id: generateLayoutId(),
          name,
          widgets: [...get().widgets],
          isCustom: true,
          createdAt: new Date().toISOString(),
        }

        set((state) => ({
          layouts: [...state.layouts, newLayout],
          activeLayoutId: newLayout.id,
        }))
      },

      updateLayout: (layoutId: string, name?: string) => {
        set((state) => ({
          layouts: state.layouts.map((layout) =>
            layout.id === layoutId
              ? {
                  ...layout,
                  name: name ?? layout.name,
                  widgets: layoutId === state.activeLayoutId ? [...state.widgets] : layout.widgets,
                }
              : layout,
          ),
        }))
      },

      deleteLayout: (layoutId: string) => {
        const layout = get().layouts.find((l) => l.id === layoutId)

        // Cannot delete built-in presets
        if (!layout || layout.isDefault || !layout.isCustom) {
          return
        }

        set((state) => {
          const newLayouts = state.layouts.filter((l) => l.id !== layoutId)
          let newActiveLayoutId = state.activeLayoutId
          let newWidgets = state.widgets

          // If deleting the active layout, switch to default
          if (state.activeLayoutId === layoutId) {
            const defaultLayout = newLayouts.find((l) => l.isDefault) ?? newLayouts[0]
            newActiveLayoutId = defaultLayout.id
            newWidgets = [...defaultLayout.widgets]
          }

          return {
            layouts: newLayouts,
            activeLayoutId: newActiveLayoutId,
            widgets: newWidgets,
          }
        })
      },

      resetToDefault: () => {
        const defaultLayout = get().layouts.find((l) => l.isDefault) ?? DEFAULT_LAYOUT
        set({
          activeLayoutId: defaultLayout.id,
          widgets: [...defaultLayout.widgets],
        })
      },

      getLayoutById: (layoutId: string) => {
        return get().layouts.find((l) => l.id === layoutId)
      },

      getDefaultLayout: () => {
        return get().layouts.find((l) => l.isDefault) ?? DEFAULT_LAYOUT
      },

      // Utility actions
      resetStore: () => {
        set({
          activeLayoutId: 'default',
          layouts: [...BUILTIN_PRESETS],
          widgets: [...DEFAULT_LAYOUT.widgets],
        })
      },
    }),
    {
      name: 'vuln-assess-layout-storage',
      partialize: (state) => ({
        activeLayoutId: state.activeLayoutId,
        layouts: state.layouts,
        widgets: state.widgets,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/**
 * Hook to get the current active layout
 */
export const useActiveLayout = (): LayoutPreset | undefined => {
  const { activeLayoutId, layouts, widgets } = useLayoutStore()
  return layouts.find((l) => l.id === activeLayoutId) ?? { id: activeLayoutId, name: 'Current', widgets }
}

/**
 * Hook to get visible widgets in current layout
 */
export const useVisibleWidgets = (): WidgetConfig[] => {
  const widgets = useLayoutStore((state) => state.widgets)
  return widgets.filter((w) => w.visible)
}

/**
 * Hook to get custom (user-created) layouts
 */
export const useCustomLayouts = (): LayoutPreset[] => {
  const layouts = useLayoutStore((state) => state.layouts)
  return layouts.filter((l) => l.isCustom)
}

/**
 * Hook to get built-in presets
 */
export const useBuiltinPresets = (): LayoutPreset[] => {
  const layouts = useLayoutStore((state) => state.layouts)
  return layouts.filter((l) => !l.isCustom)
}
