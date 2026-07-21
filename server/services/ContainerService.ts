/**
 * Container Service
 *
 * Executes Docker/Podman CLI commands to scan container images.
 * Runs in the main process and exposes functionality via IPC.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ContainerRuntime, ContainerPackage } from '../types/container.js'

const execFileAsync = promisify(execFile)

// Timeout for CLI commands (5 minutes)
const COMMAND_TIMEOUT = 300_000

/**
 * Result of executing a container CLI command
 */
interface CommandResult {
  stdout: string
  stderr: string
}

/**
 * A real image layer recovered from the `docker save` tarball, used to build
 * the scan's layer breakdown. Digest matches the `layerDigest` stamped on
 * packages, so per-layer attribution lines up.
 */
interface ScannedLayer {
  digest: string
  size: number
  mediaType: string
}

/**
 * Parsed image config from `docker image inspect`
 */
interface ImageConfig {
  os?: string
  architecture?: string
  variant?: string
  created?: string
  dockerVersion?: string
  labels?: Record<string, string>
  history?: Array<{
    created?: string
    createdBy?: string
    emptyLayer?: boolean
  }>
}

export class ContainerService {
  /**
   * Execute a container runtime CLI command
   */
  private async runCommand(runtime: ContainerRuntime, args: string[], timeout?: number): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync(runtime, args, {
        timeout: timeout || COMMAND_TIMEOUT,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large manifests
        windowsHide: true,
      })
      return { stdout, stderr }
    } catch (error: unknown) {
      // execFile throws on non-zero exit codes
      const execError = error as { stderr?: string; message?: string }
      const stderr = execError.stderr || ''
      const message = execError.message || 'Command failed'

      // Check if the error is just "not found"
      if (message.includes('ENOENT') || message.includes('not found') || message.includes('not recognized')) {
        throw new Error(`${runtime} is not installed or not in PATH`)
      }

      throw new Error(`${runtime} ${args.join(' ')} failed: ${message}. ${stderr}`.trim())
    }
  }

  /**
   * Check if a container runtime is available
   */
  async checkRuntime(runtime: ContainerRuntime): Promise<{
    type: ContainerRuntime
    version: string
    available: boolean
    socket?: string
  }> {
    try {
      const { stdout } = await this.runCommand(runtime, ['version', '--format', 'json'], 10_000)

      // Parse version info — Docker and Podman output slightly different JSON
      let version = 'unknown'
      try {
        const parsed = JSON.parse(stdout)
        // Docker: { Version: "24.0.0", ... }
        // Podman: { Client: { Version: "4.x" }, Server: { Version: "4.x" } }
        if (parsed.Version) {
          version = parsed.Version
        } else if (parsed.Client?.Version) {
          version = parsed.Client.Version
        } else if (typeof parsed === 'string') {
          version = parsed.trim()
        }
      } catch {
        // Non-JSON output, try to extract version from text
        const match = stdout.match(/Version:\s*([^\n\r]+)/)
        if (match) version = match[1].trim()
      }

      return {
        type: runtime,
        version,
        available: true,
        socket: this.getRuntimeSocket(runtime),
      }
    } catch {
      return {
        type: runtime,
        version: '',
        available: false,
      }
    }
  }

  /**
   * Pull a container image
   */
  async pullImage(
    imageRef: string,
    runtime: ContainerRuntime,
    onProgress?: (status: string) => void,
  ): Promise<{ digest: string }> {
    // Check if image already exists locally
    try {
      const inspectResult = await this.inspectImage(imageRef, runtime)
      if (inspectResult.Id) {
        onProgress?.('Image already available locally')
        return { digest: inspectResult.Id }
      }
    } catch {
      // Image not found locally, proceed with pull
    }

    onProgress?.(`Pulling ${imageRef}...`)
    const { stdout } = await this.runCommand(runtime, ['pull', imageRef])

    // Try to extract digest from pull output
    const digestMatch = stdout.match(/Digest:\s*(sha256:[a-f0-9]+)/)
    const digest = digestMatch ? digestMatch[1] : ''

    onProgress?.('Image pulled successfully')
    return { digest }
  }

  /**
   * Get image manifest
   */
  async getManifest(
    imageRef: string,
    runtime: ContainerRuntime,
  ): Promise<{
    digest: string
    config: { digest: string }
    layers: Array<{ digest: string; size: number; mediaType: string }>
  }> {
    // Use `manifest inspect` for manifest data
    let manifestJson: string

    try {
      const { stdout } = await this.runCommand(runtime, ['manifest', 'inspect', imageRef])
      manifestJson = stdout
    } catch {
      // Fallback: use `image inspect` to get layer info
      return this.getManifestFromInspect(imageRef, runtime)
    }

    const parsed = JSON.parse(manifestJson)

    // Normalize Docker manifest v2 schema
    const config = parsed.config || { digest: parsed.configDigest || '' }
    const layers = (parsed.layers || parsed.manifests || []).map(
      (layer: { digest?: string; size?: number; mediaType?: string }) => ({
        digest: layer.digest || '',
        size: layer.size || 0,
        mediaType: layer.mediaType || 'application/vnd.docker.image.rootfs.diff.tar.gzip',
      }),
    )

    return {
      digest: parsed.digest || '',
      config: { digest: config.digest || '' },
      layers,
    }
  }

  /**
   * Fallback: extract manifest-like data from `image inspect`
   */
  private async getManifestFromInspect(
    imageRef: string,
    runtime: ContainerRuntime,
  ): Promise<{
    digest: string
    config: { digest: string }
    layers: Array<{ digest: string; size: number; mediaType: string }>
  }> {
    const inspectData = await this.getImageInspect(imageRef, runtime)

    const id = (inspectData.Id as string) || ''
    const rootFsLayers = (inspectData.RootFS as { Layers?: string[] })?.Layers || []

    return {
      digest: id,
      config: { digest: id },
      layers: rootFsLayers.map((layer: string) => ({
        digest: layer,
        size: 0,
        mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
      })),
    }
  }

  /**
   * Inspect image configuration
   */
  async inspectImage(
    imageRef: string,
    runtime: ContainerRuntime,
  ): Promise<ImageConfig & { Id?: string; RootFS?: { Layers: string[] } }> {
    const { stdout } = await this.runCommand(runtime, ['image', 'inspect', imageRef, '--format', 'json'])

    let parsed: unknown
    try {
      parsed = JSON.parse(stdout)
    } catch {
      throw new Error(`Failed to parse ${runtime} inspect output`)
    }

    // Docker/Podman return an array of inspect results
    const rawData = Array.isArray(parsed) ? parsed[0] : parsed

    if (!rawData || typeof rawData !== 'object') {
      throw new Error('No inspect data returned')
    }

    // Docker/Podman image inspect output shape (partial)
    const data = rawData as Record<string, unknown>
    const config = (data.Config as Record<string, unknown>) || {}

    return {
      Id: (data.Id as string) || '',
      os: (data.Os as string) || 'linux',
      architecture: (data.Architecture as string) || (data.architecture as string) || 'amd64',
      variant: data.Variant as string | undefined,
      created: data.Created as string | undefined,
      dockerVersion: data.DockerVersion as string | undefined,
      labels: (config.Labels as Record<string, string>) || {},
      history: (data.History as Array<Record<string, unknown>>) || [],
      RootFS: (data.RootFS as { Layers: string[] }) || { Layers: [] },
    }
  }

  /**
   * Get raw image inspect data
   */
  private async getImageInspect(imageRef: string, runtime: ContainerRuntime): Promise<Record<string, unknown>> {
    const { stdout } = await this.runCommand(runtime, ['image', 'inspect', imageRef, '--format', 'json'])
    const parsed: unknown = JSON.parse(stdout)
    return Array.isArray(parsed) ? (parsed[0] as Record<string, unknown>) : (parsed as Record<string, unknown>)
  }

  /**
   * Extract packages from container image layers.
   *
   * Uses `docker save` to export the image, then scans layer tarballs
   * for known package database files.
   */
  async extractPackages(
    imageRef: string,
    runtime: ContainerRuntime,
    layerDigests: string[],
    onProgress?: (phase: string) => void,
  ): Promise<{ packages: ContainerPackage[]; layers: ScannedLayer[] }> {
    const allPackages: ContainerPackage[] = []
    // Layers recovered from the saved image, in filesystem order. Digest here
    // matches the layerDigest stamped on packages below, so the scan route can
    // attribute packages to layers reliably (unlike the multi-arch manifest
    // list, whose per-platform entries aren't filesystem layers at all).
    const scannedLayers: ScannedLayer[] = []
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vat-container-'))

    try {
      onProgress?.('Saving container image to tar...')
      const imageTarPath = path.join(tmpDir, 'image.tar')
      await this.runCommand(runtime, ['save', '-o', imageTarPath, imageRef])

      onProgress?.('Extracting image layers...')
      // Extract the outer tar to get manifest.json and layer tarballs
      await this.extractTar(imageTarPath, tmpDir)

      // Read manifest.json to find layer order
      const manifestPath = path.join(tmpDir, 'manifest.json')
      if (!fs.existsSync(manifestPath)) {
        throw new Error('manifest.json not found in exported image')
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const manifestEntry = Array.isArray(manifest) ? manifest[0] : manifest
      const layerFiles: string[] = manifestEntry.Layers || []

      // Get config for history (layer commands)
      const configFile = manifestEntry.Config
      let history: Array<{ createdBy?: string; emptyLayer?: boolean }> = []
      if (configFile) {
        const configPath = path.join(tmpDir, configFile)
        if (fs.existsSync(configPath)) {
          const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          history = configData.history || []
        }
      }

      // Process each layer
      let layerIndex = 0
      let nonEmptyHistoryIndex = 0
      for (const layerFile of layerFiles) {
        const layerPath = path.join(tmpDir, layerFile)
        if (!fs.existsSync(layerPath)) {
          layerIndex++
          continue
        }

        // Find the corresponding command from history
        while (nonEmptyHistoryIndex < history.length) {
          const entry = history[nonEmptyHistoryIndex]
          nonEmptyHistoryIndex++
          if (!entry.emptyLayer) {
            break
          }
        }

        onProgress?.(`Scanning layer ${layerIndex + 1}/${layerFiles.length}...`)

        const layerDigest = this.getLayerDigestFromPath(layerFile)
        let layerSize = 0
        try {
          layerSize = fs.statSync(layerPath).size
        } catch {
          // Non-fatal: size is display-only.
        }
        scannedLayers.push({
          digest: layerDigest,
          size: layerSize,
          mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        })

        const layerDir = path.join(tmpDir, `layer-${layerIndex}`)
        await fs.promises.mkdir(layerDir, { recursive: true })

        try {
          // Tolerate tar's non-zero exit: a Linux rootfs is full of symlinks/
          // hardlinks that Windows tar can't create, but the regular files we
          // read (the package databases) still extract fine.
          await this.extractTar(layerPath, layerDir, { tolerateErrors: true })
          const packages = await this.scanLayerForPackages(layerDir, layerDigest)
          allPackages.push(...packages)
        } catch (err) {
          console.warn(`[ContainerService] Failed to process layer ${layerIndex}:`, err)
        }

        layerIndex++
      }
    } finally {
      // Clean up temp directory
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    }

    return { packages: allPackages, layers: scannedLayers }
  }

  /**
   * Extract a tar file to a directory.
   *
   * @param options.tolerateErrors - When true, a non-zero tar exit is logged
   *   and swallowed instead of throwing. Container layers are Linux rootfs
   *   tarballs full of symlinks/hardlinks (busybox applets, shared libs) that
   *   GNU tar on Windows can't create without privilege, so it exits non-zero
   *   even though every regular file — including the package databases we read
   *   — extracted successfully. The outer image tarball (blobs + JSON, no
   *   links) is extracted strictly so a genuine corruption still surfaces.
   */
  private async extractTar(tarPath: string, destDir: string, options?: { tolerateErrors?: boolean }): Promise<void> {
    // Extract from within destDir using a path relative to it. Passing an
    // absolute "C:\..." path to tar on Windows makes it misparse the drive
    // letter as a remote host ("tar: Cannot connect to C: resolve failed");
    // a relative archive name + cwd avoids that for both GNU tar and bsdtar.
    // (tar is available by default on Windows 10 1803+.)
    const relTar = path.relative(destDir, tarPath) || path.basename(tarPath)
    try {
      await execFileAsync('tar', ['-xf', relTar], {
        cwd: destDir,
        timeout: 120_000,
        windowsHide: true,
        // A rootfs layer produces a lot of stderr (one line per uncreatable
        // link); keep the buffer generous so tar isn't killed mid-extraction.
        maxBuffer: 64 * 1024 * 1024,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (options?.tolerateErrors) {
        console.warn(
          `[ContainerService] tar reported errors extracting ${path.basename(tarPath)} (continuing): ${
            message.split('\n')[0]
          }`,
        )
        return
      }
      throw new Error(`Failed to extract tar: ${message}`)
    }
  }

  /**
   * Extract layer digest from path like "blobs/sha256/abc123" or "abc123/layer.tar"
   */
  private getLayerDigestFromPath(layerPath: string): string {
    const parts = layerPath.replace(/\\/g, '/').split('/')
    // Look for sha256 digest pattern
    for (const part of parts) {
      if (/^[a-f0-9]{64}$/.test(part)) {
        return `sha256:${part}`
      }
      if (part.startsWith('sha256:')) {
        return part
      }
    }
    // Fallback: use the filename
    return parts[parts.length - 1] || layerPath
  }

  /**
   * Scan an extracted layer directory for package databases
   */
  private async scanLayerForPackages(layerDir: string, layerDigest: string): Promise<ContainerPackage[]> {
    const packages: ContainerPackage[] = []

    // Check for dpkg database (Debian/Ubuntu)
    const dpkgPath = path.join(layerDir, 'var', 'lib', 'dpkg', 'status')
    if (fs.existsSync(dpkgPath)) {
      const dpkgPackages = this.parseDpkgStatus(dpkgPath, layerDigest)
      packages.push(...dpkgPackages)
    }

    // Check for apk database (Alpine)
    const apkPath = path.join(layerDir, 'lib', 'apk', 'db', 'installed')
    if (fs.existsSync(apkPath)) {
      const apkPackages = this.parseApkInstalled(apkPath, layerDigest)
      packages.push(...apkPackages)
    }

    // Check for rpm database (RHEL/Fedora/CentOS)
    const rpmPaths = [
      path.join(layerDir, 'var', 'lib', 'rpm', 'Packages'),
      path.join(layerDir, 'var', 'lib', 'rpm', 'Packages.db'),
      path.join(layerDir, 'var', 'lib', 'rpm', 'rpmdb.sqlite'),
    ]
    for (const rpmPath of rpmPaths) {
      if (fs.existsSync(rpmPath)) {
        // RPM binary databases require rpm CLI to parse
        const rpmPackages = await this.parseRpmPackages(rpmPath, layerDigest)
        packages.push(...rpmPackages)
        break
      }
    }

    return packages
  }

  /**
   * Parse dpkg status file (Debian/Ubuntu packages)
   */
  private parseDpkgStatus(filePath: string, layerDigest: string): ContainerPackage[] {
    const packages: ContainerPackage[] = []
    const content = fs.readFileSync(filePath, 'utf-8')
    const blocks = content.split('\n\n')

    for (const block of blocks) {
      if (!block.trim()) continue

      const fields: Record<string, string> = {}
      let currentField = ''
      let currentValue = ''

      for (const line of block.split('\n')) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
          // Continuation line
          currentValue += '\n' + line
          if (currentField) fields[currentField] = currentValue
        } else {
          const colonIndex = line.indexOf(':')
          if (colonIndex > 0) {
            currentField = line.substring(0, colonIndex).trim()
            currentValue = line.substring(colonIndex + 1).trim()
            fields[currentField] = currentValue
          }
        }
      }

      if (fields.Package && fields.Version) {
        const arch = fields.Architecture || 'amd64'
        packages.push({
          name: fields.Package,
          version: this.cleanVersion(fields.Version),
          manager: 'dpkg',
          architecture: arch,
          cpe: `cpe:2.3:a:*:${fields.Package}:${this.cleanVersion(fields.Version)}:*:*:*:*:*:*:*`,
          purl: `pkg:deb/${arch === 'all' ? '' : arch + '/'}${fields.Package}@${this.cleanVersion(fields.Version)}`,
          layerDigest,
        })
      }
    }

    return packages
  }

  /**
   * Parse APK installed database (Alpine packages)
   */
  private parseApkInstalled(filePath: string, layerDigest: string): ContainerPackage[] {
    const packages: ContainerPackage[] = []
    const content = fs.readFileSync(filePath, 'utf-8')

    // APK installed format:
    // P:package-name
    // V:1.2.3-r0
    // A:x86_64
    // (blank line separates entries)
    const blocks = content.split(/\n\n+/)

    for (const block of blocks) {
      if (!block.trim()) continue

      let name = ''
      let version = ''
      let arch = ''

      for (const line of block.split('\n')) {
        if (line.startsWith('P:')) name = line.substring(2)
        else if (line.startsWith('V:')) version = line.substring(2)
        else if (line.startsWith('A:')) arch = line.substring(2)
      }

      if (name && version) {
        packages.push({
          name,
          version,
          manager: 'apk',
          architecture: arch || undefined,
          cpe: `cpe:2.3:a:*:${name}:${version}:*:*:*:*:*:*:*`,
          purl: `pkg:alpine/${name}@${version}`,
          layerDigest,
        })
      }
    }

    return packages
  }

  /**
   * Parse RPM packages (requires rpm command)
   */
  private async parseRpmPackages(_dbPath: string, _layerDigest: string): Promise<ContainerPackage[]> {
    // RPM binary database format requires the rpm CLI tool to parse.
    // Since we're scanning a layer extracted to disk (not inside a container),
    // we can't easily query it. Return empty for now — the main scan path
    // would handle this differently by running commands inside the container.
    return []
  }

  /**
   * Clean version string (remove epoch prefix like "1:" from dpkg)
   */
  private cleanVersion(version: string): string {
    // Remove epoch (e.g., "1:2.0.0" → "2.0.0")
    const epochMatch = version.match(/^\d+:(.+)$/)
    return epochMatch ? epochMatch[1] : version
  }

  /**
   * Get the socket path for a container runtime
   */
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
}

/**
 * Create a ContainerService instance
 */
export function createContainerService(): ContainerService {
  return new ContainerService()
}
