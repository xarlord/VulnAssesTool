import { execSync } from 'child_process'

/**
 * Global Teardown for E2E Tests
 *
 * Cleans up resources after all tests complete:
 * 1. Kills any remaining Electron processes
 * 2. Kills the preview server
 */

const serverPort = 4173

export default async function globalTeardown() {
  console.log('\n=== E2E Global Teardown ===')

  // Kill any remaining Electron processes on Windows
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' })
      console.log('Killed remaining Electron processes')
    }
  } catch {
    // Ignore errors - process may not exist
  }

  // Kill the preview server
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${serverPort}`, { encoding: 'utf-8' })
      const lines = result.trim().split('\n')
      for (const line of lines) {
        const match = line.match(/\s+(\d+)\s*$/)
        if (match) {
          const pid = match[1]
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
          console.log(`Killed process ${pid} on port ${serverPort}`)
        }
      }
    }
  } catch {
    // Ignore errors - process may not exist
  }

  console.log('=== Global Teardown Complete ===\n')
}
