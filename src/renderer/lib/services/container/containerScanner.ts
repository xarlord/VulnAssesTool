/**
 * Container Image Scanner
 *
 * Scans Docker and Podman container images for vulnerabilities.
 * Extracts SBOM from container layers and integrates with the vulnerability
 * matching pipeline.
 *
 * @module services/container
 * @requirement P2-015
 */

import { getPlatform } from '@/lib/platform'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Container runtime type
 */
export type ContainerRuntime = 'docker' | 'podman'

/**
 * Registry authentication configuration
 */
export interface RegistryAuth {
  /** Registry server URL */
  server: string

  /** Username for authentication */
  username: string

  /** Password or access token */
  password: string

  /** Authentication type */
  type?: 'basic' | 'bearer' | 'token'
}

/**
 * Container image reference
 */
export interface ImageReference {
  /** Full image name */
  name: string

  /** Registry server (default: docker.io) */
  registry?: string

  /** Repository/namespace */
  repository: string

  /** Image tag (default: latest) */
  tag?: string

  /** Image digest (sha256:...) */
  digest?: string

  /** Original reference string */
  original: string
}

/**
 * Container layer information
 */
export interface ContainerLayer {
  /** Layer digest */
  digest: string

  /** Layer size in bytes */
  size: number

  /** Layer media type */
  mediaType: string

  /** Layer command/instruction */
  command?: string

  /** Packages found in this layer */
  packages: LayerPackage[]
}

/**
 * Package found in a container layer
 */
export interface LayerPackage {
  /** Package name */
  name: string

  /** Package version */
  version: string

  /** Package manager (apk, dpkg, rpm, etc.) */
  manager: string

  /** Package architecture */
  architecture?: string

  /** Package CPE if available */
  cpe?: string

  /** PURL (Package URL) */
  purl?: string

  /** Source layer digest */
  layerDigest: string

  /** File paths where package was found */
  filePaths?: string[]
}

/**
 * Container scan options
 */
export interface ContainerScanOptions {
  /** Container runtime to use */
  runtime?: ContainerRuntime

  /** Registry authentication */
  auth?: RegistryAuth[]

  /** Include all layers or just final packages */
  includeAllLayers?: boolean

  /** Maximum layers to process */
  maxLayers?: number

  /** Timeout in milliseconds */
  timeout?: number

  /** Extract SBOM only (skip vulnerability scan) */
  sbomOnly?: boolean

  /** Platform for multi-arch images */
  platform?: string
}

/**
 * Container scan result
 */
export interface ContainerScanResult {
  /** Image reference */
  image: ImageReference

  /** Image digest (verified) */
  imageDigest: string

  /** Image manifest digest */
  manifestDigest: string

  /** Platform information */
  platform: {
    os: string
    architecture: string
    variant?: string
  }

  /** All layers analyzed */
  layers: ContainerLayer[]

  /** Consolidated packages (merged across layers) */
  packages: LayerPackage[]

  /** SBOM in CycloneDX format */
  sbom?: {
    bomFormat: 'CycloneDX'
    specVersion: string
    serialNumber: string
    version: number
    metadata: Record<string, unknown>
    components: Array<{
      type: string
      name: string
      version: string
      'bom-ref': string
      purl?: string
      cpe?: string
      properties?: Array<{ name: string; value: string }>
    }>
  }

  /** Scan statistics */
  stats: {
    totalLayers: number
    processedLayers: number
    totalPackages: number
    uniquePackages: number
    scanTimeMs: number
  }

  /** Any warnings during scan */
  warnings: string[]

  /** Any errors during scan */
  errors: string[]
}

/**
 * Container runtime info
 */
export interface RuntimeInfo {
  /** Runtime type */
  type: ContainerRuntime

  /** Runtime version */
  version: string

  /** Whether runtime is available */
  available: boolean

  /** Socket path */
  socket?: string
}

// ============================================================================
// CONTAINER SCANNER CLASS
// ============================================================================

/**
 * Scans container images for vulnerabilities
 */
export class ContainerScanner {
  private runtime: ContainerRuntime
  private auth: Map<string, RegistryAuth>
  private options: ContainerScanOptions

  constructor(options: ContainerScanOptions = {}) {
    this.runtime = options.runtime || 'docker'
    this.auth = new Map()
    this.options = {
      timeout: 300000, // 5 minutes
      maxLayers: 100,
      includeAllLayers: false,
      ...options,
    }

    // Index auth by server
    if (options.auth) {
      for (const a of options.auth) {
        this.auth.set(a.server, a)
      }
    }
  }

