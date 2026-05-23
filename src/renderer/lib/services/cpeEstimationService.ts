/**
 * CPE Estimation Service
 *
 * Provides CPE (Common Platform Enumeration) estimation functionality
 * for components that are missing CPE identifiers.
 *
 * Uses a combination of:
 * - Known vendor/product mappings
 * - NVD database search
 * - Pattern-based inference
 *
 * @module cpeEstimationService
 */

import { suggestCPEs, type CPESuggestion } from '../utils/cpeUtils'
import type { Component } from '@@/types'
import type { CPEMatchResult, AmbiguousComponent } from '../generators/excelParser'

/**
 * Estimation result for a single component
 */
export interface EstimationResult {
  /** Component identifier */
  componentId: string
  /** Component name */
  componentName: string
  /** Component version */
  componentVersion: string
  /** Estimated CPEs with match scores */
  estimatedCPEs: CPEMatchResult[]
  /** Auto-selected CPE if single high-confidence match */
  autoSelected?: string
  /** Whether user confirmation is needed */
  needsUserConfirmation: boolean
}

/**
 * Batch estimation result
 */
export interface BatchEstimationResult {
  /** Estimation results per component */
  results: EstimationResult[]
  /** Total components processed */
  totalProcessed: number
  /** Components with auto-selected CPEs */
  autoSelectedCount: number
  /** Components needing user confirmation */
  needsConfirmationCount: number
  /** Components with no CPE matches found */
  noMatchCount: number
}

/**
 * CPE Estimation Options
 */
export interface CPEEstimationOptions {
  /** Minimum confidence threshold for auto-selection (0-100) */
  autoSelectThreshold?: number
  /** Maximum number of CPEs to return per component */
  maxResultsPerComponent?: number
  /** Whether to include low-confidence matches */
  includeLowConfidence?: boolean
  /** External CPE search function (for database/API lookup) */
  externalSearchFn?: (productName: string, limit?: number) => Promise<CPEMatchResult[]>
}

/**
 * Default estimation options
 */
const DEFAULT_OPTIONS: Required<Omit<CPEEstimationOptions, 'externalSearchFn'>> = {
  autoSelectThreshold: 80,
  maxResultsPerComponent: 5,
  includeLowConfidence: false,
}

/**
 * CPE Estimation Service
 *
 * Provides methods for estimating CPEs for components without them.
 */
export class CPEEstimationService {
  private options: Required<Omit<CPEEstimationOptions, 'externalSearchFn'>> & {
    externalSearchFn?: CPEEstimationOptions['externalSearchFn']
  }

