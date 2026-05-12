import type { Vulnerability, Component, VulnerabilitySource, VulnerabilityProviderConfig } from '@@/types'
import type { VulnerabilityProvider, VulnerabilityQueryOptions, ProviderHealthStatus } from './base'

/**
 * Provider Registry
 * Manages multiple vulnerability providers with priority and fallback
 */
export class ProviderRegistry {
  private providers: Map<VulnerabilitySource, VulnerabilityProvider> = new Map()
  private priorities: Map<VulnerabilitySource, number> = new Map()
  private configs: Map<VulnerabilitySource, VulnerabilityProviderConfig> = new Map()

  /**
   * Register a vulnerability provider
   */
  registerProvider(provider: VulnerabilityProvider, config: VulnerabilityProviderConfig): void {
    this.providers.set(provider.id, provider)
    this.priorities.set(provider.id, config.priority)
    this.configs.set(provider.id, config)
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: VulnerabilitySource): void {
    this.providers.delete(providerId)
    this.priorities.delete(providerId)
    this.configs.delete(providerId)
  }

  /**
   * Get a specific provider by ID
   */
  getProvider(providerId: VulnerabilitySource): VulnerabilityProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): VulnerabilityProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get enabled providers sorted by priority
   */
  getEnabledProviders(): VulnerabilityProvider[] {
    return Array.from(this.providers.entries())
      .filter(([id]) => this.configs.get(id)?.enabled)
      .sort(([, a], [, b]) => {
        const priorityA = this.priorities.get(a.id) || 999
        const priorityB = this.priorities.get(b.id) || 999
        return priorityA - priorityB
      })
      .map(([, provider]) => provider)
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerId: VulnerabilitySource, config: Partial<VulnerabilityProviderConfig>): void {
    const currentConfig = this.configs.get(providerId)
    if (currentConfig) {
      this.configs.set(providerId, { ...currentConfig, ...config })
      if (config.priority !== undefined) {
        this.priorities.set(providerId, config.priority)
      }
    }
  }

  /**
   * Check health of all enabled providers
   */
  async checkAllProvidersHealth(): Promise<Map<VulnerabilitySource, ProviderHealthStatus>> {
    const results = new Map<VulnerabilitySource, ProviderHealthStatus>()

    for (const provider of this.getEnabledProviders()) {
      const config = this.configs.get(provider.id)
      try {
        const status = await provider.checkHealth(config?.apiKey)
        results.set(provider.id, status)
      } catch (error) {
        results.set(provider.id, {
          isHealthy: false,
          error: error instanceof Error ? error.message : String(error),
          lastChecked: new Date(),
        })
      }
    }

    return results
  }

  /**
   * Query all enabled providers for a component
   * Returns merged and deduplicated vulnerabilities
   */
  async queryAllProviders(component: Component, options: VulnerabilityQueryOptions = {}): Promise<Vulnerability[]> {
    const enabledProviders = this.getEnabledProviders()
    const allVulnerabilities = new Map<string, Vulnerability>()

    // Query each provider
    const queryPromises = enabledProviders.map(async (provider) => {
      const config = this.configs.get(provider.id)
      const providerOptions = { ...options, apiKey: config?.apiKey }

      try {
        // Try PURL first if available
        if (component.purl && provider.capabilities.purlSupport) {
          const result = await provider.queryByPurl({
            purl: component.purl,
            ...providerOptions,
          })

          // Merge results
          for (const vuln of result.vulnerabilities) {
            this.mergeVulnerability(allVulnerabilities, vuln, provider.id)
          }
        }
        // Try CPE if available
        else if (component.cpe && provider.capabilities.cpeSupport) {
          const result = await provider.queryByCpe({
            cpe: component.cpe,
            ...providerOptions,
          })

          // Merge results
          for (const vuln of result.vulnerabilities) {
            this.mergeVulnerability(allVulnerabilities, vuln, provider.id)
          }
        }
      } catch (error) {
        console.error(`Error querying provider ${provider.id} for component ${component.id}:`, error)
      }
    })

    await Promise.all(queryPromises)

    return Array.from(allVulnerabilities.values())
  }

  /**
   * Merge vulnerability from a source into the collection
   * Handles deduplication and source attribution
   */
  private mergeVulnerability(
    vulnerabilities: Map<string, Vulnerability>,
    vuln: Vulnerability,
    sourceId: VulnerabilitySource,
  ): void {
    const existing = vulnerabilities.get(vuln.id)

    if (existing) {
      // Merge sources
      if (!existing.sources) {
        existing.sources = [existing.source]
      }
      if (!existing.sources.includes(sourceId)) {
        existing.sources.push(sourceId)
      }

      // Merge CVE/GHSA aliases if available
      if (vuln.aliases) {
        if (!existing.aliases) {
          existing.aliases = []
        }
        for (const alias of vuln.aliases) {
          if (!existing.aliases.includes(alias)) {
            existing.aliases.push(alias)
          }
        }
      }

      // Merge CWE data
      if (vuln.cwes && vuln.cwes.length > 0) {
        if (!existing.cwes) {
          existing.cwes = []
        }
        for (const cwe of vuln.cwes) {
          if (!existing.cwes.includes(cwe)) {
            existing.cwes.push(cwe)
          }
        }
      }

      // Merge references
      if (vuln.references && vuln.references.length > 0) {
        const existingUrls = new Set(existing.references.map((r) => r.url))
        for (const ref of vuln.references) {
          if (!existingUrls.has(ref.url)) {
            existing.references.push(ref)
            existingUrls.add(ref.url)
          }
        }
      }

      // Prefer more complete data
      if (!existing.cvssVector && vuln.cvssVector) {
        existing.cvssVector = vuln.cvssVector
      }
      if (!existing.cvssScore && vuln.cvssScore) {
        existing.cvssScore = vuln.cvssScore
      }
      if (!existing.cvssBreakdown && vuln.cvssBreakdown) {
        existing.cvssBreakdown = vuln.cvssBreakdown
      }
      if (!existing.patchInfo && vuln.patchInfo) {
        existing.patchInfo = vuln.patchInfo
      }
    } else {
      // Add new vulnerability
      vuln.sources = [vuln.source, sourceId].filter((s, i, arr) => arr.indexOf(s) === i) as VulnerabilitySource[]
      vulnerabilities.set(vuln.id, vuln)
    }
  }

  /**
   * Batch query for multiple components
   */
  async batchQuery(
    components: Component[],
    options: VulnerabilityQueryOptions = {},
  ): Promise<Map<string, Vulnerability[]>> {
    const result = new Map<string, Vulnerability[]>()

    for (const component of components) {
      try {
        const vulnerabilities = await this.queryAllProviders(component, options)
        result.set(component.id, vulnerabilities)
      } catch (error) {
        console.error(`Error querying for component ${component.id}:`, error)
        result.set(component.id, [])
      }
    }

    return result
  }

  /**
   * Get vulnerability by ID from any enabled provider
   */
  async getVulnerabilityById(id: string): Promise<Vulnerability | null> {
    const enabledProviders = this.getEnabledProviders()

    for (const provider of enabledProviders) {
      const config = this.configs.get(provider.id)
      try {
        const vuln = await provider.getVulnerabilityById(id, config?.apiKey)
        if (vuln) {
          return vuln
        }
      } catch {
        // Try next provider
        continue
      }
    }

    return null
  }
}

// Global registry instance
let globalRegistry: ProviderRegistry | null = null

/**
 * Get the global provider registry instance
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ProviderRegistry()
  }
  return globalRegistry
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetProviderRegistry(): void {
  globalRegistry = null
}
