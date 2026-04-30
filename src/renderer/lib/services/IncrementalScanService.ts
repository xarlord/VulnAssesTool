/**
 * Incremental Scan Service
 *
 * Integrates DiffEngine with the vulnerability scanning workflow to enable
 * incremental scanning. Only scans components that have changed since the
 * last scan, reducing rescan time by up to 80% for minor SBOM updates.
 *
 * @module IncrementalScanService
 */

import type { Component } from '../../../shared/types'
import { DiffEngine, type DiffResult, type DiffStats } from './DiffEngine'

/**
 * Result of preparing an incremental scan
 */
export interface IncrementalScanPrepareResult {
  /** Components that need to be scanned (added + modified) */
  componentsToScan: Component[]
  /** Full diff result for reporting */
  diff: DiffResult
  /** Whether a full rescan is recommended */
  needsFullRescan: boolean
  /** Summary of changes */
  summary: string
}

/**
 * Scan history entry for tracking changes over time
 */
export interface ScanHistoryEntry {
  /** Timestamp of the scan */
  timestamp: Date
  /** Number of components scanned */
  componentsScanned: number
  /** Total components in SBOM at time of scan */
  totalComponents: number
  /** Change percentage from previous scan */
  changePercent: number
  /** Whether it was a full or incremental scan */
  scanType: 'full' | 'incremental'
  /** Time saved by incremental scanning (ms) */
  timeSavedMs?: number
}

/**
 * Options for incremental scan
 */
export interface IncrementalScanOptions {
  /** Threshold for recommending full rescan (default: 50%) */
  fullRescanThreshold?: number
  /** Whether to include unchanged components in result for reference */
  includeUnchanged?: boolean
  /** Custom hash function */
  hashFunction?: (data: string) => string
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<IncrementalScanOptions, 'hashFunction'>> = {
  fullRescanThreshold: 50,
  includeUnchanged: false,
}

/**
 * IncrementalScanService class
 *
 * Manages incremental scanning by tracking component changes and
 * only scanning components that have changed since the last scan.
 */
export class IncrementalScanService {
  private diffEngine: DiffEngine
  private options: Required<IncrementalScanOptions>
  private scanHistory: Map<string, ScanHistoryEntry[]> = new Map()

  constructor(options: IncrementalScanOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    } as Required<IncrementalScanOptions>

    this.diffEngine = new DiffEngine({
      hashFunction: options.hashFunction,
    })
  }

  /**
   * Prepare an incremental scan by comparing old and new components
   *
   * @param projectId - The project ID
   * @param oldComponents - Components from the previous scan
   * @param newComponents - Current components from the SBOM
   * @returns Preparation result with components to scan
   */
  prepareIncrementalScan(
    projectId: string,
    oldComponents: Component[],
    newComponents: Component[],
  ): IncrementalScanPrepareResult {
    // Compute diff between old and new
    const diff = this.diffEngine.computeDiff(oldComponents, newComponents)

    // Determine if full rescan is needed
    const needsFullRescan = oldComponents.length === 0 || diff.stats.changePercent >= this.options.fullRescanThreshold

    // Get components to scan
    let componentsToScan: Component[]
    let summary: string

    if (needsFullRescan) {
      // Full rescan: scan all components
      componentsToScan = newComponents
      summary = this.generateFullRescanSummary(diff.stats, oldComponents.length === 0)
    } else {
      // Incremental scan: only scan changed components
      componentsToScan = this.diffEngine.getComponentsToScan(oldComponents, newComponents)
      summary = this.generateIncrementalSummary(diff)
    }

    // Record scan history
    this.recordScanHistory(projectId, {
      timestamp: new Date(),
      componentsScanned: componentsToScan.length,
      totalComponents: newComponents.length,
      changePercent: diff.stats.changePercent,
      scanType: needsFullRescan ? 'full' : 'incremental',
      timeSavedMs: needsFullRescan
        ? undefined
        : this.estimateTimeSavedMs(newComponents.length, componentsToScan.length),
    })

    return {
      componentsToScan,
      diff,
      needsFullRescan,
      summary,
    }
  }

  /**
   * Get components that need scanning (convenience method)
   */
  getComponentsToScan(oldComponents: Component[], newComponents: Component[]): Component[] {
    return this.diffEngine.getComponentsToScan(oldComponents, newComponents)
  }

  /**
   * Check if a full rescan is needed
   */
  needsFullRescan(oldComponents: Component[], newComponents: Component[]): boolean {
    return this.diffEngine.needsRescan(oldComponents, newComponents, this.options.fullRescanThreshold)
  }

