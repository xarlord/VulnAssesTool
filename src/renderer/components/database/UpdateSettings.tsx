/**
 * UpdateSettings Component
 * Configure automatic database update settings with bandwidth throttling,
 * pause on battery, and WiFi-only options
 */

import React, { useState, useEffect } from 'react'
import { Settings, Clock, Calendar, Save, Wifi, Battery } from 'lucide-react'
import { useSettings, useUpdateSettings } from '../../store/useStore'

interface UpdateSchedule {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'never'
  time: string // HH:MM format
  dayOfWeek?: number // 0-6 for weekly
  dayOfMonth?: number // 1-28 for monthly
  bandwidthLimitKBps?: number // Bandwidth limit in KB/s (0 = unlimited)
  pauseOnBattery: boolean // Pause updates when on battery power
  wifiOnly: boolean // Only update on WiFi connection
}

interface UpdateSettingsProps {
  className?: string
  onSave?: (settings: UpdateSchedule) => void
}

export const UpdateSettings: React.FC<UpdateSettingsProps> = ({ className = '', onSave }) => {
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
  const [schedule, setSchedule] = useState<UpdateSchedule>({
    enabled: false,
    frequency: 'weekly',
    time: '02:00',
    dayOfWeek: 0, // Sunday
    dayOfMonth: 1,
    bandwidthLimitKBps: 0, // Unlimited
    pauseOnBattery: true,
    wifiOnly: false,
  })
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    // Load saved settings
    const savedSchedule = settings.databaseUpdateSchedule
    if (savedSchedule) {
      setSchedule(savedSchedule)
    }
  }, [settings])

  const handleChange = (field: keyof UpdateSchedule, value: any) => {
    setSchedule((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    updateSettings({ databaseUpdateSchedule: schedule })
    setHasChanges(false)
    if (onSave) {
      onSave(schedule)
    }
  }

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Settings className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Database Update Settings</h3>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <label className="text-sm font-medium">Automatic Updates</label>
          <p className="text-xs text-muted-foreground">Keep the NVD database synchronized with latest CVE data</p>
        </div>
        <button
          onClick={() => handleChange('enabled', !schedule.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            schedule.enabled ? 'bg-primary' : 'bg-input'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              schedule.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {schedule.enabled && (
        <>
          {/* Frequency */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Update Frequency
            </label>
            <select
              value={schedule.frequency}
              onChange={(e) => handleChange('frequency', e.target.value as UpdateSchedule['frequency'])}
              className="w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="never">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Time */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Update Time
            </label>
            <input
              type="time"
              value={schedule.time}
              onChange={(e) => handleChange('time', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Day of Week (for weekly) */}
          {schedule.frequency === 'weekly' && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Day of Week
              </label>
              <select
                value={schedule.dayOfWeek}
                onChange={(e) => handleChange('dayOfWeek', parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {daysOfWeek.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Day of Month (for monthly) */}
          {schedule.frequency === 'monthly' && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Day of Month
              </label>
              <select
                value={schedule.dayOfMonth}
                onChange={(e) => handleChange('dayOfMonth', parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    Day {day}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bandwidth Limit */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Bandwidth Limit</label>
            <select
              value={schedule.bandwidthLimitKBps ?? 0}
              onChange={(e) => handleChange('bandwidthLimitKBps', parseInt(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="0">Unlimited</option>
              <option value="512">512 KB/s</option>
              <option value="1024">1 MB/s</option>
              <option value="2048">2 MB/s</option>
              <option value="5120">5 MB/s</option>
            </select>
          </div>

          {/* Custom Bandwidth Slider */}
          {schedule.bandwidthLimitKBps && schedule.bandwidthLimitKBps > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Custom Limit: {((schedule.bandwidthLimitKBps ?? 0) / 1024).toFixed(2)} MB/s
              </label>
              <input
                type="range"
                min="128"
                max="10240"
                step="128"
                value={schedule.bandwidthLimitKBps ?? 0}
                onChange={(e) => handleChange('bandwidthLimitKBps', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>128 KB/s</span>
                <span>10 MB/s</span>
              </div>
            </div>
          )}

          {/* Pause on Battery */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Battery className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <label className="text-sm font-medium">Pause on Battery</label>
                <p className="text-xs text-muted-foreground">Automatically pause updates when running on battery</p>
              </div>
            </div>
            <button
              onClick={() => handleChange('pauseOnBattery', !schedule.pauseOnBattery)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                schedule.pauseOnBattery ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  schedule.pauseOnBattery ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* WiFi Only */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <label className="text-sm font-medium">WiFi Only</label>
                <p className="text-xs text-muted-foreground">Only download updates when connected to WiFi</p>
              </div>
            </div>
            <button
              onClick={() => handleChange('wifiOnly', !schedule.wifiOnly)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                schedule.wifiOnly ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  schedule.wifiOnly ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Summary */}
          <div className="p-3 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">
              Next update: <span className="font-medium text-foreground">{getNextUpdateText(schedule)}</span>
            </p>
          </div>
        </>
      )}

      {/* Save Button */}
      {hasChanges && (
        <div className="pt-2 border-t">
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
        </div>
      )}
    </div>
  )
}

// Helper function to calculate next update time
function getNextUpdateText(schedule: UpdateSchedule): string {
  const now = new Date()
  const [hours, minutes] = schedule.time.split(':').map(Number)

  const next = new Date()
  next.setHours(hours, minutes, 0, 0)

  if (schedule.frequency === 'daily') {
    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }
  } else if (schedule.frequency === 'weekly') {
    next.setDate(next.getDate() + ((schedule.dayOfWeek! - next.getDay() + 7) % 7))
    if (next <= now) {
      next.setDate(next.getDate() + 7)
    }
  } else if (schedule.frequency === 'monthly') {
    next.setDate(schedule.dayOfMonth!)
    if (next <= now) {
      next.setMonth(next.getMonth() + 1)
    }
  }

  return next.toLocaleString()
}

export { UpdateSettings }
