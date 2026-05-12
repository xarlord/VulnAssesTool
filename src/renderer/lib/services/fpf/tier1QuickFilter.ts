/**
 * Tier 1 Quick Filter Service
 *
 * Fast, deterministic filters for obvious false positives in automotive IVI systems.
 * These filters handle 70-90% of false positives with high confidence.
 *
 * Filter types:
 * - Disabled interface: Component requires disabled hardware interface
 * - Version mismatch: Vulnerability affects different version than component
 * - Suppression rule: Explicit rule to suppress this CPE pattern
 * - Feature disabled: Vulnerability affects disabled software feature
 * - Internal only: Component not exposed to external interfaces
 *
 * @module fpf/tier1QuickFilter
 */

import type {
  SystemConfig,
  FilterResult,
  FeatureConfig,
  SuppressionRule,
  FilterSettingsConfig,
} from '../../../../shared/types/fpf'
import type { Vulnerability, Component } from '../../../../shared/types'
import { DEFAULT_FILTER_SETTINGS } from '../../../../shared/types/fpf'
import { DEFAULT_SUPPRESSION_RULES, matchSuppressionRule } from './defaultRules'

/**
 * Tier 1 Quick Filter class
 *
 * Implements fast deterministic filters for obvious false positives.
 * All filters must be ISO 21434 compliant with proper audit trail.
 */
export class Tier1QuickFilter {
  private config: SystemConfig
  private filterSettings: FilterSettingsConfig
  private suppressionRules: SuppressionRule[]

  constructor(config: SystemConfig) {
    this.config = config
    this.filterSettings = config.filterSettings ?? DEFAULT_FILTER_SETTINGS
    // Merge default IVI suppression rules with user-defined rules
    this.suppressionRules = [...DEFAULT_SUPPRESSION_RULES, ...(config.suppressionRules ?? [])]
  }

  /**
   * Filter a vulnerability against a component
   *
   * Runs through all Tier 1 filters in order of confidence and returns
   * the first match that results in a filter action.
   *
   * @param vulnerability - The vulnerability to evaluate
   * @param component - The component being evaluated
   * @returns FilterResult indicating the action taken
   */
  filter(vulnerability: Vulnerability, component: Component): FilterResult {
    const timestamp = new Date().toISOString()

    // Check if this severity should never be auto-filtered
    if (this.shouldNeverAutoFilter(vulnerability.severity)) {
      return this.createKeptResult(vulnerability, component, timestamp)
    }

    // Run through each filter type in order
    const filters = [
      () => this.checkDisabledInterface(component),
      () => this.checkVersionMismatch(vulnerability, component),
      () => this.checkSuppressionRules(vulnerability, component),
      () => this.checkFeatureDisabled(vulnerability),
      () => this.checkInternalOnly(component),
    ]

    for (const filterFn of filters) {
      const result = filterFn()
      if (result !== null) {
        // Check confidence threshold
        if (result.action === 'filtered' && result.confidence < this.filterSettings.autoFilterConfidenceThreshold) {
          // Not confident enough, escalate instead
          result.action = 'escalated'
          result.reason = `Low confidence (${result.confidence}%): ${result.reason}`
        }

        // Critical/High vulnerabilities need escalation regardless
        if (
          result.action === 'filtered' &&
          this.shouldAlwaysEscalate(vulnerability.severity) &&
          result.confidence < 95
        ) {
          result.action = 'escalated'
          result.reason = `Requires review (${vulnerability.severity} severity): ${result.reason}`
        }

        return {
          ...result,
          vulnerabilityId: vulnerability.id,
          componentId: component.id,
          timestamp,
        }
      }
    }

    // No filter matched - keep the vulnerability
    return this.createKeptResult(vulnerability, component, timestamp)
  }