  /**
   * Check if a container runtime is available
   */
  async checkRuntime(runtime?: ContainerRuntime): Promise<RuntimeInfo> {
    const targetRuntime = runtime || this.runtime

    // Use IPC if available (running in Electron)
    if (getPlatform()?.container) {
      const result = await getPlatform().container.checkRuntime(targetRuntime)
      if (result.success && result.runtime) {
        return result.runtime
      }
      return {
        type: targetRuntime,
        version: '',
        available: false,
      }
    }

    // Fallback: simulated response for non-Electron environments
    try {
      const result = await this.executeCommand(`${targetRuntime} version --format json`)

      return {
        type: targetRuntime,
        version: result.version || 'unknown',
        available: true,
        socket: this.getRuntimeSocket(targetRuntime),
      }
    } catch {
      return {
        type: targetRuntime,
        version: '',
        available: false,
      }
    }
  }

  /**
   * Scan a container image
   */
  async scanImage(imageRef: string): Promise<ContainerScanResult> {
    // Use IPC if available (running in Electron)
    if (getPlatform()?.container) {
      const result = await getPlatform().container.scanImage({
        imageRef,
        runtime: this.runtime,
        platform: this.options.platform,
        maxLayers: this.options.maxLayers,
      })

      if (!result.success) {
        throw new Error(result.error || 'Container scan failed')
      }

      const scanData = result.result!
      return {
        image: scanData.image,
        imageDigest: scanData.imageDigest,
        manifestDigest: scanData.manifestDigest,
        platform: scanData.platform,
        layers: scanData.layers,
        packages: scanData.packages,
        sbom: this.options.sbomOnly
          ? this.generateSbom(scanData.image, scanData.packages, scanData.platform)
          : undefined,
        stats: scanData.stats,
        warnings: scanData.warnings,
        errors: scanData.errors,
      }
    }

    // Fallback: local processing for non-Electron environments
    const startTime = Date.now()
    const warnings: string[] = []
    const errors: string[] = []

    // Parse image reference
    const image = this.parseImageReference(imageRef)

    // Check runtime availability
    const runtimeInfo = await this.checkRuntime()
    if (!runtimeInfo.available) {
      throw new Error(`${this.runtime} runtime is not available`)
    }

    // Pull image if not present
    await this.pullImageIfNeeded(image)

    // Get image manifest
    const manifest = await this.getImageManifest(image)

    // Get image config
    const config = await this.getImageConfig(image)

    // Extract and analyze layers
    const layers = await this.analyzeLayers(image, manifest.layers || [])

    // Consolidate packages
    const packages = this.consolidatePackages(layers)

    // Generate SBOM
    const sbom = this.generateSbom(image, packages, config)

    return {
      image,
      imageDigest: manifest.config?.digest || '',
      manifestDigest: manifest.digest || '',
      platform: {
        os: config.os || 'linux',
        architecture: config.architecture || 'amd64',
        variant: config.variant,
      },
      layers,
      packages,
      sbom: this.options.sbomOnly ? sbom : undefined,
      stats: {
        totalLayers: manifest.layers?.length || 0,
        processedLayers: layers.length,
        totalPackages: packages.length + layers.reduce((sum, l) => sum + l.packages.length, 0),
        uniquePackages: packages.length,
        scanTimeMs: Date.now() - startTime,
      },
      warnings,
      errors,
    }
  }

  /**
   * Parse image reference string
   */
  parseImageReference(ref: string): ImageReference {
    const original = ref
    let registry = 'docker.io'
    let repository = ref
    let tag = 'latest'
    let digest: string | undefined

    // Extract registry
    if (ref.includes('/')) {
      const parts = ref.split('/')
      if (parts[0].includes('.') || parts[0].includes(':')) {
        registry = parts.shift()!
        repository = parts.join('/')
      }
    }

    // Extract digest
    if (repository.includes('@sha256:')) {
      const atIndex = repository.indexOf('@sha256:')
      digest = repository.substring(atIndex + 1)
      repository = repository.substring(0, atIndex)
    }

    // Extract tag
    if (!digest && repository.includes(':')) {
      const colonIndex = repository.lastIndexOf(':')
      tag = repository.substring(colonIndex + 1)
      repository = repository.substring(0, colonIndex)
    }

    const name = digest ? `${registry}/${repository}@${digest}` : `${registry}/${repository}:${tag}`

    return {
      name,
      registry,
      repository,
      tag: digest ? undefined : tag,
      digest,
      original,
    }
  }

