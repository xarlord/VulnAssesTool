/**
 * IPC Type Definitions for Container Scanning Operations
 *
 * Defines the communication protocol between renderer and main process
 * for container image scanning via Docker/Podman CLI.
 */

/**
 * Container IPC channel names
 */
export const CONTAINER_IPC_CHANNELS = {
  CHECK_RUNTIME: 'container:check-runtime',
  PULL_IMAGE: 'container:pull-image',
  GET_MANIFEST: 'container:get-manifest',
  INSPECT_IMAGE: 'container:inspect-image',
  SCAN_IMAGE: 'container:scan-image',
  EXTRACT_PACKAGES: 'container:extract-packages',
} as const

/**
 * Container runtime type
 */
export type ContainerRuntime = 'docker' | 'podman'

/**
 * Check runtime request
 */
export interface CheckRuntimeRequest {
  runtime: ContainerRuntime
}

/**
 * Check runtime response
 */
export interface CheckRuntimeResponse {
  success: boolean
  runtime?: {
    type: ContainerRuntime
    version: string
    available: boolean
    socket?: string
  }
  error?: string
}

/**
 * Pull image request
 */
export interface PullImageRequest {
  imageRef: string
  runtime: ContainerRuntime
  platform?: string
}

/**
 * Pull image response
 */
export interface PullImageResponse {
  success: boolean
  digest?: string
  error?: string
}

/**
 * Get manifest request
 */
export interface GetManifestRequest {
  imageRef: string
  runtime: ContainerRuntime
}

/**
 * Layer info from manifest
 */
export interface LayerInfo {
  digest: string
  size: number
  mediaType: string
}

/**
 * Get manifest response
 */
export interface GetManifestResponse {
  success: boolean
  manifest?: {
    digest: string
    config: { digest: string }
    layers: LayerInfo[]
  }
  error?: string
}

/**
 * Inspect image request
 */
export interface InspectImageRequest {
  imageRef: string
  runtime: ContainerRuntime
}

/**
 * Inspect image response
 */
export interface InspectImageResponse {
  success: boolean
  config?: {
    os: string
    architecture: string
    variant?: string
    created?: string
    dockerVersion?: string
    labels?: Record<string, string>
  }
  error?: string
}

/**
 * Package found in container layer
 */
export interface ContainerPackage {
  name: string
  version: string
  manager: string
  architecture?: string
  cpe?: string
  purl?: string
  layerDigest: string
  filePaths?: string[]
}

/**
 * Extract packages request
 */
export interface ExtractPackagesRequest {
  imageRef: string
  runtime: ContainerRuntime
  layerDigests: string[]
}

/**
 * Extract packages response
 */
export interface ExtractPackagesResponse {
  success: boolean
  packages?: ContainerPackage[]
  error?: string
}

/**
 * Full scan request
 */
export interface ScanImageRequest {
  imageRef: string
  runtime: ContainerRuntime
  platform?: string
  maxLayers?: number
}

/**
 * Full scan response
 */
export interface ScanImageResponse {
  success: boolean
  result?: {
    image: {
      name: string
      registry?: string
      repository: string
      tag?: string
      digest?: string
      original: string
    }
    imageDigest: string
    manifestDigest: string
    platform: {
      os: string
      architecture: string
      variant?: string
    }
    layers: Array<{
      digest: string
      size: number
      mediaType: string
      command?: string
      packages: ContainerPackage[]
    }>
    packages: ContainerPackage[]
    stats: {
      totalLayers: number
      processedLayers: number
      totalPackages: number
      uniquePackages: number
      scanTimeMs: number
    }
    warnings: string[]
    errors: string[]
  }
  error?: string
}

/**
 * Container API exposed to renderer via preload
 */
export interface ContainerAPI {
  checkRuntime: (runtime: ContainerRuntime) => Promise<CheckRuntimeResponse>
  pullImage: (request: PullImageRequest) => Promise<PullImageResponse>
  getManifest: (request: GetManifestRequest) => Promise<GetManifestResponse>
  inspectImage: (request: InspectImageRequest) => Promise<InspectImageResponse>
  scanImage: (request: ScanImageRequest) => Promise<ScanImageResponse>
  extractPackages: (request: ExtractPackagesRequest) => Promise<ExtractPackagesResponse>
  onScanProgress: (callback: (progress: { phase: string; message: string; percent?: number }) => void) => () => void
}
