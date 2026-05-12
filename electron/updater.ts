/**
 * Auto-Updater Module
 *
 * Handles automatic application updates using electron-updater.
 * Supports updates from GitHub Releases for Windows, macOS, and Linux.
 */

import { app, BrowserWindow, dialog } from 'electron'
import type { AppUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'

// Lazy-loaded autoUpdater to avoid initialization before app is ready
let autoUpdater: AppUpdater | null = null
let updateCheckInterval: ReturnType<typeof setInterval> | null = null

/**
 * Get or initialize the autoUpdater (lazy loading)
 */
async function getAutoUpdater(): Promise<AppUpdater> {
  if (!autoUpdater) {
    const { autoUpdater: updater } = await import('electron-updater')
    autoUpdater = updater

    // Configure update source (GitHub Releases)
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'xarlord',
      repo: 'd-fence-vulnerability-assesment-tool',
    })

    // Configure logger (if available in production)
    try {
      const electronLog = await import('electron-log')
      autoUpdater.logger = electronLog.default as unknown as import('electron-updater').Logger
      if (autoUpdater.logger) {
        // electron-log uses transports.file.level for configuration
        const logger = autoUpdater.logger as unknown as { transports: { file: { level: string } } }
        logger.transports.file.level = 'info'
      }
    } catch {
      // electron-log not available, continue without logging
      console.log('electron-log not available, updater logging to console only')
    }
  }
  return autoUpdater
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
      void getAutoUpdater()
        .then((up) => up.checkForUpdates())
        .catch((error: unknown) => {
          log.error('Failed to check for updates:', error)
        })
    } else {
      log.info('Update check skipped - running in development mode')
    }
  }, 5000)

  // Set up event handlers
  void setupUpdaterEvents()
}

/**
 * Set up auto-updater event handlers
 */
async function setupUpdaterEvents(): Promise<void> {
  const autoUpdater = await getAutoUpdater()

  // Update available
  autoUpdater.on('update-available', (info: UpdateInfo) => {
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
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info('Update not available. Current version:', info.version)
    updateAvailable = false

    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', {
        version: info.version,
      })
    }
  })

  // Download progress
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
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
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
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
        .then((result: { response: number }) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall()
          }
        })
        .catch((error: unknown) => {
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
  return (async () => {
    if (!app.isPackaged) {
      throw new Error('Cannot check for updates in development mode')
    }

    const autoUpdater = await getAutoUpdater()
    const timeout = setTimeout(() => {
      throw new Error('Update check timed out')
    }, 30000)

    return new Promise<void>((resolve, reject) => {
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
  })()
}

/**
 * Download and install the available update
 */
export async function downloadUpdate(): Promise<void> {
  if (updateAvailable && !updateDownloaded) {
    const autoUpdater = await getAutoUpdater()
    autoUpdater.downloadUpdate()
  }
}

/**
 * Install the downloaded update and restart the app
 */
export async function installUpdate(): Promise<void> {
  if (updateDownloaded) {
    const autoUpdater = await getAutoUpdater()
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
export async function setAutoDownload(enabled: boolean): Promise<void> {
  const autoUpdater = await getAutoUpdater()
  autoUpdater.autoDownload = enabled
}

/**
 * Enable automatic install of updates on app quit
 *
 * @param enabled Whether to auto-install on quit
 */
export async function setAutoInstallOnQuit(enabled: boolean): Promise<void> {
  const autoUpdater = await getAutoUpdater()
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
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
  }

  if (hours <= 0) {
    log.info('Periodic update checks disabled')
    return
  }

  const intervalMs = hours * 60 * 60 * 1000
  log.info(`Setting update check interval to ${hours} hours`)

  updateCheckInterval = setInterval(() => {
    if (app.isPackaged && !updateDownloaded) {
      log.info('Periodic update check triggered')
      void getAutoUpdater()
        .then((up) => up.checkForUpdates())
        .catch((error: unknown) => {
          log.error('Periodic update check failed:', error)
        })
    }
  }, intervalMs)
}
