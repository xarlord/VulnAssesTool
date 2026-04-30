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
  })
})
