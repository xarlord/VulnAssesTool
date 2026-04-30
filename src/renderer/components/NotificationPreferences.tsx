import React from 'react'
import { Bell, BellOff, Check } from 'lucide-react'
import { useNotificationPreferences, updateNotificationPreferences, setCategoryEnabled } from '@/lib/notifications'

export function NotificationPreferences() {
  const preferences = useNotificationPreferences()

  const handleToggleEnabled = () => {
    updateNotificationPreferences({
      enabled: !preferences.enabled,
    })
  }

  const handleToggleDesktopEnabled = () => {
    updateNotificationPreferences({
      desktopEnabled: !preferences.desktopEnabled,
    })
  }

  const handleToggleCategory = (category: keyof typeof preferences.categories) => {
    setCategoryEnabled(category, !preferences.categories[category])
  }

  const categories = [
    {
      key: 'critical_vuln' as const,
      label: 'Critical Vulnerabilities',
      description: 'Get notified when critical vulnerabilities are detected',
      icon: '🔴',
    },
    {
      key: 'scan_complete' as const,
      label: 'Scan Complete',
      description: 'Get notified when vulnerability scans finish',
      icon: '✅',
    },
    {
      key: 'update_available' as const,
      label: 'Update Available',
      description: 'Get notified when app updates are available',
      icon: '📦',
    },
    {
      key: 'system' as const,
      label: 'System Notifications',
      description: 'Get notified about system events and errors',
      icon: '⚙️',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground">Manage how you receive notifications</p>
      </div>

      {/* Master Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            {preferences.enabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="font-medium">Enable Notifications</div>
            <div className="text-sm text-muted-foreground">
              {preferences.enabled ? 'Notifications are enabled' : 'All notifications are disabled'}
            </div>
          </div>
        </div>
        <button
          onClick={handleToggleEnabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            preferences.enabled ? 'bg-primary' : 'bg-muted'
          }`}
          role="switch"
          aria-checked={preferences.enabled}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              preferences.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Desktop Notifications */}
      {preferences.enabled && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <Bell className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <div className="font-medium">Desktop Notifications</div>
              <div className="text-sm text-muted-foreground">Show notifications on your desktop</div>
            </div>
          </div>
          <button
            onClick={handleToggleDesktopEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              preferences.desktopEnabled ? 'bg-primary' : 'bg-muted'
            }`}
            role="switch"
            aria-checked={preferences.desktopEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                preferences.desktopEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Category Toggles */}
      {preferences.enabled && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Notification Categories</h4>
          <div className="space-y-2">
            {categories.map((category) => {
              const isEnabled = preferences.categories[category.key]

              return (
                <div
                  key={category.key}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <span className="text-xl">{category.icon}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{category.label}</span>
                        {isEnabled && (
                          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600">
                            <Check className="inline h-3 w-3" /> Enabled
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">{category.description}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleCategory(category.key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isEnabled ? 'bg-primary' : 'bg-muted'
                    }`}
                    role="switch"
                    aria-checked={isEnabled}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Info Box */}
      {preferences.enabled && !preferences.desktopEnabled && (
        <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <div className="font-medium text-blue-600">Desktop notifications are disabled</div>
              <div className="mt-1 text-sm text-blue-600/80">
                You'll only see notifications in the app. Enable desktop notifications to be alerted even when the app
                is in the background.
              </div>
            </div>
          </div>
        </div>
      )}

      {!preferences.enabled && (
        <div className="rounded-lg border border-muted-foreground/50 bg-muted/50 p-4">
          <div className="flex items-start gap-3">
            <BellOff className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-medium text-muted-foreground">All notifications are disabled</div>
              <div className="mt-1 text-sm text-muted-foreground">
                You won't receive any notifications. Enable notifications to stay informed about important security
                updates and system events.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
