import React, { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { getPlatform } from '@/lib/platform'
import { isValidNvdApiKey } from '@/lib/api/nvd'
import { getSecureKeyService } from '@/lib/storage'
import {
  Shield,
  Palette,
  Database,
  Key,
  Plus,
  Download,
  Upload,
  UserCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  RefreshCw,
  Settings2,
  Gauge,
  HardDrive,
  Clock,
  AlertTriangle,
  Zap,
  Archive,
  RotateCcw,
  Save,
  History,
  RotateCw,
} from 'lucide-react'
import {
  SYNC_SCHEDULE_OPTIONS,
  SEARCH_RESULT_LIMIT_OPTIONS,
  CACHE_SIZE_OPTIONS,
  DATABASE_SIZE_OPTIONS,
  PRUNE_YEAR_OPTIONS,
  DEFAULT_DATABASE_SETTINGS,
} from '@@/constants'
import type { SyncSchedule, DatabaseStorageSettings, DatabasePerformanceSettings } from '@@/types'
import { SettingsProfileCard } from '@/components/SettingsProfileCard'
import { CreateProfileDialog } from '@/components/CreateProfileDialog'
import { AppHeader } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              {cancelLabel}
            </Button>
            <Button
              variant={variant === 'danger' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={isLoading}
              className={variant === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const SECTIONS = [
  { id: 'profiles', label: 'Profiles', icon: UserCircle },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'api', label: 'API Configuration', icon: Key },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'backup', label: 'Backup & Recovery', icon: Archive },
  { id: 'intelligence', label: 'Intelligence', icon: AlertTriangle },
] as const

type SectionId = (typeof SECTIONS)[number]['id'] | 'danger'

export function Settings() {
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

  const [nvdApiKeyInput, setNvdApiKeyInput] = useState('')
  const [isApiKeyAvailable, setIsApiKeyAvailable] = useState(false)
  const [apiKeyError, setApiKeyError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isLoadingKey, setIsLoadingKey] = useState(true)
  const [isSavingKey, setIsSavingKey] = useState(false)

  const secureKeyService = getSecureKeyService()

  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)

  const [syncSchedule, setSyncSchedule] = useState<SyncSchedule>(DEFAULT_DATABASE_SETTINGS.syncSchedule)
  const [storageSettings, setStorageSettings] = useState<DatabaseStorageSettings>(DEFAULT_DATABASE_SETTINGS.storage)
  const [performanceSettings, setPerformanceSettings] = useState<DatabasePerformanceSettings>(
    DEFAULT_DATABASE_SETTINGS.performance,
  )
  const [databaseSize, setDatabaseSize] = useState<number>(0)
  const [cveCount, setCveCount] = useState<number>(0)
  const [cpeCount, setCpeCount] = useState<number>(0)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showRebuildDialog, setShowRebuildDialog] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isRebuilding, setIsRebuilding] = useState(false)

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{
    lastSyncAt?: string
    cvesAdded?: number
    cvesUpdated?: number
  } | null>(null)

  const [backups, setBackups] = useState<
    Array<{
      id: string
      timestamp: string
      size: number
      integrity: 'valid' | 'invalid' | 'unknown'
    }>
  >([])
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [isRestoringBackup, setIsRestoringBackup] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null)
  const [backupConfig, setBackupConfig] = useState<{
    enabled: boolean
    schedule: string
    retentionCount: number
  }>({
    enabled: false,
    schedule: 'manual',
    retentionCount: 3,
  })

  const [_cacheStats, setCacheStats] = useState<{
    hits: number
    misses: number
    entryCount: number
    sizeBytes: number
    hitRate: number
  } | null>(null)

  const [kevStats, setKevStats] = useState<{
    total: number
    ransomwareRelated: number
    lastUpdated: string | null
  } | null>(null)
  const [isSyncingKev, setIsSyncingKev] = useState(false)
  const [kevSyncError, setKevSyncError] = useState<string | null>(null)
  const [kevSyncSuccess, setKevSyncSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadSettingsProfiles()
  }, [])

  useEffect(() => {
    const loadApiKey = async () => {
      setIsLoadingKey(true)
      try {
        const available = await secureKeyService.isAvailable()
        setIsApiKeyAvailable(available)

        if (available) {
          const apiKey = await secureKeyService.getApiKey('nvd')
          setNvdApiKeyInput(apiKey || '')
        }
      } catch (error) {
        console.error('Failed to load API key:', error)
      } finally {
        setIsLoadingKey(false)
      }
    }

    loadApiKey()
  }, [])

  useEffect(() => {
    const loadDatabaseSettings = async () => {
      console.log('[Settings] Loading database settings...')
      try {
        const statsResponse = await getPlatform().database.getStats()
        console.log('[Settings] Stats response:', statsResponse)
        if (statsResponse.success && statsResponse.stats) {
          const stats = statsResponse.stats
          setDatabaseSize(stats.dbSize || 0)
          setCveCount(stats.totalCves || 0)
          setLastSyncAt(stats.lastUpdate || null)
          console.log('[Settings] Loaded stats - CVEs:', stats.totalCves, 'Size:', stats.dbSize)
        } else {
          console.error('[Settings] Failed to load stats:', statsResponse.error)
        }

        try {
          const cpeResponse = await getPlatform().database.cpeSearch({ productName: '' })
          if (cpeResponse.success) {
            setCpeCount(cpeResponse.results.length)
            console.log('[Settings] CPE count:', cpeResponse.results.length)
          }
        } catch (err) {
          console.log('[Settings] CPE count not available:', err)
        }

        const configResponse = await getPlatform().database.getSyncConfig()
        if (configResponse.success && configResponse.config) {
          if (configResponse.config.syncInterval) {
            setSyncSchedule(configResponse.config.syncInterval as SyncSchedule)
          }
        }
      } catch (error) {
        console.error('[Settings] Failed to load database settings:', error)
      }
    }

    loadDatabaseSettings()
  }, [])

  useEffect(() => {
    const loadBackupData = async () => {
      try {
        await getPlatform().backup.initialize()

        const listResponse = await getPlatform().backup.listBackups()
        if (listResponse.success && listResponse.backups) {
          setBackups(
            listResponse.backups.map((b) => ({
              id: b.id,
              timestamp: b.createdAt,
              size: b.size,
              integrity: b.verified ? 'valid' : 'unknown',
            })),
          )
        }

        const configResponse = await getPlatform().backup.getConfig()
        if (configResponse.success && configResponse.config) {
          setBackupConfig({
            enabled: configResponse.config.enabled ?? false,
            schedule: configResponse.config.schedule ?? 'manual',
            retentionCount: configResponse.config.maxBackups ?? 3,
          })
        }
      } catch (error) {
        console.error('[Settings] Failed to load backup data:', error)
      }
    }

    loadBackupData()
  }, [])

  useEffect(() => {
    const loadKevStats = async () => {
      try {
        const response = await getPlatform().intelligence.getKevStats()
        if (response.success) {
          setKevStats(response.stats)
        }
      } catch (error) {
        console.error('Failed to load KEV stats:', error)
      }
    }
    loadKevStats()
  }, [])

  const handleSyncKev = async () => {
    setIsSyncingKev(true)
    setKevSyncError(null)
    setKevSyncSuccess(null)
    try {
      const response = await getPlatform().intelligence.syncKev()
      if (response.success && response.result) {
        setKevSyncSuccess(
          `KEV catalog synced: ${response.result.added} added, ${response.result.removed} removed, ${response.result.total} total`,
        )
        const statsResponse = await getPlatform().intelligence.getKevStats()
        if (statsResponse.success) {
          setKevStats(statsResponse.stats)
        }
        setTimeout(() => setKevSyncSuccess(null), 5000)
      } else {
        setKevSyncError(response.error || 'Failed to sync KEV catalog')
      }
    } catch {
      setKevSyncError('Failed to sync KEV catalog')
    } finally {
      setIsSyncingKev(false)
    }
  }

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true)
    setBackupError(null)
    setBackupSuccess(null)

    try {
      const response = await getPlatform().backup.createBackup()
      if (response.success && response.backup) {
        const newBackup = response.backup
        setBackupSuccess('Backup created successfully')
        setBackups((prev) => [
          {
            id: newBackup.id,
            timestamp: newBackup.createdAt,
            size: newBackup.size,
            integrity: newBackup.verified ? 'valid' : 'unknown',
          },
          ...prev,
        ])
        setTimeout(() => setBackupSuccess(null), 3000)
      } else {
        setBackupError(response.error || 'Failed to create backup')
      }
    } catch (error) {
      console.error('[Settings] Failed to create backup:', error)
      setBackupError('Failed to create backup')
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const handleRestoreBackup = async (backupId: string) => {
    setIsRestoringBackup(true)
    setBackupError(null)
    setShowRestoreDialog(false)

    try {
      const response = await getPlatform().backup.restoreBackup(backupId)
      if (response.success) {
        setBackupSuccess('Database restored successfully. Reloading...')
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        setBackupError(response.error || 'Failed to restore backup')
      }
    } catch (error) {
      console.error('[Settings] Failed to restore backup:', error)
      setBackupError('Failed to restore backup')
    } finally {
      setIsRestoringBackup(false)
      setSelectedBackupId(null)
    }
  }

  const handleDeleteBackup = async (backupId: string) => {
    try {
      const response = await getPlatform().backup.deleteBackup(backupId)
      if (response.success) {
        setBackups((prev) => prev.filter((b) => b.id !== backupId))
        setBackupSuccess('Backup deleted')
        setTimeout(() => setBackupSuccess(null), 2000)
      } else {
        setBackupError(response.error || 'Failed to delete backup')
      }
    } catch (error) {
      console.error('[Settings] Failed to delete backup:', error)
      setBackupError('Failed to delete backup')
    }
  }

  const handleVerifyBackup = async (backupId: string) => {
    try {
      const response = await getPlatform().backup.verifyBackup(backupId)
      if (response.success) {
        setBackups((prev) =>
          prev.map((b) => (b.id === backupId ? { ...b, integrity: response.integrity || 'unknown' } : b)),
        )
      }
    } catch (error) {
      console.error('[Settings] Failed to verify backup:', error)
    }
  }

  const formatBackupSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const handleApiKeyChange = (value: string) => {
    setNvdApiKeyInput(value)
    setApiKeyError('')
    setSaveSuccess(false)

    if (value && !isValidNvdApiKey(value)) {
      setApiKeyError('Invalid API key format. Expected UUID format.')
    }
  }

  const handleApiKeyBlur = async () => {
    if (apiKeyError) {
      const apiKey = await secureKeyService.getApiKey('nvd')
      setNvdApiKeyInput(apiKey || '')
      setApiKeyError('')
      return
    }

    setIsSavingKey(true)
    try {
      const success = await secureKeyService.setApiKey('nvd', nvdApiKeyInput || '')

      if (success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        setApiKeyError('Failed to save API key to secure storage')
      }
    } catch (error) {
      console.error('Failed to save API key:', error)
      setApiKeyError('Failed to save API key')
    } finally {
      setIsSavingKey(false)
    }
  }

  const handleDeleteApiKey = async () => {
    setIsSavingKey(true)
    try {
      const success = await secureKeyService.deleteApiKey('nvd')
      if (success) {
        setNvdApiKeyInput('')
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        setApiKeyError('Failed to delete API key')
      }
    } catch (error) {
      console.error('Failed to delete API key:', error)
      setApiKeyError('Failed to delete API key')
    } finally {
      setIsSavingKey(false)
    }
  }

  const handleResetToDefaults = () => {
    if (confirm('Reset all settings to default values?')) {
      updateSettings({
        theme: 'system',
        fontSize: 'default',
        dataRetentionDays: 30,
        autoRefresh: false,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    }
  }

  const handleSyncScheduleChange = async (value: SyncSchedule) => {
    setSyncSchedule(value)
    try {
      await getPlatform().database.updateSyncConfig({ syncInterval: value })
    } catch (error) {
      console.error('Failed to update sync schedule:', error)
    }
  }

  const handleStorageSettingChange = async (key: keyof DatabaseStorageSettings, value: number | boolean) => {
    const newSettings = { ...storageSettings, [key]: value }
    setStorageSettings(newSettings)
    try {
      await getPlatform().database.updateStorageConfig(newSettings)
    } catch (error) {
      console.error('Failed to update storage settings:', error)
    }
  }

  const handlePerformanceSettingChange = async (key: keyof DatabasePerformanceSettings, value: number | boolean) => {
    const newSettings = { ...performanceSettings, [key]: value }
    setPerformanceSettings(newSettings)
    try {
      await getPlatform().database.updatePerformanceConfig(newSettings)
    } catch (error) {
      console.error('Failed to update performance settings:', error)
    }
  }

  const loadCacheStats = async () => {
    try {
      const stats = await getPlatform().database.getCacheStats?.()
      if (stats && stats.success && stats.stats) {
        const cacheInfo = stats.stats
        setCacheStats({
          hits: 0,
          misses: 0,
          entryCount: cacheInfo.entries,
          sizeBytes: cacheInfo.totalSizeKB * 1024,
          hitRate: cacheInfo.hitRate,
        })
      }
    } catch (error) {
      console.error('Failed to load cache stats:', error)
    }
  }

  useEffect(() => {
    if (performanceSettings.enableSearchCache) {
      loadCacheStats()
    }
  }, [performanceSettings.enableSearchCache])

  const handleResetDatabase = async () => {
    setIsResetting(true)
    try {
      const result = await getPlatform().database.resetDatabase()
      if (result.success) {
        setDatabaseSize(0)
        setShowResetDialog(false)
      } else {
        console.error('Failed to reset database:', result.error)
      }
    } catch (error) {
      console.error('Failed to reset database:', error)
    } finally {
      setIsResetting(false)
    }
  }

  const handleRebuildIndexes = async () => {
    setIsRebuilding(true)
    console.log('[Settings] Starting rebuild indexes...')
    try {
      const result = await getPlatform().database.rebuildIndexes()
      console.log('[Settings] Rebuild indexes result:', result)
      if (result.success) {
        setShowRebuildDialog(false)
        const statsResponse = await getPlatform().database.getStats()
        if (statsResponse.success && statsResponse.stats) {
          setDatabaseSize(statsResponse.stats.dbSize || 0)
          setCveCount(statsResponse.stats.totalCves || 0)
        }
      } else {
        console.error('[Settings] Failed to rebuild indexes:', result.error)
        if (result.error?.includes('fts5') || result.error?.includes('FTS5')) {
          setApiKeyError(
            'Full-text search indexing is not available (sql.js does not include FTS5 module). Basic search will still work.',
          )
        } else {
          setApiKeyError(result.error || 'Failed to rebuild indexes')
        }
      }
    } catch (error) {
      console.error('[Settings] Failed to rebuild indexes:', error)
      setApiKeyError(error instanceof Error ? error.message : 'Failed to rebuild indexes')
    } finally {
      setIsRebuilding(false)
    }
  }

  const handleSyncNow = async () => {
    setIsSyncing(true)
    setSyncStatus(null)
    console.log('[Settings] Starting delta sync...')
    try {
      const result = await getPlatform().database.startDeltaSync(false)
      console.log('[Settings] Delta sync result:', result)
      if (result.success) {
        setSyncStatus({
          lastSyncAt: new Date().toISOString(),
          cvesAdded: result.cvesAdded || 0,
          cvesUpdated: result.cvesUpdated || 0,
        })
        const statsResponse = await getPlatform().database.getStats()
        console.log('[Settings] Stats after sync:', statsResponse)
        if (statsResponse.success && statsResponse.stats) {
          setDatabaseSize(statsResponse.stats.dbSize || 0)
          setCveCount(statsResponse.stats.totalCves || 0)
        }
      } else {
        console.error('[Settings] Sync failed:', result.errors)
        setApiKeyError(result.errors?.join(', ') || 'Sync failed')
      }
    } catch (error) {
      console.error('[Settings] Failed to start sync:', error)
      setApiKeyError(error instanceof Error ? error.message : 'Failed to start sync')
    } finally {
      setIsSyncing(false)
    }
  }

  const [isBulkDownloading, setIsBulkDownloading] = useState(false)

  const handleBulkDownload = async () => {
    setIsBulkDownloading(true)
    setSyncStatus(null)
    setApiKeyError('')
    console.log('[Settings] Starting bulk download...')
    try {
      const currentYear = new Date().getFullYear()
      const result = await getPlatform().database.startBulkDownload({
        startYear: currentYear - 2,
        endYear: currentYear,
      })
      console.log('[Settings] Bulk download result:', result)
      if (result.success) {
        setSyncStatus({
          lastSyncAt: new Date().toISOString(),
          cvesAdded: result.totalCves || 0,
          cvesUpdated: 0,
        })
        const statsResponse = await getPlatform().database.getStats()
        console.log('[Settings] Stats after bulk download:', statsResponse)
        if (statsResponse.success && statsResponse.stats) {
          setDatabaseSize(statsResponse.stats.dbSize || 0)
          setCveCount(statsResponse.stats.totalCves || 0)
        }
      } else {
        console.error('[Settings] Bulk download failed:', result.errors)
        setApiKeyError(result.errors.join(', ') || 'Bulk download failed')
      }
    } catch (error) {
      console.error('[Settings] Failed to start bulk download:', error)
      setApiKeyError(error instanceof Error ? error.message : 'Failed to start bulk download')
    } finally {
      setIsBulkDownloading(false)
    }
  }

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

    event.target.value = ''
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const [activeSection, setActiveSection] = useState<SectionId>('profiles')

  return (
    <div className="flex h-full flex-col">
      <AppHeader title="Settings" />

      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/30">
          <div className="flex-1 space-y-1 p-3">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                  activeSection === section.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                )}
              >
                <section.icon className="h-4 w-4 shrink-0" />
                {section.label}
              </button>
            ))}

            <Separator className="my-3" />

            <button
              onClick={() => setActiveSection('danger')}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                activeSection === 'danger'
                  ? 'bg-destructive/10 text-destructive'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-destructive',
              )}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Danger Zone
            </button>
          </div>

          <div className="border-t border-border p-3">
            <p className="px-3 text-xs text-muted-foreground">D-Fence v0.1.0</p>
          </div>
        </nav>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            {activeSection === 'profiles' && (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <UserCircle className="h-5 w-5 text-muted-foreground" />
                          Settings Profiles
                        </CardTitle>
                        <CardDescription>
                          Create and manage configuration profiles for different workflows
                        </CardDescription>
                      </div>
                      <Button size="sm" onClick={() => setShowCreateProfileDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Profile
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {settingsProfiles.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <UserCircle className="mb-3 h-12 w-12 opacity-40" />
                        <p className="text-sm">No settings profiles yet. Create your first profile to get started.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-muted-foreground" />
                      Import & Export
                    </CardTitle>
                    <CardDescription>Share settings profiles across different installations</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={handleExportProfiles} disabled={settingsProfiles.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Export Profiles
                      </Button>
                      <Button variant="outline" asChild>
                        <label className="cursor-pointer">
                          <Upload className="mr-2 h-4 w-4" />
                          Import Profiles
                          <input type="file" accept=".json" onChange={handleImportProfiles} className="hidden" />
                        </label>
                      </Button>
                    </div>
                    {importSuccess && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Settings profiles imported successfully!
                      </div>
                    )}
                    {importError && (
                      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        <XCircle className="h-4 w-4 shrink-0" />
                        {importError}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'appearance' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5 text-muted-foreground" />
                      Theme
                    </CardTitle>
                    <CardDescription>Choose how D-Fence looks on your system</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      {(['light', 'dark', 'system'] as const).map((theme) => (
                        <button
                          key={theme}
                          onClick={() => updateSettings({ theme })}
                          className={cn(
                            'flex flex-col items-center gap-3 rounded-lg border-2 p-5 transition-colors',
                            settings.theme === theme
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50',
                          )}
                        >
                          <div
                            className={cn(
                              'h-10 w-10 rounded-full border-2',
                              theme === 'light' && 'border-gray-300 bg-white',
                              theme === 'dark' && 'border-gray-700 bg-gray-900',
                              theme === 'system' && 'bg-gradient-to-br from-white to-gray-900 border-gray-400',
                            )}
                          />
                          <span className="text-sm font-medium capitalize">{theme}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      {settings.theme === 'system'
                        ? 'Follows your operating system theme preference'
                        : `Always use ${settings.theme} theme`}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Font Size</CardTitle>
                    <CardDescription>Adjust the text size throughout the application</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      {(['small', 'default', 'large'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => updateSettings({ fontSize: size })}
                          className={cn(
                            'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
                            settings.fontSize === size
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50',
                          )}
                        >
                          <span
                            className={cn(
                              'block',
                              size === 'small' && 'text-xs',
                              size === 'default' && 'text-sm',
                              size === 'large' && 'text-lg',
                            )}
                          >
                            Aa
                          </span>
                          <span className="text-xs capitalize">{size}</span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'api' && (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Key className="h-5 w-5 text-muted-foreground" />
                          NVD API Key
                        </CardTitle>
                        <CardDescription>Configure your NIST NVD API key for higher rate limits</CardDescription>
                      </div>
                      {isApiKeyAvailable ? (
                        <Badge variant="secondary" className="gap-1.5 text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Secure Storage
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1.5 text-yellow-600">
                          <XCircle className="h-3 w-3" />
                          Insecure
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isLoadingKey ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading API key from secure storage...
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          id="nvd-api-key"
                          type="text"
                          value={nvdApiKeyInput}
                          onChange={(e) => handleApiKeyChange(e.target.value)}
                          onBlur={handleApiKeyBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }}
                          disabled={!isApiKeyAvailable || isSavingKey}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          aria-label="NVD API Key"
                          className={cn('pr-20', apiKeyError && 'border-destructive')}
                        />
                        {isSavingKey && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {saveSuccess && !isSavingKey && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">Saved</div>
                        )}
                      </div>
                    )}

                    {apiKeyError && <p className="text-xs text-destructive">{apiKeyError}</p>}

                    <div className="flex items-start justify-between gap-4">
                      <p className="text-xs text-muted-foreground">
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
                      </p>
                      {nvdApiKeyInput && isApiKeyAvailable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDeleteApiKey}
                          disabled={isSavingKey}
                          className="shrink-0 text-destructive hover:text-destructive"
                        >
                          Delete Key
                        </Button>
                      )}
                    </div>

                    {!isApiKeyAvailable && (
                      <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-600">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Secure storage is not available. API keys will be stored in localStorage (less secure).
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RotateCw className="h-5 w-5 text-muted-foreground" />
                      Auto-Refresh
                    </CardTitle>
                    <CardDescription>Automatically refresh vulnerability data when viewing projects</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="auto-refresh" className="cursor-pointer">
                        Enable auto-refresh
                      </Label>
                      <Switch
                        id="auto-refresh"
                        checked={settings.autoRefresh}
                        onCheckedChange={(checked) => updateSettings({ autoRefresh: checked })}
                        aria-label="Toggle auto-refresh vulnerability data"
                      />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'database' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-muted-foreground" />
                      Database Overview
                    </CardTitle>
                    <CardDescription>Current state of your local vulnerability database</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                        <div className="rounded-lg bg-red-500/10 p-2">
                          <Shield className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Total CVEs</div>
                          <div className="text-lg font-semibold">{cveCount.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                        <div className="rounded-lg bg-blue-500/10 p-2">
                          <Database className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">CPE Matches</div>
                          <div className="text-lg font-semibold">{cpeCount.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                        <div className="rounded-lg bg-green-500/10 p-2">
                          <HardDrive className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Database Size</div>
                          <div className="text-lg font-semibold">{formatBytes(databaseSize)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                        <div className="rounded-lg bg-purple-500/10 p-2">
                          <Clock className="h-5 w-5 text-purple-500" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Last Sync</div>
                          <div className="text-sm font-medium">
                            {lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isBulkDownloading && (
                      <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                        <div className="mb-3 flex items-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          <div>
                            <div className="font-medium text-blue-600">Downloading CVE Data</div>
                            <div className="text-sm text-muted-foreground">
                              Fetching vulnerability data from NVD API...
                            </div>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div className="h-2 animate-pulse rounded-full bg-blue-500" style={{ width: '60%' }} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          This may take several minutes. Please wait...
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 text-muted-foreground" />
                      Synchronization
                    </CardTitle>
                    <CardDescription>Configure how vulnerability data is synced from NVD</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="sync-schedule">Sync Schedule</Label>
                      <Select
                        value={syncSchedule}
                        onValueChange={(val) => handleSyncScheduleChange(val as SyncSchedule)}
                      >
                        <SelectTrigger id="sync-schedule">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYNC_SCHEDULE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {SYNC_SCHEDULE_OPTIONS.find((o) => o.value === syncSchedule)?.description}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button onClick={handleSyncNow} disabled={isSyncing || isBulkDownloading}>
                        {isSyncing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Sync Now
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleBulkDownload}
                        disabled={isSyncing || isBulkDownloading}
                        title="Download CVE data from NIST feeds (requires NVD API key)"
                      >
                        {isBulkDownloading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Bulk Download
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>
                        Bulk Download requires an NVD API key. Add your key in API Configuration or set the NVD_API_KEY
                        environment variable.
                      </span>
                    </div>

                    {syncStatus && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Last sync:</span>{' '}
                        {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'Never'}
                        {syncStatus.cvesAdded !== undefined && syncStatus.cvesAdded > 0 && (
                          <span className="ml-2 text-green-600">+{syncStatus.cvesAdded} CVEs</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive className="h-5 w-5 text-muted-foreground" />
                      Storage Management
                    </CardTitle>
                    <CardDescription>Control database size and data retention</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="max-database-size">Maximum Database Size</Label>
                      <Select
                        value={String(storageSettings.maxSizeMB)}
                        onValueChange={(val) => handleStorageSettingChange('maxSizeMB', Number(val))}
                      >
                        <SelectTrigger id="max-database-size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATABASE_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Database will be pruned when it exceeds this limit
                      </p>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Trash2 className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <Label htmlFor="prune-old-cves" className="cursor-pointer">
                            Prune Old CVEs
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Remove CVEs older than a specified year to save space
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="prune-old-cves"
                        checked={storageSettings.pruneOldCves}
                        onCheckedChange={(checked) => handleStorageSettingChange('pruneOldCves', checked)}
                        aria-label="Toggle prune old CVEs"
                      />
                    </div>

                    {storageSettings.pruneOldCves && (
                      <div className="space-y-2">
                        <Label htmlFor="prune-year">Keep CVEs From</Label>
                        <Select
                          value={String(storageSettings.pruneOlderThanYear)}
                          onValueChange={(val) => handleStorageSettingChange('pruneOlderThanYear', Number(val))}
                        >
                          <SelectTrigger id="prune-year">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRUNE_YEAR_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gauge className="h-5 w-5 text-muted-foreground" />
                      Performance
                    </CardTitle>
                    <CardDescription>Fine-tune search performance and caching</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="search-result-limit">Search Result Limit</Label>
                      <Select
                        value={String(performanceSettings.searchResultLimit)}
                        onValueChange={(val) => handlePerformanceSettingChange('searchResultLimit', Number(val))}
                      >
                        <SelectTrigger id="search-result-limit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEARCH_RESULT_LIMIT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Maximum number of results returned from vulnerability searches
                      </p>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Zap className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <Label htmlFor="enable-search-cache" className="cursor-pointer">
                            Enable Search Cache
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Cache search results for faster repeated queries
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="enable-search-cache"
                        checked={performanceSettings.enableSearchCache}
                        onCheckedChange={(checked) => handlePerformanceSettingChange('enableSearchCache', checked)}
                        aria-label="Toggle search cache"
                      />
                    </div>

                    {performanceSettings.enableSearchCache && (
                      <div className="space-y-2">
                        <Label htmlFor="cache-size">Cache Size</Label>
                        <Select
                          value={String(performanceSettings.cacheSizeMB)}
                          onValueChange={(val) => handlePerformanceSettingChange('cacheSizeMB', Number(val))}
                        >
                          <SelectTrigger id="cache-size">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CACHE_SIZE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Maximum memory allocated for search result caching
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Data Retention</CardTitle>
                    <CardDescription>Control how long scan results are kept</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Label htmlFor="data-retention">Retention Period</Label>
                    <Select
                      value={String(settings.dataRetentionDays)}
                      onValueChange={(val) => updateSettings({ dataRetentionDays: Number(val) })}
                    >
                      <SelectTrigger id="data-retention">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="180">6 months</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                        <SelectItem value="-1">Never (keep all data)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Scan results older than the specified period will be automatically deleted
                      {settings.dataRetentionDays === -1
                        ? '. Data is never deleted automatically.'
                        : ` (every ${settings.dataRetentionDays} days).`}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Maintenance</CardTitle>
                    <CardDescription>Database maintenance and recovery operations</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowRebuildDialog(true)}
                      className="w-full justify-start"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Rebuild Indexes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowResetDialog(true)}
                      className="w-full justify-start border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Reset Database
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'backup' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Save className="h-5 w-5 text-muted-foreground" />
                      Create Backup
                    </CardTitle>
                    <CardDescription>Create a snapshot of your current database</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {backupError && (
                      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        <XCircle className="h-4 w-4 shrink-0" />
                        {backupError}
                      </div>
                    )}
                    {backupSuccess && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        {backupSuccess}
                      </div>
                    )}

                    <Button onClick={handleCreateBackup} disabled={isCreatingBackup}>
                      {isCreatingBackup ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Create Backup
                        </>
                      )}
                    </Button>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="backup-retention">Retention Policy</Label>
                      </div>
                      <Select
                        value={String(backupConfig.retentionCount)}
                        onValueChange={async (val) => {
                          const newCount = Number(val)
                          setBackupConfig((prev) => ({ ...prev, retentionCount: newCount }))
                          await getPlatform().backup.updateConfig({ maxBackups: newCount })
                        }}
                      >
                        <SelectTrigger id="backup-retention">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 backup</SelectItem>
                          <SelectItem value="3">3 backups</SelectItem>
                          <SelectItem value="5">5 backups</SelectItem>
                          <SelectItem value="10">10 backups</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Older backups will be automatically deleted when limit is reached
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-muted-foreground" />
                      Available Backups
                      <Badge variant="secondary" className="ml-2">
                        {backups.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {backups.length === 0 ? (
                      <div className="rounded-lg bg-muted p-8 text-center text-sm text-muted-foreground">
                        No backups available. Create your first backup to protect your data.
                      </div>
                    ) : (
                      <div className="max-h-[400px] space-y-2 overflow-y-auto">
                        {backups.map((backup) => (
                          <div
                            key={backup.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'rounded-lg p-2',
                                  backup.integrity === 'valid' && 'bg-green-500/10',
                                  backup.integrity === 'invalid' && 'bg-red-500/10',
                                  backup.integrity === 'unknown' && 'bg-muted-foreground/10',
                                )}
                              >
                                <Archive
                                  className={cn(
                                    'h-4 w-4',
                                    backup.integrity === 'valid' && 'text-green-500',
                                    backup.integrity === 'invalid' && 'text-red-500',
                                    backup.integrity === 'unknown' && 'text-muted-foreground',
                                  )}
                                />
                              </div>
                              <div>
                                <div className="text-sm font-medium">{new Date(backup.timestamp).toLocaleString()}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatBackupSize(backup.size)}
                                  {backup.integrity === 'valid' && ' \u2022 Verified'}
                                  {backup.integrity === 'invalid' && ' \u2022 Corrupted'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleVerifyBackup(backup.id)}
                                aria-label="Verify backup integrity"
                                title="Verify integrity"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedBackupId(backup.id)
                                  setShowRestoreDialog(true)
                                }}
                                disabled={backup.integrity === 'invalid'}
                                aria-label="Restore backup"
                                title="Restore backup"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteBackup(backup.id)}
                                aria-label="Delete backup"
                                title="Delete backup"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'intelligence' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                      CISA Known Exploited Vulnerabilities
                    </CardTitle>
                    <CardDescription>Manage the CISA KEV catalog used for vulnerability prioritization</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {kevSyncError && (
                      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        <XCircle className="h-4 w-4 shrink-0" />
                        {kevSyncError}
                      </div>
                    )}
                    {kevSyncSuccess && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        {kevSyncSuccess}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                        <div className="rounded-lg bg-red-500/10 p-2">
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">KEV Entries</div>
                          <div className="text-lg font-semibold">{kevStats?.total ?? 0}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                        <div className="rounded-lg bg-orange-500/10 p-2">
                          <Shield className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Ransomware</div>
                          <div className="text-lg font-semibold">{kevStats?.ransomwareRelated ?? 0}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                        <div className="rounded-lg bg-purple-500/10 p-2">
                          <Clock className="h-5 w-5 text-purple-500" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Last Updated</div>
                          <div className="text-sm font-medium">
                            {kevStats?.lastUpdated ? new Date(kevStats.lastUpdated).toLocaleDateString() : 'Never'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
                      <div className="flex items-center gap-3">
                        <RefreshCw className={cn('h-5 w-5 text-muted-foreground', isSyncingKev && 'animate-spin')} />
                        <div>
                          <div className="font-medium">Sync KEV Catalog</div>
                          <p className="text-sm text-muted-foreground">
                            Download latest CISA Known Exploited Vulnerabilities catalog
                          </p>
                        </div>
                      </div>
                      <Button onClick={handleSyncKev} disabled={isSyncingKev}>
                        {isSyncingKev ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Sync Now
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground">
                        The <strong>CISA KEV Catalog</strong> contains vulnerabilities that have been actively exploited
                        in the wild. EPSS scores predict the likelihood of exploitation based on threat intelligence.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'danger' && (
              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive">Danger Zone</CardTitle>
                  <CardDescription>Irreversible and destructive actions. Proceed with caution.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <div className="font-medium">Reset All Settings</div>
                      <p className="text-sm text-muted-foreground">
                        Reset all settings to their default values. Projects and vulnerability data will not be
                        affected.
                      </p>
                    </div>
                    <Button variant="destructive" onClick={handleResetToDefaults}>
                      Reset to Defaults
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>

      <CreateProfileDialog
        open={showCreateProfileDialog}
        onClose={() => setShowCreateProfileDialog(false)}
        onCreate={handleCreateProfile}
        existingProfiles={settingsProfiles}
        currentSettings={settings}
      />

      <ConfirmDialog
        open={showResetDialog}
        title="Reset Database"
        message="This will delete all CVE data from the local database. You will need to re-sync the database after resetting. This action cannot be undone."
        confirmLabel="Reset Database"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleResetDatabase}
        onCancel={() => setShowResetDialog(false)}
        isLoading={isResetting}
      />

      <ConfirmDialog
        open={showRebuildDialog}
        title="Rebuild Indexes"
        message="This will rebuild all database indexes. The operation may take a few minutes depending on the database size. Search functionality may be temporarily slower during the rebuild."
        confirmLabel="Rebuild Indexes"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleRebuildIndexes}
        onCancel={() => setShowRebuildDialog(false)}
        isLoading={isRebuilding}
      />

      <ConfirmDialog
        open={showRestoreDialog}
        title="Restore Backup"
        message="This will replace your current database with the selected backup. Any changes made since the backup was created will be lost. The application will reload after restoration."
        confirmLabel="Restore Backup"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => selectedBackupId && handleRestoreBackup(selectedBackupId)}
        onCancel={() => {
          setShowRestoreDialog(false)
          setSelectedBackupId(null)
        }}
        isLoading={isRestoringBackup}
      />
    </div>
  )
}
