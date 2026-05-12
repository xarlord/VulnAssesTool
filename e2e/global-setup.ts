import { execSync, spawn, ChildProcess } from 'child_process'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let previewServer: ChildProcess | null = null
const serverPort = 4173

/**
 * Check if a port is in use
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode !== undefined)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

/**
 * Kill any process using the port on Windows
 */
function killProcessOnPort(port: number) {
  try {
    // On Windows, use netstat and taskkill
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' })
    const lines = result.split('\n').filter((line) => line.includes('LISTENING'))
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && !isNaN(Number(pid))) {
        console.log(`Killing process ${pid} on port ${port}`)
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' })
        } catch {
          // Process might have already exited
        }
      }
    }
  } catch {
    // No process found on port
  }
}

/**
 * Wait for server to be ready
 */
async function waitForServer(port: number, maxWaitMs: number = 30000): Promise<boolean> {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    if (await isPortInUse(port)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/**
 * Get the test database path
 */
function getTestDatabasePath(): string {
  const isWindows = os.platform() === 'win32'
  const homeDir = os.homedir()

  if (isWindows) {
    return path.join(homeDir, 'AppData', 'Roaming', 'vuln-assess-tool', 'nvd-data.db')
  } else {
    return path.join(homeDir, '.config', 'vuln-assess-tool', 'nvd-data.db')
  }
}

/**
 * Seed the test database with sample CVE data
 */
async function seedTestDatabase(): Promise<void> {
  console.log('Seeding test database with sample CVE data...')

  const dbPath = getTestDatabasePath()
  const seedScript = path.join(__dirname, '..', 'scripts', 'seed-test-db.js')

  try {
    execSync(`node "${seedScript}" "${dbPath}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('Test database seeded successfully')
  } catch (error) {
    console.error('Failed to seed test database:', error)
    // Don't throw - continue with tests even if seeding fails
    // The tests will gracefully skip if no data is available
  }
}

async function globalSetup() {
  console.log('=== E2E Global Setup ===')

  // Kill any existing process on the port
  killProcessOnPort(serverPort)
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Build the application
  console.log('Building application...')
  try {
    execSync('npm run build', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('Build completed successfully')
  } catch (error) {
    console.error('Build failed:', error)
    throw error
  }

  // Seed the test database with sample CVE data
  await seedTestDatabase()

  // Start the preview server
  console.log(`Starting preview server on port ${serverPort}...`)
  previewServer = spawn('npx', ['vite', 'preview', '--port', String(serverPort), '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    shell: true,
    env: { ...process.env },
  })

  previewServer.stdout?.on('data', (data) => {
    const output = data.toString().trim()
    if (output) console.log(`[Preview] ${output}`)
  })

  previewServer.stderr?.on('data', (data) => {
    const output = data.toString().trim()
    if (output && !output.includes('[DEP')) {
      console.error(`[Preview Error] ${output}`)
    }
  })

  // Wait for server
  const ready = await waitForServer(serverPort, 30000)
  if (!ready) {
    throw new Error('Preview server failed to start')
  }

  console.log(`Preview server running on http://127.0.0.1:${serverPort}`)
  console.log('=== Global Setup Complete ===')

  // Return empty to satisfy the interface
  return undefined
}

export default globalSetup
