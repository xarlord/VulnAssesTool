import { useState } from 'react'
import { Clock, Trash2, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { SettingsProfile } from '@@/types'

interface SettingsProfileCardProps {
  profile: SettingsProfile
  isActive: boolean
  onSwitch: (profileId: string) => void
  onDelete: (profileId: string) => void
  onSetDefault: (profileId: string) => void
}

export function SettingsProfileCard({ profile, isActive, onSwitch, onDelete, onSetDefault }: SettingsProfileCardProps) {
  const { t } = useTranslation('settingsProfileCard')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleConfirmDelete = () => {
    onDelete(profile.id)
    setShowDeleteConfirm(false)
  }

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('relativeTime.justNow')
    if (diffMins < 60) return t('relativeTime.minutesAgo', { count: diffMins })
    if (diffHours < 24) return t('relativeTime.hoursAgo', { count: diffHours })
    if (diffDays < 7) return t('relativeTime.daysAgo', { count: diffDays })

    return d.toLocaleDateString()
  }

  return (
    <div
      className={`relative rounded-lg border-2 bg-card p-4 transition-all ${
        isActive
          ? 'border-primary shadow-md ring-2 ring-primary/20'
          : 'border-border hover:border-muted-foreground/30 hover:shadow-sm'
      }`}
    >
      {/* Active Indicator */}
      {isActive && (
        <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckCircle className="h-4 w-4" />
        </div>
      )}

      {/* Default Badge */}
      {profile.isDefault && (
        <div className="mb-2">
          {/* Tint marks the badge; text uses foreground (not text-primary) — text-primary on
              bg-primary/10 is only 3.01:1 in dark mode, below WCAG AA 4.5:1 (NFR-04.5). */}
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-foreground">
            {t('badge.default')}
          </span>
        </div>
      )}

      {/* Profile Name */}
      <h3 className="mb-1 text-base font-semibold text-card-foreground">{profile.name}</h3>

      {/* Description */}
      {profile.description && <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{profile.description}</p>}

      {/* Settings Summary */}
      <div className="mb-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{t('summary.theme')}</span>
          <span className="font-medium capitalize">{profile.settings.theme}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{t('summary.fontSize')}</span>
          <span className="font-medium capitalize">{profile.settings.fontSize}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{t('summary.autoRefresh')}</span>
          <span className="font-medium">
            {profile.settings.autoRefresh ? t('summary.enabled') : t('summary.disabled')}
          </span>
        </div>
      </div>

      {/* Last Used */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{t('lastUsed', { date: formatDate(profile.lastUsed) })}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-border">
        {!isActive ? (
          <button
            onClick={() => onSwitch(profile.id)}
            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('actions.switchToProfile')}
          </button>
        ) : (
          <div className="flex-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground text-center">
            {t('actions.activeProfile')}
          </div>
        )}
        <button
          onClick={() => onSetDefault(profile.id)}
          disabled={profile.isDefault}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            profile.isDefault
              ? 'cursor-not-allowed bg-muted text-muted-foreground opacity-50'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
          title={profile.isDefault ? t('actions.alreadyDefaultTitle') : t('actions.setDefaultTitle')}
        >
          {t('actions.setDefault')}
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isActive}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            isActive
              ? 'cursor-not-allowed bg-muted text-muted-foreground opacity-50'
              : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          }`}
          title={isActive ? t('actions.cannotDeleteTitle') : t('actions.deleteTitle')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('deleteConfirm.title')}
        message={t('deleteConfirm.message', { name: profile.name })}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
