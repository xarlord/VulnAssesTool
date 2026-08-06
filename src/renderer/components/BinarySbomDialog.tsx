/**
 * Binary SBOM Dialog
 *
 * Generates a CycloneDX SBOM from an uploaded binary/archive or a container
 * image reference using Syft (server-side), then imports the resulting
 * components/vulnerabilities into the current project via the SAME path SBOM
 * upload uses: parseCycloneDX -> CPE estimation -> updateProject.
 */

import { useState, useCallback, useRef } from 'react'
import { Binary, Upload, AlertCircle, CheckCircle, Loader2, Package } from 'lucide-react'
import { getPlatform } from '@/lib/platform'
import { useCurrentProject, useStore } from '@/store/useStore'
import { parseCycloneDX } from '@/lib/parsers/cyclonedx'
import { estimateCpesForComponents, createCpeDatabaseSearchFn } from '@/lib/services/cpeEstimationPipeline'
import { sha256Hex } from '@/lib/crypto/sha256'
import { logSbomUpload } from '@/lib/audit'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { SbomFile, Component, Vulnerability } from '@@/types'

type Mode = 'file' | 'path' | 'image'
type Step = 'idle' | 'generating' | 'success' | 'error'

interface ParsedResult {
  components: Component[]
  vulnerabilities: Vulnerability[]
  formatVersion: string
  sourceLabel: string
  // SHA-256 of the generated CycloneDX content (H5/M2) — a real content hash.
  fileHash: string
}

interface BinarySbomDialogProps {
  open: boolean
  onClose: () => void
  projectId?: string
}

