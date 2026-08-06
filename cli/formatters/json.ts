/**
 * JSON output formatter for CLI scan results.
 * Emits the full ScanResult (Date fields serialize to ISO strings).
 */

import type { ScanResult } from '../commands/scan.js'

export function formatJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2)
}