  /**
   * Check if the component requires a disabled hardware interface
   *
   * Maps component CPE patterns to system interfaces and checks if
   * the interface is disabled in the configuration.
   *
   * @param component - Component to check
   * @returns FilterResult if matched, null otherwise
   */
  checkDisabledInterface(component: Component): FilterResult | null {
    const cpe = component.cpe?.toLowerCase() ?? ''
    const name = component.name.toLowerCase()

    // Map CPE/product names to interface configurations
    const interfaceMappings: Array<{
      patterns: string[]
      interfaceKey: string
      interfaceName: string
      confidence: number
    }> = [
      // Ethernet/MDIO
      {
        patterns: ['ethernet', 'mdio', 'phy', 'network_controller'],
        interfaceKey: 'ethernet',
        interfaceName: 'Ethernet',
        confidence: 90,
      },
      // WiFi
      {
        patterns: ['wifi', 'wireless', 'wlan', '802.11'],
        interfaceKey: 'wifi',
        interfaceName: 'WiFi',
        confidence: 90,
      },
      // Bluetooth
      {
        patterns: ['bluetooth', 'bt_stack', 'bluez'],
        interfaceKey: 'bluetooth',
        interfaceName: 'Bluetooth',
        confidence: 90,
      },
      // Cellular
      {
        patterns: ['cellular', 'lte', '4g', '5g', 'modem', 'qmi'],
        interfaceKey: 'cellular',
        interfaceName: 'Cellular',
        confidence: 90,
      },
      // USB
      {
        patterns: ['usb', 'usb_host', 'usb_device'],
        interfaceKey: 'usb',
        interfaceName: 'USB',
        confidence: 85,
      },
      // GPS
      {
        patterns: ['gps', 'gnss', 'location'],
        interfaceKey: 'gps',
        interfaceName: 'GPS',
        confidence: 85,
      },
      // CAN Bus
      {
        patterns: ['can_bus', 'canbus', 'socketcan'],
        interfaceKey: 'can',
        interfaceName: 'CAN Bus',
        confidence: 90,
      },
    ]

    for (const mapping of interfaceMappings) {
      const matches = mapping.patterns.some((pattern) => cpe.includes(pattern) || name.includes(pattern))

      if (matches) {
        const interfaceConfig = this.config.interfaces[mapping.interfaceKey]

        if (interfaceConfig && !interfaceConfig.enabled) {
          // Use interface confidence primarily, as it reflects how confident we are in the config
          const confidence = interfaceConfig.confidence ?? mapping.confidence
          return {
            vulnerabilityId: '',
            componentId: component.id,
            action: 'filtered',
            tier: 1,
            filterType: 'disabled_interface',
            reason: `${mapping.interfaceName} interface is disabled in system configuration${interfaceConfig.reason ? `: ${interfaceConfig.reason}` : ''}`,
            confidence,
            timestamp: new Date().toISOString(),
          }
        }
      }
    }

    return null
  }

  /**
   * Check if vulnerability affects a different version than the component
   *
   * Parses the vulnerability's affected version range and compares
   * with the component's version.
   *
   * @param vuln - Vulnerability to check
   * @param component - Component being evaluated
   * @returns FilterResult if version mismatch detected, null otherwise
   */
  checkVersionMismatch(vuln: Vulnerability, component: Component): FilterResult | null {
    const componentVersion = component.version

    if (!componentVersion || !vuln.patchInfo) {
      return null
    }

    const { affectedVersionRanges, fixedVersions } = vuln.patchInfo

    // Check if component version is in fixed versions
    if (fixedVersions && fixedVersions.length > 0) {
      for (const fixedVersion of fixedVersions) {
        if (this.compareVersions(componentVersion, fixedVersion) >= 0) {
          return {
            vulnerabilityId: vuln.id,
            componentId: component.id,
            action: 'filtered',
            tier: 1,
            filterType: 'version_mismatch',
            reason: `Component version ${componentVersion} is at or above fixed version ${fixedVersion}`,
            confidence: 95,
            timestamp: new Date().toISOString(),
          }
        }
      }
    }

    // Check against affected version ranges
    if (affectedVersionRanges && affectedVersionRanges.length > 0) {
      let isAffected = false

      for (const range of affectedVersionRanges) {
        const intro = range.introduction
        const fix = range.fixIn

        // Check if component version is in affected range
        const aboveIntro = !intro || this.compareVersions(componentVersion, intro) >= 0
        const belowFix = !fix || this.compareVersions(componentVersion, fix) < 0

        if (aboveIntro && belowFix) {
          isAffected = true
          break
        }
      }

      // If not in affected range, it's a version mismatch
      if (!isAffected) {
        return {
          vulnerabilityId: vuln.id,
          componentId: component.id,
          action: 'filtered',
          tier: 1,
          filterType: 'version_mismatch',
          reason: `Component version ${componentVersion} is outside affected version range`,
          confidence: 85,
          timestamp: new Date().toISOString(),
        }
      }
    }

    return null
  }

  /**
   * Check if vulnerability matches a suppression rule
   *
   * Suppression rules are explicit declarations that certain CPE patterns
   * are false positives for specific reasons (e.g., feature not used).
   *
   * @param vuln - Vulnerability to check
   * @param component - Component being evaluated
   * @returns FilterResult if rule matched, null otherwise
   */
  checkSuppressionRules(vuln: Vulnerability, component: Component): FilterResult | null {
    const cpe = component.cpe ?? ''

    for (const rule of this.suppressionRules) {
      const match = matchSuppressionRule(rule, cpe, vuln.severity)

      if (match) {
        // Check if rule has expired
        if (rule.expires) {
          const expiryDate = new Date(rule.expires)
          if (expiryDate < new Date()) {
            continue // Rule has expired, skip it
          }
        }

        return {
          vulnerabilityId: vuln.id,
          componentId: component.id,
          action: 'filtered',
          tier: 1,
          filterType: 'suppression_rule',
          reason: rule.reason,
          ruleId: rule.id,
          confidence: 95, // Explicit rules have high confidence
          timestamp: new Date().toISOString(),
        }
      }
    }

    return null
  }

