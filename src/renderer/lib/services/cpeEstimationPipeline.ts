/**
 * CPE Estimation Pipeline
 *
 * Orchestrates CPE estimation for SBOM components that are missing CPE values.
 * This pipeline integrates with the existing cpeEstimationService to:
 * - Process components after SBOM parsing
 * - Check KNOWN_CPE_MAPPINGS in cpeUtils
 * - Query local NVD database for CPE matches
 * - Apply confidence scoring
 * - Auto-select CPE if confidence >= 80%
 * - Flag ambiguous components for user review
 *
 * @module cpeEstimationPipeline
 */

import type { Component } from '@@/types'
import { CPEEstimationService, getCPEEstimationService, type EstimationResult } from './cpeEstimationService'
import type { CPEMatchResult, AmbiguousComponent } from '../generators/excelParser'

/**
 * Pipeline result containing processed components and estimation metadata
 */
export interface PipelineResult {
  /** All components with CPEs assigned (either from SBOM, auto-selected, or user-selected) */
  components: Component[]
  /** Results from the estimation process */
  estimationResults: EstimationResult[]
  /** Components that need user confirmation (ambiguous matches) */
  ambiguousComponents: AmbiguousComponent[]
  /** Summary statistics */
  summary: {
    totalProcessed: number
    alreadyHadCpe: number
    autoSelected: number
    needsConfirmation: number
    noMatchFound: number
  }
}

/**
 * Options for running the CPE estimation pipeline
 */
export interface PipelineOptions {
  /** Minimum confidence threshold for auto-selection (0-100, default: 80) */
  autoSelectThreshold?: number
  /** Maximum number of CPEs to return per component (default: 5) */
  maxResultsPerComponent?: number
  /** Whether to include low-confidence matches (default: false) */
  includeLowConfidence?: boolean
  /** External CPE search function (for database/API lookup) */
  externalSearchFn?: (productName: string, limit?: number) => Promise<CPEMatchResult[]>
}

/**
 * Default pipeline options
 */
const DEFAULT_PIPELINE_OPTIONS: Required<Omit<PipelineOptions, 'externalSearchFn'>> = {
  autoSelectThreshold: 80,
  maxResultsPerComponent: 5,
  includeLowConfidence: false,
}

/**
 * CPE Estimation Pipeline class
 *
 * Handles the orchestration of CPE estimation for components without CPEs.
 */
export class CPEEstimationPipeline {
  private estimationService: CPEEstimationService
  private options: Required<Omit<PipelineOptions, 'externalSearchFn'>> & {
    externalSearchFn?: PipelineOptions['externalSearchFn']
  }

  constructor(options: PipelineOptions = {}) {
    this.options = {
      ...DEFAULT_PIPELINE_OPTIONS,
      ...options,
    }
    this.estimationService = getCPEEstimationService({
      autoSelectThreshold: this.options.autoSelectThreshold,
      maxResultsPerComponent: this.options.maxResultsPerComponent,
      includeLowConfidence: this.options.includeLowConfidence,
      externalSearchFn: this.options.externalSearchFn,
    })
  }

