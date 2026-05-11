/**
 * Tier 2 Attack Graph Filter
 *
 * Analyzes vulnerabilities based on attack path reachability.
 * Filters vulnerabilities in components that are not reachable from external entry points.
 *
 * @module fpf/tier2AttackGraphFilter
 */

import type {
  FilterResult,
  FilterAction,
  FilterTier,
  FilterType,
  ReachabilityResult,
  Vulnerability,
  Component,
} from '@@/types/fpf'
import { AttackGraph } from './attackGraph'

/**
 * Tier 2 Attack Graph Filter class
 */
export class Tier2AttackGraphFilter {
  private graph: AttackGraph

  /**
   * Create a new Tier 2 filter
   * @param graph - Attack graph to use for analysis
   */
  constructor(graph: AttackGraph) {
    this.graph = graph
  }

  /**
   * Analyze a vulnerability against the attack graph
   * @param vulnerability - Vulnerability to analyze
   * @param component - Affected component
   * @returns Filter result with decision
   */
  analyze(vulnerability: Vulnerability, component: Component): FilterResult {
    const timestamp = new Date().toISOString()

    // Get component name for graph lookup
    const componentName = this.getComponentIdentifier(component)

    // Check reachability from external entry points
    const reachability = this.graph.isReachableFromExternal(componentName)

    // Calculate confidence in the decision
    const confidence = this.calculateConfidence(reachability)

    // Determine action based on reachability
    let action: FilterAction
    let reason: string
    let filterType: FilterType

    if (!reachability.reachable) {
      // Component is not reachable - filter as false positive
      if (reachability.blockedBy.length > 0) {
        action = 'filtered'
        reason = `Attack path blocked: ${reachability.blockedBy.join(', ')}`
        filterType = 'attack_path_blocked'
      } else {
        action = 'filtered'
        reason = `Component "${componentName}" is not reachable from any external entry point`
        filterType = 'internal_only'
      }
    } else {
      // Component is reachable - keep for review
      action = 'kept'
      reason = `Component is reachable from external entry points via ${reachability.paths.length} path(s)`
      filterType = 'attack_path_blocked' // Will be 'kept' action, so this is informational
    }

    // For high-severity vulnerabilities that are filtered, escalate instead
    if (action === 'filtered' && this.isHighSeverity(vulnerability)) {
      action = 'escalated'
      reason = `High-severity vulnerability in potentially unreachable component - requires review. ${reason}`
    }

    return {
      vulnerabilityId: vulnerability.id,
      componentId: component.id,
      action,
      tier: 2 as FilterTier,
      filterType,
      reason,
      confidence,
      attackPathsBlocked: reachability.blockedBy.length > 0 ? reachability.blockedBy : undefined,
      timestamp,
    }
  }

  /**
   * Calculate confidence score based on reachability result
   * @param result - Reachability analysis result
   * @returns Confidence score (0-100)
   */
  calculateConfidence(result: ReachabilityResult): number {
    // Base confidence from reachability analysis
    let confidence = result.confidence

    // Adjust based on number of paths found
    if (result.reachable) {
      // More paths = more certain about reachability
      confidence = Math.min(100, confidence + result.paths.length * 5)

      // Shorter paths are more certain
      if (result.shortestPath && result.shortestPath.length > 0) {
        const pathLength = result.shortestPath.length
        // Paths of 1-2 hops are very certain, longer paths less so
        if (pathLength <= 2) {
          confidence = Math.min(100, confidence + 10)
        } else if (pathLength > 5) {
          confidence = Math.max(50, confidence - (pathLength - 5) * 5)
        }
      }
    } else {
      // Not reachable
      if (result.blockedBy.length > 0) {
        // Explicit blocking gives high confidence
        confidence = Math.min(100, confidence + 15)
      }
    }

    // Ensure confidence is in valid range
    return Math.min(100, Math.max(0, Math.round(confidence)))
  }

  /**
   * Get component identifier for graph lookup
   * @param component - Component to identify
   * @returns Identifier string for graph lookup
   */
  private getComponentIdentifier(component: Component): string {
    // Try to match by name first
    if (component.name) {
      return component.name
    }

    // Try CPE
    if (component.cpe) {
      // Extract product name from CPE
      const cpeParts = component.cpe.split(':')
      if (cpeParts.length >= 5) {
        return cpeParts[4] // Product name in CPE 2.3
      }
    }

    // Try purl
    if (component.purl) {
      // Extract package name from purl
      const match = component.purl.match(/pkg:[^/]+\/([^@]+)/)
      if (match) {
        return match[1]
      }
    }

    // Fallback to ID
    return component.id
  }

  /**
   * Check if vulnerability is high severity
   * @param vulnerability - Vulnerability to check
   * @returns True if high or critical severity
   */
  private isHighSeverity(vulnerability: Vulnerability): boolean {
    return vulnerability.severity === 'critical' || vulnerability.severity === 'high'
  }

  /**
   * Batch analyze multiple vulnerabilities
   * @param items - Array of vulnerability/component pairs
   * @returns Array of filter results
   */
  analyzeBatch(items: Array<{ vulnerability: Vulnerability; component: Component }>): FilterResult[] {
    return items.map((item) => this.analyze(item.vulnerability, item.component))
  }

  /**
   * Get summary statistics for a batch of results
   * @param results - Filter results to summarize
   * @returns Summary object
   */
  getSummary(results: FilterResult[]): {
    total: number
    filtered: number
    kept: number
    escalated: number
    avgConfidence: number
  } {
    const total = results.length
    const filtered = results.filter((r) => r.action === 'filtered').length
    const kept = results.filter((r) => r.action === 'kept').length
    const escalated = results.filter((r) => r.action === 'escalated').length
    const avgConfidence = total > 0 ? results.reduce((sum, r) => sum + r.confidence, 0) / total : 0

    return {
      total,
      filtered,
      kept,
      escalated,
      avgConfidence: Math.round(avgConfidence * 10) / 10,
    }
  }
}
