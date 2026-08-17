/**
 * Binary SBOM Dialog
 *
 * Generates a CycloneDX SBOM from an uploaded binary/archive or a container
 * image reference using Syft (server-side), then imports the resulting
 * components/vulnerabilities into the current project via the SAME path SBOM
 * upload uses: parseCycloneDX -> CPE estimation -> updateProject.
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
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

/** Android image filenames shown in the path hint — identifiers, never translated. */
const ANDROID_IMAGE_FILES = ['super.img', 'boot.img'] as const

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
  const { t } = useTranslation('binarySbomDialog')
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
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {targetProject
              ? t('description.withProject', { projectName: targetProject.name })
              : t('description.noProject')}
          </DialogDescription>
        </DialogHeader>

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
                {t('mode.file')}
              </button>
              <button
                onClick={() => setMode('path')}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'path'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                {t('mode.path')}
              </button>
              <button
                onClick={() => setMode('image')}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'image'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                {t('mode.image')}
              </button>
            </div>

            {mode === 'file' ? (
              <div>
                <label className="block text-sm font-medium mb-1">{t('file.label')}</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm"
                  disabled={!targetProject}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('file.hint')}</p>
              </div>
            ) : mode === 'path' ? (
              <div>
                <label className="block text-sm font-medium mb-1">{t('path.label')}</label>
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder={t('path.placeholder')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={!targetProject}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('path.hintBefore')}
                  {/* Literal Android image filenames — data, not translatable prose. */}
                  <code>{ANDROID_IMAGE_FILES[0]}</code>/<code>{ANDROID_IMAGE_FILES[1]}</code>
                  {t('path.hintAfter')}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">{t('image.label')}</label>
                <input
                  type="text"
                  value={imageRef}
                  onChange={(e) => setImageRef(e.target.value)}
                  placeholder={t('image.placeholder')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={!targetProject}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('image.hint')}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                {t('common:actions.cancel')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={
                  !targetProject || (mode === 'file' ? !file : mode === 'path' ? !localPath.trim() : !imageRef.trim())
                }
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                {t('generateSbom')}
              </button>
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">{t('generating')}</p>
            {progress && <p className="text-sm text-muted-foreground mt-1">{progress.message}</p>}
          </div>
        )}

        {step === 'success' && parsed && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md bg-green-500/15 p-4">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-green-600">{t('success.title')}</p>
                <p className="text-sm text-green-600 mt-1">
                  {t('success.foundComponents', { count: parsed.components.length })}{' '}
                  {parsed.vulnerabilities.length > 0
                    ? t('success.andVulnerabilities', { count: parsed.vulnerabilities.length })
                    : ''}
                  {t('success.inSource', { source: parsed.sourceLabel })}
                </p>
              </div>
            </div>

            {parsed.components.length > 0 && (
              <div className="rounded-md border border-border bg-muted p-4">
                <p className="text-sm font-medium mb-2">{t('success.preview', { count: parsed.components.length })}</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {parsed.components.slice(0, 10).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.version}</span>
                    </div>
                  ))}
                  {parsed.components.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      {t('success.more', { count: parsed.components.length - 10 })}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={resetState}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                {t('success.generateAnother')}
              </button>
              <button
                onClick={handleImport}
                disabled={parsed.components.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('success.addComponents', { count: parsed.components.length })}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
