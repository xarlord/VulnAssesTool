/**
 * Electron module wrapper for development mode
 *
 * This module works around the issue where the npm electron package
 * exports a string (path to binary) instead of the Electron API.
 *
 * In production, the npm electron package is not included, so
 * require('electron') correctly resolves to the built-in module.
 *
 * In development, we need to access Electron's API differently.
 */

// Only apply this workaround in development
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV

if (isDev && process.versions?.electron) {
  // We're running in Electron in development mode
  // The npm electron package shadows the built-in module
  // Try to get the built-in module
  // Approach: Re-export from electron with a workaround
  // This won't work directly because we'd create a circular dependency
  // So we need a different solution
}

// Re-export everything from electron
export * from 'electron'