  /**
   * Get scan history for a project
   */
  getScanHistory(projectId: string): ScanHistoryEntry[] {
    return this.scanHistory.get(projectId) || []
  }

  /**
   * Get statistics about incremental scanning for a project
   */
  getScanStatistics(projectId: string): {
    totalScans: number
    incrementalScans: number
    fullScans: number
    totalTimeSavedMs: number
    averageChangePercent: number
  } {
    const history = this.getScanHistory(projectId)

    if (history.length === 0) {
      return {
        totalScans: 0,
        incrementalScans: 0,
        fullScans: 0,
        totalTimeSavedMs: 0,
        averageChangePercent: 0,
      }
    }

    const incrementalScans = history.filter((s) => s.scanType === 'incremental').length
    const fullScans = history.filter((s) => s.scanType === 'full').length
    const totalTimeSavedMs = history.reduce((sum, s) => sum + (s.timeSavedMs || 0), 0)
    const averageChangePercent = history.reduce((sum, s) => sum + s.changePercent, 0) / history.length

    return {
      totalScans: history.length,
      incrementalScans,
      fullScans,
      totalTimeSavedMs,
      averageChangePercent,
    }
  }

  /**
   * Clear scan history for a project
   */
  clearScanHistory(projectId: string): void {
    this.scanHistory.delete(projectId)
  }

  /**
   * Compute hash for a component
   */
  computeComponentHash(component: Component): string {
    return this.diffEngine.computeComponentHash(component)
  }

  /**
   * Update component hashes after parsing
   */
  updateComponentHashes(components: Component[]): Component[] {
    return components.map((component) => ({
      ...component,
      componentHash: this.computeComponentHash(component),
    }))
  }

  /**
   * Record scan history entry
   */
  private recordScanHistory(projectId: string, entry: ScanHistoryEntry): void {
    const history = this.scanHistory.get(projectId) || []
    history.push(entry)

    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift()
    }

    this.scanHistory.set(projectId, history)
  }

  /**
   * Estimate time saved by incremental scanning
   * Assumes 100ms per component for vulnerability lookup
   */
  private estimateTimeSavedMs(totalComponents: number, componentsScanned: number): number {
    const avgTimePerComponent = 100 // ms
    const componentsSkipped = totalComponents - componentsScanned
    return componentsSkipped * avgTimePerComponent
  }

  /**
   * Generate summary for full rescan
   */
  private generateFullRescanSummary(stats: DiffStats, isFirstScan: boolean): string {
    if (isFirstScan) {
      return `First scan: scanning all ${stats.newTotal} components`
    }

    return `Full rescan required: ${stats.changePercent}% of components changed (threshold: ${this.options.fullRescanThreshold}%). Scanning all ${stats.newTotal} components.`
  }

  /**
   * Generate summary for incremental scan
   */
  private generateIncrementalSummary(diff: DiffResult): string {
    const stats = diff.stats
    const componentsToScan = stats.addedCount + stats.modifiedCount
    const timeSaved = this.estimateTimeSavedMs(stats.newTotal, componentsToScan)

    const lines: string[] = [
      `Incremental scan: ${componentsToScan} components to scan (${stats.changePercent}% changed)`,
      `  + ${stats.addedCount} added`,
      `  ~ ${stats.modifiedCount} modified`,
      `  = ${stats.unchangedCount} unchanged (skipped)`,
      `Estimated time saved: ${this.formatDuration(timeSaved)}`,
    ]

    // Add details for small diffs
    if (diff.modified.length > 0 && diff.modified.length <= 5) {
      lines.push(`Modified components:`)
      for (const mod of diff.modified) {
        lines.push(`  - ${mod.new.name} (${mod.old.version} → ${mod.new.version})`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`
    }
    const seconds = Math.round(ms / 1000)
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
}

/**
 * Create an IncrementalScanService instance
 */
export function createIncrementalScanService(options?: IncrementalScanOptions): IncrementalScanService {
  return new IncrementalScanService(options)
}

/**
 * Quick utility to get components that need scanning
 */
export function getComponentsNeedingScan(
  oldComponents: Component[],
  newComponents: Component[],
  threshold = 50,
): { components: Component[]; needsFullRescan: boolean } {
  const service = new IncrementalScanService({ fullRescanThreshold: threshold })
  const result = service.prepareIncrementalScan('temp', oldComponents, newComponents)
  return {
    components: result.componentsToScan,
    needsFullRescan: result.needsFullRescan,
  }
}

export default IncrementalScanService
