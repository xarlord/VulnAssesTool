import { Router } from 'express'
import { ContainerService } from '../services/ContainerService.js'
import { broadcast } from '../websocket.js'
import type {
  CheckRuntimeRequest,
  CheckRuntimeResponse,
  PullImageRequest,
  PullImageResponse,
  GetManifestRequest,
  GetManifestResponse,
  InspectImageRequest,
  InspectImageResponse,
  ScanImageRequest,
  ScanImageResponse,
  ExtractPackagesRequest,
  ExtractPackagesResponse,
  ContainerPackage,
} from '../types/container.js'

const router = Router()
const containerService = new ContainerService()

function parseImageRef(ref: string) {
  let registry = 'docker.io'
  let repository = ref
  let tag = 'latest'
  let digest: string | undefined

  if (ref.includes('/')) {
    const parts = ref.split('/')
    if (parts[0].includes('.') || parts[0].includes(':')) {
      const shifted = parts.shift()
      if (shifted) registry = shifted
      repository = parts.join('/')
    }
  }

  if (repository.includes('@sha256:')) {
    const atIndex = repository.indexOf('@sha256:')
    digest = repository.substring(atIndex + 1)
    repository = repository.substring(0, atIndex)
  }

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
    original: ref,
  }
}

router.post('/check-runtime', async (req, res) => {
  try {
    const request = req.body as CheckRuntimeRequest
    const info = await containerService.checkRuntime(request.runtime)
    const response: CheckRuntimeResponse = { success: true, runtime: info }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check container runtime',
    })
  }
})

router.post('/pull', async (req, res) => {
  try {
    const request = req.body as PullImageRequest
    const result = await containerService.pullImage(request.imageRef, request.runtime, (status) => {
      broadcast('scan-progress', { phase: 'pull', message: status })
    })
    const response: PullImageResponse = { success: true, digest: result.digest }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pull image',
    })
  }
})

router.post('/manifest', async (req, res) => {
  try {
    const request = req.body as GetManifestRequest
    const manifest = await containerService.getManifest(request.imageRef, request.runtime)
    const response: GetManifestResponse = { success: true, manifest }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get manifest',
    })
  }
})

router.post('/inspect', async (req, res) => {
  try {
    const request = req.body as InspectImageRequest
    const config = await containerService.inspectImage(request.imageRef, request.runtime)
    const response: InspectImageResponse = {
      success: true,
      config: {
        os: config.os || 'linux',
        architecture: config.architecture || 'amd64',
        variant: config.variant,
        created: config.created,
        dockerVersion: config.dockerVersion,
        labels: config.labels,
      },
    }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to inspect image',
    })
  }
})

router.post('/scan', async (req, res) => {
  const startTime = Date.now()
  const warnings: string[] = []
  const errors: string[] = []

  try {
    const request = req.body as ScanImageRequest

    const runtimeInfo = await containerService.checkRuntime(request.runtime)
    if (!runtimeInfo.available) {
      res.json({
        success: false,
        error: `${request.runtime} runtime is not available. Please install ${request.runtime} to scan container images.`,
      })
      return
    }

    broadcast('scan-progress', {
      phase: 'pull',
      message: `Pulling ${request.imageRef}...`,
    })
    await containerService.pullImage(request.imageRef, request.runtime, (status) => {
      broadcast('scan-progress', { phase: 'pull', message: status })
    })

    broadcast('scan-progress', {
      phase: 'manifest',
      message: 'Inspecting image manifest...',
    })
    const manifest = await containerService.getManifest(request.imageRef, request.runtime)

    broadcast('scan-progress', {
      phase: 'inspect',
      message: 'Inspecting image configuration...',
    })
    const inspectConfig = await containerService.inspectImage(request.imageRef, request.runtime)

    broadcast('scan-progress', {
      phase: 'extract',
      message: 'Extracting packages from image layers...',
    })

    const { packages, layers: scannedLayers } = await containerService.extractPackages(
      request.imageRef,
      request.runtime,
      [],
      (phase) => {
        broadcast('scan-progress', { phase: 'extract', message: phase })
      },
    )

    const image = parseImageRef(request.imageRef)

    // Build the layer breakdown from the layers actually recovered from the
    // saved image (real filesystem layers) rather than from the manifest: a
    // multi-arch image's manifest is a *list of per-platform manifests*, not
    // layers, so using it showed e.g. "16 layers" for single-layer alpine and
    // attributed zero packages to each (digests never matched).
    const layers = scannedLayers.map((layer) => ({
      digest: layer.digest,
      size: layer.size,
      mediaType: layer.mediaType,
      packages: packages.filter((pkg: ContainerPackage) => pkg.layerDigest === layer.digest),
    }))

    const packageMap = new Map<string, ContainerPackage>()
    for (const pkg of packages) {
      const key = `${pkg.manager}:${pkg.name}:${pkg.architecture || 'noarch'}`
      packageMap.set(key, pkg)
    }
    const consolidatedPackages = Array.from(packageMap.values())

    const response: ScanImageResponse = {
      success: true,
      result: {
        image,
        imageDigest: manifest.config?.digest || '',
        manifestDigest: manifest.digest || '',
        platform: {
          os: inspectConfig.os || 'linux',
          architecture: inspectConfig.architecture || 'amd64',
          variant: inspectConfig.variant,
        },
        layers,
        packages: consolidatedPackages,
        stats: {
          totalLayers: scannedLayers.length,
          processedLayers: scannedLayers.length,
          totalPackages: packages.length,
          uniquePackages: consolidatedPackages.length,
          scanTimeMs: Date.now() - startTime,
        },
        warnings,
        errors,
      },
    }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scan image',
    })
  }
})

router.post('/extract', async (req, res) => {
  try {
    const request = req.body as ExtractPackagesRequest
    const { packages } = await containerService.extractPackages(
      request.imageRef,
      request.runtime,
      request.layerDigests,
      (phase) => {
        broadcast('scan-progress', { phase: 'extract', message: phase })
      },
    )
    const response: ExtractPackagesResponse = { success: true, packages }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract packages',
    })
  }
})

export { router as containerRoutes }
