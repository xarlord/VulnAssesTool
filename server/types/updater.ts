/**
 * Auto-Updater Types
 * Types for updater communication between main and renderer processes
 */

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateDownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface UpdateState {
  updateAvailable: boolean
  updateDownloaded: boolean
  currentVersion: string
}

export interface UpdateAvailableEvent {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateNotAvailableEvent {
  version: string
}

export interface UpdateDownloadedEvent {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateErrorEvent {
  message: string
}
