import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '@/store/useStore'
import { getPlatform } from '@/lib/platform'
import { isValidNvdApiKey } from '@/lib/api/nvd'
import { getSecureKeyService } from '@/lib/storage'
import {
  Shield,
  FileText,
  Database,
  RotateCw,
  Key,
  Download,
  Upload,
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
} from 'lucide-react'
// CACHE_TTL_OPTIONS removed - unused
import {
  SYNC_SCHEDULE_OPTIONS,
  SEARCH_RESULT_LIMIT_OPTIONS,
  CACHE_SIZE_OPTIONS,
  DATABASE_SIZE_OPTIONS,
  PRUNE_YEAR_OPTIONS,
  DEFAULT_DATABASE_SETTINGS,
  AUTO_REFRESH_INTERVAL_OPTIONS,
} from '@@/constants'
import type { SyncSchedule, DatabaseStorageSettings, DatabasePerformanceSettings } from '@@/types'
import { PageHeader } from '@/components/PageHeader'
import { SettingsNav } from './settings/SettingsNav'
import { ProfilesSection } from './settings/ProfilesSection'
import { AppearanceSection } from './settings/AppearanceSection'
import { NotificationsSection } from './settings/NotificationsSection'
import { CvssSection } from './settings/CvssSection'
// DatabaseStatus removed - unused

