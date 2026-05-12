/**
 * Error Pattern Definitions
 *
 * Regex patterns for detecting various error types across the application stack
 */

import type { ErrorPatternDefinition } from '../types'

export const ERROR_PATTERNS: ErrorPatternDefinition[] = [
  // TypeScript Errors
  {
    type: 'typescript',
    pattern: /error TS(\d+):\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'typescript',
    pattern: /Cannot find (?:module|name)\s+['"]?([^'"]+)['"]?/,
    severity: 'error',
  },
  {
    type: 'typescript',
    pattern: /Type\s+['"](.+)['"]\s+is not assignable to type\s+['"](.+)['"]/,
    severity: 'error',
  },
  {
    type: 'typescript',
    pattern: /Property\s+['"](.+)['"]\s+does not exist on type/,
    severity: 'error',
  },
  {
    type: 'typescript',
    pattern: /Cannot redeclare (?:block-scoped )?variable\s+['"](.+)['"]/,
    severity: 'error',
  },
  {
    type: 'typescript',
    pattern: /Missing return type on function/,
    severity: 'warning',
  },

  // Vite Build Errors
  {
    type: 'vite',
    pattern: /Build failed with (\d+) errors?/,
    severity: 'error',
  },
  {
    type: 'vite',
    pattern: /Could not resolve\s+['"]([^'"]+)['"]/,
    severity: 'error',
  },
  {
    type: 'vite',
    pattern: /transform failed with (\d+) errors?/,
    severity: 'error',
  },
  {
    type: 'vite',
    pattern: /Unexpected token\s*\(?/,
    severity: 'error',
  },
  {
    type: 'vite',
    pattern: /The requested module\s+['"]([^'"]+)['"]\s+does not provide an export/,
    severity: 'error',
  },

  // Electron Main Process Errors
  {
    type: 'electron',
    pattern: /Uncaught Exception:\s*(.+)/,
    severity: 'critical',
  },
  {
    type: 'electron',
    pattern: /A JavaScript error occurred in the main process/,
    severity: 'critical',
  },
  {
    type: 'electron',
    pattern: /Error:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'electron',
    pattern: /Failed to load:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'electron',
    pattern: /Cannot find module\s+['"]([^'"]+)['"]/,
    severity: 'critical',
  },
  {
    type: 'electron',
    pattern: /App threw an error during (?:load|startup)/,
    severity: 'critical',
  },

  // React Renderer Errors
  {
    type: 'react',
    pattern: /Error: Minified React error #(\d+)/,
    severity: 'critical',
  },
  {
    type: 'react',
    pattern: /Cannot read properties of (?:undefined|null)\s+\(reading\s+['"]([^'"]+)['"]\)/,
    severity: 'error',
  },
  {
    type: 'react',
    pattern: /Cannot destructure property\s+['"]([^'"]+)['"]\s+of\s+['"]([^'"]+)['"]\s+as it is (?:undefined|null)/,
    severity: 'error',
  },
  {
    type: 'react',
    pattern: /Objects are not valid as a React child/,
    severity: 'error',
  },
  {
    type: 'react',
    pattern: /Maximum update depth exceeded/,
    severity: 'error',
  },
  {
    type: 'react',
    pattern: /Rendered more hooks than during the previous render/,
    severity: 'error',
  },

  // IPC Communication Errors
  {
    type: 'ipc',
    pattern: /Error invoking remote method\s+['"]([^'"]+)['"]:?\s*(.+)?/,
    severity: 'error',
  },
  {
    type: 'ipc',
    pattern: /Channel\s+['"]([^'"]+)['"]\s+not found/,
    severity: 'error',
  },
  {
    type: 'ipc',
    pattern: /IPC(?:\s+handler)?\s+(?:error|failed)/i,
    severity: 'error',
  },
  {
    type: 'ipc',
    pattern: /Failed to invoke\s+['"]([^'"]+)['"]/,
    severity: 'error',
  },

  // Database Errors
  {
    type: 'runtime',
    pattern: /Database (?:initialization|connection) failed/i,
    severity: 'critical',
  },
  {
    type: 'runtime',
    pattern: /SQLITE_\w+:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'runtime',
    pattern: /no such table:\s*(\w+)/,
    severity: 'error',
  },
  {
    type: 'runtime',
    pattern: /UNIQUE constraint failed/,
    severity: 'error',
  },

  // Generic Runtime Errors
  {
    type: 'runtime',
    pattern: /TypeError:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'runtime',
    pattern: /ReferenceError:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'runtime',
    pattern: /SyntaxError:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'runtime',
    pattern: /RangeError:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'runtime',
    pattern: /UnhandledPromiseRejectionWarning:\s*(.+)/,
    severity: 'error',
  },
  {
    type: 'runtime',
    pattern: /FATAL ERROR:/,
    severity: 'critical',
  },

  // Console Error Patterns (from Playwright capture)
  {
    type: 'console',
    pattern: /console\.error:\s*(.+)/,
    severity: 'warning',
  },
  {
    type: 'console',
    pattern: /Warning:\s*(.+)/,
    severity: 'warning',
  },
]

// Success patterns for each phase
export const SUCCESS_PATTERNS = {
  build: /built in \d+(?:\.\d+)?[hms]|Build completed successfully/i,
  startup: /Database initialized successfully|Electron app ready/i,
  render: /Dashboard|VulnAssessTool/i,
  functional: /All smoke tests passed/i,
}

// Patterns that indicate the phase is ready to proceed
export const READY_PATTERNS = {
  build: /dist\/|build completed/i,
  startup: /App ready|Window created/i,
  render: /React|Rendered/i,
  functional: /Test completed/i,
}
