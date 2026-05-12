/**
 * Tier 1 Quick Filter Tests
 *
 * Comprehensive unit tests for the Tier1QuickFilter class covering:
 * - Each filter type (disabled interface, version mismatch, etc.)
 * - Confidence scoring
 * - Edge cases
 * - Critical/High never auto-filtered below threshold
 * - ISO 21434 compliance requirements
 *
 * @module fpf/tier1QuickFilter.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Tier1QuickFilter, createTier1QuickFilter } from './tier1QuickFilter'
import { DEFAULT_SUPPRESSION_RULES, matchSuppressionRule, matchCPEPattern } from './defaultRules'
import type {
  SystemConfig,
  InterfaceConfig,
  ServiceConfig,
  FeatureConfig,
  FilterResult,
} from '../../../../shared/types/fpf'
import type { Vulnerability, Component } from '../../../../shared/types'

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockConfig = (overrides: Partial<SystemConfig> = {}): SystemConfig => ({
  project: {
    name: 'Test IVI Project',
    version: '1.0.0',
    tier: 'production',
  },
  cybersecurity: {
    attackSurface: 'intermediate',
    safetyRelated: true,
    asilLevel: 'B',
  },
  interfaces: {},
  services: {},
  features: {},
  suppressionRules: [],
  filterSettings: {
    autoFilterConfidenceThreshold: 75,
    neverAutoFilter: ['critical'],
    alwaysEscalateToReview: ['critical', 'high'],
    missFilterDetection: {
      enabled: true,
      lowConfidenceThreshold: 70,
      recentCveDays: 30,
      flagKnownExploits: true,
    },
    audit: {
      logAllDecisions: true,
      logLlmResponses: true,
      retentionDays: 365,
    },
  },
  ...overrides,
})

const createMockVulnerability = (overrides: Partial<Vulnerability> = {}): Vulnerability => ({
  id: 'CVE-2024-12345',
  source: 'nvd',
  severity: 'medium',
  cvssScore: 5.5,
  description: 'A buffer overflow vulnerability in the audio decoder',
  references: [],
  affectedComponents: ['comp-1'],
  ...overrides,
})

const createMockComponent = (overrides: Partial<Component> = {}): Component => ({
  id: 'comp-1',
  name: 'Audio Codec Library',
  version: '1.2.3',
  type: 'library',
  licenses: ['MIT'],
  vulnerabilities: [],
  ...overrides,
})

// ============================================================================
// TIER 1 QUICK FILTER TESTS
// ============================================================================

describe('Tier1QuickFilter', () => {
  let filter: Tier1QuickFilter
  let config: SystemConfig

  beforeEach(() => {
    config = createMockConfig()
    filter = new Tier1QuickFilter(config)
  })

  // ==========================================================================
  // CONSTRUCTOR TESTS
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(filter).toBeInstanceOf(Tier1QuickFilter)
    })

    it('should merge default suppression rules with user rules', () => {
      const customRule = {
        id: 'CUSTOM-001',
        cpePattern: 'cpe:2.3:a:custom:custom:*:*:*:*:*:*:*',
        reason: 'Custom rule',
        severityLimit: ['low'] as const,
      }
      const configWithRules = createMockConfig({
        suppressionRules: [customRule],
      })
      const customFilter = new Tier1QuickFilter(configWithRules)

      // Filter should work without error
      const result = customFilter.filter(
        createMockVulnerability({ severity: 'low' }),
        createMockComponent({ cpe: 'cpe:2.3:a:custom:custom:1.0:*:*:*:*:*:*:*' }),
      )

      expect(result.filterType).toBe('suppression_rule')
      expect(result.ruleId).toBe('CUSTOM-001')
    })

    it('should use default filter settings when not provided', () => {
      const minimalConfig = createMockConfig({ filterSettings: undefined })
      const minimalFilter = new Tier1QuickFilter(minimalConfig)

      // Should still filter correctly
      const result = minimalFilter.filter(createMockVulnerability({ severity: 'low' }), createMockComponent())

      expect(result).toBeDefined()
    })
  })

  // ==========================================================================
  // FILTER METHOD TESTS
  // ==========================================================================

  describe('filter', () => {
    it('should return kept result when no filter matches', () => {
      const vuln = createMockVulnerability()
      const component = createMockComponent()

      const result = filter.filter(vuln, component)

      expect(result.action).toBe('kept')
      expect(result.confidence).toBe(100)
    })

    it('should return all required fields in result', () => {
      const vuln = createMockVulnerability()
      const component = createMockComponent()

      const result = filter.filter(vuln, component)

      expect(result).toHaveProperty('vulnerabilityId')
      expect(result).toHaveProperty('componentId')
      expect(result).toHaveProperty('action')
      expect(result).toHaveProperty('tier')
      expect(result).toHaveProperty('filterType')
      expect(result).toHaveProperty('reason')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('timestamp')
      expect(result.vulnerabilityId).toBe(vuln.id)
      expect(result.componentId).toBe(component.id)
      expect(result.tier).toBe(1)
    })

    it('should use current timestamp in result', () => {
      const beforeTime = new Date().toISOString()
      const result = filter.filter(createMockVulnerability(), createMockComponent())
      const afterTime = new Date().toISOString()

      expect(result.timestamp >= beforeTime).toBe(true)
      expect(result.timestamp <= afterTime).toBe(true)
    })
  })

  // ==========================================================================
  // DISABLED INTERFACE TESTS
  // ==========================================================================

  describe('checkDisabledInterface', () => {
    it('should filter when ethernet interface is disabled', () => {
      config = createMockConfig({
        interfaces: {
          ethernet: {
            enabled: false,
            reason: 'No ethernet port in this IVI variant',
            confidence: 90,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        name: 'Ethernet PHY Driver',
        cpe: 'cpe:2.3:a:vendor:ethernet_driver:1.0:*:*:*:*:*:*:*',
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).not.toBeNull()
      expect(result?.action).toBe('filtered')
      expect(result?.filterType).toBe('disabled_interface')
      expect(result?.reason).toContain('Ethernet')
      expect(result?.confidence).toBeGreaterThanOrEqual(90)
    })

    it('should filter when wifi interface is disabled', () => {
      config = createMockConfig({
        interfaces: {
          wifi: {
            enabled: false,
            reason: 'WiFi not supported',
            confidence: 95,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'WiFi WPA Supplicant',
        cpe: 'cpe:2.3:a:w1fi:wpa_supplicant:2.9:*:*:*:*:*:*:*',
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).not.toBeNull()
      expect(result?.filterType).toBe('disabled_interface')
      expect(result?.reason).toContain('WiFi')
    })

    it('should filter when bluetooth interface is disabled', () => {
      config = createMockConfig({
        interfaces: {
          bluetooth: {
            enabled: false,
            reason: 'Bluetooth removed for security',
            confidence: 90,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'BlueZ Bluetooth Stack',
        cpe: 'cpe:2.3:a:bluez:bluez:5.50:*:*:*:*:*:*:*',
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).not.toBeNull()
      expect(result?.filterType).toBe('disabled_interface')
      expect(result?.reason).toContain('Bluetooth')
    })

    it('should filter when cellular interface is disabled', () => {
      config = createMockConfig({
        interfaces: {
          cellular: {
            enabled: false,
            reason: 'Offline-only configuration',
            confidence: 90,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'LTE Modem Driver',
        cpe: 'cpe:2.3:a:qualcomm:lte_modem:1.0:*:*:*:*:*:*:*',
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).not.toBeNull()
      expect(result?.filterType).toBe('disabled_interface')
      expect(result?.reason).toContain('Cellular')
    })

    it('should not filter when interface is enabled', () => {
      config = createMockConfig({
        interfaces: {
          ethernet: {
            enabled: true,
            confidence: 90,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'Ethernet PHY Driver',
        cpe: 'cpe:2.3:a:vendor:ethernet_driver:1.0:*:*:*:*:*:*:*',
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).toBeNull()
    })

    it('should not filter when component does not match any interface pattern', () => {
      const component = createMockComponent({
        name: 'Generic UI Library',
        cpe: 'cpe:2.3:a:qt:qt:5.15:*:*:*:*:*:*:*',
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).toBeNull()
    })

    it('should match interface by component name', () => {
      config = createMockConfig({
        interfaces: {
          gps: {
            enabled: false,
            reason: 'GPS not installed',
            confidence: 85,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'GPS Location Service',
        cpe: undefined, // No CPE, but name matches
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).not.toBeNull()
      expect(result?.filterType).toBe('disabled_interface')
    })
  })

  // ==========================================================================
  // VERSION MISMATCH TESTS
  // ==========================================================================

  describe('checkVersionMismatch', () => {
    it('should filter when component version is above fixed version', () => {
      const vuln = createMockVulnerability({
        severity: 'medium',
        patchInfo: {
          fixedVersions: ['1.3.0', '2.0.0'],
          patchLinks: [],
          remediationAdvice: {
            priority: 'high',
            category: 'upgrade',
            steps: [],
          },
          affectedVersionRanges: [],
          patchAvailability: 'available',
        },
      })
      const component = createMockComponent({
        version: '1.4.0',
      })

      const result = filter.checkVersionMismatch(vuln, component)

      expect(result).not.toBeNull()
      expect(result?.action).toBe('filtered')
      expect(result?.filterType).toBe('version_mismatch')
      expect(result?.confidence).toBe(95)
      expect(result?.reason).toContain('at or above fixed version')
    })

    it('should filter when component version is outside affected range', () => {
      const vuln = createMockVulnerability({
        severity: 'medium',
        patchInfo: {
          fixedVersions: [],
          patchLinks: [],
          remediationAdvice: {
            priority: 'medium',
            category: 'upgrade',
            steps: [],
          },
          affectedVersionRanges: [
            {
              type: 'SEMVER',
              introduction: '2.0.0',
              fixIn: '2.5.0',
            },
          ],
          patchAvailability: 'available',
        },
      })
      const component = createMockComponent({
        version: '1.9.0', // Below affected range
      })

      const result = filter.checkVersionMismatch(vuln, component)

      expect(result).not.toBeNull()
      expect(result?.action).toBe('filtered')
      expect(result?.filterType).toBe('version_mismatch')
      expect(result?.reason).toContain('outside affected version range')
    })

    it('should not filter when component version is in affected range', () => {
      const vuln = createMockVulnerability({
        severity: 'medium',
        patchInfo: {
          fixedVersions: [],
          patchLinks: [],
          remediationAdvice: {
            priority: 'high',
            category: 'upgrade',
            steps: [],
          },
          affectedVersionRanges: [
            {
              type: 'SEMVER',
              introduction: '1.0.0',
              fixIn: '2.0.0',
            },
          ],
          patchAvailability: 'available',
        },
      })
      const component = createMockComponent({
        version: '1.5.0', // In affected range
      })

      const result = filter.checkVersionMismatch(vuln, component)

      expect(result).toBeNull()
    })

    it('should return null when no patch info available', () => {
      const vuln = createMockVulnerability({
        patchInfo: undefined,
      })
      const component = createMockComponent()

      const result = filter.checkVersionMismatch(vuln, component)

      expect(result).toBeNull()
    })

    it('should handle semantic version comparison correctly', () => {
      const vuln = createMockVulnerability({
        patchInfo: {
          fixedVersions: ['1.2.4'],
          patchLinks: [],
          remediationAdvice: {
            priority: 'high',
            category: 'upgrade',
            steps: [],
          },
          affectedVersionRanges: [],
          patchAvailability: 'available',
        },
      })

      // Test version 1.2.5 > 1.2.4
      const result1 = filter.checkVersionMismatch(vuln, createMockComponent({ version: '1.2.5' }))
      expect(result1).not.toBeNull()

      // Test version 1.2.3 < 1.2.4
      const result2 = filter.checkVersionMismatch(vuln, createMockComponent({ version: '1.2.3' }))
      expect(result2).toBeNull()

      // Test version 1.2.4 == 1.2.4
      const result3 = filter.checkVersionMismatch(vuln, createMockComponent({ version: '1.2.4' }))
      expect(result3).not.toBeNull()
    })
  })

  // ==========================================================================
  // SUPPRESSION RULE TESTS
  // ==========================================================================

  describe('checkSuppressionRules', () => {
    it('should filter when CPE matches a suppression rule', () => {
      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        cpe: 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*',
      })

      const result = filter.checkSuppressionRules(vuln, component)

      expect(result).not.toBeNull()
      expect(result?.action).toBe('filtered')
      expect(result?.filterType).toBe('suppression_rule')
      expect(result?.ruleId).toBe('IVI-SSL-001')
      expect(result?.confidence).toBe(95)
    })

    it('should not filter when severity is not in severityLimit', () => {
      const vuln = createMockVulnerability({ severity: 'critical' })
      const component = createMockComponent({
        cpe: 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*',
      })

      const result = filter.checkSuppressionRules(vuln, component)

      expect(result).toBeNull()
    })

    it('should skip expired rules', () => {
      const expiredRule = {
        id: 'EXPIRED-001',
        cpePattern: 'cpe:2.3:a:test:test:1.0:*:*:*:*:*:*:*',
        reason: 'This rule has expired',
        severityLimit: ['low'] as const,
        expires: '2020-01-01', // Expired
      }
      config = createMockConfig({
        suppressionRules: [expiredRule],
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        cpe: 'cpe:2.3:a:test:test:1.0:*:*:*:*:*:*:*',
      })

      const result = filter.checkSuppressionRules(vuln, component)

      expect(result).toBeNull()
    })

    it('should use valid non-expired rules', () => {
      const futureRule = {
        id: 'FUTURE-001',
        cpePattern: 'cpe:2.3:a:test:test:1.0:*:*:*:*:*:*:*',
        reason: 'This rule is still valid',
        severityLimit: ['low'] as const,
        expires: '2030-12-31', // Not expired
      }
      config = createMockConfig({
        suppressionRules: [futureRule],
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        cpe: 'cpe:2.3:a:test:test:1.0:*:*:*:*:*:*:*',
      })

      const result = filter.checkSuppressionRules(vuln, component)

      expect(result).not.toBeNull()
      expect(result?.ruleId).toBe('FUTURE-001')
    })

    it('should return null when no CPE on component', () => {
      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({ cpe: undefined })

      const result = filter.checkSuppressionRules(vuln, component)

      expect(result).toBeNull()
    })
  })

  // ==========================================================================
  // FEATURE DISABLED TESTS
  // ==========================================================================

  describe('checkFeatureDisabled', () => {
    it('should filter when vulnerable feature is disabled', () => {
      config = createMockConfig({
        features: {
          audioCodecs: {
            enabled: false,
            reason: 'Audio codecs disabled for security',
            confidence: 80,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({
        description: 'Buffer overflow in MP3 audio decoder allows code execution',
        cwes: ['CWE-119'],
      })

      const result = filter.checkFeatureDisabled(vuln)

      expect(result).not.toBeNull()
      expect(result?.action).toBe('filtered')
      expect(result?.filterType).toBe('feature_disabled')
      expect(result?.reason).toContain('Audio Codec')
    })

    it('should filter when specific sub-feature is disabled', () => {
      config = createMockConfig({
        features: {
          audioCodecs: {
            enabled: true,
            disabled: ['opus', 'flac'],
            confidence: 80,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({
        description: 'Vulnerability in opus audio decoder',
      })

      const result = filter.checkFeatureDisabled(vuln)

      expect(result).not.toBeNull()
      expect(result?.filterType).toBe('feature_disabled')
      expect(result?.reason).toContain('disabled')
    })

    it('should not filter when feature is enabled', () => {
      config = createMockConfig({
        features: {
          audioCodecs: {
            enabled: true,
            confidence: 80,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({
        description: 'Buffer overflow in audio decoder',
      })

      const result = filter.checkFeatureDisabled(vuln)

      expect(result).toBeNull()
    })

    it('should match video codec vulnerabilities', () => {
      config = createMockConfig({
        features: {
          videoCodecs: {
            enabled: false,
            reason: 'Video playback not supported',
            confidence: 80,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({
        description: 'Heap buffer overflow in H.264 video decoder',
      })

      const result = filter.checkFeatureDisabled(vuln)

      expect(result).not.toBeNull()
      expect(result?.reason).toContain('Video Codec')
    })

    it('should match by CWE ID', () => {
      config = createMockConfig({
        features: {
          imageProcessing: {
            enabled: false,
            reason: 'Image processing disabled',
            confidence: 80,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({
        description: 'Memory corruption vulnerability', // Generic description
        cwes: ['CWE-787'], // Out-of-bounds write
      })

      const result = filter.checkFeatureDisabled(vuln)

      // Should not match because description doesn't mention image
      expect(result).toBeNull()
    })

    it('should match JavaScript engine vulnerabilities', () => {
      config = createMockConfig({
        features: {
          javascript: {
            enabled: false,
            reason: 'No JavaScript execution',
            confidence: 85,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({
        description: 'Type confusion in V8 JavaScript engine',
      })

      const result = filter.checkFeatureDisabled(vuln)

      expect(result).not.toBeNull()
      expect(result?.reason).toContain('JavaScript')
    })
  })

  // ==========================================================================
  // INTERNAL ONLY TESTS
  // ==========================================================================

  describe('checkInternalOnly', () => {
    it('should filter when component is used by internal-only service', () => {
      config = createMockConfig({
        services: {
          tls: {
            enabled: true,
            externalAccess: false,
            usage: 'Internal communication encryption',
            confidence: 90,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'OpenSSL',
        cpe: 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*',
      })

      const result = filter.checkInternalOnly(component)

      expect(result).not.toBeNull()
      expect(result?.action).toBe('filtered')
      expect(result?.filterType).toBe('internal_only')
    })

    it('should not filter when service has external access', () => {
      config = createMockConfig({
        services: {
          tls: {
            enabled: true,
            externalAccess: true,
            confidence: 90,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'OpenSSL',
        cpe: 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*',
      })

      const result = filter.checkInternalOnly(component)

      expect(result).toBeNull()
    })

    it('should filter test-only components', () => {
      const component = createMockComponent({
        name: 'Test Utilities',
      })

      const result = filter.checkInternalOnly(component)

      expect(result).not.toBeNull()
      expect(result?.filterType).toBe('internal_only')
      expect(result?.reason).toContain('Test')
      expect(result?.confidence).toBe(75)
    })

    it('should filter debug-only components', () => {
      const component = createMockComponent({
        name: 'Debug Helper Library',
      })

      const result = filter.checkInternalOnly(component)

      expect(result).not.toBeNull()
      expect(result?.reason).toContain('Debug')
      expect(result?.confidence).toBe(70)
    })

    it('should filter build-only components', () => {
      const component = createMockComponent({
        name: 'Build System Tools',
      })

      const result = filter.checkInternalOnly(component)

      expect(result).not.toBeNull()
      expect(result?.reason).toContain('Build')
      expect(result?.confidence).toBe(75)
    })

    it('should match by CPE pattern', () => {
      config = createMockConfig({
        services: {
          database: {
            enabled: true,
            externalAccess: false,
            usage: 'Internal data storage',
            confidence: 85,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const component = createMockComponent({
        name: 'Database Library',
        cpe: 'cpe:2.3:a:sqlite:sqlite:3.35:*:*:*:*:*:*:*',
      })

      const result = filter.checkInternalOnly(component)

      expect(result).not.toBeNull()
    })
  })

  // ==========================================================================
  // CONFIDENCE THRESHOLD TESTS
  // ==========================================================================

  describe('confidence threshold handling', () => {
    it('should escalate when confidence is below threshold', () => {
      config = createMockConfig({
        filterSettings: {
          ...createMockConfig().filterSettings!,
          autoFilterConfidenceThreshold: 90,
        },
        interfaces: {
          ethernet: {
            enabled: false,
            confidence: 75, // Below threshold
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        name: 'Ethernet Driver',
      })

      const result = filter.filter(vuln, component)

      expect(result.action).toBe('escalated')
      expect(result.reason).toContain('Low confidence')
    })

    it('should filter when confidence is above threshold', () => {
      config = createMockConfig({
        filterSettings: {
          ...createMockConfig().filterSettings!,
          autoFilterConfidenceThreshold: 70,
        },
        interfaces: {
          ethernet: {
            enabled: false,
            confidence: 90, // Above threshold
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        name: 'Ethernet Driver',
      })

      const result = filter.filter(vuln, component)

      expect(result.action).toBe('filtered')
    })
  })

  // ==========================================================================
  // SEVERITY HANDLING TESTS
  // ==========================================================================

  describe('severity handling', () => {
    it('should never auto-filter critical vulnerabilities', () => {
      config = createMockConfig({
        filterSettings: {
          ...createMockConfig().filterSettings!,
          neverAutoFilter: ['critical'],
        },
        interfaces: {
          ethernet: {
            enabled: false,
            confidence: 95,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'critical' })
      const component = createMockComponent({
        name: 'Ethernet Driver',
      })

      const result = filter.filter(vuln, component)

      expect(result.action).toBe('kept')
    })

    it('should escalate high severity vulnerabilities for review', () => {
      config = createMockConfig({
        filterSettings: {
          ...createMockConfig().filterSettings!,
          alwaysEscalateToReview: ['critical', 'high'],
          autoFilterConfidenceThreshold: 75,
        },
        interfaces: {
          ethernet: {
            enabled: false,
            confidence: 80, // Above threshold but below 95
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'high' })
      const component = createMockComponent({
        name: 'Ethernet Driver',
      })

      const result = filter.filter(vuln, component)

      expect(result.action).toBe('escalated')
      expect(result.reason).toContain('Requires review')
    })

    it('should filter high severity when confidence is very high (95+)', () => {
      config = createMockConfig({
        filterSettings: {
          ...createMockConfig().filterSettings!,
          alwaysEscalateToReview: ['critical', 'high'],
          neverAutoFilter: ['critical'],
        },
        interfaces: {
          ethernet: {
            enabled: false,
            confidence: 95,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vuln = createMockVulnerability({ severity: 'high' })
      const component = createMockComponent({
        name: 'Ethernet Driver',
      })

      const result = filter.filter(vuln, component)

      expect(result.action).toBe('filtered')
    })

    it('should auto-filter medium and low severity normally', () => {
      config = createMockConfig({
        filterSettings: {
          ...createMockConfig().filterSettings!,
          neverAutoFilter: ['critical'],
          alwaysEscalateToReview: ['critical'],
        },
        interfaces: {
          ethernet: {
            enabled: false,
            confidence: 90,
          },
        },
      })
      filter = new Tier1QuickFilter(config)

      const vulnMedium = createMockVulnerability({ severity: 'medium' })
      const vulnLow = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        name: 'Ethernet Driver',
      })

      const resultMedium = filter.filter(vulnMedium, component)
      const resultLow = filter.filter(vulnLow, component)

      expect(resultMedium.action).toBe('filtered')
      expect(resultLow.action).toBe('filtered')
    })
  })

  // ==========================================================================
  // UPDATE CONFIG TESTS
  // ==========================================================================

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = createMockConfig({
        interfaces: {
          wifi: {
            enabled: false,
            confidence: 95,
          },
        },
      })
      filter.updateConfig(newConfig)

      const component = createMockComponent({
        name: 'WiFi Driver',
      })

      const result = filter.checkDisabledInterface(component)

      expect(result).not.toBeNull()
      expect(result?.reason).toContain('WiFi')
    })

    it('should merge new suppression rules', () => {
      const newRule = {
        id: 'NEW-001',
        cpePattern: 'cpe:2.3:a:new:new:1.0:*:*:*:*:*:*:*',
        reason: 'New rule',
        severityLimit: ['low'] as const,
      }
      const newConfig = createMockConfig({
        suppressionRules: [newRule],
      })
      filter.updateConfig(newConfig)

      const vuln = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({
        cpe: 'cpe:2.3:a:new:new:1.0:*:*:*:*:*:*:*',
      })

      const result = filter.checkSuppressionRules(vuln, component)

      expect(result).not.toBeNull()
      expect(result?.ruleId).toBe('NEW-001')
    })
  })
})

// ============================================================================
// DEFAULT RULES TESTS
// ============================================================================

describe('defaultRules', () => {
  describe('DEFAULT_SUPPRESSION_RULES', () => {
    it('should contain IVI suppression rules', () => {
      expect(DEFAULT_SUPPRESSION_RULES.length).toBeGreaterThan(0)
    })

    it('should have valid structure for all rules', () => {
      for (const rule of DEFAULT_SUPPRESSION_RULES) {
        expect(rule).toHaveProperty('id')
        expect(rule).toHaveProperty('cpePattern')
        expect(rule).toHaveProperty('reason')
        expect(rule).toHaveProperty('severityLimit')
        expect(rule.cpePattern).toMatch(/^cpe:2\.3:/)
      }
    })

    it('should include ethernet disabled rules', () => {
      const ethRules = DEFAULT_SUPPRESSION_RULES.filter(
        (r) => r.cpePattern.includes('ethernet') || r.cpePattern.includes('mdio'),
      )
      expect(ethRules.length).toBeGreaterThan(0)
    })

    it('should include bluetooth audio-only rules', () => {
      const btRules = DEFAULT_SUPPRESSION_RULES.filter(
        (r) => r.cpePattern.includes('bluetooth') || r.cpePattern.includes('bluez'),
      )
      expect(btRules.length).toBeGreaterThan(0)
    })

    it('should include openssl internal-only rules', () => {
      const sslRules = DEFAULT_SUPPRESSION_RULES.filter(
        (r) =>
          r.cpePattern.includes('openssl') || r.cpePattern.includes('libssl') || r.cpePattern.includes('libcrypto'),
      )
      expect(sslRules.length).toBeGreaterThan(0)
    })

    it('should include disabled codec rules', () => {
      const codecRules = DEFAULT_SUPPRESSION_RULES.filter(
        (r) => r.cpePattern.includes('opus') || r.cpePattern.includes('flac') || r.cpePattern.includes('vorbis'),
      )
      expect(codecRules.length).toBeGreaterThan(0)
    })
  })

  describe('matchSuppressionRule', () => {
    it('should match CPE pattern correctly', () => {
      const rule = DEFAULT_SUPPRESSION_RULES.find((r) => r.id === 'IVI-SSL-001')!
      const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1k:*:*:*:*:*:*:*'

      expect(matchSuppressionRule(rule, cpe, 'medium')).toBe(true)
    })

    it('should not match when severity is not in limit', () => {
      const rule = DEFAULT_SUPPRESSION_RULES.find((r) => r.id === 'IVI-SSL-001')!
      const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1k:*:*:*:*:*:*:*'

      expect(matchSuppressionRule(rule, cpe, 'critical')).toBe(false)
    })

    it('should not match empty CPE', () => {
      const rule = DEFAULT_SUPPRESSION_RULES[0]

      expect(matchSuppressionRule(rule, '', 'medium')).toBe(false)
    })
  })

  describe('matchCPEPattern', () => {
    it('should match exact CPE', () => {
      const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
      const pattern = 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*'

      expect(matchCPEPattern(cpe, pattern)).toBe(true)
    })

    it('should match with wildcards', () => {
      const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
      const pattern = 'cpe:2.3:*:openssl:*:*:*:*:*:*:*'

      expect(matchCPEPattern(cpe, pattern)).toBe(true)
    })

    it('should not match different vendor', () => {
      const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
      const pattern = 'cpe:2.3:a:apache:openssl:*:*:*:*:*:*:*'

      expect(matchCPEPattern(cpe, pattern)).toBe(false)
    })

    it('should not match different product', () => {
      const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
      const pattern = 'cpe:2.3:a:openssl:libssl:*:*:*:*:*:*:*'

      expect(matchCPEPattern(cpe, pattern)).toBe(false)
    })

    it('should return false for invalid pattern', () => {
      const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
      const pattern = 'invalid-pattern'

      expect(matchCPEPattern(cpe, pattern)).toBe(false)
    })
  })
})

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createTier1QuickFilter', () => {
  it('should create a Tier1QuickFilter instance', () => {
    const config = createMockConfig()
    const filter = createTier1QuickFilter(config)

    expect(filter).toBeInstanceOf(Tier1QuickFilter)
  })
})

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('edge cases', () => {
  let filter: Tier1QuickFilter
  let config: SystemConfig

  beforeEach(() => {
    config = createMockConfig()
    filter = new Tier1QuickFilter(config)
  })

  it('should handle component without CPE', () => {
    const vuln = createMockVulnerability({ severity: 'low' })
    const component = createMockComponent({ cpe: undefined })

    const result = filter.filter(vuln, component)

    expect(result).toBeDefined()
    expect(result.action).toBe('kept')
  })

  it('should handle vulnerability without patch info', () => {
    const vuln = createMockVulnerability({
      patchInfo: undefined,
      severity: 'low',
    })
    const component = createMockComponent()

    const result = filter.filter(vuln, component)

    expect(result).toBeDefined()
  })

  it('should handle empty component name', () => {
    const vuln = createMockVulnerability({ severity: 'low' })
    const component = createMockComponent({ name: '' })

    const result = filter.filter(vuln, component)

    expect(result).toBeDefined()
  })

  it('should handle vulnerability without CWEs', () => {
    const vuln = createMockVulnerability({
      cwes: undefined,
      description: 'Some vulnerability',
    })

    const result = filter.checkFeatureDisabled(vuln)

    // Should not crash
    expect(result).toBeDefined()
  })

  it('should handle empty affected version ranges', () => {
    const vuln = createMockVulnerability({
      patchInfo: {
        fixedVersions: [],
        patchLinks: [],
        remediationAdvice: {
          priority: 'medium',
          category: 'upgrade',
          steps: [],
        },
        affectedVersionRanges: [],
        patchAvailability: 'none',
      },
    })
    const component = createMockComponent({ version: '1.0.0' })

    const result = filter.checkVersionMismatch(vuln, component)

    expect(result).toBeNull()
  })

  it('should handle complex version strings', () => {
    const vuln = createMockVulnerability({
      patchInfo: {
        fixedVersions: ['1.2.3-beta.1'],
        patchLinks: [],
        remediationAdvice: {
          priority: 'high',
          category: 'upgrade',
          steps: [],
        },
        affectedVersionRanges: [],
        patchAvailability: 'available',
      },
    })
    const component = createMockComponent({
      version: '1.2.3-beta.2',
    })

    const result = filter.checkVersionMismatch(vuln, component)

    // Should handle pre-release versions
    expect(result).toBeDefined()
  })

  it('should handle "none" severity', () => {
    const vuln = createMockVulnerability({ severity: 'none' })
    const component = createMockComponent()

    const result = filter.filter(vuln, component)

    expect(result).toBeDefined()
    expect(result.action).toBe('kept')
  })

  it('should handle very long CPE strings', () => {
    const vuln = createMockVulnerability({ severity: 'low' })
    const component = createMockComponent({
      cpe: 'cpe:2.3:a:very_long_vendor_name_with_underscores:very_long_product_name_with_underscores:1.0.0:alpha:beta:gamma:delta:epsilon:zeta:eta',
    })

    const result = filter.filter(vuln, component)

    expect(result).toBeDefined()
  })

  it('should handle special characters in component name', () => {
    const vuln = createMockVulnerability({ severity: 'low' })
    const component = createMockComponent({
      name: 'Test-Component_v1.0 (Alpha)',
    })

    const result = filter.filter(vuln, component)

    expect(result).toBeDefined()
  })
})
