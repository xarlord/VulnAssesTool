/**
 * Configuration Service for False Positive Filter
 *
 * Handles loading, saving, and validating system configurations
 * for the false positive vulnerability filtering system.
 *
 * @module configService
 */

import * as yaml from 'yaml'
import {
  type SystemConfig,
  type ConfigValidationResult,
  type ConfigValidationError,
  type ConfigValidationWarning,
  DEFAULT_FILTER_SETTINGS,
} from '../../../../shared/types/fpf'
import crypto from 'crypto'

/**
 * Required top-level fields in configuration
 */
const REQUIRED_FIELDS: (keyof SystemConfig)[] = ['project', 'cybersecurity', 'interfaces', 'services', 'features']

/**
 * Configuration Service
 */
export class ConfigService {
  /**
   * Load configuration from YAML string
   */
  loadFromYaml(yamlContent: string): SystemConfig {
    const parsed = yaml.parse(yamlContent)
    return this.normalizeConfig(parsed)
  }

  /**
   * Load configuration from JSON string
   */
  loadFromJson(jsonContent: string): SystemConfig {
    const parsed = JSON.parse(jsonContent)
    return this.normalizeConfig(parsed)
  }

  /**
   * Load configuration from object
   */
  loadFromObject(obj: Record<string, unknown>): SystemConfig {
    return this.normalizeConfig(obj as unknown as SystemConfig)
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: Partial<SystemConfig>): SystemConfig {
    return {
      project: {
        name: config.project?.name || 'Unknown Project',
        version: config.project?.version || '0.0.0',
        tier: config.project?.tier || 'development',
        configId: config.project?.configId,
        lastModified: config.project?.lastModified || new Date().toISOString(),
        approvedBy: config.project?.approvedBy,
      },
      cybersecurity: {
        attackSurface: config.cybersecurity?.attackSurface || 'intermediate',
        safetyRelated: config.cybersecurity?.safetyRelated ?? false,
        asilLevel: config.cybersecurity?.asilLevel,
        externalInterfaces: config.cybersecurity?.externalInterfaces || [],
        networkSegments: config.cybersecurity?.networkSegments || [],
      },
      interfaces: config.interfaces || {},
      services: config.services || {},
      features: config.features || {},
      suppressionRules: config.suppressionRules || [],
      filterSettings: {
        ...DEFAULT_FILTER_SETTINGS,
        ...(config.filterSettings || {}),
        missFilterDetection: {
          ...DEFAULT_FILTER_SETTINGS.missFilterDetection,
          ...(config.filterSettings?.missFilterDetection || {}),
        },
        audit: {
          ...DEFAULT_FILTER_SETTINGS.audit,
          ...(config.filterSettings?.audit || {}),
        },
      },
      metadata: config.metadata,
    }
  }

  /**
   * Save configuration to YAML string
   */
  saveToYaml(config: SystemConfig): string {
    return yaml.stringify(config, {
      indent: 2,
      lineWidth: 0,
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    })
  }

  /**
   * Save configuration to JSON string
   */
  saveToJson(config: SystemConfig): string {
    return JSON.stringify(config, null, 2)
  }

  /**
   * Validate configuration
   */
  validate(config: SystemConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = []
    const warnings: ConfigValidationWarning[] = []

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (!config[field]) {
        errors.push({
          path: field,
          message: `Required field '${field}' is missing`,
        })
      }
    }

    // Validate project section
    if (config.project) {
      if (!config.project.name) {
        errors.push({
          path: 'project.name',
          message: 'Project name is required',
        })
      }
      if (!config.project.version) {
        warnings.push({
          path: 'project.version',
          message: 'Project version is not specified',
          suggestion: 'Add version for better tracking',
        })
      }
      if (config.project.tier === 'production' && !config.project.approvedBy) {
        warnings.push({
          path: 'project.approvedBy',
          message: 'Production tier should have approval',
          suggestion: 'Add approvedBy field for audit trail',
        })
      }
    }

    // Validate cybersecurity section
    if (config.cybersecurity) {
      if (config.cybersecurity.safetyRelated && !config.cybersecurity.asilLevel) {
        warnings.push({
          path: 'cybersecurity.asilLevel',
          message: 'Safety-related system should specify ASIL level',
          suggestion: 'Add ASIL classification (QM, A, B, C, or D)',
        })
      }
    }

    // Validate interfaces
    if (config.interfaces) {
      for (const [name, iface] of Object.entries(config.interfaces)) {
        if (iface.enabled && !iface.exposure) {
          warnings.push({
            path: `interfaces.${name}.exposure`,
            message: `Enabled interface '${name}' should specify exposure level`,
            suggestion: 'Set exposure to external, internal, or isolated',
          })
        }
        if (typeof iface.confidence !== 'number' || iface.confidence < 0 || iface.confidence > 100) {
          warnings.push({
            path: `interfaces.${name}.confidence`,
            message: `Interface '${name}' has invalid confidence`,
            suggestion: 'Set confidence between 0 and 100',
          })
        }
      }
    }

    // Validate services
    if (config.services) {
      for (const [name, service] of Object.entries(config.services)) {
        if (service.enabled && service.externalAccess === undefined) {
          warnings.push({
            path: `services.${name}.externalAccess`,
            message: `Enabled service '${name}' should specify externalAccess`,
            suggestion: 'Set externalAccess to true or false',
          })
        }
        if (typeof service.confidence !== 'number' || service.confidence < 0 || service.confidence > 100) {
          warnings.push({
            path: `services.${name}.confidence`,
            message: `Service '${name}' has invalid confidence`,
            suggestion: 'Set confidence between 0 and 100',
          })
        }
      }
    }

