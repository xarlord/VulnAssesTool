/**
 * DashboardEditor Component
 *
 * Drag-and-drop interface for customizing dashboard widget layout.
 * Uses the layoutStore for persistence.
 *
 * @module components/dashboard/DashboardEditor
 */

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GripVertical, RotateCcw, Save, Trash2, Layout, Eye, EyeOff } from 'lucide-react'
import { useLayoutStore, useActiveLayout, useVisibleWidgets, useCustomLayouts, useBuiltinPresets } from '@/lib/layout'
import type { WidgetConfig } from '@/lib/layout/types'

interface DashboardEditorProps {
  /** Whether the editor is open */
  open: boolean
  /** Callback when editor should close */
  onOpenChange: (open: boolean) => void
}

interface WidgetItemProps {
  widget: WidgetConfig
  onToggleVisibility: () => void
  onPositionChange: (x: number, y: number) => void
  onSizeChange: (width: number, height: number) => void
}

function WidgetItem({
  widget,
  onToggleVisibility,
  onPositionChange: _onPositionChange,
  onSizeChange: _onSizeChange,
}: WidgetItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-card">
      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">
            {widget.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
          {widget.visible ? (
            <Badge variant="outline" className="text-xs">
              Visible
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Hidden
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Position: ({widget.x}, {widget.y}) | Size: {widget.width}×{widget.height}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onToggleVisibility} className="shrink-0">
        {widget.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>
    </div>
  )
}

export function DashboardEditor({ open, onOpenChange }: DashboardEditorProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')

  const {
    widgets,
    activeLayoutId,
    setActiveLayout,
    toggleWidgetVisibility,
    updateWidgetPosition,
    updateWidgetSize,
    saveCurrentLayout,
    deleteLayout,
    resetToDefault,
  } = useLayoutStore()

  const activeLayout = useActiveLayout()
  const visibleWidgets = useVisibleWidgets()
  const customLayouts = useCustomLayouts()
  const builtinPresets = useBuiltinPresets()

  // Handle layout change
  const handleLayoutChange = useCallback(
    (layoutId: string) => {
      setActiveLayout(layoutId)
    },
    [setActiveLayout],
  )

  // Handle save new layout
  const handleSaveLayout = useCallback(() => {
    if (newLayoutName.trim()) {
      saveCurrentLayout(newLayoutName.trim())
      setNewLayoutName('')
      setShowSaveDialog(false)
    }
  }, [newLayoutName, saveCurrentLayout])

  // Handle delete layout
  const handleDeleteLayout = useCallback(
    (layoutId: string) => {
      if (confirm('Are you sure you want to delete this layout?')) {
        deleteLayout(layoutId)
      }
    },
    [deleteLayout],
  )

  // Handle reset
  const handleReset = useCallback(() => {
    if (confirm('Reset to default layout? This will lose any unsaved changes.')) {
      resetToDefault()
    }
  }, [resetToDefault])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layout className="h-5 w-5" />
              Customize Dashboard
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-6 pr-4">
                {/* Layout Presets */}
                <div className="space-y-3">
                  <Label className="text-base">Layout Preset</Label>
                  <Select value={activeLayoutId} onValueChange={handleLayoutChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select layout" />
                    </SelectTrigger>
                    <SelectContent>
                      <optgroup label="Built-in">
                        {builtinPresets.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.name}
                            {preset.isDefault && ' (Default)'}
                          </SelectItem>
                        ))}
                      </optgroup>
                      {customLayouts.length > 0 && (
                        <optgroup label="Custom">
                          {customLayouts.map((layout) => (
                            <SelectItem key={layout.id} value={layout.id}>
                              {layout.name}
                            </SelectItem>
                          ))}
                        </optgroup>
                      )}
                    </SelectContent>
                  </Select>

                  {/* Layout description */}
                  {activeLayout && (
                    <p className="text-sm text-muted-foreground">
                      {activeLayout.widgets.length} widgets, {activeLayout.widgets.filter((w) => w.visible).length}{' '}
                      visible
                    </p>
                  )}
                </div>

                {/* Widgets */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Widgets</Label>
                    <Badge variant="outline">
                      {visibleWidgets.length} of {widgets.length} visible
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {widgets.map((widget) => (
                      <WidgetItem
                        key={widget.id}
                        widget={widget}
                        onToggleVisibility={() => toggleWidgetVisibility(widget.id)}
                        onPositionChange={(x, y) => updateWidgetPosition(widget.id, x, y)}
                        onSizeChange={(w, h) => updateWidgetSize(widget.id, w, h)}
                      />
                    ))}
                  </div>
                </div>

                {/* Custom Layout Actions */}
                <div className="space-y-3">
                  <Label className="text-base">Custom Layouts</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSaveDialog(true)}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Save Current Layout
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleReset} className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Reset to Default
                    </Button>
                  </div>

                  {/* Custom layouts list */}
                  {customLayouts.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <p className="text-sm text-muted-foreground">Saved layouts:</p>
                      {customLayouts.map((layout) => (
                        <div key={layout.id} className="flex items-center justify-between p-2 border rounded-md">
                          <span className="text-sm">{layout.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLayout(layout.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Layout Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Layout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="layoutName">Layout Name</Label>
              <Input
                id="layoutName"
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
                placeholder="My Custom Layout"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLayout} disabled={!newLayoutName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default DashboardEditor
