import React from 'react'
import { Clock, Trash2, CheckCircle } from 'lucide-react'
import type { SettingsProfile } from '@@/types'

interface SettingsProfileCardProps {
  profile: SettingsProfile
  isActive: boolean
  onSwitch: (profileId: string) => void
  onDelete: (profileId: string) => void
}

export default function SettingsProfileCard({ profile, isActive, onSwitch, onDelete }: SettingsProfileCardProps) {
  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete the profile "${profile.name}"?`)) {
      onDelete(profile.id)
    }
  }

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

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
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Default
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
          <span>Theme:</span>
          <span className="font-medium capitalize">{profile.settings.theme}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Font Size:</span>
          <span className="font-medium capitalize">{profile.settings.fontSize}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Auto-refresh:</span>
          <span className="font-medium">{profile.settings.autoRefresh ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      {/* Last Used */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Last used: {formatDate(profile.lastUsed)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-border">
        {!isActive ? (
          <button
            onClick={() => onSwitch(profile.id)}
            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Switch to Profile
          </button>
        ) : (
          <div className="flex-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary text-center">
            Active Profile
          </div>
        )}
        <button
          onClick={handleDelete}
          disabled={isActive}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            isActive
              ? 'cursor-not-allowed bg-muted text-muted-foreground opacity-50'
              : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          }`}
          title={isActive ? 'Cannot delete active profile' : 'Delete profile'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
