import { test as base } from '@playwright/test'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'

// Type definitions for Electron window
type ElectronWindow = Awaited<ReturnType<typeof launchElectron>>

/**
 * Launch the Electron application
 */
async function launchElectron() {
  // Determine the path to the Electron app
  const isDev = process.env.NODE_ENV !== 'production'
  const electronAppPath = path.join(__dirname, '../dist/electron/main.js') // Built app
  const electronExecutable = path.join(__dirname, '../node_modules/.bin/electron') // Dev mode

  // For development, we run the Electron app directly
  // For production, we run the built executable

  let electronProcess: ChildProcess | null = null

  if (isDev) {
    // Development mode: run Electron with the renderer
    electronProcess = spawn(electronExecutable, ['.'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
    })

    // Wait for Electron to start
    await new Promise<void>((resolve) => {
      electronProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('Electron')) {
          resolve()
        }
      })
      // Timeout after 10 seconds
      setTimeout(resolve, 10000)
    })
  }

  return {
    electronProcess,
    // The browser will connect to the Electron window
    // We need to use CDP or remote debugging
  }
}

/**
 * Extended test fixture with Electron support
 */
export const test = base.extend({
  electron: async ({}, use) => {
    // For Electron apps, we need a different approach
    // This is a placeholder - you'll need to configure this based on your Electron setup

    // Note: Full Electron E2E testing setup requires either:
    // 1. Using @playwright/test's electron mode (experimental)
    // 2. Setting up CDP (Chrome DevTools Protocol) connection
    // 3. Using a library like electron-playwright

    await use({})
  },
})

// Re-export everything from playwright/test
export * from '@playwright/test'