    // Validate suppression rules
    if (config.suppressionRules) {
      for (let i = 0; i < config.suppressionRules.length; i++) {
        const rule = config.suppressionRules[i]
        if (!rule.id) {
          errors.push({
            path: `suppressionRules[${i}].id`,
            message: 'Suppression rule must have an ID',
          })
        }
        if (!rule.cpePattern) {
          errors.push({
            path: `suppressionRules[${i}].cpePattern`,
            message: 'Suppression rule must have a CPE pattern',
          })
        }
        if (!rule.reason) {
          errors.push({
            path: `suppressionRules[${i}].reason`,
            message: 'Suppression rule must have a reason (for audit)',
          })
        }
        if (!rule.approvedBy) {
          warnings.push({
            path: `suppressionRules[${i}].approvedBy`,
            message: `Rule '${rule.id}' should have approval`,
            suggestion: 'Add approvedBy field for audit trail',
          })
        }
        // Check expiration
        if (rule.expires) {
          const expiresDate = new Date(rule.expires)
          if (isNaN(expiresDate.getTime())) {
            errors.push({
              path: `suppressionRules[${i}].expires`,
              message: `Rule '${rule.id}' has invalid expiration date`,
            })
          } else if (expiresDate < new Date()) {
            warnings.push({
              path: `suppressionRules[${i}].expires`,
              message: `Rule '${rule.id}' has expired`,
              suggestion: 'Update or remove expired rule',
            })
          }
        }
      }
    }

    // Validate filter settings
    if (config.filterSettings) {
      const { autoFilterConfidenceThreshold } = config.filterSettings
      if (
        typeof autoFilterConfidenceThreshold !== 'number' ||
        autoFilterConfidenceThreshold < 0 ||
        autoFilterConfidenceThreshold > 100
      ) {
        errors.push({
          path: 'filterSettings.autoFilterConfidenceThreshold',
          message: 'Confidence threshold must be between 0 and 100',
        })
      }
      if (config.filterSettings.neverAutoFilter?.includes('critical') === false) {
        warnings.push({
          path: 'filterSettings.neverAutoFilter',
          message: 'Critical vulnerabilities should not be auto-filtered',
          suggestion: 'Add "critical" to neverAutoFilter',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Get hash of configuration (for audit trail)
   */
  getConfigHash(config: SystemConfig): string {
    const content = JSON.stringify(config)
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * Merge two configurations (base + override)
   */
  mergeConfigs(base: SystemConfig, override: Partial<SystemConfig>): SystemConfig {
    return this.normalizeConfig({
      ...base,
      ...override,
      project: {
        ...base.project,
        ...override.project,
      },
      cybersecurity: {
        ...base.cybersecurity,
        ...override.cybersecurity,
      },
      interfaces: {
        ...base.interfaces,
        ...override.interfaces,
      },
      services: {
        ...base.services,
        ...override.services,
      },
      features: {
        ...base.features,
        ...override.features,
      },
      suppressionRules: [...(base.suppressionRules || []), ...(override.suppressionRules || [])],
      filterSettings: {
        ...base.filterSettings,
        ...override.filterSettings,
        missFilterDetection: {
          ...base.filterSettings?.missFilterDetection,
          ...override.filterSettings?.missFilterDetection,
        },
        audit: {
          ...base.filterSettings?.audit,
          ...override.filterSettings?.audit,
        },
      },
    })
  }

  /**
   * Create default configuration for a project
   */
  createDefaultConfig(projectName: string, projectVersion: string = '1.0.0'): SystemConfig {
    return this.normalizeConfig({
      project: {
        name: projectName,
        version: projectVersion,
        tier: 'development',
      },
      cybersecurity: {
        attackSurface: 'intermediate',
        safetyRelated: false,
      },
      interfaces: {},
      services: {},
      features: {},
      suppressionRules: [],
    })
  }

  /**
   * Check if interface is enabled
   */
  isInterfaceEnabled(config: SystemConfig, interfaceName: string): boolean {
    return config.interfaces[interfaceName]?.enabled ?? false
  }

  /**
   * Check if service is enabled
   */
  isServiceEnabled(config: SystemConfig, serviceName: string): boolean {
    return config.services[serviceName]?.enabled ?? false
  }

  /**
   * Check if service has external access
   */
  hasExternalAccess(config: SystemConfig, serviceName: string): boolean {
    const service = config.services[serviceName]
    return !!(service?.enabled && service?.externalAccess === true)
  }

  /**
   * Get all enabled external interfaces
   */
  getEnabledExternalInterfaces(config: SystemConfig): string[] {
    return Object.entries(config.interfaces)
      .filter(([_, iface]) => iface.enabled && iface.exposure === 'external')
      .map(([name]) => name)
  }

  /**
   * Get all services with external access
   */
  getServicesWithExternalAccess(config: SystemConfig): string[] {
    return Object.entries(config.services)
      .filter(([_, service]) => service.enabled && service.externalAccess)
      .map(([name]) => name)
  }

  /**
   * Get active suppression rules (not expired)
   */
  getActiveSuppressionRules(config: SystemConfig): SystemConfig['suppressionRules'] {
    const now = new Date()
    return (config.suppressionRules || []).filter((rule) => {
      if (!rule.expires) return true
      return new Date(rule.expires) > now
    })
  }
}

// Export singleton instance
export const configService = new ConfigService()