  constructor(options: CPEEstimationOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    }
  }

  /**
   * Estimate CPEs for a single component.
   *
   * @param componentName - Component name
   * @param version - Component version
   * @returns Promise resolving to array of CPE match results
   */
  async estimateCPEs(componentName: string, version: string): Promise<CPEMatchResult[]> {
    if (!componentName || !version) {
      return []
    }

    const results: CPEMatchResult[] = []

    const knownSuggestions = suggestCPEs(componentName, version)
    for (const suggestion of knownSuggestions) {
      if (!this.options.includeLowConfidence && suggestion.confidence === 'low') {
        continue
      }

      results.push(this.suggestionToMatchResult(suggestion))
    }

    if (this.options.externalSearchFn) {
      try {
        const dbResults = await this.options.externalSearchFn(componentName, this.options.maxResultsPerComponent)
        const normalizedVersion = version.toLowerCase().replace(/[/\\]/g, '.')

        function extractCpeVersion(cpe: string): string {
          const parts = cpe.split(':')
          return parts.length >= 6 ? parts[5] : ''
        }

        for (const local of results) {
          const dbMatch = dbResults.find(
            (db) =>
              db.vendor.toLowerCase() === local.vendor.toLowerCase() &&
              db.product.toLowerCase() === local.product.toLowerCase(),
          )

          if (dbMatch) {
            const dbVersion = extractCpeVersion(dbMatch.cpe).toLowerCase()
            if (dbVersion && (dbVersion === normalizedVersion || dbVersion === '*')) {
              local.confidence = 'high'
              local.matchScore = 90
              local.cpe = dbMatch.cpe
            } else {
              local.confidence = 'medium'
              local.matchScore = 70
            }
          } else {
            local.confidence = 'low'
            local.matchScore = 40
          }
        }

        for (const db of dbResults) {
          const isDuplicate = results.some(
            (r) =>
              r.vendor.toLowerCase() === db.vendor.toLowerCase() &&
              r.product.toLowerCase() === db.product.toLowerCase(),
          )
          if (!isDuplicate) {
            results.push({ ...db })
          }
        }
      } catch (error) {
        console.warn('[CPEEstimationService] External search failed:', error)
      }
    }

    results.sort((a, b) => b.matchScore - a.matchScore)

    return results.slice(0, this.options.maxResultsPerComponent)
  }

  /**
   * Estimate CPEs for multiple components.
   *
   * @param components - Components to process
   * @returns Promise resolving to batch estimation result
   */
  async estimateComponents(components: Component[]): Promise<EstimationResult[]> {
    const results: EstimationResult[] = []

    for (const component of components) {
      // Skip components that already have a CPE
      if (component.cpe) {
        continue
      }

      // Skip components without a version
      if (!component.version) {
        continue
      }

      const estimatedCPEs = await this.estimateCPEs(component.name, component.version)

      // Determine if auto-selection is possible
      const highConfidenceMatches = estimatedCPEs.filter((cpe) => cpe.matchScore >= this.options.autoSelectThreshold)

      let autoSelected: string | undefined
      let needsUserConfirmation = true

      if (highConfidenceMatches.length === 1) {
        autoSelected = highConfidenceMatches[0].cpe
        needsUserConfirmation = false
      }

      results.push({
        componentId: component.id,
        componentName: component.name,
        componentVersion: component.version,
        estimatedCPEs,
        autoSelected,
        needsUserConfirmation,
      })
    }

    return results
  }

  /**
   * Assign user-selected CPEs to components.
   *
   * @param components - Original components
   * @param selections - Map of component ID to selected CPE string
   * @returns Components with CPEs assigned
   */
  async assignCPEs(components: Component[], selections: Map<string, string>): Promise<Component[]> {
    return components.map((component) => {
      const selectedCPE = selections.get(component.id)
      if (selectedCPE) {
        return {
          ...component,
          cpe: selectedCPE,
        }
      }
      return component
    })
  }

  /**
   * Get a summary of the estimation batch results.
   *
   * @param results - Estimation results
   * @returns Batch summary
   */
  getBatchSummary(results: EstimationResult[]): BatchEstimationResult {
    return {
      results,
      totalProcessed: results.length,
      autoSelectedCount: results.filter((r) => r.autoSelected !== undefined).length,
      needsConfirmationCount: results.filter((r) => r.needsUserConfirmation && r.estimatedCPEs.length > 0).length,
      noMatchCount: results.filter((r) => r.estimatedCPEs.length === 0).length,
    }
  }

  /**
   * Convert CPESuggestion to CPEMatchResult.
   */
  private suggestionToMatchResult(suggestion: CPESuggestion): CPEMatchResult {
    // Convert confidence level to match score
    const scoreMap = {
      high: 90,
      medium: 70,
      low: 40,
    }

    return {
      cpe: suggestion.cpe,
      vendor: suggestion.vendor,
      product: suggestion.product,
      confidence: suggestion.confidence,
      matchScore: scoreMap[suggestion.confidence],
    }
  }
}

/**
 * Singleton instance of the CPE Estimation Service
 */
let serviceInstance: CPEEstimationService | null = null

/**
 * Get the singleton instance of the CPE Estimation Service.
 *
 * @param options - Optional service options (used on first call)
 * @returns CPE Estimation Service instance
 */
export function getCPEEstimationService(options?: CPEEstimationOptions): CPEEstimationService {
  if (!serviceInstance) {
    serviceInstance = new CPEEstimationService(options)
  }
  return serviceInstance
}

/**
 * Reset the singleton instance (useful for testing).
 */
export function resetCPEEstimationService(): void {
  serviceInstance = null
}

/**
 * Convert EstimationResult to AmbiguousComponent for UI handling.
 *
 * @param result - Estimation result
 * @returns Ambiguous component for UI
 */
export function toAmbiguousComponent(result: EstimationResult): AmbiguousComponent {
  return {
    componentId: result.componentId,
    componentName: result.componentName,
    componentVersion: result.componentVersion,
    estimatedCPEs: result.estimatedCPEs,
    needsUserConfirmation: result.needsUserConfirmation,
  }
}

/**
 * Convert array of EstimationResults to AmbiguousComponents.
 *
 * @param results - Estimation results
 * @returns Array of ambiguous components
 */
export function toAmbiguousComponents(results: EstimationResult[]): AmbiguousComponent[] {
  return results.filter((r) => r.needsUserConfirmation && r.estimatedCPEs.length > 0).map(toAmbiguousComponent)
}

export function createCpeDatabaseSearchFn(): (productName: string, limit?: number) => Promise<CPEMatchResult[]> {
  return async (productName: string, limit?: number): Promise<CPEMatchResult[]> => {
    try {
      const { getPlatform } = await import('../platform')
      const platform = getPlatform()
      const response = await platform.database.cpeSearch({
        productName,
        limit: limit ?? 10,
      })

      if (!response.success || !response.results) {
        return []
      }

      return response.results.map((r) => ({
        cpe: r.cpe23Uri,
        vendor: r.vendor,
        product: r.product,
        confidence: r.vulnerable ? 'high' : 'medium',
        matchScore: r.vulnerable ? 90 : 70,
      }))
    } catch {
      return []
    }
  }
}
