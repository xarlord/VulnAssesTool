/**
 * Container Scan Dialog
 *
 * Dialog for scanning container images (Docker/Podman) and importing
 * extracted packages as components into the current project.
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlatform } from '@/lib/platform'
import { Container, Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronRight, Package, Layers } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useCurrentProject, useStore } from '@/store/useStore'
import type { Component } from '@@/types'

type ScanStep = 'idle' | 'checking' | 'pulling' | 'scanning' | 'success' | 'error'

interface ScanProgress {
  phase: string
  message: string
  percent?: number
}

interface LayerInfo {
  digest: string
  size: number
  packageCount: number
  expanded: boolean
}

interface ScanResult {
  image: string
  platform: { os: string; architecture: string; variant?: string }
  layers: LayerInfo[]
  packages: Array<{
    name: string
    version: string
    manager: string
    architecture?: string
    cpe?: string
    purl?: string
    layerDigest: string
  }>
  stats: {
    totalLayers: number
    totalPackages: number
    uniquePackages: number
    scanTimeMs: number
  }
}

interface ContainerScanDialogProps {
  open: boolean
  onClose: () => void
  projectId?: string
}

const RUNTIMES = [
  { value: 'docker' as const, labelKey: 'runtime.docker' },
  { value: 'podman' as const, labelKey: 'runtime.podman' },
]

export function ContainerScanDialog({ open, onClose, projectId }: ContainerScanDialogProps) {
  const { t } = useTranslation('containerScanDialog')
  const currentProject = useCurrentProject()
  const updateProject = useStore((s) => s.updateProject)

  const targetProject = projectId ? useStore.getState().projects.find((p) => p.id === projectId) : currentProject

  const [step, setStep] = useState<ScanStep>('idle')
  const [error, setError] = useState('')
  const [imageRef, setImageRef] = useState('')
  const [runtime, setRuntime] = useState<'docker' | 'podman'>('docker')
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())
  const progressRef = useRef<(() => void) | null>(null)

  const resetState = useCallback(() => {
    setStep('idle')
    setError('')
    setProgress(null)
    setScanResult(null)
    setExpandedLayers(new Set())
    if (progressRef.current) {
      progressRef.current()
      progressRef.current = null
    }
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  const handleScan = useCallback(async () => {
    if (!imageRef.trim() || !targetProject) return

    setStep('checking')
    setError('')
    setScanResult(null)

    try {
      // Check if container API is available
      if (!getPlatform()?.container) {
        throw new Error('Container scanning is not available. Please update the application.')
      }

      // Check runtime availability
      setProgress({ phase: 'checking', message: `Checking ${runtime} availability...` })
      const runtimeResult = await getPlatform().container.checkRuntime(runtime)

      if (!runtimeResult.success || !runtimeResult.runtime?.available) {
        throw new Error(
          `${runtime} is not installed or not running. Please install ${runtime} to scan container images.`,
        )
      }

      setStep('pulling')

      // Set up progress listener
      const cleanup = getPlatform().container.onScanProgress((p) => {
        setProgress(p)
      })
      progressRef.current = cleanup

      setStep('scanning')
      setProgress({ phase: 'scan', message: `Scanning ${imageRef}...` })

      // Run the full scan
      const result = await getPlatform().container.scanImage({
        imageRef: imageRef.trim(),
        runtime,
        maxLayers: 100,
      })

      if (!result.success) {
        throw new Error(result.error || 'Scan failed')
      }

      // Build result for display
      if (!result.result) throw new Error('Scan result missing')
      const scanData = result.result
      setScanResult({
        image: scanData.image.original,
        platform: scanData.platform,
        layers: scanData.layers.map((l) => ({
          digest: l.digest,
          size: l.size,
          packageCount: l.packages.length,
          expanded: false,
        })),
        packages: scanData.packages,
        stats: {
          totalLayers: scanData.stats.totalLayers,
          totalPackages: scanData.stats.totalPackages,
          uniquePackages: scanData.stats.uniquePackages,
          scanTimeMs: scanData.stats.scanTimeMs,
        },
      })

      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
      setStep('error')
    } finally {
      if (progressRef.current) {
        progressRef.current()
        progressRef.current = null
      }
    }
  }, [imageRef, runtime, targetProject])

  const handleImport = useCallback(() => {
    if (!scanResult || !targetProject) return

    // Convert scanned packages to project components. Container scanning builds Component objects
    // directly (it does not go through parseCycloneDX), so coverage/provenance must be set here too:
    // a package-manager package with a real version is 'identified', otherwise a 'gap'.
    const newComponents: Component[] = scanResult.packages.map((pkg, index) => {
      const hasVersion = !!pkg.version && pkg.version !== 'unknown'
      return {
        id: `container-${Date.now()}-${index}`,
        name: pkg.name,
        version: hasVersion ? pkg.version : '',
        type: 'container' as const,
        purl: pkg.purl,
        cpe: pkg.cpe,
        hasMissingCpe: !pkg.cpe,
        description: `${pkg.manager} package: ${pkg.name}`,
        licenses: [],
        coverage: hasVersion ? ('identified' as const) : ('gap' as const),
        provenanceSources: [pkg.manager],
        vulnerabilities: [],
        dependencies: [],
        sbomFileId: undefined,
      }
    })

    // Filter out duplicates
    const existingComponents = targetProject.components
    const uniqueComponents = newComponents.filter(
      (newComp) =>
        !existingComponents.some((existing) => existing.name === newComp.name && existing.version === newComp.version),
    )

    updateProject(targetProject.id, {
      components: [...existingComponents, ...uniqueComponents],
      updatedAt: new Date(),
      statistics: {
        ...targetProject.statistics,
        // Reflect the imported packages in the project totals so the Overview
        // count updates (otherwise the import looks like a no-op even though
        // the components appear in the Components tab).
        totalComponents: existingComponents.length + uniqueComponents.length,
      },
    })

    handleClose()
  }, [scanResult, targetProject, updateProject, handleClose])

  const toggleLayer = (digest: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(digest)) {
        next.delete(digest)
      } else {
        next.add(digest)
      }
      return next
    })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Math.round((bytes / Math.pow(k, i)) * 10) / 10} ${sizes[i]}`
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Container className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {targetProject
              ? t('description.withProject', { projectName: targetProject.name })
              : t('description.noProject')}
          </DialogDescription>
        </DialogHeader>

        {/* Input Form */}
        {(step === 'idle' || step === 'error') && (
          <div className="space-y-4">
            {!targetProject && (
              <div className="rounded-md bg-yellow-500/15 p-3 text-sm text-yellow-600">{t('warnings.noProject')}</div>
            )}

            {step === 'error' && error && (
              <div className="flex items-start gap-3 rounded-md bg-destructive/15 p-4">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">{t('error.title')}</p>
                  <p className="text-sm text-destructive mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Image Reference Input */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('imageRef.label')}</label>
              <input
                type="text"
                value={imageRef}
                onChange={(e) => setImageRef(e.target.value)}
                placeholder={t('imageRef.placeholder')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={!targetProject}
              />
              <p className="text-xs text-muted-foreground mt-1">{t('imageRef.hint')}</p>
            </div>

            {/* Runtime Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('runtime.label')}</label>
              <div className="flex gap-2">
                {RUNTIMES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRuntime(r.value)}
                    className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                      runtime === r.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background hover:bg-muted'
                    }`}
                  >
                    {t(r.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Button */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                {t('common:actions.cancel')}
              </button>
              <button
                onClick={handleScan}
                disabled={!imageRef.trim() || !targetProject}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Container className="h-4 w-4" />
                {t('scanImage')}
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        {(step === 'checking' || step === 'pulling' || step === 'scanning') && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium capitalize">
              {step === 'checking'
                ? t('progressStep.checking')
                : step === 'pulling'
                  ? t('progressStep.pulling')
                  : t('progressStep.scanning')}
            </p>
            {progress && <p className="text-sm text-muted-foreground mt-1">{progress.message}</p>}
          </div>
        )}

        {/* Success */}
        {step === 'success' && scanResult && (
          <div className="space-y-4">
            {/* Success Banner */}
            <div className="flex items-start gap-3 rounded-md bg-green-500/15 p-4">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-green-600">{t('success.title')}</p>
                <p className="text-sm text-green-600 mt-1">
                  {t('success.summary', {
                    uniqueCount: scanResult.stats.uniquePackages,
                    layerCount: scanResult.stats.totalLayers,
                    duration: formatDuration(scanResult.stats.scanTimeMs),
                  })}
                </p>
              </div>
            </div>

            {/* Image Info */}
            <div className="rounded-md border border-border bg-muted p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('imageInfo.image')}</span>
                  <span className="ml-2 font-medium">{scanResult.image}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('imageInfo.platform')}</span>
                  <span className="ml-2 font-medium">
                    {scanResult.platform.os}/{scanResult.platform.architecture}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('imageInfo.layers')}</span>
                  <span className="ml-2 font-medium">{scanResult.stats.totalLayers}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('imageInfo.packages')}</span>
                  <span className="ml-2 font-medium">{scanResult.stats.uniquePackages}</span>
                </div>
              </div>
            </div>

            {/* Layers Breakdown */}
            {scanResult.layers.length > 0 && (
              <div className="rounded-md border border-border bg-muted p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{t('layersSection.title')}</p>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {scanResult.layers.map((layer, index) => (
                    <div key={layer.digest}>
                      <button
                        onClick={() => toggleLayer(layer.digest)}
                        className="w-full flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-background/50 text-left"
                      >
                        {expandedLayers.has(layer.digest) ? (
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        )}
                        <span className="text-muted-foreground">
                          {t('layersSection.layerNumber', { number: index + 1 })}
                        </span>
                        <span className="text-xs text-muted-foreground truncate flex-1">
                          {layer.digest.substring(0, 19)}...
                        </span>
                        <span className="text-xs text-muted-foreground">{formatSize(layer.size)}</span>
                        <span className="text-xs">
                          <Package className="h-3 w-3 inline" /> {layer.packageCount}
                        </span>
                      </button>
                      {expandedLayers.has(layer.digest) && (
                        <div className="ml-6 pl-2 border-l border-border space-y-1 py-1">
                          {scanResult.packages
                            .filter((pkg) => pkg.layerDigest === layer.digest)
                            .map((pkg) => (
                              <div
                                key={`${pkg.manager}-${pkg.name}`}
                                className="flex items-center gap-2 text-xs text-muted-foreground py-0.5"
                              >
                                <span className="font-medium text-foreground">{pkg.name}</span>
                                <span>{pkg.version}</span>
                                <span className="rounded bg-background px-1 py-0.5 text-[10px]">{pkg.manager}</span>
                              </div>
                            ))}
                          {layer.packageCount === 0 && (
                            <p className="text-xs text-muted-foreground italic">{t('layersSection.noPackages')}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Package Sample */}
            {scanResult.packages.length > 0 && (
              <div className="rounded-md border border-border bg-muted p-4">
                <p className="text-sm font-medium mb-2">
                  {t('packagePreview.title', { count: scanResult.stats.uniquePackages })}
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {scanResult.packages.slice(0, 10).map((pkg) => (
                    <div key={`${pkg.manager}-${pkg.name}`} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{pkg.name}</span>
                      <span className="text-muted-foreground">{pkg.version}</span>
                      <span className="text-xs text-muted-foreground rounded bg-background px-1.5 py-0.5">
                        {pkg.manager}
                      </span>
                    </div>
                  ))}
                  {scanResult.packages.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      {t('packagePreview.more', { count: scanResult.packages.length - 10 })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={resetState}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                {t('success.scanDifferentImage')}
              </button>
              <button
                onClick={handleImport}
                disabled={scanResult.packages.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('success.addPackages', { count: scanResult.stats.uniquePackages })}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
