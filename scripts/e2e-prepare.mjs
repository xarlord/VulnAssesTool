/**
 * E2E preparation — runs BEFORE `playwright test` (see the test:e2e* npm
 * scripts). Doing this outside Playwright avoids its webServer lifecycle
 * entirely: kill anything holding the E2E port (a leftover server serves a
 * stale build and locks the seed DB on Windows), build the current code, and
 * seed the isolated E2E database that .env.e2e points the server at.
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const E2E_PORT = 3001

function killPort(port) {
  if (process.platform !== 'win32') {
    try {
      execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'ignore', shell: '/bin/sh' })
    } catch {
      /* nothing listening */
    }
    return
  }
  try {
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' })
    const pids = new Set()
    for (const line of result.trim().split('\n')) {
      // Only LISTENING rows whose local address ends in :<port> — avoid
      // matching unrelated ports that merely contain the digits.
      if (!line.includes('LISTENING')) continue
      if (!new RegExp(`[:.]${port}\\s`).test(line)) continue
      const match = line.match(/\s(\d+)\s*$/)
      if (match) pids.add(match[1])
    }
    for (const pid of pids) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
      console.log(`[e2e-prepare] Killed stale process ${pid} on port ${port}`)
    }
  } catch {
    /* nothing listening */
  }
}

console.log('[e2e-prepare] Freeing E2E port...')
killPort(E2E_PORT)

console.log('[e2e-prepare] Building application...')
execSync('npm run build:all', { cwd: repoRoot, stdio: 'inherit' })

console.log('[e2e-prepare] Seeding isolated E2E database...')
const seedScript = path.join(repoRoot, 'scripts', 'seed-test-db.js')
const dbPath = path.join(repoRoot, '.e2e-data', 'nvd-data.db')
execSync(`node "${seedScript}" "${dbPath}"`, { cwd: repoRoot, stdio: 'inherit' })

console.log('[e2e-prepare] Ready.')
