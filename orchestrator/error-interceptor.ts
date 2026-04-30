/**
 * Error Interceptor
 *
 * Detects and parses errors from multiple sources:
 * - Terminal output (stdout/stderr)
 * - Console errors (from Playwright)
 * - IPC communication errors
 */

import type { ErrorMatch, ErrorType, ErrorPatternDefinition } from './types'
import { ERROR_PATTERNS } from './utils/patterns'

export class ErrorInterceptor {
  private errors: ErrorMatch[] = []
  private consoleErrors: string[] = []
  private pageErrors: Error[] = []

  /**
   * Parse a line of output for errors
   */
  parseLine(line: string, _source: 'stdout' | 'stderr' | 'console' = 'stdout'): ErrorMatch | null {
    for (const definition of ERROR_PATTERNS) {
      const match = line.match(definition.pattern)
      if (match) {
        return this.createErrorMatch(definition, match, line)
      }
    }
    return null
  }

  /**
   * Parse multiple lines of output
   */
  parseOutput(output: string): ErrorMatch[] {
    const lines = output.split('\n')
    const found: ErrorMatch[] = []

    for (const line of lines) {
      const error = this.parseLine(line)
      if (error) {
        found.push(error)
        this.errors.push(error)
      }
    }

    return found
  }

  /**
   * Add a console error from Playwright
   */
  addConsoleError(message: string): void {
    this.consoleErrors.push(message)

    // Parse for error patterns
    const error = this.parseLine(message, 'console')
    if (error) {
      error.type = 'console'
      this.errors.push(error)
    } else {
      // Create generic console error
      this.errors.push({
        type: 'console',
        message: message,
        rawOutput: message,
        severity: 'warning',
        timestamp: new Date(),
      })
    }
  }

  /**
   * Add a page error from Playwright
   */
  addPageError(error: Error): void {
    this.pageErrors.push(error)

    const errorMatch: ErrorMatch = {
      type: 'react',
      message: error.message,
      stack: error.stack,
      rawOutput: `${error.message}\n${error.stack || ''}`,
      severity: 'error',
      timestamp: new Date(),
    }

    // Try to extract file and line from stack
    const stackMatch = error.stack?.match(/at .*?\((.+?):(\d+):(\d+)\)/)
    if (stackMatch) {
      errorMatch.file = stackMatch[1]
      errorMatch.line = parseInt(stackMatch[2], 10)
      errorMatch.column = parseInt(stackMatch[3], 10)
    }

    this.errors.push(errorMatch)
  }

  /**
   * Add an IPC error
   */
  addIPCError(channel: string, error: Error | string): void {
    const message = typeof error === 'string' ? error : error.message
    const stack = typeof error === 'string' ? undefined : error.stack

    this.errors.push({
      type: 'ipc',
      message: `IPC error on channel '${channel}': ${message}`,
      stack,
      rawOutput: `Channel: ${channel}\nError: ${message}${stack ? `\n${stack}` : ''}`,
      severity: 'error',
      timestamp: new Date(),
    })
  }

  /**
   * Get all collected errors
   */
  getErrors(): ErrorMatch[] {
    return [...this.errors]
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type: ErrorType): ErrorMatch[] {
    return this.errors.filter((e) => e.type === type)
  }

  /**
   * Get critical errors only
   */
  getCriticalErrors(): ErrorMatch[] {
    return this.errors.filter((e) => e.severity === 'critical')
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0
  }

  /**
   * Check if there are any critical errors
   */
  hasCriticalErrors(): boolean {
    return this.errors.some((e) => e.severity === 'critical')
  }

  /**
   * Clear all collected errors
   */
  clear(): void {
    this.errors = []
    this.consoleErrors = []
    this.pageErrors = []
  }

  /**
   * Get console errors for debugging
   */
  getConsoleErrors(): string[] {
    return [...this.consoleErrors]
  }

  /**
   * Get page errors for debugging
   */
  getPageErrors(): Error[] {
    return [...this.pageErrors]
  }

  /**
   * Get unique errors (deduplicated by message)
   */
  getUniqueErrors(): ErrorMatch[] {
    const seen = new Set<string>()
    const unique: ErrorMatch[] = []

    for (const error of this.errors) {
      const key = `${error.type}:${error.message}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(error)
      }
    }

    return unique
  }

  /**
   * Generate a summary of errors by type
   */
  getSummary(): Record<ErrorType, number> {
    const summary: Record<ErrorType, number> = {
      build: 0,
      runtime: 0,
      console: 0,
      ipc: 0,
      typescript: 0,
      vite: 0,
      electron: 0,
      react: 0,
      unknown: 0,
    }

    for (const error of this.errors) {
      summary[error.type]++
    }

    return summary
  }

  /**
   * Create an ErrorMatch from a pattern match
   */
  private createErrorMatch(definition: ErrorPatternDefinition, match: RegExpMatchArray, rawLine: string): ErrorMatch {
    const errorMatch: ErrorMatch = {
      type: definition.type,
      message: match[0],
      rawOutput: rawLine,
      severity: definition.severity,
      timestamp: new Date(),
    }

    // Extract file/line information if present in the line
    const fileMatch = rawLine.match(/(?:at\s+)?(.+?):(\d+)(?::(\d+))?/)
    if (fileMatch) {
      errorMatch.file = fileMatch[1]
      errorMatch.line = parseInt(fileMatch[2], 10)
      if (fileMatch[3]) {
        errorMatch.column = parseInt(fileMatch[3], 10)
      }
    }

    return errorMatch
  }
}

/**
 * Create a global error interceptor instance
 */
export function createErrorInterceptor(): ErrorInterceptor {
  return new ErrorInterceptor()
}
