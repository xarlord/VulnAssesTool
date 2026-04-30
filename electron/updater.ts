/**
 * Auto-Updater Module
 *
 * Handles automatic application updates using electron-updater.
 * Supports updates from GitHub Releases for Windows, macOS, and Linux.
 */

import { app, BrowserWindow, dialog } from 'electron'

// Lazy-loaded autoUpdater to avoid initialization before app is ready
let _autoUpdater: any = null
let _updateCheckInterval: ReturnType<typeof setInterval> | null = null

/**
 * Get or initialize the autoUpdater (lazy loading)
 */
function getAutoUpdater(): any {
  if (!_autoUpdater) {
    const { autoUpdater } = require('electron-updater')
    _autoUpdater = autoUpdater

    // Configure update source (GitHub Releases)
    _autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'xarlord',
      repo: 'd-fence-vulnerability-assesment-tool',
    })

    // Configure logger (if available in production)
    try {
      const electronLog = require('electron-log')
      _autoUpdater.logger = electronLog
      if (_autoUpdater.logger) {
        _autoUpdater.logger.transports.file.level = 'info'
      }
    } catch {
      // electron-log not available, continue without logging
      console.log('electron-log not available, updater logging to console only')
    }
  }
  return _autoUpdater
}

// Simple logger for the updater
const log = {
  info: (msg: string, ...args: unknown[]) => console.log(`[Updater] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[Updater] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[Updater] ${msg}`, ...args),
}

// State tracking
let updateAvailable = false
let updateDownloaded = false
let mainWindow: BrowserWindow | null = null

/**
 * Initialize the auto-updater
 *
 * @param window The main browser window
 */
export function initializeUpdater(window: BrowserWindow): void {
  mainWindow = window

  // Check for updates on startup (with a delay to avoid startup slowdown)
  setTimeout(() => {
    if (app.isPackaged) {
      log.info('Checking for updates...')
      try {
        const autoUpdater = getAutoUpdater()
        autoUpdater.checkForUpdates()
      } catch (error) {
        log.error('Failed to check for updates:', error)
      }
    } else {
      log.info('Update check skipped - running in development mode')
    }
  }, 5000) // Check 5 seconds after startup

  // Set up event handlers
  setupUpdaterEvents()
}

/**
 * Set up auto-updater event handlers
 */
function setupUpdaterEvents(): void {
  const autoUpdater = getAutoUpdater()

  // Update available
  autoUpdater.on('update-available', (info: any) => {
    log.info('Update available:', info.version)
    updateAvailable = true

    if (mainWindow) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      })
    }
  })

  // Update not available
  autoUpdater.on('update-not-available', (info: any) => {
    log.info('Update not available. Current version:', info.version)
    updateAvailable = false

    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', {
        version: info.version,
      })
    }
  })

  // Download progress
  autoUpdater.on('download-progress', (progress: any) => {
    log.info(`Download progress: ${Math.round(progress.percent || 0)}%`)

    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      })
    }
  })

  // Update downloaded
  autoUpdater.on('update-downloaded', (info: any) => {
    log.info('Update downloaded:', info.version)
    updateDownloaded = true

    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      })

      // Prompt user to install update
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Ready',
          message: `A new version (${info.version}) has been downloaded.`,
          detail: 'Would you like to install the update now? The application will restart.',
          buttons: ['Install Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall()
          }
        })
        .catch((error) => {
          log.error('Error showing update dialog:', error)
        })
    }
  })

  // Update error
  autoUpdater.on('error', (error: Error) => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error('Update error:', errorMessage)

    if (mainWindow) {
      mainWindow.webContents.send('update-error', {
        message: errorMessage,
      })
    }
  })

  // Checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')

    if (mainWindow) {
      mainWindow.webContents.send('update-checking')
    }
  })
}

/**
 * Manually check for updates
 *
 * @returns Promise that resolves when update check is complete
 */
export function checkForUpdates(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!app.isPackaged) {
      reject(new Error('Cannot check for updates in development mode'))
      return
    }

    const autoUpdater = getAutoUpdater()
    const timeout = setTimeout(() => {
      reject(new Error('Update check timed out'))
    }, 30000) // 30 second timeout

    autoUpdater.once('update-available', () => {
      clearTimeout(timeout)
      resolve()
    })

    autoUpdater.once('update-not-available', () => {
      clearTimeout(timeout)
      resolve()
    })

    autoUpdater.once('error', (error: Error) => {
      clearTimeout(timeout)
      reject(error)
    })

    autoUpdater.checkForUpdates()
  })
}

/**
 * Download and install the available update
 */
export function downloadUpdate(): void {
  if (updateAvailable && !updateDownloaded) {
    const autoUpdater = getAutoUpdater()
    autoUpdater.downloadUpdate()
  }
}

/**
 * Install the downloaded update and restart the app
 */
export function installUpdate(): void {
  if (updateDownloaded) {
    const autoUpdater = getAutoUpdater()
    autoUpdater.quitAndInstall()
  }
}

/**
 * Get current version
 *
 * @returns Current application version
 */
export function getCurrentVersion(): string {
  return app.getVersion()
}

/**
 * Get update state
 *
 * @returns Object containing current update state
 */
export function getUpdateState(): {
  updateAvailable: boolean
  updateDownloaded: boolean
  currentVersion: string
} {
  return {
    updateAvailable,
    updateDownloaded,
    currentVersion: app.getVersion(),
  }
}

/**
 * Enable automatic download of updates
 *
 * @param enabled Whether to auto-download updates
 */
export function setAutoDownload(enabled: boolean): void {
  const autoUpdater = getAutoUpdater()
  autoUpdater.autoDownload = enabled
}

/**
 * Enable automatic install of updates on app quit
 *
 * @param enabled Whether to auto-install on quit
 */
export function setAutoInstallOnQuit(enabled: boolean): void {
  const autoUpdater = getAutoUpdater()
  autoUpdater.autoInstallOnAppQuit = enabled
}

/**
 * Set the update check interval
 *
 * Schedules periodic update checks using the specified interval.
 * Clears any previous interval before setting a new one.
 *
 * @param hours Hours between update checks
 */
export function setUpdateCheckInterval(hours: number): void {
  // Clear existing interval if any
  if (_updateCheckInterval) {
    clearInterval(_updateCheckInterval)
    _updateCheckInterval = null
  }

  if (hours <= 0) {
    log.info('Periodic update checks disabled')
    return
  }

  const intervalMs = hours * 60 * 60 * 1000
  log.info(`Setting update check interval to ${hours} hours`)

  _updateCheckInterval = setInterval(() => {
    if (app.isPackaged && !updateDownloaded) {
      log.info('Periodic update check triggered')
      try {
        const autoUpdater = getAutoUpdater()
        autoUpdater.checkForUpdates()
      } catch (error) {
        log.error('Periodic update check failed:', error)
      }
    }
  }, intervalMs)
}
