import React, { useState, useRef } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useCurrentProject, useStore } from '@/store/useStore'
import { parseCycloneDX } from '@/lib/parsers/cyclonedx'
import { parseSpdx } from '@/lib/parsers/spdx'
import { estimateCpesForComponents } from '@/lib/services/cpeEstimationPipeline'
import type { SbomFile, Component, Vulnerability } from '@@/types'
import type { AmbiguousComponent } from '@/lib/generators/excelParser'
import CPEMatchDialog from './CPEMatchDialog'

interface SbomUploadDialogProps {
  open: boolean
  onClose: () => void
  projectId?: string
}

type UploadStep = 'idle' | 'validating' | 'parsing' | 'estimating-cpe' | 'success' | 'error'
type FileFormat = 'cyclonedx' | 'spdx' | 'unknown'

// File size limit: 50MB to prevent DoS attacks
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB in bytes

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export default function SbomUploadDialog({ open, onClose, projectId }: SbomUploadDialogProps) {
  const currentProject = useCurrentProject()
  const updateProject = useStore((s) => s.updateProject)
  const [step, setStep] = useState<UploadStep>('idle')
  const [error, setError] = useState('')
  const [parsedData, setParsedData] = useState<{
    components: Component[]
    vulnerabilities: Vulnerability[]
    format: 'cyclonedx' | 'spdx'
  } | null>(null)
  const [cpeEstimationStats, setCpeEstimationStats] = useState<{
    autoSelected: number
    needsConfirmation: number
    noMatchFound: number
  } | null>(null)
  const [ambiguousComponents, setAmbiguousComponents] = useState<AmbiguousComponent[]>([])
  const [showCpeMatchDialog, setShowCpeMatchDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const targetProject = projectId ? useStore.getState().projects.find((p) => p.id === projectId) : currentProject

  const resetState = () => {
    setStep('idle')
    setError('')
    setParsedData(null)
    setCpeEstimationStats(null)
    setAmbiguousComponents([])
    setShowCpeMatchDialog(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const detectFormat = (content: string, filename: string): FileFormat => {
    // Try to detect from filename first
    const lowerFilename = filename.toLowerCase()
    if (lowerFilename.includes('cyclonedx') || lowerFilename.includes('bom')) {
      return 'cyclonedx'
    }
    if (lowerFilename.includes('spdx')) {
      return 'spdx'
    }

    // Try to detect from content
    try {
      const parsed = JSON.parse(content)
      if (parsed.bomFormat || parsed.specVersion) {
        return 'cyclonedx'
      }
      if (parsed.spdxVersion || parsed.SPDXID) {
        return 'spdx'
      }
    } catch {
      // Not JSON, check for XML patterns
      if (content.includes('<CycloneDX') || content.includes('bom')) {
        return 'cyclonedx'
      }
      if (content.includes('SPDX') || content.includes('Document')) {
        return 'spdx'
      }
    }

    return 'unknown'
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStep('validating')
    setError('')

    // Validate file size before processing
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File size (${formatFileSize(file.size)}) exceeds maximum allowed size of ${formatFileSize(MAX_FILE_SIZE)}. ` +
          `Please split your SBOM into smaller files or contact support for assistance.`,
      )
      setStep('error')
      return
    }

    // Check for empty file
    if (file.size === 0) {
      setError('The selected file is empty. Please choose a valid SBOM file.')
      setStep('error')
      return
    }

    try {
      const content = await file.text()

      // Detect format
      const format = detectFormat(content, file.name)

      if (format === 'unknown') {
        setError('Unable to detect SBOM format. Please upload a CycloneDX or SPDX file.')
        setStep('error')
        return
      }

      setStep('parsing')

      // Parse based on format
      let result
      if (format === 'cyclonedx') {
        result = await parseCycloneDX(content, file.name)
      } else {
        result = await parseSpdx(content, file.name)
      }

      // Run CPE estimation for components missing CPEs
      setStep('estimating-cpe')
      const cpeResult = await estimateCpesForComponents(result.components)

      // Store estimation stats for display
      setCpeEstimationStats({
        autoSelected: cpeResult.summary.autoSelected,
        needsConfirmation: cpeResult.summary.needsConfirmation,
        noMatchFound: cpeResult.summary.noMatchFound,
      })

      // Store ambiguous components if user confirmation is needed
      if (cpeResult.ambiguousComponents.length > 0) {
        setAmbiguousComponents(cpeResult.ambiguousComponents)
      }

      setParsedData({
        components: cpeResult.components,
        vulnerabilities: result.vulnerabilities || [],
        format: result.metadata.format,
      })

      // If there are ambiguous components, show CPE match dialog
      // Otherwise go straight to success
      if (cpeResult.ambiguousComponents.length > 0) {
        setShowCpeMatchDialog(true)
        setStep('success')
      } else {
        setStep('success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse SBOM file')
      setStep('error')
    }
  }

  const handleConfirm = () => {
    if (!parsedData || !targetProject) return

    // Create SBOM file entry
    const sbomFileId = `sbom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const sbomFile: SbomFile = {
      id: sbomFileId,
      filename: fileInputRef.current?.files?.[0]?.name || 'sbom.json',
      format: parsedData.format,
      formatVersion: parsedData.format === 'cyclonedx' ? '1.5' : '2.3',
      uploadedAt: new Date(),
      fileHash: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      componentCount: parsedData.components.length,
    }

    // Update project with new SBOM and components
    const existingComponents = targetProject.components
    // Tag new components with the sbomFileId so we can track their origin
    const newComponents = parsedData.components
      .filter((newComp) => !existingComponents.some((existing) => existing.id === newComp.id))
      .map((comp) => ({ ...comp, sbomFileId }))

    // Merge vulnerabilities from SBOM with existing ones
    const existingVulnerabilities = targetProject.vulnerabilities || []
    const newVulnerabilities = parsedData.vulnerabilities.filter(
      (newVuln) => !existingVulnerabilities.some((existing) => existing.id === newVuln.id),
    )

    // Calculate statistics from all vulnerabilities
    const allVulnerabilities = [...existingVulnerabilities, ...newVulnerabilities]
    const stats = {
      totalVulnerabilities: allVulnerabilities.length,
      criticalCount: allVulnerabilities.filter((v) => v.severity === 'critical').length,
      highCount: allVulnerabilities.filter((v) => v.severity === 'high').length,
      mediumCount: allVulnerabilities.filter((v) => v.severity === 'medium').length,
      lowCount: allVulnerabilities.filter((v) => v.severity === 'low').length,
      none: allVulnerabilities.filter((v) => v.severity === 'none').length,
    }

    updateProject(targetProject.id, {
      sbomFiles: [...targetProject.sbomFiles, sbomFile],
      components: [...existingComponents, ...newComponents],
      vulnerabilities: allVulnerabilities,
      updatedAt: new Date(),
      statistics: {
        ...targetProject.statistics,
        ...stats,
        totalComponents: targetProject.components.length + newComponents.length,
        vulnerableComponents:
          existingVulnerabilities.length > 0 || newVulnerabilities.length > 0
            ? new Set([
                ...existingVulnerabilities.flatMap((v) => v.affectedComponents || []),
                ...newVulnerabilities.flatMap((v) => v.affectedComponents || []),
              ]).size
            : targetProject.statistics.vulnerableComponents,
      },
    })

    resetState()
    onClose()
  }

  const handleRetry = () => {
    resetState()
  }

  // Handle CPE match confirmation from dialog
  const handleCpeConfirm = (selections: Map<string, string>) => {
    if (!parsedData) return

    // Apply user CPE selections to components
    const updatedComponents = parsedData.components.map((component) => {
      const selectedCPE = selections.get(component.id)
      if (selectedCPE) {
        return {
          ...component,
          cpe: selectedCPE,
          hasMissingCpe: false,
        }
      }
      return component
    })

    setParsedData({
      ...parsedData,
      components: updatedComponents,
    })
    setShowCpeMatchDialog(false)
    setAmbiguousComponents([])

    // Update stats to reflect user selections
    const selectedCount = selections.size
    setCpeEstimationStats((prev) =>
      prev
        ? {
            ...prev,
            needsConfirmation: 0,
            autoSelected: prev.autoSelected + selectedCount,
          }
        : null,
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />

      {/* Dialog */}
      <div className="relative z-50 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Upload SBOM</h2>
          <p className="text-sm text-muted-foreground">
            {targetProject ? `Upload to project: ${targetProject.name}` : 'Upload a Software Bill of Materials file'}
          </p>
        </div>

        {/* Content */}
        {step === 'idle' && (
          <div className="space-y-4">
            {!targetProject && (
              <div className="rounded-md bg-yellow-500/15 p-3 text-sm text-yellow-600">
                Please select a project first before uploading an SBOM.
              </div>
            )}

            <div
              role="button"
              tabIndex={targetProject ? 0 : -1}
              aria-label="Upload SBOM file"
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50 p-8 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${
                !targetProject ? 'opacity-50' : ''
              }`}
              onClick={() => targetProject && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (targetProject && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.xml,.yaml,.yml"
                onChange={handleFileSelect}
                className="hidden"
                disabled={!targetProject}
              />
              <Upload className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-sm font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">
                CycloneDX or SPDX JSON files (.json) • Max size: 50MB
              </p>
            </div>

            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Supported formats:</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-muted-foreground">
                <li>CycloneDX JSON and XML</li>
                <li>SPDX JSON</li>
              </ul>
            </div>
          </div>
        )}

        {(step === 'validating' || step === 'parsing' || step === 'estimating-cpe') && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">
              {step === 'validating'
                ? 'Validating file...'
                : step === 'parsing'
                  ? 'Parsing SBOM...'
                  : 'Estimating CPEs for components...'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {step === 'estimating-cpe'
                ? 'Matching components to known CPE patterns'
                : 'This may take a moment for large files'}
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md bg-destructive/15 p-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Upload Failed</p>
                <p className="text-sm text-destructive mt-1">{error}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleRetry}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Try Again
              </button>
              <button
                onClick={handleClose}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {step === 'success' && parsedData && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md bg-green-500/15 p-4">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-green-600">Upload Successful</p>
                <p className="text-sm text-green-600 mt-1">Found {parsedData.components.length} components</p>
              </div>
            </div>

            {/* CPE Estimation Stats */}
            {cpeEstimationStats &&
              (cpeEstimationStats.autoSelected > 0 ||
                cpeEstimationStats.needsConfirmation > 0 ||
                cpeEstimationStats.noMatchFound > 0) && (
                <div className="rounded-md border border-border bg-muted p-4">
                  <p className="text-sm font-medium mb-2">CPE Estimation Results</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {cpeEstimationStats.autoSelected > 0 && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-green-600">{cpeEstimationStats.autoSelected}</span>
                        <span className="text-muted-foreground">Auto-selected</span>
                      </div>
                    )}
                    {cpeEstimationStats.needsConfirmation > 0 && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-yellow-600">{cpeEstimationStats.needsConfirmation}</span>
                        <span className="text-muted-foreground">Need confirmation</span>
                      </div>
                    )}
                    {cpeEstimationStats.noMatchFound > 0 && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-red-600">{cpeEstimationStats.noMatchFound}</span>
                        <span className="text-muted-foreground">No match found</span>
                      </div>
                    )}
                  </div>
                  {ambiguousComponents.length > 0 && (
                    <button
                      onClick={() => setShowCpeMatchDialog(true)}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      Review {ambiguousComponents.length} component(s) with ambiguous CPE matches
                    </button>
                  )}
                </div>
              )}

            {/* File info */}
            <div className="rounded-md border border-border bg-muted p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{fileInputRef.current?.files?.[0]?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {parsedData.format.toUpperCase()} • {parsedData.components.length} components
                  </p>
                </div>
              </div>
            </div>

            {/* Component preview */}
            {parsedData.components.length > 0 && (
              <div className="rounded-md border border-border bg-muted p-4">
                <p className="text-sm font-medium mb-2">Sample Components</p>
                <div className="space-y-1">
                  {parsedData.components.slice(0, 5).map((component) => (
                    <div key={component.id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{component.name}</span>
                      <span className="text-muted-foreground">{component.version}</span>
                      <span className="text-xs text-muted-foreground">({component.type})</span>
                    </div>
                  ))}
                  {parsedData.components.length > 5 && (
                    <p className="text-xs text-muted-foreground">... and {parsedData.components.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleRetry}
                className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Upload Different File
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Add to Project
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CPE Match Dialog for ambiguous components */}
      <CPEMatchDialog
        open={showCpeMatchDialog}
        onClose={() => setShowCpeMatchDialog(false)}
        onConfirm={handleCpeConfirm}
        ambiguousComponents={ambiguousComponents.map((ac) => ({
          id: ac.componentId,
          name: ac.componentName,
          version: ac.componentVersion,
          suggestedCPEs: ac.estimatedCPEs.map((cpe) => ({
            cpe: cpe.cpe,
            vendor: cpe.vendor,
            product: cpe.product,
            version: cpe.product.split(':')[4] || '',
            confidence: cpe.matchScore,
            matchType: 'token' as const,
          })),
        }))}
      />
    </div>
  )
}
