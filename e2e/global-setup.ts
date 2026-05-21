import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getTestDatabasePath(): string {
  const isWindows = os.platform() === 'win32'
  const homeDir = os.homedir()

  if (isWindows) {
    return path.join(homeDir, 'AppData', 'Roaming', 'vuln-assess-tool', 'nvd-data.db')
  } else {
    return path.join(homeDir, '.config', 'vuln-assess-tool', 'nvd-data.db')
  }
}

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
  }
}

async function globalSetup() {
  console.log('=== E2E Global Setup ===')

  console.log('Building application...')
  try {
    execSync('npm run build:all', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('Build completed successfully')
  } catch (error) {
    console.error('Build failed:', error)
    throw error
  }

  await seedTestDatabase()

  console.log('=== Global Setup Complete ===')
  console.log('Express server will be started by Playwright webServer config.')

  return undefined
}

export default globalSetup