export function BinarySbomDialog({ open, onClose, projectId }: BinarySbomDialogProps) {
  const currentProject = useCurrentProject()
  const updateProject = useStore((s) => s.updateProject)
  const targetProject = projectId ? useStore.getState().projects.find((p) => p.id === projectId) : currentProject

  const [mode, setMode] = useState<Mode>('file')
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [localPath, setLocalPath] = useState('')
  const [imageRef, setImageRef] = useState('')
  const [progress, setProgress] = useState<{ phase: string; message: string } | null>(null)
  const [parsed, setParsed] = useState<ParsedResult | null>(null)
  const progressRef = useRef<(() => void) | null>(null)

  const resetState = useCallback(() => {
    setStep('idle')
    setError('')
    setFile(null)
    setLocalPath('')
    setImageRef('')
    setProgress(null)
    setParsed(null)
    if (progressRef.current) {
      progressRef.current()
      progressRef.current = null
    }
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  const handleGenerate = useCallback(async () => {
    if (!targetProject) return
    if (mode === 'file' && !file) return
    if (mode === 'path' && !localPath.trim()) return
    if (mode === 'image' && !imageRef.trim()) return

    setStep('generating')
    setError('')
    setParsed(null)

    try {
      const platform = getPlatform()
      if (!platform?.sbom) {
        throw new Error('SBOM generation is not available. Please update the application.')
      }

      const cleanup = platform.sbom.onGenerateProgress((p) => setProgress(p))
      progressRef.current = cleanup
      setProgress({ phase: 'starting', message: 'Starting Syft...' })

      const result =
        mode === 'file' && file
          ? await platform.sbom.generateFromFile(file)
          : mode === 'path'
            ? await platform.sbom.generateFromPath(localPath.trim())
            : await platform.sbom.generateFromImage(imageRef.trim())

      if (!result.success || !result.cyclonedxJson) {
        throw new Error(result.error || 'SBOM generation failed')
      }

      const parsedResult = await parseCycloneDX(result.cyclonedxJson, 'syft-generated.json')
      const cpe = await estimateCpesForComponents(parsedResult.components, {
        externalSearchFn: createCpeDatabaseSearchFn(),
      })
      const fileHash = await sha256Hex(result.cyclonedxJson)

      setParsed({
        components: cpe.components,
        vulnerabilities: parsedResult.vulnerabilities || [],
        formatVersion: parsedResult.metadata.formatVersion,
        sourceLabel: mode === 'file' && file ? file.name : mode === 'path' ? localPath.trim() : imageRef.trim(),
        fileHash,
      })
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SBOM generation failed')
      setStep('error')
    } finally {
      if (progressRef.current) {
        progressRef.current()
        progressRef.current = null
      }
    }
  }, [mode, file, localPath, imageRef, targetProject])

  const handleImport = useCallback(() => {
    if (!parsed || !targetProject) return

    const sbomFileId = `sbom-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    const sbomFile: SbomFile = {
      id: sbomFileId,
      filename: `syft-${parsed.sourceLabel}`,
      format: 'cyclonedx',
      formatVersion: parsed.formatVersion,
      uploadedAt: new Date(),
      fileHash: parsed.fileHash,
      componentCount: parsed.components.length,
    }

    const existingComponents = targetProject.components
    const newComponents = parsed.components
      .filter((newComp) => !existingComponents.some((existing) => existing.id === newComp.id))
      .map((comp) => ({ ...comp, sbomFileId }))

    const existingVulnerabilities = targetProject.vulnerabilities || []
    const newVulnerabilities = parsed.vulnerabilities.filter(
      (newVuln) => !existingVulnerabilities.some((existing) => existing.id === newVuln.id),
    )
    const allVulnerabilities = [...existingVulnerabilities, ...newVulnerabilities]

    updateProject(targetProject.id, {
      sbomFiles: [...targetProject.sbomFiles, sbomFile],
      components: [...existingComponents, ...newComponents],
      vulnerabilities: allVulnerabilities,
      updatedAt: new Date(),
      statistics: {
        ...targetProject.statistics,
        totalVulnerabilities: allVulnerabilities.length,
        criticalCount: allVulnerabilities.filter((v) => v.severity === 'critical').length,
        highCount: allVulnerabilities.filter((v) => v.severity === 'high').length,
        mediumCount: allVulnerabilities.filter((v) => v.severity === 'medium').length,
        lowCount: allVulnerabilities.filter((v) => v.severity === 'low').length,
        totalComponents: existingComponents.length + newComponents.length,
      },
    })

    // M10: record the generated-SBOM import in the compliance audit trail.
    logSbomUpload(targetProject.id, targetProject.name, sbomFile.filename, 'cyclonedx', parsed.components.length)

    handleClose()
  }, [parsed, targetProject, updateProject, handleClose])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Radix fires this for Escape, overlay click, and the close button.
        if (!next) handleClose()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Binary className="h-5 w-5" />
            Generate SBOM from Binary
          </DialogTitle>
          <DialogDescription>
            {targetProject
              ? `Analyze a binary or image with Syft and import into: ${targetProject.name}`
              : 'Generate an SBOM from a compiled artifact or container image'}
          </DialogDescription>
        </DialogHeader>

        {(step === 'idle' || step === 'error') && (
          <div className="space-y-4">
            {!targetProject && (
              <div className="rounded-md bg-yellow-500/15 p-3 text-sm text-yellow-600">
                Please select a project first before generating an SBOM.
              </div>
            )}

            {step === 'error' && error && (
              <div className="flex items-start gap-3 rounded-md bg-destructive/15 p-4">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">Generation Failed</p>
                  <p className="text-sm text-destructive mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setMode('file')}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'file'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                Upload artifact
              </button>
              <button
                onClick={() => setMode('path')}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'path'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                Local path
              </button>
              <button
                onClick={() => setMode('image')}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'image'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                Container image
              </button>
            </div>

            {mode === 'file' ? (
              <div>
                <label className="block text-sm font-medium mb-1">Binary or archive</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm"
                  disabled={!targetProject}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Executables, libraries, jars, or archives. Syft detects packages and language binaries.
                </p>
              </div>
            ) : mode === 'path' ? (
              <div>
                <label className="block text-sm font-medium mb-1">Local file or directory path</label>
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="e.g., D:\\imx95_projects\\...\\eCockpit_Release_1.1.3_AAOS_prebuilt_image"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={!targetProject}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Scanned in place on the server host (no upload) — use for large local artifacts and prebuilt image
                  trees. An Android image folder (with <code>super.img</code>/<code>boot.img</code>) is auto-detected
                  and unpacked (sparse → super → EROFS/ext4) before scanning; on Windows this runs via WSL2. The path
                  must exist on the machine running the backend.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">Image Reference</label>
                <input
                  type="text"
                  value={imageRef}
                  onChange={(e) => setImageRef(e.target.value)}
                  placeholder="e.g., alpine:3.19, ghcr.io/org/image:v1"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={!targetProject}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Pulled directly from the registry by Syft (no Docker daemon required).
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={
                  !targetProject || (mode === 'file' ? !file : mode === 'path' ? !localPath.trim() : !imageRef.trim())
                }
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Generate SBOM
              </button>
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">Generating SBOM...</p>
            {progress && <p className="text-sm text-muted-foreground mt-1">{progress.message}</p>}
          </div>
        )}

        {step === 'success' && parsed && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md bg-green-500/15 p-4">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-green-600">SBOM Generated</p>
                <p className="text-sm text-green-600 mt-1">
                  Found {parsed.components.length} components{' '}
                  {parsed.vulnerabilities.length > 0 ? `and ${parsed.vulnerabilities.length} vulnerabilities ` : ''}
                  in {parsed.sourceLabel}
                </p>
              </div>
            </div>

            {parsed.components.length > 0 && (
              <div className="rounded-md border border-border bg-muted p-4">
                <p className="text-sm font-medium mb-2">Component Preview ({parsed.components.length} total)</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {parsed.components.slice(0, 10).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.version}</span>
                    </div>
                  ))}
                  {parsed.components.length > 10 && (
                    <p className="text-xs text-muted-foreground">... and {parsed.components.length - 10} more</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={resetState}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Generate Another
              </button>
              <button
                onClick={handleImport}
                disabled={parsed.components.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add {parsed.components.length} Components to Project
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
