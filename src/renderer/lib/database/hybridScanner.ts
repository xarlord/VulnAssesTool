/**
 * Hybrid Scanner - Stub module
 *
 * Provides vulnerability scanning capabilities by combining local NVD database
 * queries with remote API lookups. This is a stub implementation — the real
 * implementation is expected to be provided by the runtime environment or mocked
 * in tests.
 *
 * The CLI scan command (`cli/commands/scan.ts`) depends on this module.
 */

import type { Vulnerability } from '../../../shared/types.js'

export interface ScanComponentResult {
  vulnerabilities: Vulnerability[]
  fromCache: number
  fromApi: number
  errors: string[]
}

export interface ScannerStatistics {
  totalCves: number
}

export interface ScannerInstance {
  scanComponent(purl: string, options?: { preferLocal?: boolean }): Promise<ScanComponentResult>
  scanComponents(purls: string[], options?: { preferLocal?: boolean }): Promise<ScanComponentResult[]>
  getStatistics(): ScannerStatistics
}

/**
 * Returns the shared scanner instance.
 * Stub implementation — override in tests or provide at runtime.
 */
export function getHybridScanner(): ScannerInstance {
  return {
    scanComponent: async () => ({
      vulnerabilities: [],
      fromCache: 0,
      fromApi: 0,
      errors: [],
    }),
    scanComponents: async () => [],
    getStatistics: () => ({ totalCves: 0 }),
  }
}

/**
 * HybridScanner class.
 * Stub implementation — override in tests or provide at runtime.
 */
export class HybridScanner {
  async scanComponent(_purl: string, _options?: { preferLocal?: boolean }): Promise<ScanComponentResult> {
    return { vulnerabilities: [], fromCache: 0, fromApi: 0, errors: [] }
  }

  async scanComponents(_purls: string[], _options?: { preferLocal?: boolean }): Promise<ScanComponentResult[]> {
    return []
  }

  getStatistics(): ScannerStatistics {
    return { totalCves: 0 }
  }
}
