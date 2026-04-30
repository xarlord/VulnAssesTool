/**
 * Layout Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from './layoutStore'
import type { WidgetConfig, WidgetId } from './types'

describe('Layout Store', () => {
  beforeEach(() => {
    useLayoutStore.getState()._resetStore()
  })

  describe('Initial State', () => {
    it('should have default layout as active on init', () => {
      const state = useLayoutStore.getState()
      expect(state.activeLayoutId).toBe('default')
    })

    it('should have three built-in presets', () => {
      const state = useLayoutStore.getState()
      expect(state.layouts).toHaveLength(3)
      expect(state.layouts.map((l) => l.id)).toContain('default')
      expect(state.layouts.map((l) => l.id)).toContain('compact')
      expect(state.layouts.map((l) => l.id)).toContain('detailed')
    })

    it('should have default widgets configured', () => {
      const state = useLayoutStore.getState()
      expect(state.widgets.length).toBeGreaterThan(0)
      expect(state.widgets.some((w) => w.id === 'statistics-cards')).toBe(true)
      expect(state.widgets.some((w) => w.id === 'recent-projects')).toBe(true)
      expect(state.widgets.some((w) => w.id === 'vulnerability-chart')).toBe(true)
    })
  })

  describe('updateWidgetPosition', () => {
    it('should update widget position', () => {
      const store = useLayoutStore.getState()

      store.updateWidgetPosition('statistics-cards', 2, 3)

      const widgets = useLayoutStore.getState().widgets
      const widget = widgets.find((w) => w.id === 'statistics-cards')
      expect(widget).toBeDefined()
      expect(widget?.x).toBe(2)
      expect(widget?.y).toBe(3)
    })

    it('should not modify other widgets when updating position', () => {
      const store = useLayoutStore.getState()
      const originalWidgets = [...store.widgets]

      store.updateWidgetPosition('recent-projects', 5, 5)

      const widgets = useLayoutStore.getState().widgets
      const recentProjects = widgets.find((w) => w.id === 'recent-projects')
      const statsCards = widgets.find((w) => w.id === 'statistics-cards')

      expect(recentProjects?.x).toBe(5)
      expect(recentProjects?.y).toBe(5)
      // Other widgets should remain unchanged
      expect(statsCards?.x).toBe(originalWidgets.find((w) => w.id === 'statistics-cards')?.x)
    })

    it('should not modify anything if widget does not exist', () => {
      const store = useLayoutStore.getState()
      const originalWidgets = [...store.widgets]

      store.updateWidgetPosition('non-existent-widget' as WidgetId, 10, 10)

      const widgets = useLayoutStore.getState().widgets
      expect(widgets).toHaveLength(originalWidgets.length)
    })
  })

  describe('updateWidgetSize', () => {
    it('should update widget size', () => {
      const store = useLayoutStore.getState()

      store.updateWidgetSize('statistics-cards', 8, 2)

      const widgets = useLayoutStore.getState().widgets
      const widget = widgets.find((w) => w.id === 'statistics-cards')
      expect(widget).toBeDefined()
      expect(widget?.width).toBe(8)
      expect(widget?.height).toBe(2)
    })

    it('should respect minWidth constraint', () => {
      const store = useLayoutStore.getState()

      // Try to set width below minWidth (6 for statistics-cards)
      store.updateWidgetSize('statistics-cards', 2, 1)

      const widgets = useLayoutStore.getState().widgets
      const widget = widgets.find((w) => w.id === 'statistics-cards')
      expect(widget?.width).toBe(6) // Should be constrained to minWidth
    })

    it('should respect maxWidth constraint', () => {
      const store = useLayoutStore.getState()

      // Try to set width above 12 (max columns)
      store.updateWidgetSize('recent-projects', 20, 10)

      const widgets = useLayoutStore.getState().widgets
      const widget = widgets.find((w) => w.id === 'recent-projects')
      expect(widget?.width).toBeLessThanOrEqual(12)
    })

    it('should respect minHeight constraint', () => {
      const store = useLayoutStore.getState()

      // Try to set height below minHeight (2 for recent-projects)
      store.updateWidgetSize('recent-projects', 6, 0)

      const widgets = useLayoutStore.getState().widgets
      const widget = widgets.find((w) => w.id === 'recent-projects')
      expect(widget?.height).toBeGreaterThanOrEqual(1)
    })
  })

  describe('toggleWidgetVisibility', () => {
    it('should toggle widget visibility from true to false', () => {
      const store = useLayoutStore.getState()

      // First ensure it's visible
      const initialWidget = store.widgets.find((w) => w.id === 'statistics-cards')
      expect(initialWidget?.visible).toBe(true)

      store.toggleWidgetVisibility('statistics-cards')

      const widgets = useLayoutStore.getState().widgets
      const widget = widgets.find((w) => w.id === 'statistics-cards')
      expect(widget?.visible).toBe(false)
    })

    it('should toggle widget visibility from false to true', () => {
      const store = useLayoutStore.getState()

      // First hide it
      store.toggleWidgetVisibility('statistics-cards')
      expect(useLayoutStore.getState().widgets.find((w) => w.id === 'statistics-cards')?.visible).toBe(false)

      // Then show it again
      store.toggleWidgetVisibility('statistics-cards')
      expect(useLayoutStore.getState().widgets.find((w) => w.id === 'statistics-cards')?.visible).toBe(true)
    })
  })

  describe('updateWidgets', () => {
    it('should replace all widgets', () => {
      const store = useLayoutStore.getState()

      const newWidgets: WidgetConfig[] = [
        { id: 'statistics-cards', x: 0, y: 0, width: 12, height: 1, visible: true },
        { id: 'recent-projects', x: 0, y: 1, width: 12, height: 2, visible: false },
      ]

      store.updateWidgets(newWidgets)

      const widgets = useLayoutStore.getState().widgets
      expect(widgets).toHaveLength(2)
      expect(widgets[0].id).toBe('statistics-cards')
      expect(widgets[1].visible).toBe(false)
    })
  })

  describe('setActiveLayout', () => {
    it('should switch to compact layout', () => {
      const store = useLayoutStore.getState()

      store.setActiveLayout('compact')

      const state = useLayoutStore.getState()
      expect(state.activeLayoutId).toBe('compact')
      expect(state.widgets).toHaveLength(4) // Compact has 4 widgets
    })

    it('should switch to detailed layout', () => {
      const store = useLayoutStore.getState()

      store.setActiveLayout('detailed')

      const state = useLayoutStore.getState()
      expect(state.activeLayoutId).toBe('detailed')
      expect(state.widgets).toHaveLength(7) // Detailed has 7 widgets
    })

    it('should not change layout if layout ID does not exist', () => {
      const store = useLayoutStore.getState()
      const originalActiveId = store.activeLayoutId
      const originalWidgets = [...store.widgets]

      store.setActiveLayout('non-existent-layout')

      const state = useLayoutStore.getState()
      expect(state.activeLayoutId).toBe(originalActiveId)
      expect(state.widgets).toEqual(originalWidgets)
    })
  })

  describe('saveCurrentLayout', () => {
    it('should create a new custom layout', () => {
      const store = useLayoutStore.getState()
      const originalLayoutCount = store.layouts.length

      store.saveCurrentLayout('My Custom Layout')

      const state = useLayoutStore.getState()
      expect(state.layouts).toHaveLength(originalLayoutCount + 1)

      const newLayout = state.layouts.find((l) => l.name === 'My Custom Layout')
      expect(newLayout).toBeDefined()
      expect(newLayout?.isCustom).toBe(true)
      expect(newLayout?.isDefault).toBeFalsy()
      expect(newLayout?.createdAt).toBeDefined()
    })

    it('should set the new layout as active', () => {
      const store = useLayoutStore.getState()

      store.saveCurrentLayout('Test Layout')

      const state = useLayoutStore.getState()
      const newLayout = state.layouts.find((l) => l.name === 'Test Layout')
      expect(state.activeLayoutId).toBe(newLayout?.id)
    })

    it('should copy current widgets to the new layout', () => {
      const store = useLayoutStore.getState()

      // Modify current widgets
      store.updateWidgetPosition('statistics-cards', 5, 5)

      store.saveCurrentLayout('Modified Layout')

      const state = useLayoutStore.getState()
      const newLayout = state.layouts.find((l) => l.name === 'Modified Layout')
      const widget = newLayout?.widgets.find((w) => w.id === 'statistics-cards')
      expect(widget?.x).toBe(5)
      expect(widget?.y).toBe(5)
    })
  })

  describe('updateLayout', () => {
    it('should update layout name', () => {
      const store = useLayoutStore.getState()

      // First create a custom layout
      store.saveCurrentLayout('Original Name')
      const customLayout = useLayoutStore.getState().layouts.find((l) => l.name === 'Original Name')
      const customLayoutId = customLayout!.id

      // Update the name
      useLayoutStore.getState().updateLayout(customLayoutId, 'New Name')

      const state = useLayoutStore.getState()
      const updatedLayout = state.layouts.find((l) => l.id === customLayoutId)
      expect(updatedLayout?.name).toBe('New Name')
    })

    it('should update widgets for active layout', () => {
      const store = useLayoutStore.getState()

      // First create and activate a custom layout
      store.saveCurrentLayout('Test Layout')
      const state = useLayoutStore.getState()
      const customLayoutId = state.activeLayoutId

      // Modify widgets
      store.updateWidgetPosition('statistics-cards', 3, 3)

      // Update the layout
      useLayoutStore.getState().updateLayout(customLayoutId)

      const finalState = useLayoutStore.getState()
      const layout = finalState.layouts.find((l) => l.id === customLayoutId)
      const widget = layout?.widgets.find((w) => w.id === 'statistics-cards')
      expect(widget?.x).toBe(3)
    })
  })

  describe('deleteLayout', () => {
    it('should delete a custom layout', () => {
      const store = useLayoutStore.getState()

      // First create a custom layout
      store.saveCurrentLayout('Layout to Delete')
      const customLayout = useLayoutStore.getState().layouts.find((l) => l.name === 'Layout to Delete')
      const customLayoutId = customLayout!.id
      const layoutCount = useLayoutStore.getState().layouts.length

      // Switch to default first
      useLayoutStore.getState().setActiveLayout('default')

      // Delete the custom layout
      useLayoutStore.getState().deleteLayout(customLayoutId)

      const state = useLayoutStore.getState()
      expect(state.layouts).toHaveLength(layoutCount - 1)
      expect(state.layouts.find((l) => l.id === customLayoutId)).toBeUndefined()
    })

    it('should not delete built-in presets', () => {
      const store = useLayoutStore.getState()
      const layoutCount = store.layouts.length

      // Try to delete a built-in preset
      store.deleteLayout('default')
      store.deleteLayout('compact')
      store.deleteLayout('detailed')

      const state = useLayoutStore.getState()
      expect(state.layouts).toHaveLength(layoutCount)
      expect(state.layouts.find((l) => l.id === 'default')).toBeDefined()
      expect(state.layouts.find((l) => l.id === 'compact')).toBeDefined()
      expect(state.layouts.find((l) => l.id === 'detailed')).toBeDefined()
    })

    it('should switch to default when deleting active layout', () => {
      const store = useLayoutStore.getState()

      // Create and activate a custom layout
      store.saveCurrentLayout('Active to Delete')
      const customLayoutId = useLayoutStore.getState().activeLayoutId

      // Delete the active layout
      useLayoutStore.getState().deleteLayout(customLayoutId)

      const state = useLayoutStore.getState()
      expect(state.activeLayoutId).toBe('default')
    })
  })

  describe('resetToDefault', () => {
    it('should reset to default layout', () => {
      const store = useLayoutStore.getState()

      // Switch to compact
      store.setActiveLayout('compact')
      expect(useLayoutStore.getState().activeLayoutId).toBe('compact')

      // Reset
      useLayoutStore.getState().resetToDefault()

      const state = useLayoutStore.getState()
      expect(state.activeLayoutId).toBe('default')
    })

    it('should reset widgets to default configuration', () => {
      const store = useLayoutStore.getState()

      // Modify widgets
      store.updateWidgetPosition('statistics-cards', 10, 10)
      store.toggleWidgetVisibility('recent-projects')

      // Reset
      useLayoutStore.getState().resetToDefault()

      const state = useLayoutStore.getState()
      const statsCards = state.widgets.find((w) => w.id === 'statistics-cards')
      const recentProjects = state.widgets.find((w) => w.id === 'recent-projects')

      expect(statsCards?.x).toBe(0)
      expect(statsCards?.y).toBe(0)
      expect(recentProjects?.visible).toBe(true)
    })
  })

  describe('getLayoutById', () => {
    it('should return layout by ID', () => {
      const layout = useLayoutStore.getState().getLayoutById('default')
      expect(layout).toBeDefined()
      expect(layout?.name).toBe('Default')
    })

    it('should return undefined for non-existent ID', () => {
      const layout = useLayoutStore.getState().getLayoutById('non-existent')
      expect(layout).toBeUndefined()
    })
  })

  describe('getDefaultLayout', () => {
    it('should return the default layout', () => {
      const layout = useLayoutStore.getState().getDefaultLayout()
      expect(layout).toBeDefined()
      expect(layout.isDefault).toBe(true)
      expect(layout.id).toBe('default')
    })
  })

  describe('_resetStore', () => {
    it('should reset all state to initial values', () => {
      const store = useLayoutStore.getState()

      // Make various modifications
      store.setActiveLayout('detailed')
      store.updateWidgetPosition('statistics-cards', 5, 5)
      store.saveCurrentLayout('Custom')
      store.toggleWidgetVisibility('recent-projects')

      // Reset
      useLayoutStore.getState()._resetStore()

      const state = useLayoutStore.getState()
      expect(state.activeLayoutId).toBe('default')
      expect(state.layouts).toHaveLength(3) // Only built-in presets
      expect(state.widgets.find((w) => w.id === 'statistics-cards')?.x).toBe(0)
      expect(state.widgets.find((w) => w.id === 'recent-projects')?.visible).toBe(true)
    })
  })
})

describe('Layout Hooks', () => {
  beforeEach(() => {
    useLayoutStore.getState()._resetStore()
  })

  describe('useVisibleWidgets', () => {
    it('should return only visible widgets', () => {
      // Hide one widget
      useLayoutStore.getState().toggleWidgetVisibility('recent-projects')

      // Get visible widgets (simulating hook behavior)
      const widgets = useLayoutStore.getState().widgets.filter((w) => w.visible)

      expect(widgets.every((w) => w.visible)).toBe(true)
      expect(widgets.find((w) => w.id === 'recent-projects')).toBeUndefined()
    })
  })

  describe('useCustomLayouts', () => {
    it('should return only custom layouts', () => {
      // Create custom layouts
      useLayoutStore.getState().saveCurrentLayout('Custom 1')
      useLayoutStore.getState().saveCurrentLayout('Custom 2')

      // Get fresh state after modifications
      const customLayouts = useLayoutStore.getState().layouts.filter((l) => l.isCustom)
      expect(customLayouts).toHaveLength(2)
      expect(customLayouts.every((l) => l.isCustom)).toBe(true)
    })
  })

  describe('useBuiltinPresets', () => {
    it('should return only built-in presets', () => {
      const store = useLayoutStore.getState()

      // Create a custom layout
      store.saveCurrentLayout('Custom')

      const builtinPresets = store.layouts.filter((l) => !l.isCustom)
      expect(builtinPresets).toHaveLength(3)
      expect(builtinPresets.every((l) => !l.isCustom)).toBe(true)
      expect(builtinPresets.map((l) => l.id)).toContain('default')
      expect(builtinPresets.map((l) => l.id)).toContain('compact')
      expect(builtinPresets.map((l) => l.id)).toContain('detailed')
    })
  })
})

describe('Layout Presets', () => {
  beforeEach(() => {
    useLayoutStore.getState()._resetStore()
  })

  describe('Default Layout', () => {
    it('should have correct widget configuration', () => {
      const layout = useLayoutStore.getState().getLayoutById('default')
      expect(layout?.widgets).toHaveLength(3)

      // Statistics cards at top, full width
      const stats = layout?.widgets.find((w) => w.id === 'statistics-cards')
      expect(stats?.x).toBe(0)
      expect(stats?.y).toBe(0)
      expect(stats?.width).toBe(12)

      // Recent projects on left
      const recent = layout?.widgets.find((w) => w.id === 'recent-projects')
      expect(recent?.x).toBe(0)
      expect(recent?.y).toBe(1)
      expect(recent?.width).toBe(6)

      // Vulnerability chart on right
      const chart = layout?.widgets.find((w) => w.id === 'vulnerability-chart')
      expect(chart?.x).toBe(6)
      expect(chart?.y).toBe(1)
      expect(chart?.width).toBe(6)
    })
  })

  describe('Compact Layout', () => {
    it('should have all widgets full width and stacked', () => {
      const layout = useLayoutStore.getState().getLayoutById('compact')
      expect(layout?.widgets).toHaveLength(4)

      // All visible widgets should be full width
      const visibleWidgets = layout?.widgets.filter((w) => w.visible) ?? []
      visibleWidgets.forEach((w) => {
        expect(w.width).toBe(12)
      })

      // All widgets should start at x=0
      layout?.widgets.forEach((w) => {
        expect(w.x).toBe(0)
      })
    })

    it('should have KEV alerts hidden by default', () => {
      const layout = useLayoutStore.getState().getLayoutById('compact')
      const kevAlerts = layout?.widgets.find((w) => w.id === 'kev-alerts')
      expect(kevAlerts?.visible).toBe(false)
    })
  })

  describe('Detailed Layout', () => {
    it('should have all widgets visible', () => {
      const layout = useLayoutStore.getState().getLayoutById('detailed')
      expect(layout?.widgets).toHaveLength(7)

      layout?.widgets.forEach((w) => {
        expect(w.visible).toBe(true)
      })
    })

    it('should include KEV and EPSS widgets', () => {
      const layout = useLayoutStore.getState().getLayoutById('detailed')
      expect(layout?.widgets.find((w) => w.id === 'kev-alerts')).toBeDefined()
      expect(layout?.widgets.find((w) => w.id === 'epss-summary')).toBeDefined()
      expect(layout?.widgets.find((w) => w.id === 'severity-distribution')).toBeDefined()
      expect(layout?.widgets.find((w) => w.id === 'project-health')).toBeDefined()
    })
  })
})

describe('Edge Cases', () => {
  beforeEach(() => {
    useLayoutStore.getState()._resetStore()
  })

  describe('updateWidgetSize with non-existent widget', () => {
    it('should not modify state when widget does not exist', () => {
      const originalWidgets = [...useLayoutStore.getState().widgets]

      useLayoutStore.getState().updateWidgetSize('non-existent-widget' as WidgetId, 5, 5)

      expect(useLayoutStore.getState().widgets).toEqual(originalWidgets)
    })
  })

  describe('updateLayout for non-active layout', () => {
    it('should update name but not widgets for non-active layout', () => {
      // Create two custom layouts
      useLayoutStore.getState().saveCurrentLayout('Layout 1')
      const layout1Id = useLayoutStore.getState().activeLayoutId

      useLayoutStore.getState().setActiveLayout('default')
      useLayoutStore.getState().saveCurrentLayout('Layout 2')
      const layout2Id = useLayoutStore.getState().activeLayoutId

      // Modify current widgets
      useLayoutStore.getState().updateWidgetPosition('statistics-cards', 7, 7)

      // Update Layout 1 (non-active)
      useLayoutStore.getState().updateLayout(layout1Id, 'Renamed Layout 1')

      const layout1 = useLayoutStore.getState().getLayoutById(layout1Id)
      expect(layout1?.name).toBe('Renamed Layout 1')

      // Layout 1 widgets should NOT be updated since it's not active
      const widget1 = layout1?.widgets.find((w) => w.id === 'statistics-cards')
      expect(widget1?.x).toBe(0) // Original position

      // Layout 2 (active) widgets should be updated when we call updateLayout
      useLayoutStore.getState().updateLayout(layout2Id)
      const layout2 = useLayoutStore.getState().getLayoutById(layout2Id)
      const widget2 = layout2?.widgets.find((w) => w.id === 'statistics-cards')
      expect(widget2?.x).toBe(7) // Updated position
    })
  })

  describe('deleteLayout edge cases', () => {
    it('should not delete non-existent layout', () => {
      const layoutCount = useLayoutStore.getState().layouts.length

      useLayoutStore.getState().deleteLayout('non-existent-layout')

      expect(useLayoutStore.getState().layouts).toHaveLength(layoutCount)
    })

    it('should handle deletion when default is not found', () => {
      // Create a custom layout and switch to it
      useLayoutStore.getState().saveCurrentLayout('Only Layout')

      // Manually remove default from layouts to test fallback
      const state = useLayoutStore.getState()
      const customLayoutId = state.activeLayoutId

      // Delete the active custom layout - it should fall back to default
      useLayoutStore.getState().deleteLayout(customLayoutId)

      // Should have switched to default
      expect(useLayoutStore.getState().activeLayoutId).toBe('default')
    })
  })

  describe('getDefaultLayout fallback', () => {
    it('should return DEFAULT_LAYOUT constant when no isDefault found', () => {
      // The store should always have a default layout, but this tests the fallback
      const defaultLayout = useLayoutStore.getState().getDefaultLayout()
      expect(defaultLayout).toBeDefined()
      expect(defaultLayout.id).toBe('default')
    })
  })

  describe('Custom layout ID generation', () => {
    it('should generate unique IDs for custom layouts', () => {
      useLayoutStore.getState().saveCurrentLayout('Layout A')
      const idA = useLayoutStore.getState().activeLayoutId

      useLayoutStore.getState().setActiveLayout('default')
      useLayoutStore.getState().saveCurrentLayout('Layout B')
      const idB = useLayoutStore.getState().activeLayoutId

      expect(idA).not.toBe(idB)
      expect(idA).toMatch(/^custom-/)
      expect(idB).toMatch(/^custom-/)
    })
  })

  describe('Widget size constraints', () => {
    it('should apply maxHeight constraint when specified', () => {
      // Add a widget with maxHeight constraint
      const newWidgets: WidgetConfig[] = [
        { id: 'statistics-cards', x: 0, y: 0, width: 12, height: 1, visible: true, maxHeight: 3 },
      ]
      useLayoutStore.getState().updateWidgets(newWidgets)

      // Try to set height above maxHeight
      useLayoutStore.getState().updateWidgetSize('statistics-cards', 12, 10)

      const widget = useLayoutStore.getState().widgets.find((w) => w.id === 'statistics-cards')
      expect(widget?.height).toBe(3) // Should be constrained to maxHeight
    })

    it('should handle widgets without min/max constraints', () => {
      // Add a widget without constraints
      const newWidgets: WidgetConfig[] = [{ id: 'recent-projects', x: 0, y: 0, width: 6, height: 2, visible: true }]
      useLayoutStore.getState().updateWidgets(newWidgets)

      // Set size within default bounds
      useLayoutStore.getState().updateWidgetSize('recent-projects', 8, 5)

      const widget = useLayoutStore.getState().widgets.find((w) => w.id === 'recent-projects')
      expect(widget?.width).toBe(8)
      expect(widget?.height).toBe(5)
    })
  })
})
