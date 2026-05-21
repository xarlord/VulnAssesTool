import { execSync } from 'child_process'

const serverPort = 3001

export default async function globalTeardown() {
  console.log('\n=== E2E Global Teardown ===')

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
