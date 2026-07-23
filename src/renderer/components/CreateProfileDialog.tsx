import React, { useState } from 'react'
import { Copy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { SettingsProfile, AppSettings } from '@@/types'

interface CreateProfileDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, description: string | undefined, settings: AppSettings) => void
  existingProfiles: SettingsProfile[]
  currentSettings: AppSettings
}

export function CreateProfileDialog({
  open,
  onClose,
  onCreate,
  existingProfiles,
  currentSettings,
}: CreateProfileDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [copyFromProfileId, setCopyFromProfileId] = useState<string>('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!name.trim()) {
      setError('Profile name is required')
      return
    }

    if (name.trim().length < 3) {
      setError('Profile name must be at least 3 characters')
      return
    }

    // Check for duplicate names
    const nameExists = existingProfiles.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
    if (nameExists) {
      setError('A profile with this name already exists')
      return
    }

    // Get settings to copy
    let settingsToUse = currentSettings
    if (copyFromProfileId) {
      const profile = existingProfiles.find((p) => p.id === copyFromProfileId)
      if (profile) {
        settingsToUse = profile.settings
      }
    }

    // Create profile
    onCreate(name.trim(), description.trim() || undefined, settingsToUse)

    // Reset form
    setName('')
    setDescription('')
    setCopyFromProfileId('')
    setError('')
    onClose()
  }

  const handleCancel = () => {
    setName('')
    setDescription('')
    setCopyFromProfileId('')
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <DialogHeader>
          <DialogTitle>Create New Settings Profile</DialogTitle>
          <DialogDescription>Create a custom settings profile for different use cases</DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Field */}
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              Profile Name <span className="text-destructive">*</span>
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="e.g., Development, Production, Security Audit"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              autoFocus
            />
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <label htmlFor="profile-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="profile-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of when to use this profile..."
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
            />
          </div>

          {/* Copy from existing profile */}
          {existingProfiles.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="copy-from" className="text-sm font-medium flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Copy Settings From
              </label>
              <select
                id="copy-from"
                value={copyFromProfileId}
                onChange={(e) => setCopyFromProfileId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Use Current Settings</option>
                {existingProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Optionally copy settings from an existing profile. Otherwise, current settings will be used.
              </p>
            </div>
          )}

          {/* Settings Preview */}
          <div className="rounded-md bg-muted p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Settings Summary:</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theme:</span>
                <span className="font-medium capitalize">
                  {currentSettings.theme.charAt(0).toUpperCase() + currentSettings.theme.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Font:</span>
                <span className="font-medium">
                  {currentSettings.fontSize === 'default'
                    ? 'Default'
                    : currentSettings.fontSize.charAt(0).toUpperCase() + currentSettings.fontSize.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auto-refresh:</span>
                <span className="font-medium">{currentSettings.autoRefresh ? 'On' : 'Off'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cache TTL:</span>
                <span className="font-medium">{currentSettings.vulnDataCacheTTL}h</span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create Profile
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