  /**
   * Get authentication for a registry
   */
  getRegistryAuth(server: string): RegistryAuth | undefined {
    return this.auth.get(server) || this.auth.get('index.docker.io')
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getRuntimeSocket(runtime: ContainerRuntime): string {
    switch (runtime) {
      case 'docker':
        return process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'
      case 'podman':
        return process.platform === 'win32' ? '//./pipe/podman-machine-default' : '/run/user/1000/podman/podman.sock'
      default:
        return ''
    }
  }

  private async executeCommand(_command: string): Promise<Record<string, unknown>> {
    // This would be implemented via IPC in Electron
    // For now, return a mock response
    return {
      version: '24.0.0',
    }
  }

  private async pullImageIfNeeded(image: ImageReference): Promise<void> {
    const auth = this.getRegistryAuth(image.registry || 'docker.io')
    const authFlags = auth ? `--username ${auth.username} --password-stdin` : ''

    await this.executeCommand(`${this.runtime} pull ${authFlags} ${image.name}`)
  }

  private async getImageManifest(image: ImageReference): Promise<{
    digest?: string
    config?: { digest: string }
    layers?: Array<{ digest: string; size: number; mediaType: string }>
  }> {
    const result = await this.executeCommand(`${this.runtime} manifest inspect ${image.name}`)

    return result as {
      digest?: string
      config?: { digest: string }
      layers?: Array<{ digest: string; size: number; mediaType: string }>
    }
  }

  private async getImageConfig(image: ImageReference): Promise<{
    os?: string
    architecture?: string
    variant?: string
    config?: Record<string, unknown>
  }> {
    const result = await this.executeCommand(`${this.runtime} image inspect ${image.name} --format json`)

    return result as {
      os?: string
      architecture?: string
      variant?: string
      config?: Record<string, unknown>
    }
  }

  private async analyzeLayers(
    image: ImageReference,
    manifestLayers: Array<{ digest: string; size: number; mediaType: string }>,
  ): Promise<ContainerLayer[]> {
    const layers: ContainerLayer[] = []
    const maxLayers = this.options.maxLayers || 100

    for (let i = 0; i < Math.min(manifestLayers.length, maxLayers); i++) {
      const layerInfo = manifestLayers[i]
      const packages = await this.extractPackagesFromLayer(image, layerInfo.digest)

      layers.push({
        digest: layerInfo.digest,
        size: layerInfo.size,
        mediaType: layerInfo.mediaType,
        packages,
      })
    }

    return layers
  }

  private async extractPackagesFromLayer(image: ImageReference, layerDigest: string): Promise<LayerPackage[]> {
    // Use IPC if available (running in Electron)
    if (getPlatform()?.container) {
      const result = await getPlatform().container.extractPackages({
        imageRef: image.original,
        runtime: this.runtime,
        layerDigests: [layerDigest],
      })

      if (result.success && result.packages) {
        return result.packages
      }
    }

    // Fallback: return empty array — actual extraction requires main process
    return []
  }

  private consolidatePackages(layers: ContainerLayer[]): LayerPackage[] {
    const packageMap = new Map<string, LayerPackage>()

    // Process layers in order (later layers override earlier)
    for (const layer of layers) {
      for (const pkg of layer.packages) {
        const key = `${pkg.manager}:${pkg.name}:${pkg.architecture || 'noarch'}`
        packageMap.set(key, pkg)
      }
    }

    return Array.from(packageMap.values())
  }

  private generateSbom(
    image: ImageReference,
    packages: LayerPackage[],
    config: { os?: string; architecture?: string; variant?: string },
  ): ContainerScanResult['sbom'] {
    const components = packages.map((pkg, index) => ({
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      'bom-ref': `urn:cdx:${image.name}/${index}`,
      purl: pkg.purl,
      cpe: pkg.cpe,
      properties: [
        { name: 'aquasecurity:trivy:PkgID', value: `${pkg.manager}:${pkg.name}` },
        { name: 'aquasecurity:trivy:LayerDigest', value: pkg.layerDigest },
      ],
    }))

    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: `urn:uuid:${this.generateUUID()}`,
      version: 1,
      metadata: {
        component: {
          type: 'container',
          name: image.name,
          'bom-ref': `urn:cdx:${image.digest || image.name}`,
        },
        timestamp: new Date().toISOString(),
        tools: [
          {
            vendor: 'VulnAssesTool',
            name: 'ContainerScanner',
            version: '1.0.0',
          },
        ],
        properties: [
          { name: 'image:registry', value: image.registry || 'docker.io' },
          { name: 'image:repository', value: image.repository },
          { name: 'image:tag', value: image.tag || 'latest' },
          { name: 'image:digest', value: image.digest || '' },
          { name: 'image:platform:os', value: config.os || 'linux' },
          { name: 'image:platform:arch', value: config.architecture || 'amd64' },
        ],
      },
      components,
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a container scanner with default options
 */
export function createContainerScanner(options?: ContainerScanOptions): ContainerScanner {
  return new ContainerScanner(options)
}

/**
 * Scan a container image (convenience function)
 */
export async function scanContainerImage(
  imageRef: string,
  options?: ContainerScanOptions,
): Promise<ContainerScanResult> {
  const scanner = new ContainerScanner(options)
  return scanner.scanImage(imageRef)
}

/**
 * Check container runtime availability
 */
export async function checkContainerRuntime(runtime?: ContainerRuntime): Promise<RuntimeInfo> {
  const scanner = new ContainerScanner({ runtime })
  return scanner.checkRuntime(runtime)
}

/**
 * Parse container image reference
 */
export function parseImageReference(ref: string): ImageReference {
  const scanner = new ContainerScanner()
  return scanner.parseImageReference(ref)
}