  /**
   * Check if vulnerability affects a disabled software feature
   *
   * Some components have features that can be disabled at compile time
   * or runtime. If the vulnerable feature is disabled, the vulnerability
   * is not exploitable.
   *
   * @param vuln - Vulnerability to check
   * @returns FilterResult if feature is disabled, null otherwise
   */
  checkFeatureDisabled(vuln: Vulnerability): FilterResult | null {
    const vulnDescription = vuln.description.toLowerCase()
    const cweIds = vuln.cwes ?? []
    const references = vuln.references ?? []

    // Map vulnerability patterns to feature configurations
    const featureMappings: Array<{
      patterns: string[]
      cwePatterns: string[]
      featureKey: string
      featureName: string
      confidence: number
    }> = [
      // Audio codecs
      {
        patterns: ['audio decoder', 'audio codec', 'mp3', 'aac decoder', 'opus'],
        cwePatterns: ['CWE-119', 'CWE-787'],
        featureKey: 'audioCodecs',
        featureName: 'Audio Codec',
        confidence: 80,
      },
      // Video codecs
      {
        patterns: ['video decoder', 'video codec', 'h.264', 'h.265', 'hevc', 'vp9'],
        cwePatterns: ['CWE-119', 'CWE-787'],
        featureKey: 'videoCodecs',
        featureName: 'Video Codec',
        confidence: 80,
      },
      // Image processing
      {
        patterns: ['image decoder', 'image parsing', 'jpeg', 'png', 'gif', 'bmp'],
        cwePatterns: ['CWE-119', 'CWE-787'],
        featureKey: 'imageProcessing',
        featureName: 'Image Processing',
        confidence: 80,
      },
      // JavaScript engine
      {
        patterns: ['javascript', 'js engine', 'ecmascript', 'v8', 'spidermonkey'],
        cwePatterns: [],
        featureKey: 'javascript',
        featureName: 'JavaScript Engine',
        confidence: 85,
      },
      // PDF processing
      {
        patterns: ['pdf', 'pdfium', 'pdf reader'],
        cwePatterns: [],
        featureKey: 'pdfProcessing',
        featureName: 'PDF Processing',
        confidence: 85,
      },
    ]

    for (const mapping of featureMappings) {
      const descriptionMatch = mapping.patterns.some((p) => vulnDescription.includes(p))
      // CWE match only counts if description also mentions something relevant (to avoid false matches)
      const cweMatch =
        mapping.cwePatterns.length > 0 &&
        cweIds.some((cwe) => mapping.cwePatterns.some((cp) => cwe.includes(cp))) &&
        descriptionMatch // CWE match requires description match to avoid over-filtering
      const referenceMatch = references.some((ref) => mapping.patterns.some((p) => ref.url.toLowerCase().includes(p)))

      if (descriptionMatch || cweMatch || referenceMatch) {
        const featureConfig = this.config.features[mapping.featureKey]

        if (featureConfig) {
          // Check if feature is completely disabled
          if (!this.isFeatureEnabled(featureConfig)) {
            return {
              vulnerabilityId: vuln.id,
              componentId: '',
              action: 'filtered',
              tier: 1,
              filterType: 'feature_disabled',
              reason: `${mapping.featureName} feature is disabled${featureConfig.reason ? `: ${featureConfig.reason}` : ''}`,
              confidence: Math.max(mapping.confidence, featureConfig.confidence),
              timestamp: new Date().toISOString(),
            }
          }

          // Check if specific vulnerable feature is disabled
          if (
            Array.isArray(featureConfig.disabled) &&
            mapping.patterns.some((p) => featureConfig.disabled.includes(p))
          ) {
            return {
              vulnerabilityId: vuln.id,
              componentId: '',
              action: 'filtered',
              tier: 1,
              filterType: 'feature_disabled',
              reason: `Vulnerable ${mapping.featureName} sub-feature is disabled`,
              confidence: 90,
              timestamp: new Date().toISOString(),
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Check if component is internal-only (not exposed to external interfaces)
   *
   * Components that are only used internally and not exposed to external
   * inputs have reduced attack surface.
   *
   * @param component - Component to check
   * @returns FilterResult if internal-only, null otherwise
   */
  checkInternalOnly(component: Component): FilterResult | null {
    const cpe = component.cpe?.toLowerCase() ?? ''
    const name = component.name.toLowerCase()

    // Check service configurations for internal-only status
    for (const [serviceKey, serviceConfig] of Object.entries(this.config.services)) {
      if (!serviceConfig.enabled || serviceConfig.externalAccess) {
        continue
      }

      // Map component to service
      const servicePatterns: Record<string, string[]> = {
        tls: ['openssl', 'libssl', 'libcrypto'],
        openssl: ['openssl', 'libssl', 'libcrypto'],
        cryptography: ['cryptography', 'pycrypto', 'pyopenssl'],
        database: ['sqlite', 'sqlite3'],
        sqlite: ['sqlite', 'sqlite3'],
        zlib: ['zlib', 'compression'],
      }

      const patterns = servicePatterns[serviceKey] ?? []
      const matches = patterns.some((p) => cpe.includes(p) || name.includes(p))

      if (matches && !serviceConfig.externalAccess) {
        return {
          vulnerabilityId: '',
          componentId: component.id,
          action: 'filtered',
          tier: 1,
          filterType: 'internal_only',
          reason: `Component is only used internally via ${serviceKey} service${serviceConfig.reason ? `: ${serviceConfig.reason}` : ''}`,
          confidence: serviceConfig.confidence,
          timestamp: new Date().toISOString(),
        }
      }
    }

    // Check for internal-only patterns in component dependencies
    const internalOnlyPatterns = [
      { pattern: 'test', confidence: 75, reason: 'Test-only component' },
      { pattern: 'debug', confidence: 70, reason: 'Debug-only component' },
      { pattern: 'build', confidence: 75, reason: 'Build-only component' },
      { pattern: 'dev', confidence: 70, reason: 'Development-only component' },
    ]

    for (const { pattern, confidence, reason } of internalOnlyPatterns) {
      if (name.includes(pattern) || cpe.includes(pattern)) {
        return {
          vulnerabilityId: '',
          componentId: component.id,
          action: 'filtered',
          tier: 1,
          filterType: 'internal_only',
          reason,
          confidence,
          timestamp: new Date().toISOString(),
        }
      }
    }

    return null
  }

  /**
   * Update the configuration
   */
  updateConfig(config: SystemConfig): void {
    this.config = config
    this.filterSettings = config.filterSettings ?? DEFAULT_FILTER_SETTINGS
    this.suppressionRules = [...DEFAULT_SUPPRESSION_RULES, ...(config.suppressionRules ?? [])]
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Check if a severity should never be auto-filtered
   */
  private shouldNeverAutoFilter(severity: string): boolean {
    return this.filterSettings.neverAutoFilter.includes(severity as 'critical' | 'high' | 'medium' | 'low')
  }

  /**
   * Check if a severity should always be escalated for review
   */
  private shouldAlwaysEscalate(severity: string): boolean {
    return this.filterSettings.alwaysEscalateToReview.includes(severity as 'critical' | 'high' | 'medium' | 'low')
  }

  /**
   * Check if a feature is enabled
   */
  private isFeatureEnabled(featureConfig: FeatureConfig): boolean {
    if (typeof featureConfig.enabled === 'boolean') {
      return featureConfig.enabled
    }
    if (Array.isArray(featureConfig.enabled)) {
      return featureConfig.enabled.length > 0
    }
    return true
  }

  /**
   * Compare two semantic versions
   * @returns negative if a < b, 0 if a == b, positive if a > b
   */
  private compareVersions(a: string, b: string): number {
    const parseVersion = (v: string): number[] => {
      return v.split(/[.-]/).map((part) => {
        const num = parseInt(part, 10)
        return isNaN(num) ? 0 : num
      })
    }

    const partsA = parseVersion(a)
    const partsB = parseVersion(b)
    const maxLen = Math.max(partsA.length, partsB.length)

    for (let i = 0; i < maxLen; i++) {
      const valA = partsA[i] ?? 0
      const valB = partsB[i] ?? 0

      if (valA < valB) return -1
      if (valA > valB) return 1
    }

    return 0
  }

  /**
   * Create a result indicating the vulnerability was kept
   */
  private createKeptResult(vulnerability: Vulnerability, component: Component, timestamp: string): FilterResult {
    return {
      vulnerabilityId: vulnerability.id,
      componentId: component.id,
      action: 'kept',
      tier: 1,
      filterType: 'suppression_rule', // Default, will be overridden
      reason: 'No Tier 1 filter matched',
      confidence: 100,
      timestamp,
    }
  }
}

/**
 * Factory function to create a Tier1QuickFilter instance
 */
export function createTier1QuickFilter(config: SystemConfig): Tier1QuickFilter {
  return new Tier1QuickFilter(config)
}