/**
 * Confirmation Dialog Component
 */
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

  const variantStyles = {
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${variantStyles[variant]}`}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Settings() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings, settingsProfiles, exportSettingsProfiles, importSettingsProfiles } = useStore()

  // Local state for API key management (using secure storage)
  const [nvdApiKeyInput, setNvdApiKeyInput] = useState('')
  const [isApiKeyAvailable, setIsApiKeyAvailable] = useState(false)
  const [apiKeyError, setApiKeyError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isLoadingKey, setIsLoadingKey] = useState(true)
  const [isSavingKey, setIsSavingKey] = useState(false)

  // Initialize secure key service
  const secureKeyService = getSecureKeyService()

  // Profile import/export state
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)

  // Database settings state
  const [syncSchedule, setSyncSchedule] = useState<SyncSchedule>(DEFAULT_DATABASE_SETTINGS.syncSchedule)
  const [storageSettings, setStorageSettings] = useState<DatabaseStorageSettings>(DEFAULT_DATABASE_SETTINGS.storage)
  const [performanceSettings, setPerformanceSettings] = useState<DatabasePerformanceSettings>(
    DEFAULT_DATABASE_SETTINGS.performance,
  )
  const [databaseSize, setDatabaseSize] = useState<number>(0)
  const [cveCount, setCveCount] = useState<number>(0)
  const [cpeCount, setCpeCount] = useState<number>(0)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [bandwidthLimit, setBandwidthLimit] = useState<number>(0)
  const [dbPath, setDbPath] = useState<string | null>(null)

  // Confirmation dialogs state
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showRebuildDialog, setShowRebuildDialog] = useState(false)
  const [showResetSettingsDialog, setShowResetSettingsDialog] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isRebuilding, setIsRebuilding] = useState(false)

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{
    lastSyncAt?: string
    cvesAdded?: number
    cvesUpdated?: number
  } | null>(null)

  // Backup state
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

  // Cache statistics state
  const [_cacheStats, setCacheStats] = useState<{
    hits: number
    misses: number
    entryCount: number
    sizeBytes: number
    hitRate: number
  } | null>(null)

  // Intelligence (KEV/EPSS) state
  const [kevStats, setKevStats] = useState<{
    total: number
    ransomwareRelated: number
    lastUpdated: string | null
  } | null>(null)
  const [isSyncingKev, setIsSyncingKev] = useState(false)
  const [kevSyncError, setKevSyncError] = useState<string | null>(null)
  const [kevSyncSuccess, setKevSyncSuccess] = useState<string | null>(null)

  // Load API key from secure storage on mount
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
    // Intentional mount-only load; secureKeyService is a stable singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load database settings and size on mount
  useEffect(() => {
    const loadDatabaseSettings = async () => {
      console.log('[Settings] Loading database settings...')
      try {
        // Load database stats
        const statsResponse = await getPlatform().database.getStats()
        console.log('[Settings] Stats response:', statsResponse)
        // dbPath is a config fact, present even when the DB itself isn't ready yet.
        setDbPath(statsResponse.dbPath ?? null)
        if (statsResponse.success && statsResponse.stats) {
          const stats = statsResponse.stats
          setDatabaseSize(stats.dbSize || 0)
          setCveCount(stats.totalCves || 0)
          setLastSyncAt(stats.lastUpdate || null)
          console.log('[Settings] Loaded stats - CVEs:', stats.totalCves, 'Size:', stats.dbSize)
        } else {
          console.error('[Settings] Failed to load stats:', statsResponse.error)
        }

        // Load CPE count
        try {
          const cpeResponse = await getPlatform().database.cpeSearch({ productName: '' })
          if (cpeResponse.success) {
            setCpeCount(cpeResponse.results.length)
            console.log('[Settings] CPE count:', cpeResponse.results.length)
          }
        } catch (err) {
          console.log('[Settings] CPE count not available:', err)
        }

        // Load sync config if available
        const configResponse = await getPlatform().database.getSyncConfig()
        if (configResponse.success && configResponse.config) {
          if (configResponse.config.syncInterval) {
            setSyncSchedule(configResponse.config.syncInterval as SyncSchedule)
          }
          setBandwidthLimit(configResponse.config.bandwidthLimitKBps ?? 0)
        }
      } catch (error) {
        console.error('[Settings] Failed to load database settings:', error)
      }
    }

    loadDatabaseSettings()
  }, [])

  // Load backup data on mount
  useEffect(() => {
    const loadBackupData = async () => {
      try {
        // Initialize backup service
        await getPlatform().backup.initialize()

        // Load backup list
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

        // Load backup config
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

  // Load KEV stats
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

  // KEV sync handler
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
        // Refresh stats
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

  // Backup handlers
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

    // Validate if not empty
    if (value && !isValidNvdApiKey(value)) {
      setApiKeyError('Invalid API key format. Expected UUID format.')
    }
  }

  const handleApiKeyBlur = async () => {
    if (apiKeyError) {
      // Reset to current valid value by reloading from secure storage
      const apiKey = await secureKeyService.getApiKey('nvd')
      setNvdApiKeyInput(apiKey || '')
      setApiKeyError('')
      return
    }

    // Save to secure storage
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

  const handleConfirmResetSettings = () => {
    setShowResetSettingsDialog(false)
    updateSettings({
      theme: 'system',
      fontSize: 'default',
      dataRetentionDays: 30,
      autoRefresh: false,
    })
    // Note: API key is NOT reset as it's stored in secure storage
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
  }

  // Database settings handlers
  const handleSyncScheduleChange = async (value: SyncSchedule) => {
    setSyncSchedule(value)
    try {
      await getPlatform().database.updateSyncConfig({ syncInterval: value })
    } catch (error) {
      console.error('Failed to update sync schedule:', error)
    }
  }

  const handleBandwidthLimitChange = async (value: number) => {
    const normalized = Number.isFinite(value) && value > 0 ? value : 0
    setBandwidthLimit(normalized)
    try {
      await getPlatform().database.updateSyncConfig({ bandwidthLimitKBps: normalized })
    } catch (error) {
      console.error('Failed to update bandwidth limit:', error)
    }
  }

  const handleStorageSettingChange = async (key: keyof DatabaseStorageSettings, value: number | boolean) => {
    const previous = storageSettings
    const newSettings = { ...storageSettings, [key]: value }
    setStorageSettings(newSettings)
    try {
      // H3: the server persists+enforces this now, so honor its {success}. On a rejection
      // (or throw) revert the optimistic change instead of leaving the UI showing an
      // unsaved value the user would believe took effect.
      const response = await getPlatform().database.updateStorageConfig(newSettings)
      if (!response?.success) {
        setStorageSettings(previous)
        console.error('Failed to update storage settings:', response?.error)
      }
    } catch (error) {
      setStorageSettings(previous)
      console.error('Failed to update storage settings:', error)
    }
  }

  const handlePerformanceSettingChange = async (key: keyof DatabasePerformanceSettings, value: number | boolean) => {
    const previous = performanceSettings
    const newSettings = { ...performanceSettings, [key]: value }
    setPerformanceSettings(newSettings)
    try {
      const response = await getPlatform().database.updatePerformanceConfig(newSettings)
      if (!response?.success) {
        setPerformanceSettings(previous)
        console.error('Failed to update performance settings:', response?.error)
      }
    } catch (error) {
      setPerformanceSettings(previous)
      console.error('Failed to update performance settings:', error)
    }
  }

  // Load cache statistics
  const loadCacheStats = async () => {
    try {
      // Get cache stats from the cache manager via IPC
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

  // Clear all caches

  // Load cache stats on mount and when cache settings change
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
        // Refresh stats after rebuild
        const statsResponse = await getPlatform().database.getStats()
        if (statsResponse.success && statsResponse.stats) {
          setDatabaseSize(statsResponse.stats.dbSize || 0)
          setCveCount(statsResponse.stats.totalCves || 0)
        }
      } else {
        console.error('[Settings] Failed to rebuild indexes:', result.error)
        // Show error to user - FTS5 not available is expected with sql.js
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
        // Refresh database stats
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

  // Bulk download state
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)

  const handleBulkDownload = async () => {
    setIsBulkDownloading(true)
    setSyncStatus(null)
    setApiKeyError('')
    console.log('[Settings] Starting bulk download...')
    try {
      // Download last 3 years of CVE data (requires API key)
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
        // Refresh database stats
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

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader title={t('pageTitle')} />
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <SettingsNav />
          <div className="min-w-0 space-y-6">
            <ProfilesSection />
            <AppearanceSection />
            <NotificationsSection />
            <CvssSection />

            {/* API Configuration Section */}
            <div id="api" className="rounded-lg border border-border bg-card scroll-mt-6">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold">{t('api.heading')}</h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isApiKeyAvailable ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {t('api.secureStorageEnabled')}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-yellow-600" />
                      {t('api.secureStorageUnavailable')}
                    </>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-4">
                {/* NVD API Key */}
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    {t('api.nvdApiKeyLabel')}{' '}
                    <span className="text-muted-foreground font-normal">{t('api.optional')}</span>
                  </label>
                  <div className="relative">
                    {isLoadingKey ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('api.loadingApiKey')}
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          id="nvd-api-key"
                          name="nvdApiKey"
                          value={nvdApiKeyInput}
                          onChange={(e) => handleApiKeyChange(e.target.value)}
                          onBlur={handleApiKeyBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }}
                          disabled={!isApiKeyAvailable || isSavingKey}
                          placeholder={t('api.apiKeyPlaceholder')}
                          aria-label={t('api.nvdApiKeyLabel')}
                          className={`w-full rounded-md border bg-background px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                            apiKeyError ? 'border-destructive' : 'border-border'
                          } ${!isApiKeyAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {isSavingKey && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {saveSuccess && !isSavingKey && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">
                            {t('api.saved')}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {apiKeyError && <p className="mt-1 text-xs text-destructive">{apiKeyError}</p>}
                  <div className="mt-2 flex items-center gap-4">
                    <p className="text-xs text-muted-foreground">
                      {t('api.getApiKeyBefore')}{' '}
                      <a
                        href="https://nvd.nist.gov/developers/request-an-api-key"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {t('api.nistLinkText')}
                      </a>{' '}
                      {t('api.getApiKeyAfter')}
                    </p>
                    {nvdApiKeyInput && isApiKeyAvailable && (
                      <button
                        onClick={handleDeleteApiKey}
                        disabled={isSavingKey}
                        className="text-xs text-destructive hover:underline disabled:opacity-50"
                      >
                        {t('api.deleteKey')}
                      </button>
                    )}
                  </div>
                  {!isApiKeyAvailable && (
                    <p className="mt-2 text-xs text-yellow-600">{t('api.secureStorageUnavailableNotice')}</p>
                  )}
                </div>

                {/* Auto Refresh */}
                <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <RotateCw className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{t('api.autoRefresh.title')}</div>
                        <p className="text-sm text-muted-foreground">{t('api.autoRefresh.description')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateSettings({ autoRefresh: !settings.autoRefresh })}
                      role="switch"
                      aria-checked={settings.autoRefresh}
                      aria-label={t('api.autoRefresh.toggleAriaLabel')}
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

                  {/* Refresh interval — disabled (not hidden) while auto-refresh is off (FR-03.6). */}
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <label htmlFor="auto-refresh-interval" className="text-sm font-medium">
                      {t('api.autoRefresh.refreshIntervalLabel')}
                    </label>
                    <select
                      id="auto-refresh-interval"
                      value={settings.autoRefreshInterval}
                      disabled={!settings.autoRefresh}
                      onChange={(e) => updateSettings({ autoRefreshInterval: Number(e.target.value) })}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {AUTO_REFRESH_INTERVAL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Pause on battery guard (FR-03.6). */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{t('api.autoRefresh.pauseOnBatteryTitle')}</div>
                      <p className="text-xs text-muted-foreground">{t('api.autoRefresh.pauseOnBatteryDescription')}</p>
                    </div>
                    <button
                      onClick={() => updateSettings({ pauseOnBattery: !settings.pauseOnBattery })}
                      role="switch"
                      aria-checked={settings.pauseOnBattery}
                      aria-label={t('api.autoRefresh.pauseOnBatteryToggleAriaLabel')}
                      disabled={!settings.autoRefresh}
                      className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        settings.pauseOnBattery ? 'bg-primary' : 'bg-muted-foreground'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                          settings.pauseOnBattery ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Database Section */}
            <div id="database" className="rounded-lg border border-border bg-card scroll-mt-6">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <Database className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">{t('database.heading')}</h2>
              </div>
              <div className="p-4 space-y-6">
                {/* Database Statistics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <Shield className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('database.totalCves')}</div>
                      <div className="text-lg font-semibold">{cveCount.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Database className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('database.cpeMatches')}</div>
                      <div className="text-lg font-semibold">{cpeCount.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <HardDrive className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('database.databaseSize')}</div>
                      <div className="text-lg font-semibold">{formatBytes(databaseSize)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Clock className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('database.lastSync')}</div>
                      <div className="text-sm font-medium">
                        {lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : t('never')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bulk Download Progress */}
                {isBulkDownloading && (
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                      <div>
                        <div className="font-medium text-blue-500">{t('database.downloadingCveData')}</div>
                        <div className="text-sm text-muted-foreground">{t('database.fetchingVulnerabilityData')}</div>
                      </div>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div className="bg-blue-500 rounded-full h-2 animate-pulse" style={{ width: '60%' }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{t('database.downloadWaitNotice')}</p>
                  </div>
                )}

                {/* Sync Schedule */}
                <div>
                  <div className="flex items-end justify-between gap-4">
                    <div className="flex-1">
                      <label htmlFor="sync-schedule" className="mb-2 block text-sm font-medium">
                        {t('database.syncScheduleLabel')}
                      </label>
                      <select
                        id="sync-schedule"
                        value={syncSchedule}
                        onChange={(e) => handleSyncScheduleChange(e.target.value as SyncSchedule)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {SYNC_SCHEDULE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleSyncNow}
                      disabled={isSyncing || isBulkDownloading}
                      className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('syncing')}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          {t('syncNow')}
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleBulkDownload}
                      disabled={isSyncing || isBulkDownloading}
                      className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title={t('database.bulkDownloadTitle')}
                    >
                      {isBulkDownloading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('database.downloading')}
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          {t('database.bulkDownload')}
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {SYNC_SCHEDULE_OPTIONS.find((o) => o.value === syncSchedule)?.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {t('database.bulkDownloadRequiresApiKey')}
                  </p>
                  {syncStatus && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium">{t('database.lastSyncLabel')}</span>{' '}
                      {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : t('never')}
                      {syncStatus.cvesAdded !== undefined && syncStatus.cvesAdded > 0 && (
                        <span className="ml-2 text-green-600">
                          {t('database.cvesAddedBadge', { count: syncStatus.cvesAdded })}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bandwidth Limit (FR-10.3) */}
                  <div className="mt-4">
                    <label htmlFor="bandwidth-limit" className="mb-2 block text-sm font-medium">
                      {t('database.bandwidthLimitLabel')}
                    </label>
                    <input
                      id="bandwidth-limit"
                      type="number"
                      min={0}
                      value={bandwidthLimit}
                      onChange={(e) => handleBandwidthLimitChange(Number(e.target.value))}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">{t('database.bandwidthLimitDescription')}</p>
                  </div>
                </div>

                {/* Storage Management */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">{t('database.storageManagementHeading')}</h3>
                  </div>

                  {/* Storage Location (FR-10.3) — read-only; changing it is an env/restart concern */}
                  <div>
                    <label className="mb-2 block text-sm font-medium">{t('database.storageLocationLabel')}</label>
                    <p className="break-all rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {dbPath ?? t('database.notAvailable')}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{t('database.storageLocationDescription')}</p>
                  </div>

                  {/* Storage Limit Slider */}
                  <div>
                    <label htmlFor="max-database-size" className="mb-2 block text-sm font-medium">
                      {t('database.maxDatabaseSizeLabel')}
                    </label>
                    <select
                      id="max-database-size"
                      value={storageSettings.maxSizeMB}
                      onChange={(e) => handleStorageSettingChange('maxSizeMB', Number(e.target.value))}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {DATABASE_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-muted-foreground">{t('database.maxDatabaseSizeDescription')}</p>
                  </div>

                  {/* Prune Old CVEs */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-4">
                    <div className="flex items-center gap-3">
                      <Trash2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{t('database.pruneOldCvesTitle')}</div>
                        <p className="text-sm text-muted-foreground">{t('database.pruneOldCvesDescription')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStorageSettingChange('pruneOldCves', !storageSettings.pruneOldCves)}
                      role="switch"
                      aria-checked={storageSettings.pruneOldCves}
                      aria-label={t('database.pruneOldCvesAriaLabel')}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        storageSettings.pruneOldCves ? 'bg-primary' : 'bg-muted-foreground'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                          storageSettings.pruneOldCves ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Prune Year Threshold */}
                  {storageSettings.pruneOldCves && (
                    <div>
                      <label htmlFor="prune-year" className="mb-2 block text-sm font-medium">
                        {t('database.keepCvesFromLabel')}
                      </label>
                      <select
                        id="prune-year"
                        value={storageSettings.pruneOlderThanYear}
                        onChange={(e) => handleStorageSettingChange('pruneOlderThanYear', Number(e.target.value))}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {PRUNE_YEAR_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Database Actions */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={() => setShowRebuildDialog(true)}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('database.rebuildIndexes')}
                  </button>
                  <button
                    onClick={() => setShowResetDialog(true)}
                    className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('database.resetDatabase')}
                  </button>
                </div>
              </div>
            </div>

            {/* Backup & Recovery Section */}
            <div id="backup" className="rounded-lg border border-border bg-card scroll-mt-6">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <Archive className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">{t('backup.heading')}</h2>
              </div>
              <div className="p-4 space-y-6">
                {/* Status Messages */}
                {backupError && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    {backupError}
                  </div>
                )}
                {backupSuccess && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {backupSuccess}
                  </div>
                )}

                {/* Backup Actions */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleCreateBackup}
                    disabled={isCreatingBackup}
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreatingBackup ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('backup.creating')}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {t('backup.createBackup')}
                      </>
                    )}
                  </button>
                </div>

                {/* Backup Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">{t('backup.configHeading')}</h3>
                  </div>

                  {/* Retention Count */}
                  <div>
                    <label htmlFor="backup-retention" className="mb-2 block text-sm font-medium">
                      {t('backup.keepBackupsLabel')}
                    </label>
                    <select
                      id="backup-retention"
                      value={backupConfig.retentionCount}
                      onChange={async (e) => {
                        const newCount = Number(e.target.value)
                        setBackupConfig((prev) => ({ ...prev, retentionCount: newCount }))
                        await getPlatform().backup.updateConfig({ maxBackups: newCount })
                      }}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value={1}>{t('backup.retentionOptions.backups1')}</option>
                      <option value={3}>{t('backup.retentionOptions.backups3')}</option>
                      <option value={5}>{t('backup.retentionOptions.backups5')}</option>
                      <option value={10}>{t('backup.retentionOptions.backups10')}</option>
                    </select>
                    <p className="mt-2 text-xs text-muted-foreground">{t('backup.retentionDescription')}</p>
                  </div>
                </div>

                {/* Backup List */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">{t('backup.availableBackups', { count: backups.length })}</h3>
                  </div>

                  {backups.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-4 rounded-lg bg-muted text-center">
                      {t('backup.noBackups')}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {backups.map((backup) => (
                        <div
                          key={backup.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-lg ${
                                backup.integrity === 'valid'
                                  ? 'bg-green-500/10'
                                  : backup.integrity === 'invalid'
                                    ? 'bg-red-500/10'
                                    : 'bg-muted-foreground/10'
                              }`}
                            >
                              <Archive
                                className={`h-4 w-4 ${
                                  backup.integrity === 'valid'
                                    ? 'text-green-500'
                                    : backup.integrity === 'invalid'
                                      ? 'text-red-500'
                                      : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div>
                              <div className="text-sm font-medium">{new Date(backup.timestamp).toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatBackupSize(backup.size)}
                                {backup.integrity === 'valid' && t('backup.verifiedSuffix')}
                                {backup.integrity === 'invalid' && t('backup.corruptedSuffix')}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleVerifyBackup(backup.id)}
                              className="p-2 rounded-md hover:bg-muted transition-colors"
                              aria-label={t('backup.verifyIntegrityAriaLabel')}
                              title={t('backup.verifyIntegrityTitle')}
                            >
                              <RefreshCw className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedBackupId(backup.id)
                                setShowRestoreDialog(true)
                              }}
                              disabled={backup.integrity === 'invalid'}
                              className="p-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                              aria-label={t('backup.restoreAction')}
                              title={t('backup.restoreAction')}
                            >
                              <RotateCcw className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDeleteBackup(backup.id)}
                              className="p-2 rounded-md hover:bg-destructive/10 transition-colors"
                              aria-label={t('backup.deleteAction')}
                              title={t('backup.deleteAction')}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Performance Section */}
            <div id="performance" className="rounded-lg border border-border bg-card scroll-mt-6">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <Gauge className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">{t('performance.heading')}</h2>
              </div>
              <div className="p-4 space-y-4">
                {/* Search Result Limit */}
                <div>
                  <label htmlFor="search-result-limit" className="mb-2 block text-sm font-medium">
                    {t('performance.searchResultLimitLabel')}
                  </label>
                  <select
                    id="search-result-limit"
                    value={performanceSettings.searchResultLimit}
                    onChange={(e) => handlePerformanceSettingChange('searchResultLimit', Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {SEARCH_RESULT_LIMIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-muted-foreground">{t('performance.searchResultLimitDescription')}</p>
                </div>

                {/* Search Cache Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-4">
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{t('performance.enableSearchCacheTitle')}</div>
                      <p className="text-sm text-muted-foreground">{t('performance.enableSearchCacheDescription')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handlePerformanceSettingChange('enableSearchCache', !performanceSettings.enableSearchCache)
                    }
                    role="switch"
                    aria-checked={performanceSettings.enableSearchCache}
                    aria-label={t('performance.toggleSearchCacheAriaLabel')}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      performanceSettings.enableSearchCache ? 'bg-primary' : 'bg-muted-foreground'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                        performanceSettings.enableSearchCache ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Cache Size (if cache enabled) */}
                {performanceSettings.enableSearchCache && (
                  <div>
                    <label htmlFor="cache-size" className="mb-2 block text-sm font-medium">
                      {t('performance.cacheSizeLabel')}
                    </label>
                    <select
                      id="cache-size"
                      value={performanceSettings.cacheSizeMB}
                      onChange={(e) => handlePerformanceSettingChange('cacheSizeMB', Number(e.target.value))}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {CACHE_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-muted-foreground">{t('performance.cacheSizeDescription')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Data Management Section */}
            <div id="data-management" className="rounded-lg border border-border bg-card scroll-mt-6">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">{t('dataManagement.heading')}</h2>
              </div>
              <div className="p-4 space-y-4">
                {/* Import/Export Profiles */}
                <div className="rounded-lg border border-border bg-muted p-4">
                  <div className="mb-3">
                    <div className="font-medium">{t('dataManagement.importExportTitle')}</div>
                    <p className="text-sm text-muted-foreground">{t('dataManagement.importExportDescription')}</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleExportProfiles}
                      disabled={settingsProfiles.length === 0}
                      className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      {t('dataManagement.exportProfiles')}
                    </button>
                    <label className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 cursor-pointer transition-colors">
                      <Upload className="h-4 w-4" />
                      {t('dataManagement.importProfiles')}
                      <input type="file" accept=".json" onChange={handleImportProfiles} className="hidden" />
                    </label>
                  </div>
                  {importSuccess && (
                    <div className="mt-3 text-sm text-green-600">{t('dataManagement.importedSuccessfully')}</div>
                  )}
                  {importError && <div className="mt-3 text-sm text-destructive">{importError}</div>}
                </div>

                {/* Data Retention */}
                <div>
                  <label htmlFor="data-retention" className="mb-2 block text-sm font-medium">
                    {t('dataManagement.dataRetentionLabel')}
                  </label>
                  <select
                    id="data-retention"
                    value={settings.dataRetentionDays}
                    onChange={(e) => updateSettings({ dataRetentionDays: Number(e.target.value) })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={7}>{t('dataManagement.retentionOptions.days7')}</option>
                    <option value={30}>{t('dataManagement.retentionOptions.days30')}</option>
                    <option value={60}>{t('dataManagement.retentionOptions.days60')}</option>
                    <option value={90}>{t('dataManagement.retentionOptions.days90')}</option>
                    <option value={180}>{t('dataManagement.retentionOptions.months6')}</option>
                    <option value={365}>{t('dataManagement.retentionOptions.year1')}</option>
                    <option value={-1}>{t('dataManagement.retentionOptions.never')}</option>
                  </select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('dataManagement.retentionDescription')}
                    {settings.dataRetentionDays === -1
                      ? t('dataManagement.retentionNeverSuffix')
                      : t('dataManagement.retentionDaysSuffix', { days: settings.dataRetentionDays })}
                  </p>
                </div>
              </div>
            </div>

            {/* Intelligence Section */}
            <div id="threat-intel" className="rounded-lg border border-border bg-card scroll-mt-6">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">{t('threatIntel.heading')}</h2>
              </div>
              <div className="p-4 space-y-6">
                {/* Status Messages */}
                {kevSyncError && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    {kevSyncError}
                  </div>
                )}
                {kevSyncSuccess && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {kevSyncSuccess}
                  </div>
                )}

                {/* KEV Stats Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('threatIntel.kevEntries')}</div>
                      <div className="text-lg font-semibold">{kevStats?.total ?? 0}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Shield className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('threatIntel.ransomware')}</div>
                      <div className="text-lg font-semibold">{kevStats?.ransomwareRelated ?? 0}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Clock className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('threatIntel.lastUpdated')}</div>
                      <div className="text-sm font-medium">
                        {kevStats?.lastUpdated ? new Date(kevStats.lastUpdated).toLocaleDateString() : t('never')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* KEV Sync Button */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-4">
                  <div className="flex items-center gap-3">
                    <RefreshCw className={`h-5 w-5 text-muted-foreground ${isSyncingKev ? 'animate-spin' : ''}`} />
                    <div>
                      <div className="font-medium">{t('threatIntel.syncKevTitle')}</div>
                      <p className="text-sm text-muted-foreground">{t('threatIntel.syncKevDescription')}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSyncKev}
                    disabled={isSyncingKev}
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isSyncingKev ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('syncing')}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        {t('syncNow')}
                      </>
                    )}
                  </button>
                </div>

                {/* Info */}
                <div className="text-xs text-muted-foreground">
                  <p>
                    {t('threatIntel.infoBefore')} <strong>{t('threatIntel.infoStrong')}</strong>{' '}
                    {t('threatIntel.infoAfter')}
                  </p>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div id="danger-zone" className="rounded-lg border border-destructive/50 bg-destructive/5 scroll-mt-6">
              <div className="border-b border-destructive/50 p-4">
                <h2 className="font-semibold text-destructive">{t('dangerZone.heading')}</h2>
              </div>
              <div className="p-4">
                <button
                  onClick={() => setShowResetSettingsDialog(true)}
                  className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
                >
                  {t('dangerZone.resetAllSettings')}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">{t('dangerZone.resetAllSettingsDescription')}</p>
              </div>
            </div>

            {/* Version Info */}
            <div className="text-center text-sm text-muted-foreground">{t('versionInfo')}</div>
          </div>
        </div>
      </div>

      {/* Reset Settings Confirmation Dialog */}
      <ConfirmDialog
        open={showResetSettingsDialog}
        title={t('dialogs.resetSettings.title')}
        message={t('dialogs.resetSettings.message')}
        confirmLabel={t('dialogs.resetSettings.confirmLabel')}
        cancelLabel={t('common:actions.cancel')}
        variant="danger"
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setShowResetSettingsDialog(false)}
      />

      {/* Reset Database Confirmation Dialog */}
      <ConfirmDialog
        open={showResetDialog}
        title={t('dialogs.resetDatabase.title')}
        message={t('dialogs.resetDatabase.message')}
        confirmLabel={t('dialogs.resetDatabase.confirmLabel')}
        cancelLabel={t('common:actions.cancel')}
        variant="danger"
        onConfirm={handleResetDatabase}
        onCancel={() => setShowResetDialog(false)}
        isLoading={isResetting}
      />

      {/* Rebuild Indexes Confirmation Dialog */}
      <ConfirmDialog
        open={showRebuildDialog}
        title={t('dialogs.rebuildIndexes.title')}
        message={t('dialogs.rebuildIndexes.message')}
        confirmLabel={t('dialogs.rebuildIndexes.confirmLabel')}
        cancelLabel={t('common:actions.cancel')}
        variant="warning"
        onConfirm={handleRebuildIndexes}
        onCancel={() => setShowRebuildDialog(false)}
        isLoading={isRebuilding}
      />

      {/* Restore Backup Confirmation Dialog */}
      <ConfirmDialog
        open={showRestoreDialog}
        title={t('dialogs.restoreBackup.title')}
        message={t('dialogs.restoreBackup.message')}
        confirmLabel={t('dialogs.restoreBackup.confirmLabel')}
        cancelLabel={t('common:actions.cancel')}
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
