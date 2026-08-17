/**
 * ConfigService Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ConfigService } from './configService'
import type { SystemConfig } from '../../../../shared/types/fpf'

describe('ConfigService', () => {
  let service: ConfigService

  beforeEach(() => {
    service = new ConfigService()
  })

  const validConfig: SystemConfig = {
    project: {
      name: 'Test Project',
      version: '1.0.0',
      tier: 'production',
    },
    cybersecurity: {
      attackSurface: 'intermediate',
      safetyRelated: true,
      asilLevel: 'B',
    },
    interfaces: {
      ethernet: {
        enabled: false,
        reason: 'No hardware',
        confidence: 95,
      },
      wifi: {
        enabled: true,
        exposure: 'external',
        reason: 'For internet',
        confidence: 90,
      },
    },
    services: {
      openssl: {
        enabled: true,
        externalAccess: false,
        usage: 'internal_crypto_only',
        confidence: 85,
      },
    },
    features: {
      navigation: {
        enabled: true,
        confidence: 90,
      },
    },
    suppressionRules: [],
  }

  describe('loadFromObject', () => {
    it('should load a valid configuration', () => {
      const config = service.loadFromObject(validConfig)
      expect(config.project.name).toBe('Test Project')
      expect(config.project.tier).toBe('production')
    })

    it('should apply defaults for missing fields', () => {
      const config = service.loadFromObject({
        project: { name: 'Test', version: '1.0', tier: 'development' },
        cybersecurity: { attackSurface: 'low', safetyRelated: false },
        interfaces: {},
        services: {},
        features: {},
      })

      expect(config.suppressionRules).toEqual([])
      expect(config.filterSettings).toBeDefined()
      expect(config.filterSettings?.autoFilterConfidenceThreshold).toBe(75)
    })
  })

  describe('loadFromYaml', () => {
    it('should parse YAML configuration', () => {
      const yaml = `
project:
  name: YAML Project
  version: 2.0.0
  tier: development
cybersecurity:
  attackSurface: low
  safetyRelated: false
interfaces: {}
services: {}
features: {}
`
      const config = service.loadFromYaml(yaml)
      expect(config.project.name).toBe('YAML Project')
      expect(config.project.version).toBe('2.0.0')
    })
  })

  describe('loadFromJson', () => {
    it('should parse JSON configuration', () => {
      const json = JSON.stringify(validConfig)
      const config = service.loadFromJson(json)
      expect(config.project.name).toBe('Test Project')
    })
  })

  describe('saveToYaml', () => {
    it('should serialize configuration to YAML', () => {
      const yaml = service.saveToYaml(validConfig)
      expect(yaml).toContain('Test Project')
      expect(yaml).toContain('production')
    })
  })

  describe('saveToJson', () => {
    it('should serialize configuration to JSON', () => {
      const json = service.saveToJson(validConfig)
      const parsed = JSON.parse(json)
      expect(parsed.project.name).toBe('Test Project')
    })
  })

  describe('validate', () => {
    it('should validate a correct configuration', () => {
      const result = service.validate(validConfig)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing required fields', () => {
      const result = service.validate({} as SystemConfig)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'project')).toBe(true)
    })

    it('should warn about production without approval', () => {
      const config = {
        ...validConfig,
        project: { ...validConfig.project, approvedBy: undefined },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'project.approvedBy')).toBe(true)
    })

    it('should warn about enabled interface without exposure', () => {
      const config = {
        ...validConfig,
        interfaces: {
          wifi: { enabled: true, confidence: 90 },
        },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'interfaces.wifi.exposure')).toBe(true)
    })

    it('should validate suppression rules', () => {
      const config = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Test rule',
            severityLimit: ['low'],
          },
        ],
      }
      const result = service.validate(config)
      expect(result.valid).toBe(true)
    })

    it('should detect missing suppression rule fields', () => {
      const config = {
        ...validConfig,
        suppressionRules: [
          {
            id: '',
            cpePattern: '',
            reason: '',
            severityLimit: [],
          },
        ],
      }
      const result = service.validate(config)
      expect(result.errors.some((e) => e.path === 'suppressionRules[0].id')).toBe(true)
      expect(result.errors.some((e) => e.path === 'suppressionRules[0].cpePattern')).toBe(true)
      expect(result.errors.some((e) => e.path === 'suppressionRules[0].reason')).toBe(true)
    })

    it('should warn about expired suppression rules', () => {
      const config = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Expired rule',
            severityLimit: ['low'],
            expires: '2020-01-01',
          },
        ],
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.message.includes('expired'))).toBe(true)
    })

    it('should warn about critical not in neverAutoFilter', () => {
      const config = {
        ...validConfig,
        filterSettings: {
          autoFilterConfidenceThreshold: 75,
          neverAutoFilter: ['high'], // Missing critical
          alwaysEscalateToReview: [],
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
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'filterSettings.neverAutoFilter')).toBe(true)
    })
  })

  describe('getConfigHash', () => {
    it('should generate consistent hash for same config', () => {
      const hash1 = service.getConfigHash(validConfig)
      const hash2 = service.getConfigHash(validConfig)
      expect(hash1).toBe(hash2)
    })

    it('should generate different hash for different config', () => {
      const hash1 = service.getConfigHash(validConfig)
      const hash2 = service.getConfigHash({
        ...validConfig,
        project: { ...validConfig.project, name: 'Different Name' },
      })
      expect(hash1).not.toBe(hash2)
    })

    it('should return a 64-character hex string', () => {
      const hash = service.getConfigHash(validConfig)
      expect(hash).toHaveLength(64)
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true)
    })
  })

  describe('mergeConfigs', () => {
    it('should merge configurations', () => {
      const base = validConfig
      const override = {
        project: { name: 'Override Name', version: '2.0.0', tier: 'prototype' as const },
        interfaces: {
          bluetooth: { enabled: true, confidence: 80 },
        },
      }
      const merged = service.mergeConfigs(base, override)
      expect(merged.project.name).toBe('Override Name')
      expect(merged.interfaces.bluetooth).toBeDefined()
      expect(merged.interfaces.ethernet).toBeDefined() // Preserved from base
    })
  })

  describe('createDefaultConfig', () => {
    it('should create a default configuration', () => {
      const config = service.createDefaultConfig('New Project', '1.0.0')
      expect(config.project.name).toBe('New Project')
      expect(config.project.version).toBe('1.0.0')
      expect(config.project.tier).toBe('development')
      expect(config.interfaces).toEqual({})
      expect(config.services).toEqual({})
    })
  })

  describe('isInterfaceEnabled', () => {
    it('should return true for enabled interface', () => {
      expect(service.isInterfaceEnabled(validConfig, 'wifi')).toBe(true)
    })

    it('should return false for disabled interface', () => {
      expect(service.isInterfaceEnabled(validConfig, 'ethernet')).toBe(false)
    })

    it('should return false for unknown interface', () => {
      expect(service.isInterfaceEnabled(validConfig, 'unknown')).toBe(false)
    })
  })

  describe('isServiceEnabled', () => {
    it('should return true for enabled service', () => {
      expect(service.isServiceEnabled(validConfig, 'openssl')).toBe(true)
    })

    it('should return false for unknown service', () => {
      expect(service.isServiceEnabled(validConfig, 'unknown')).toBe(false)
    })
  })

  describe('hasExternalAccess', () => {
    it('should return false for internal-only service', () => {
      expect(service.hasExternalAccess(validConfig, 'openssl')).toBe(false)
    })

    it('should return false for disabled service', () => {
      expect(service.hasExternalAccess(validConfig, 'unknown')).toBe(false)
    })
  })

  describe('getEnabledExternalInterfaces', () => {
    it('should return list of enabled external interfaces', () => {
      const external = service.getEnabledExternalInterfaces(validConfig)
      expect(external).toContain('wifi')
      expect(external).not.toContain('ethernet')
    })
  })

  describe('getServicesWithExternalAccess', () => {
    it('should return list of services with external access', () => {
      const config: SystemConfig = {
        ...validConfig,
        services: {
          openssl: { enabled: true, externalAccess: false, confidence: 85 },
          webserver: { enabled: true, externalAccess: true, confidence: 90 },
        },
      }
      const external = service.getServicesWithExternalAccess(config)
      expect(external).toContain('webserver')
      expect(external).not.toContain('openssl')
    })
  })

  describe('normalizeConfig defaults (via loadFromObject)', () => {
    it('fills in every default when the input is completely empty, since downstream code assumes all SystemConfig fields exist', () => {
      const config = service.loadFromObject({})
      expect(config.project.name).toBe('Unknown Project')
      expect(config.project.version).toBe('0.0.0')
      expect(config.project.tier).toBe('development')
      expect(typeof config.project.lastModified).toBe('string')
      expect(config.cybersecurity.attackSurface).toBe('intermediate')
      expect(config.cybersecurity.safetyRelated).toBe(false)
      expect(config.cybersecurity.externalInterfaces).toEqual([])
      expect(config.cybersecurity.networkSegments).toEqual([])
      expect(config.interfaces).toEqual({})
      expect(config.services).toEqual({})
      expect(config.features).toEqual({})
      expect(config.suppressionRules).toEqual([])
      expect(config.filterSettings?.missFilterDetection.lowConfidenceThreshold).toBe(70)
      expect(config.filterSettings?.audit.retentionDays).toBe(365)
    })

    it('preserves explicit optional values instead of overwriting them with defaults', () => {
      const config = service.loadFromObject({
        project: {
          name: 'Explicit',
          version: '3.2.1',
          tier: 'production',
          configId: 'cfg-1',
          lastModified: '2020-05-05T00:00:00.000Z',
          approvedBy: 'alice',
        },
        cybersecurity: {
          attackSurface: 'high',
          safetyRelated: true,
          asilLevel: 'C',
          externalInterfaces: ['wifi'],
          networkSegments: [{ name: 'dmz', type: 'dmz', trusted: false }],
        },
        interfaces: {},
        services: {},
        features: {},
        filterSettings: {
          autoFilterConfidenceThreshold: 60,
          neverAutoFilter: ['critical'],
          alwaysEscalateToReview: ['critical'],
          missFilterDetection: {
            enabled: false,
            lowConfidenceThreshold: 40,
            recentCveDays: 10,
            flagKnownExploits: false,
          },
          audit: { logAllDecisions: false, logLlmResponses: false, retentionDays: 30 },
        },
        metadata: { formatVersion: '1.0' },
      })
      expect(config.project.configId).toBe('cfg-1')
      expect(config.project.lastModified).toBe('2020-05-05T00:00:00.000Z')
      expect(config.cybersecurity.externalInterfaces).toEqual(['wifi'])
      expect(config.cybersecurity.networkSegments).toHaveLength(1)
      expect(config.filterSettings?.missFilterDetection.lowConfidenceThreshold).toBe(40)
      expect(config.filterSettings?.audit.retentionDays).toBe(30)
      expect(config.metadata?.formatVersion).toBe('1.0')
    })
  })

  describe('validate - additional branch coverage', () => {
    it('flags an empty project name even when the project object exists, since a blank name is not a valid identity', () => {
      const config = { ...validConfig, project: { ...validConfig.project, name: '' } }
      const result = service.validate(config)
      expect(result.errors.some((e) => e.path === 'project.name')).toBe(true)
    })

    it('warns when project version is missing, so teams know to add one for better tracking', () => {
      const config = { ...validConfig, project: { ...validConfig.project, version: '' } }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'project.version')).toBe(true)
    })

    it('does not warn about missing approval when a production project already has approvedBy set', () => {
      const config = { ...validConfig, project: { ...validConfig.project, approvedBy: 'bob' } }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'project.approvedBy')).toBe(false)
    })

    it('does not require approval for non-production tiers, since that rule is production-specific', () => {
      const config = {
        ...validConfig,
        project: { ...validConfig.project, tier: 'development' as const, approvedBy: undefined },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'project.approvedBy')).toBe(false)
    })

    it('warns when a safety-related system has no ASIL level, since ISO 21434 requires a safety classification', () => {
      const config = {
        ...validConfig,
        cybersecurity: { ...validConfig.cybersecurity, safetyRelated: true, asilLevel: undefined },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'cybersecurity.asilLevel')).toBe(true)
    })

    it('does not require an ASIL level for systems that are not safety-related', () => {
      const config = {
        ...validConfig,
        cybersecurity: { ...validConfig.cybersecurity, safetyRelated: false, asilLevel: undefined },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'cybersecurity.asilLevel')).toBe(false)
    })

    it('warns when an interface confidence score is out of the valid 0-100 range', () => {
      const config = {
        ...validConfig,
        interfaces: { wifi: { ...validConfig.interfaces.wifi, confidence: 150 } },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'interfaces.wifi.confidence')).toBe(true)
    })

    it('warns when an enabled service does not specify externalAccess, since that leaves exposure unknown', () => {
      const config = {
        ...validConfig,
        services: {
          openssl: {
            enabled: true,
            externalAccess: undefined as unknown as boolean,
            confidence: 85,
          },
        },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'services.openssl.externalAccess')).toBe(true)
    })

    it('warns when a service confidence score is out of the valid 0-100 range', () => {
      const config = {
        ...validConfig,
        services: { openssl: { ...validConfig.services.openssl, confidence: -5 } },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'services.openssl.confidence')).toBe(true)
    })

    it('does not warn about missing approval when a suppression rule already has approvedBy set', () => {
      const config = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Reviewed rule',
            severityLimit: ['low'],
            approvedBy: 'carol',
          },
        ],
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'suppressionRules[0].approvedBy')).toBe(false)
    })

    it('flags a suppression rule whose expiration date cannot be parsed', () => {
      const config = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Bad date',
            severityLimit: ['low'],
            expires: 'not-a-real-date',
          },
        ],
      }
      const result = service.validate(config)
      expect(result.errors.some((e) => e.path === 'suppressionRules[0].expires')).toBe(true)
    })

    it('does not warn about expiration for a suppression rule that expires in the future', () => {
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      const config = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Still active',
            severityLimit: ['low'],
            expires: future,
          },
        ],
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.message.includes('expired'))).toBe(false)
    })

    it('flags an out-of-range autoFilterConfidenceThreshold, since it must be a 0-100 percentage', () => {
      const config = {
        ...validConfig,
        filterSettings: {
          autoFilterConfidenceThreshold: 150,
          neverAutoFilter: ['critical'],
          alwaysEscalateToReview: [],
          missFilterDetection: {
            enabled: true,
            lowConfidenceThreshold: 70,
            recentCveDays: 30,
            flagKnownExploits: true,
          },
          audit: { logAllDecisions: true, logLlmResponses: true, retentionDays: 365 },
        },
      }
      const result = service.validate(config)
      expect(result.errors.some((e) => e.path === 'filterSettings.autoFilterConfidenceThreshold')).toBe(true)
    })

    it('does not warn about critical auto-filtering when neverAutoFilter already includes critical', () => {
      const config = {
        ...validConfig,
        filterSettings: {
          autoFilterConfidenceThreshold: 75,
          neverAutoFilter: ['critical', 'high'],
          alwaysEscalateToReview: [],
          missFilterDetection: {
            enabled: true,
            lowConfidenceThreshold: 70,
            recentCveDays: 30,
            flagKnownExploits: true,
          },
          audit: { logAllDecisions: true, logLlmResponses: true, retentionDays: 365 },
        },
      }
      const result = service.validate(config)
      expect(result.warnings.some((w) => w.path === 'filterSettings.neverAutoFilter')).toBe(false)
    })
  })

  describe('mergeConfigs - nested filterSettings overrides', () => {
    it('merges missFilterDetection and audit sub-objects from both base and override rather than dropping base values', () => {
      const base: SystemConfig = {
        ...validConfig,
        filterSettings: {
          autoFilterConfidenceThreshold: 75,
          neverAutoFilter: ['critical'],
          alwaysEscalateToReview: ['critical'],
          missFilterDetection: {
            enabled: true,
            lowConfidenceThreshold: 70,
            recentCveDays: 30,
            flagKnownExploits: true,
          },
          audit: { logAllDecisions: true, logLlmResponses: true, retentionDays: 365 },
        },
      }
      const override: Partial<SystemConfig> = {
        filterSettings: {
          autoFilterConfidenceThreshold: 75,
          neverAutoFilter: ['critical'],
          alwaysEscalateToReview: ['critical'],
          missFilterDetection: {
            enabled: true,
            lowConfidenceThreshold: 50,
            recentCveDays: 30,
            flagKnownExploits: true,
          },
          audit: { logAllDecisions: true, logLlmResponses: true, retentionDays: 90 },
        },
      }
      const merged = service.mergeConfigs(base, override)
      // Overridden field wins...
      expect(merged.filterSettings?.missFilterDetection.lowConfidenceThreshold).toBe(50)
      // ...but fields the override didn't touch still come from base, proving a deep (not shallow) merge.
      expect(merged.filterSettings?.missFilterDetection.recentCveDays).toBe(30)
      expect(merged.filterSettings?.audit.retentionDays).toBe(90)
    })

    it('defaults suppressionRules to an empty list when neither base nor override defines any', () => {
      const base: SystemConfig = { ...validConfig, suppressionRules: undefined }
      const merged = service.mergeConfigs(base, {})
      expect(merged.suppressionRules).toEqual([])
    })
  })

  describe('hasExternalAccess - additional branch coverage', () => {
    it('returns true when a service is both enabled and externalAccess is explicitly true', () => {
      const config = {
        ...validConfig,
        services: { api: { enabled: true, externalAccess: true, confidence: 90 } },
      }
      expect(service.hasExternalAccess(config, 'api')).toBe(true)
    })

    it('returns false when the service exists but is disabled, even if externalAccess is true', () => {
      const config = {
        ...validConfig,
        services: { api: { enabled: false, externalAccess: true, confidence: 90 } },
      }
      expect(service.hasExternalAccess(config, 'api')).toBe(false)
    })
  })

  describe('getActiveSuppressionRules', () => {
    it('should filter out expired rules', () => {
      const config: SystemConfig = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Active rule',
            severityLimit: ['low'],
          },
          {
            id: 'SUP-002',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Expired rule',
            severityLimit: ['low'],
            expires: '2020-01-01',
          },
        ],
      }
      const active = service.getActiveSuppressionRules(config)
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('SUP-001')
    })

    it('should keep rules without expiration', () => {
      const config: SystemConfig = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'No expiration',
            severityLimit: ['low'],
          },
        ],
      }
      const active = service.getActiveSuppressionRules(config)
      expect(active).toHaveLength(1)
    })

    it('keeps a rule whose expiration date is still in the future, since it has not lapsed yet', () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const config: SystemConfig = {
        ...validConfig,
        suppressionRules: [
          {
            id: 'SUP-001',
            cpePattern: 'cpe:2.3:a:test:*',
            reason: 'Future expiration',
            severityLimit: ['low'],
            expires: future,
          },
        ],
      }
      const active = service.getActiveSuppressionRules(config)
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('SUP-001')
    })

    it('returns an empty list rather than throwing when suppressionRules is undefined', () => {
      const config: SystemConfig = { ...validConfig, suppressionRules: undefined }
      const active = service.getActiveSuppressionRules(config)
      expect(active).toEqual([])
    })
  })
})
