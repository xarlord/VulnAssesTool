/**
 * Dashboard Layout Editor (FR-06.3)
 *
 * A dialog for customizing the executive dashboard: toggle widget visibility,
 * reorder (move up/down), resize (small/medium/large), switch between saved
 * layout profiles, and save the current layout as a new profile. Uses
 * button/dropdown controls (no drag-and-drop) and the store's zustand-persist
 * state, so it needs no new dependency.
 */

import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { WIDGET_LABELS, type DashboardWidgetSlot, type WidgetSizePreset } from '@/lib/dashboard/dashboardLayout'

interface DashboardLayoutEditorProps {
  open?: boolean
  onClose?: () => void
}

const SIZE_OPTIONS: WidgetSizePreset[] = ['small', 'medium', 'large']

export function DashboardLayoutEditor({ open, onClose }: DashboardLayoutEditorProps) {
  const profiles = useStore((s) => s.dashboardLayoutProfiles)
  const activeProfileId = useStore((s) => s.activeDashboardLayoutProfileId)
  const setActiveProfileId = useStore((s) => s.setActiveDashboardLayoutProfileId)
  const updateWidgets = useStore((s) => s.updateDashboardLayoutWidgets)
  const addProfile = useStore((s) => s.addDashboardLayoutProfile)

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0]

  const [localOpen, setLocalOpen] = useState(false)
  const [draft, setDraft] = useState<DashboardWidgetSlot[]>(() =>
    (activeProfile?.widgets ?? []).map((slot) => ({ ...slot })),
  )
  const [newProfileName, setNewProfileName] = useState('')

  const isOpen = open !== undefined ? open : localOpen
  const close = onClose ?? (() => setLocalOpen(false))

  const seedDraftFrom = (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId)
    setDraft((profile?.widgets ?? []).map((slot) => ({ ...slot })))
  }

  const handleOpen = () => {
    // Re-seed the working draft from the active profile each time the editor opens.
    seedDraftFrom(activeProfileId)
    setLocalOpen(true)
  }

  const handleProfileChange = (id: string) => {
    setActiveProfileId(id)
    seedDraftFrom(id)
  }

  const setSlot = (index: number, patch: Partial<DashboardWidgetSlot>) => {
    setDraft((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= draft.length) return
    setDraft((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const handleSave = () => {
    updateWidgets(activeProfileId, draft)
    close()
  }

  const handleSaveAsNew = () => {
    const name = newProfileName.trim()
    if (!name) return
    addProfile(name)
    setNewProfileName('')
  }

  const triggerButton = (
    <button
      onClick={() => (open !== undefined ? onClose?.() : handleOpen())}
      className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-secondary/80 flex items-center gap-2"
    >
      <LayoutGrid className="w-4 h-4" />
      Customize Layout
    </button>
  )

  if (!isOpen) {
    return open === undefined ? triggerButton : null
  }

  return (
    <>
      {open === undefined && triggerButton}
      <Dialog open={isOpen} onOpenChange={(next) => !next && close()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize Dashboard Layout</DialogTitle>
            <DialogDescription>Show/hide, reorder and resize widgets, or save a new layout profile.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Profile selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold" htmlFor="dashboard-layout-profile">
                Profile
              </label>
              <select
                id="dashboard-layout-profile"
                aria-label="Active layout profile"
                value={activeProfileId}
                onChange={(e) => handleProfileChange(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Widget rows */}
            <ul className="space-y-2">
              {draft.map((slot, index) => (
                <li key={slot.id} className="flex items-center gap-2 rounded border border-border p-2">
                  <input
                    type="checkbox"
                    aria-label={`Show ${WIDGET_LABELS[slot.id]}`}
                    checked={slot.visible}
                    onChange={(e) => setSlot(index, { visible: e.target.checked })}
                  />
                  <span className="flex-1 text-sm">{WIDGET_LABELS[slot.id]}</span>
                  <button
                    type="button"
                    aria-label={`Move ${WIDGET_LABELS[slot.id]} up`}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded border border-border px-2 text-sm disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${WIDGET_LABELS[slot.id]} down`}
                    onClick={() => move(index, 1)}
                    disabled={index === draft.length - 1}
                    className="rounded border border-border px-2 text-sm disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <select
                    aria-label={`Size for ${WIDGET_LABELS[slot.id]}`}
                    value={slot.size}
                    onChange={(e) => setSlot(index, { size: e.target.value as WidgetSizePreset })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    {SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>

            {/* Save as new profile */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                aria-label="New profile name"
                placeholder="New profile name"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={handleSaveAsNew}
                className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
              >
                Save as new profile
              </button>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
