#!/usr/bin/env npx tsx
/**
 * Error Watcher CLI
 *
 * Reads .errors/errors.jsonl and reports unresolved errors.
 * Supports --mark-resolved, --clear, --count, --json flags.
 *
 * Usage:
 *   npx tsx scripts/watch-errors.ts              # show unresolved errors
 *   npx tsx scripts/watch-errors.ts --json        # JSON output
 *   npx tsx scripts/watch-errors.ts --mark-resolved  # mark all as resolved
 *   npx tsx scripts/watch-errors.ts --clear       # delete all errors
 *   npx tsx scripts/watch-errors.ts --count       # count unresolved
 */

import fs from 'node:fs'
import path from 'node:path'

const ERROR_DIR = path.resolve(process.cwd(), '.errors')
const ERROR_FILE = path.join(ERROR_DIR, 'errors.jsonl')

interface CapturedError {
  id: string
  timestamp: string
  source: 'main' | 'renderer'
  level: 'error' | 'warn'
  message: string
  stack?: string
  resolved: boolean
  resolvedAt?: string
  metadata?: Record<string, unknown>
}

function readErrors(): CapturedError[] {
  if (!fs.existsSync(ERROR_FILE)) return []
  const content = fs.readFileSync(ERROR_FILE, 'utf-8').trim()
  if (!content) return []
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as CapturedError
      } catch {
        return null
      }
    })
    .filter((e): e is CapturedError => e !== null)
}

function writeErrors(errors: CapturedError[]): void {
  if (!fs.existsSync(ERROR_DIR)) {
    fs.mkdirSync(ERROR_DIR, { recursive: true })
  }
  const content = errors.map((e) => JSON.stringify(e)).join('\n')
  fs.writeFileSync(ERROR_FILE, content + (content ? '\n' : ''), 'utf-8')
}

function getUnresolved(): CapturedError[] {
  return readErrors().filter((e) => !e.resolved)
}

function markAllResolved(): void {
  const errors = readErrors()
  const now = new Date().toISOString()
  for (const e of errors) {
    if (!e.resolved) {
      e.resolved = true
      e.resolvedAt = now
    }
  }
  writeErrors(errors)
  const count = errors.filter((e) => e.resolved && e.resolvedAt === now).length
  console.log(`Marked ${count} error(s) as resolved`)
}

function clearAll(): void {
  if (fs.existsSync(ERROR_FILE)) {
    fs.writeFileSync(ERROR_FILE, '', 'utf-8')
  }
  console.log('All errors cleared')
}

function showCount(): void {
  const unresolved = getUnresolved()
  const all = readErrors()
  console.log(`Unresolved: ${unresolved.length} | Total: ${all.length}`)
}

function showErrors(json: boolean): void {
  const unresolved = getUnresolved()

  if (json) {
    console.log(JSON.stringify(unresolved, null, 2))
    return
  }

  if (unresolved.length === 0) {
    console.log('No unresolved errors')
    return
  }

  console.log(`\n=== ${unresolved.length} Unresolved Error(s) ===\n`)

  for (const error of unresolved) {
    const time = new Date(error.timestamp).toLocaleString()
    const source = error.source === 'main' ? 'MAIN' : 'RENDERER'
    const level = error.level.toUpperCase()

    console.log(`[${error.id}] ${time} | ${source} | ${level}`)
    console.log(`  ${error.message}`)

    if (error.stack) {
      // Show first 3 lines of stack trace
      const stackLines = error.stack.split('\n').slice(0, 3)
      for (const line of stackLines) {
        console.log(`  ${line.trim()}`)
      }
    }
    console.log()
  }
}

// CLI
const args = process.argv.slice(2)

if (args.includes('--mark-resolved')) {
  markAllResolved()
} else if (args.includes('--clear')) {
  clearAll()
} else if (args.includes('--count')) {
  showCount()
} else {
  showErrors(args.includes('--json'))
}