  /**
   * Run the CPE estimation pipeline on a set of components.
   *
   * @param components - Components to process (typically from SBOM parsing)
   * @returns Pipeline result with updated components and estimation metadata
   */
  async run(components: Component[]): Promise<PipelineResult> {
    // Separate components that already have CPEs
    const componentsWithCpe = components.filter((c) => c.cpe)
    const componentsWithoutCpe = components.filter((c) => !c.cpe)

    // Run estimation on components without CPEs
    const estimationResults = await this.estimationService.estimateComponents(componentsWithoutCpe)

    // Build updated components array
    const updatedComponents: Component[] = [...componentsWithCpe]
    const ambiguousComponents: AmbiguousComponent[] = []

    for (const result of estimationResults) {
      const originalComponent = componentsWithoutCpe.find((c) => c.id === result.componentId)
      if (!originalComponent) continue

      if (result.autoSelected) {
        // Auto-selected high confidence CPE
        updatedComponents.push({
          ...originalComponent,
          cpe: result.autoSelected,
          hasMissingCpe: false,
          suggestedCpes: result.estimatedCPEs.map((cpe) => ({
            cpe: cpe.cpe,
            vendor: cpe.vendor,
            product: cpe.product,
            confidence: cpe.confidence,
            source: 'inferred' as const,
          })),
        })
      } else if (result.estimatedCPEs.length > 0) {
        // Has suggestions but needs user confirmation
        updatedComponents.push({
          ...originalComponent,
          hasMissingCpe: true,
          suggestedCpes: result.estimatedCPEs.map((cpe) => ({
            cpe: cpe.cpe,
            vendor: cpe.vendor,
            product: cpe.product,
            confidence: cpe.confidence,
            source: 'inferred' as const,
          })),
        })
        // Add to ambiguous list for user confirmation
        ambiguousComponents.push({
          componentId: result.componentId,
          componentName: result.componentName,
          componentVersion: result.componentVersion,
          estimatedCPEs: result.estimatedCPEs,
          needsUserConfirmation: result.needsUserConfirmation,
        })
      } else {
        // No CPE matches found
        updatedComponents.push({
          ...originalComponent,
          hasMissingCpe: true,
        })
      }
    }

    // Build summary
    const summary = {
      totalProcessed: components.length,
      alreadyHadCpe: componentsWithCpe.length,
      autoSelected: estimationResults.filter((r) => r.autoSelected !== undefined).length,
      needsConfirmation: estimationResults.filter((r) => r.needsUserConfirmation && r.estimatedCPEs.length > 0).length,
      noMatchFound: estimationResults.filter((r) => r.estimatedCPEs.length === 0).length,
    }

    return {
      components: updatedComponents,
      estimationResults,
      ambiguousComponents,
      summary,
    }
  }

  /**
   * Apply user CPE selections to components.
   *
   * @param components - Components with suggested CPEs
   * @param selections - Map of component ID to selected CPE string
   * @returns Updated components with CPEs assigned
   */
  applyUserSelections(components: Component[], selections: Map<string, string>): Component[] {
    return components.map((component) => {
      const selectedCPE = selections.get(component.id)
      if (selectedCPE) {
        return {
          ...component,
          cpe: selectedCPE,
          hasMissingCpe: false,
        }
      }
      return component
    })
  }

  /**
   * Get the count of components missing CPEs.
   *
   * @param components - Components to check
   * @returns Number of components without CPE
   */
  static countMissingCpes(components: Component[]): number {
    return components.filter((c) => !c.cpe).length
  }

  /**
   * Check if any components need CPE estimation.
   *
   * @param components - Components to check
   * @returns true if any components are missing CPEs
   */
  static needsEstimation(components: Component[]): boolean {
    return components.some((c) => !c.cpe && c.version)
  }

  /**
   * Get components that have suggested CPEs but no final CPE assigned.
   *
   * @param components - Components to filter
   * @returns Components with suggested CPEs pending confirmation
   */
  static getPendingConfirmations(components: Component[]): Component[] {
    return components.filter((c) => !c.cpe && c.suggestedCpes && c.suggestedCpes.length > 0)
  }
}

/**
 * Singleton pipeline instance
 */
let pipelineInstance: CPEEstimationPipeline | null = null

/**
 * Get the singleton CPE Estimation Pipeline instance.
 *
 * @param options - Optional pipeline options (used on first call)
 * @returns CPE Estimation Pipeline instance
 */
export function getCPEEstimationPipeline(options?: PipelineOptions): CPEEstimationPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new CPEEstimationPipeline(options)
  }
  return pipelineInstance
}

/**
 * Reset the singleton instance (useful for testing).
 */
export function resetCPEEstimationPipeline(): void {
  pipelineInstance = null
}

/**
 * Convenience function to run CPE estimation on components.
 *
 * @param components - Components to process
 * @param options - Optional pipeline options
 * @returns Pipeline result
 */
export async function estimateCpesForComponents(
  components: Component[],
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const pipeline = new CPEEstimationPipeline(options)
  return pipeline.run(components)
}
