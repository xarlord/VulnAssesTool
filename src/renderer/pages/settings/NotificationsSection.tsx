import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNotificationPreferences, useNotificationsStore } from '@/lib/notifications/notificationsStore'
import type { NotificationPreferences } from '@@/types'

/**
 * Notification preferences (FR-10.4). Self-contained: reads/writes the separate
 * notifications zustand store directly (notification prefs are global/app-level,
 * not part of per-profile AppSettings).
 */

const CATEGORY_KEYS: Array<keyof NotificationPreferences['categories']> = [
  'critical_vuln',
  'scan_complete',
  'update_available',
  'system',
]

interface ToggleSwitchProps {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}

// Module-level so it is not re-created on every render.
function ToggleSwitch({ label, checked, disabled = false, onChange }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${disabled ? 'text-muted-foreground' : ''}`}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export function NotificationsSection() {
  const { t } = useTranslation('notificationsSection')
  const preferences = useNotificationPreferences()
  const updatePreferences = useNotificationsStore((s) => s.updatePreferences)
  const setCategoryEnabled = useNotificationsStore((s) => s.setCategoryEnabled)

  return (
    <div id="notifications" className="rounded-lg border border-border bg-card scroll-mt-6">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">{t('title')}</h2>
      </div>
      <div className="p-4 space-y-4">
        <ToggleSwitch
          label={t('enableNotifications')}
          checked={preferences.enabled}
          onChange={(value) => updatePreferences({ enabled: value })}
        />
        <ToggleSwitch
          label={t('desktopNotifications')}
          checked={preferences.desktopEnabled}
          disabled={!preferences.enabled}
          onChange={(value) => updatePreferences({ desktopEnabled: value })}
        />

        <div className="pt-2">
          <p className="mb-3 text-sm font-medium">{t('categoriesLabel')}</p>
          <div className="space-y-3">
            {CATEGORY_KEYS.map((category) => (
              <ToggleSwitch
                key={category}
                label={t(`categories.${category}`)}
                checked={preferences.categories[category]}
                disabled={!preferences.enabled}
                onChange={(value) => setCategoryEnabled(category, value)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
