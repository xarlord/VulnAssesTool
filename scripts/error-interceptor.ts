/**
 * Error Interceptor for Electron Main Process
 *
 * Captures errors from both main and renderer processes and writes them
 * to .errors/errors.jsonl for the watch-errors.ts CLI to consume.
 *
 * Usage in main.ts:
 *   import { initMainErrorInterceptor } from '../scripts/error-interceptor.js'
 *   initMainErrorInterceptor()  // call before app.whenReady()
 */

import fs from 'node:fs'
import path from 'node:path'
import type { IpcMainInvokeEvent } from 'electron'

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

const ERROR_DIR = path.resolve(process.cwd(), '.errors')
const ERROR_FILE = path.join(ERROR_DIR, 'errors.jsonl')

function ensureErrorDir(): void {
  if (!fs.existsSync(ERROR_DIR)) {
    fs.mkdirSync(ERROR_DIR, { recursive: true })
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function writeError(error: Omit<CapturedError, 'id' | 'resolved'>): void {
  try {
    ensureErrorDir()
    const entry: CapturedError = {
      ...error,
      id: generateId(),
      resolved: false,
    }
    fs.appendFileSync(ERROR_FILE, JSON.stringify(entry) + '\n', 'utf-8')
  } catch {
    // Silently fail — never let error logging crash the app
  }
}

function sanitizeArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.message + (arg.stack ? '\n' + arg.stack : '')
  }
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

/**
 * Initialize error interception in the main process.
 * Must be called before app.whenReady().
 *
 * - Patches console.error and console.warn
 * - Registers uncaughtException and unhandledRejection handlers
 * - Registers IPC handler for renderer-side errors
 */
export function initMainErrorInterceptor(): void {
  // Patch console.error
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    originalError.apply(console, args)
    const message = args.map(sanitizeArg).join(' ')
    // Skip our own log noise and harmless messages
    if (message.includes('[Mock]') || message.includes('CSP directive')) return
    writeError({
      timestamp: new Date().toISOString(),
      source: 'main',
      level: 'error',
      message,
      metadata: { argsCount: args.length },
    })
  }

  // Patch console.warn
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args)
    const message = args.map(sanitizeArg).join(' ')
    if (message.includes('[Mock]')) return
    writeError({
      timestamp: new Date().toISOString(),
      source: 'main',
      level: 'warn',
      message,
    })
  }

  // Catch uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    writeError({
      timestamp: new Date().toISOString(),
      source: 'main',
      level: 'error',
      message: `Uncaught Exception: ${error.message}`,
      stack: error.stack,
    })
  })

  // Catch unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    writeError({
      timestamp: new Date().toISOString(),
      source: 'main',
      level: 'error',
      message: `Unhandled Rejection: ${message}`,
      stack,
    })
  })

  // Register IPC handler for renderer errors
  // This is called from the preload script's error interceptor
  try {
    void import('electron').then(({ ipcMain }) => {
      ipcMain.handle(
        'error-interceptor:report',
        (_event: IpcMainInvokeEvent, errorData: Omit<CapturedError, 'id' | 'resolved'>) => {
          writeError(errorData)
          return { captured: true }
        },
      )
    })
  } catch {
    // electron not available (e.g., running outside Electron)
  }

  console.log('[ErrorInterceptor] Main process error interceptor initialized')
}

/**
 * Get the IPC channel name for renderer-to-main error reporting.
 * Used by the preload script.
 */
export const RENDERER_ERROR_CHANNEL = 'error-interceptor:report'
