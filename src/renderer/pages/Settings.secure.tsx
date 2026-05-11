/**
 * Secure Settings Page Component
 * Updated to use secure storage for API keys
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { isValidNvdApiKey } from '@/lib/api/nvd'
import { getSecureKeyService, loadApiKeyWithFallback } from '@/lib/storage'
import { migrateApiKeysToSecureStorage } from '@/lib/storage/migration'
import {
  Palette,
  Database,
  RotateCw,
  Key,
  Plus,
  Download,
  Upload,
  UserCircle,
  Lock,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { SettingsProfileCard } from '@/components/SettingsProfileCard'
import { CreateProfileDialog } from '@/components/CreateProfileDialog'

export function SettingsPage() {
  const navigate = useNavigate()
  const {
    settings,
    updateSettings,
    settingsProfiles,
    activeProfileId,
    loadSettingsProfiles,
    createSettingsProfile,
    deleteSettingsProfile,
    switchSettingsProfile,
    exportSettingsProfiles,
    importSettingsProfiles,
  } = useStore()

  // Local state for form values (only commit on blur/enter)
  const [nvdApiKeyInput, setNvdApiKeyInput] = useState('')
  const [apiKeyError, setApiKeyError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Secure storage state
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationComplete, setMigrationComplete] = useState(false)

  // Profile dialog state
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)

  const secureKeyService = getSecureKeyService()

  // Load profiles on mount
  useEffect(() => {
    loadSettingsProfiles()
    checkSecureStorageAvailability()
    checkMigrationNeeded()
  }, [])

  // Initialize API key input from secure storage
  useEffect(() => {
    const loadApiKey = async () => {
      const key = await loadApiKeyWithFallback('nvd', settings.nvdApiKey)
      setNvdApiKeyInput(key || '')
    }
    loadApiKey()
  }, [settings.nvdApiKey])

  const checkSecureStorageAvailability = async () => {
    const available = await secureKeyService.isAvailable()
    setSecureStorageAvailable(available)
  }

  const checkMigrationNeeded = async () => {
    const needsMigrate = await secureKeyService.needsMigration()
    setNeedsMigration(needsMigrate)
  }

  const handleApiKeyChange = (value: string) => {
    setNvdApiKeyInput(value)
    setApiKeyError('')
    setSaveSuccess(false)

    // Validate if not empty
    if (value && !isValidNvdApiKey(value)) {
      setApiKeyError('Invalid API key format. Expected UUID format.')
    }
  }

  const handleApiKeyBlur = async () => {
    if (apiKeyError) {
      // Reset to current valid value
      const key = await loadApiKeyWithFallback('nvd', settings.nvdApiKey)
      setNvdApiKeyInput(key || '')
      setApiKeyError('')
      return
    }

    // Save to secure storage if available
    if (secureStorageAvailable) {
      const success = await secureKeyService.setApiKey('nvd', nvdApiKeyInput || '')
      if (success) {
        // Update settings to undefined (key is now in secure storage)
        updateSettings({ nvdApiKey: undefined })
        if (nvdApiKeyInput !== (await loadApiKeyWithFallback('nvd', settings.nvdApiKey))) {
          setSaveSuccess(true)
          setTimeout(() => setSaveSuccess(false), 2000)
        }
      } else {
        setApiKeyError('Failed to save API key securely')
      }
    } else {
      // Fall back to storing in settings (not recommended)
      updateSettings({ nvdApiKey: nvdApiKeyInput || undefined })
      if (nvdApiKeyInput !== settings.nvdApiKey) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    }
  }

  const handleResetToDefaults = () => {
    if (confirm('Reset all settings to default values?')) {
      updateSettings({
        theme: 'system',
        fontSize: 'default',
        nvdApiKey: undefined,
        dataRetentionDays: 30,
        autoRefresh: false,
      })

      // Also delete from secure storage if available
      if (secureStorageAvailable) {
        secureKeyService.deleteApiKey('nvd')
      }

      setNvdApiKeyInput('')
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    }
  }

  const handleMigrateKeys = async () => {
    setMigrating(true)

    try {
      const result = await migrateApiKeysToSecureStorage(settings)

      if (result.success) {
        // Update settings with keys removed
        updateSettings(result.updatedSettings)
        setMigrationComplete(true)
        setNeedsMigration(false)

        // Reload the current API key input
        const newKey = await secureKeyService.getApiKey('nvd')
        setNvdApiKeyInput(newKey || '')

        setTimeout(() => setMigrationComplete(false), 3000)
      } else {
        alert(`Migration failed for ${result.failed.join(', ')} keys`)
      }
    } catch (error) {
      console.error('Migration error:', error)
      alert('Migration failed. Please try again.')
    } finally {
      setMigrating(false)
    }
  }

  // Profile handlers
  const handleCreateProfile = (name: string, description: string | undefined, profileSettings: typeof settings) => {
    try {
      createSettingsProfile(name, description, profileSettings)
    } catch (error) {
      console.error('Failed to create profile:', error)
      alert(error instanceof Error ? error.message : 'Failed to create profile')
    }
  }

  const handleDeleteProfile = (profileId: string) => {
    try {
      deleteSettingsProfile(profileId)
    } catch (error) {
      console.error('Failed to delete profile:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete profile')
    }
  }

  const handleSwitchProfile = (profileId: string) => {
    try {
      switchSettingsProfile(profileId)
      // Update local state
      const profile = settingsProfiles.find((p) => p.id === profileId)
      if (profile) {
        const key = loadApiKeyWithFallback('nvd', profile.settings.nvdApiKey)
        key.then((k) => setNvdApiKeyInput(k || ''))
      }
    } catch (error) {
      console.error('Failed to switch profile:', error)
      alert(error instanceof Error ? error.message : 'Failed to switch profile')
    }
  }

  const handleExportProfiles = () => {
    try {
      exportSettingsProfiles()
      setImportSuccess(true)
      setImportError('')
      setTimeout(() => setImportSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to export profiles:', error)
      alert(error instanceof Error ? error.message : 'Failed to export profiles')
    }
  }

  const handleImportProfiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError('')
    setImportSuccess(false)

    try {
      const result = await importSettingsProfiles(file)
      if (result.success) {
        setImportSuccess(true)
        setTimeout(() => setImportSuccess(false), 3000)
      } else {
        setImportError(result.error || 'Failed to import profiles')
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import profiles')
    }

    // Reset input
    event.target.value = ''
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold">Settings</h1>
          <div className="w-12" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Migration Notice */}
          {needsMigration && secureStorageAvailable && !migrationComplete && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                    API Key Security Migration Recommended
                  </h3>
                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                    Your API keys are currently stored in plaintext. We recommend migrating them to secure storage for
                    better security.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleMigrateKeys}
                      disabled={migrating}
                      className="flex items-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {migrating ? (
                        <>
                          <RotateCw className="h-4 w-4 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          Migrate Keys to Secure Storage
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setNeedsMigration(false)}
                      className="text-sm text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
                    >
                      Remind Me Later
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Migration Success Message */}
          {migrationComplete && (
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-green-900 dark:text-green-100">Migration Complete</h3>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Your API keys have been successfully migrated to secure storage.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Settings Profiles Section */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-3">
                <UserCircle className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">Settings Profiles</h2>
              </div>
              <button
                onClick={() => setShowCreateProfileDialog(true)}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create New Profile
              </button>
            </div>
            <div className="p-4">
              {settingsProfiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No settings profiles yet. Create your first profile to get started!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {settingsProfiles.map((profile) => (
                    <SettingsProfileCard
                      key={profile.id}
                      profile={profile}
                      isActive={profile.id === activeProfileId}
                      onSwitch={handleSwitchProfile}
                      onDelete={handleDeleteProfile}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Appearance Section */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Appearance</h2>
            </div>
            <div className="p-4 space-y-6">
              {/* Theme */}
              <div>
                <label className="mb-3 block text-sm font-medium">Theme</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => updateSettings({ theme })}
                      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                        settings.theme === theme ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <div
                        className={`h-8 w-8 rounded-full ${
                          theme === 'light'
                            ? 'bg-white border-2 border-gray-300'
                            : theme === 'dark'
                              ? 'bg-gray-900 border-2 border-gray-700'
                              : 'bg-gradient-to-r from-white to-gray-900'
                        }`}
                      />
                      <span className="text-sm capitalize">{theme}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {settings.theme === 'system'
                    ? 'Follows your system theme preference'
                    : `Always use ${settings.theme} theme`}
                </p>
              </div>

              {/* Font Size */}
              <div>
                <label className="mb-3 block text-sm font-medium">Font Size</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['small', 'default', 'large'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => updateSettings({ fontSize: size })}
                      className={`rounded-lg border-2 p-3 transition-colors ${
                        settings.fontSize === size ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <span
                        className={`block ${size === 'small' ? 'text-xs' : size === 'large' ? 'text-lg' : 'text-sm'}`}
                      >
                        Aa
                      </span>
                      <span className="text-xs capitalize">{size}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Adjust text size throughout the application</p>
              </div>
            </div>
          </div>

          {/* API Configuration Section */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Key className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">API Configuration</h2>
                {secureStorageAvailable && (
                  <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                    <Lock className="h-3 w-3" />
                    Secure
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 space-y-4">
              {/* NVD API Key */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  NVD API Key <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <input
                    type={secureStorageAvailable ? 'password' : 'text'}
                    value={nvdApiKeyInput}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    onBlur={handleApiKeyBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className={`w-full rounded-md border bg-background px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                      apiKeyError ? 'border-destructive' : 'border-border'
                    }`}
                  />
                  {saveSuccess && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">Saved</div>
                  )}
                </div>
                {apiKeyError && <p className="mt-1 text-xs text-destructive">{apiKeyError}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  Get your free API key from{' '}
                  <a
                    href="https://nvd.nist.gov/developers/request-an-api-key"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    NIST
                  </a>{' '}
                  for higher rate limits (5 requests/rolling 30 seconds instead of default)
                  {secureStorageAvailable && (
                    <span className="ml-1 text-green-600"> &bull; Stored securely using system credential manager</span>
                  )}
                </p>
              </div>

              {/* Auto Refresh */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-4">
                <div className="flex items-center gap-3">
                  <RotateCw className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Auto-refresh Vulnerability Data</div>
                    <p className="text-sm text-muted-foreground">
                      Automatically refresh vulnerability data when viewing projects
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateSettings({ autoRefresh: !settings.autoRefresh })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    settings.autoRefresh ? 'bg-primary' : 'bg-muted-foreground'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      settings.autoRefresh ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Data Management Section */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Database className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Data Management</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Import/Export Profiles */}
              <div className="rounded-lg border border-border bg-muted p-4">
                <div className="mb-3">
                  <div className="font-medium">Import/Export Settings Profiles</div>
                  <p className="text-sm text-muted-foreground">
                    Share your settings profiles across different installations
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleExportProfiles}
                    disabled={settingsProfiles.length === 0}
                    className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Export Profiles
                  </button>
                  <label className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 cursor-pointer transition-colors">
                    <Upload className="h-4 w-4" />
                    Import Profiles
                    <input type="file" accept=".json" onChange={handleImportProfiles} className="hidden" />
                  </label>
                </div>
                {importSuccess && (
                  <div className="mt-3 text-sm text-green-600">Settings profiles imported successfully!</div>
                )}
                {importError && <div className="mt-3 text-sm text-destructive">{importError}</div>}
              </div>

              {/* Data Retention */}
              <div>
                <label className="mb-2 block text-sm font-medium">Data Retention Period</label>
                <select
                  value={settings.dataRetentionDays}
                  onChange={(e) => updateSettings({ dataRetentionDays: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>6 months</option>
                  <option value={365}>1 year</option>
                  <option value={-1}>Never (keep all data)</option>
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Scan results older than specified period will be automatically deleted
                  {settings.dataRetentionDays === -1
                    ? '. Data is never deleted automatically.'
                    : ` (every ${settings.dataRetentionDays} days).`}
                </p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg border border-destructive/50 bg-destructive/5">
            <div className="border-b border-destructive/50 p-4">
              <h2 className="font-semibold text-destructive">Danger Zone</h2>
            </div>
            <div className="p-4">
              <button
                onClick={handleResetToDefaults}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
              >
                Reset All Settings to Defaults
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                This will reset all settings to their default values. Your projects and vulnerability data will not be
                affected.
              </p>
            </div>
          </div>

          {/* Version Info */}
          <div className="text-center text-sm text-muted-foreground">VulnAssessTool v0.1.0</div>
        </div>
      </main>

      {/* Create Profile Dialog */}
      <CreateProfileDialog
        open={showCreateProfileDialog}
        onClose={() => setShowCreateProfileDialog(false)}
        onCreate={handleCreateProfile}
        existingProfiles={settingsProfiles}
        currentSettings={settings}
      />
    </div>
  )
}
