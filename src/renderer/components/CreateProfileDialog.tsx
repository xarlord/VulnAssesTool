import React, { useState } from 'react'
import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('createProfileDialog')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [copyFromProfileId, setCopyFromProfileId] = useState<string>('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }

    if (name.trim().length < 3) {
      setError(t('errors.nameTooShort'))
      return
    }

    // Check for duplicate names
    const nameExists = existingProfiles.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
    if (nameExists) {
      setError(t('errors.nameDuplicate'))
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
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Field */}
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              {t('fields.nameLabel')} <span className="text-destructive">*</span>
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder={t('fields.namePlaceholder')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              autoFocus
            />
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <label htmlFor="profile-description" className="text-sm font-medium">
              {t('fields.descriptionLabel')}
            </label>
            <textarea
              id="profile-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('fields.descriptionPlaceholder')}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
            />
          </div>

          {/* Copy from existing profile */}
          {existingProfiles.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="copy-from" className="text-sm font-medium flex items-center gap-2">
                <Copy className="h-4 w-4" />
                {t('copyFrom.label')}
              </label>
              <select
                id="copy-from"
                value={copyFromProfileId}
                onChange={(e) => setCopyFromProfileId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">{t('copyFrom.useCurrentSettings')}</option>
                {existingProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.isDefault ? t('copyFrom.defaultSuffix') : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t('copyFrom.hint')}</p>
            </div>
          )}

          {/* Settings Preview */}
          <div className="rounded-md bg-muted p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{t('summary.title')}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('summary.theme')}</span>
                <span className="font-medium capitalize">
                  {currentSettings.theme.charAt(0).toUpperCase() + currentSettings.theme.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('summary.font')}</span>
                <span className="font-medium">
                  {currentSettings.fontSize === 'default'
                    ? t('summary.fontDefault')
                    : currentSettings.fontSize.charAt(0).toUpperCase() + currentSettings.fontSize.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('summary.autoRefresh')}</span>
                <span className="font-medium">{currentSettings.autoRefresh ? t('summary.on') : t('summary.off')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('summary.cacheTtl')}</span>
                <span className="font-medium">
                  {t('summary.cacheTtlValue', { hours: currentSettings.vulnDataCacheTTL })}
                </span>
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
              {t('common:actions.cancel')}
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('actions.createProfile')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
