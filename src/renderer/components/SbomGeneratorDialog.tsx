import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  Settings,
  ArrowRight,
  AlertTriangle,
  Edit3,
} from 'lucide-react'
import { parseExcel, mapRowToComponent, type ExcelRow } from '@/lib/generators/excelParser'
import { generateCycloneDX } from '@/lib/generators/cyclonedxGenerator'
import { suggestCPEs, isValidCPE } from '@/lib/utils/cpeUtils'
import type { Component } from '@@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface SbomGeneratorDialogProps {
  open: boolean
  onClose: () => void
}

type GeneratorStep = 'idle' | 'uploading' | 'mapping' | 'preview' | 'cpe-selection' | 'generating' | 'success' | 'error'

interface BomMetadata {
  name: string
  version: string
  description?: string
  author?: string
}

const DEFAULT_METADATA: BomMetadata = {
  name: 'Generated SBOM',
  version: '1.0.0',
  description: '',
  author: '',
}

export function SbomGeneratorDialog({ open, onClose }: SbomGeneratorDialogProps) {
  const { t } = useTranslation('sbomGeneratorDialog')
  const [step, setStep] = useState<GeneratorStep>('idle')
  const [error, setError] = useState('')
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([])
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [components, setComponents] = useState<Component[]>([])
  const [metadata, setMetadata] = useState<BomMetadata>(DEFAULT_METADATA)
  const [generatedSbom, setGeneratedSbom] = useState<{ content: string; filename: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingCpeComponentId, setEditingCpeComponentId] = useState<string | null>(null)
  const [customCpeValue, setCustomCpeValue] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const AVAILABLE_COLUMNS = [
    { key: 'name', label: t('columns.name'), required: true },
    { key: 'version', label: t('columns.version'), required: true },
    { key: 'type', label: t('columns.type'), required: false },
    { key: 'license', label: t('columns.license'), required: false },
    { key: 'purl', label: t('columns.purl'), required: false },
    { key: 'cpe', label: t('columns.cpe'), required: false },
    { key: 'description', label: t('columns.description'), required: false },
    { key: 'supplier', label: t('columns.supplier'), required: false },
    { key: 'group', label: t('columns.group'), required: false },
  ]

  // Calculate components that need CPE suggestions
  const componentsNeedingCpe = useMemo(() => {
    return components.filter((c) => c.version && !c.cpe)
  }, [components])

  const hasComponentsNeedingCpe = componentsNeedingCpe.length > 0

  const resetState = useCallback(() => {
    setStep('idle')
    setError('')
    setExcelRows([])
    setExcelHeaders([])
    setColumnMapping({})
    setComponents([])
    setMetadata(DEFAULT_METADATA)
    setGeneratedSbom(null)
    setIsLoading(false)
    setEditingCpeComponentId(null)
    setCustomCpeValue('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStep('uploading')
    setError('')
    setIsLoading(true)

    try {
      console.log('[SBOM Generator] Starting file upload:', file.name, file.size, 'bytes')
      const buffer = await file.arrayBuffer()
      console.log('[SBOM Generator] File buffer loaded, size:', buffer.byteLength)

      const rows = await parseExcel(buffer)
      console.log('[SBOM Generator] Parsed rows:', rows.length)

      if (!rows || rows.length === 0) {
        setError(t('errors.emptyFile'))
        setStep('error')
        return
      }

      // Log first row for debugging
      console.log('[SBOM Generator] First row:', rows[0])

      // Store the parsed rows
      setExcelRows(rows)

      // Extract headers from first row
      const headers = Object.keys(rows[0]).filter((h) => h && h.trim())
      console.log('[SBOM Generator] Extracted headers:', headers)
      setExcelHeaders(headers)

      // Auto-detect column mapping
      const detectedMapping: Record<string, string> = {}
      const headerLower = headers.map((h) => h.toLowerCase().trim())

      AVAILABLE_COLUMNS.forEach((col) => {
        const matchingIndex = headerLower.findIndex(
          (h) => h.includes(col.key.toLowerCase()) || h.includes(col.label.toLowerCase()),
        )
        if (matchingIndex >= 0) {
          detectedMapping[col.key] = headers[matchingIndex]
        }
      })

      console.log('[SBOM Generator] Auto-detected mapping:', detectedMapping)
      setColumnMapping(detectedMapping)
      setStep('mapping')
      console.log('[SBOM Generator] Step set to mapping')
    } catch (err) {
      console.error('[SBOM Generator] Error during file upload:', err)
      setError(err instanceof Error ? err.message : t('errors.parseFailed'))
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMappingConfirm = () => {
    console.log('[SBOM Generator] handleMappingConfirm called')
    try {
      // Validate required columns are mapped
      const requiredColumns = AVAILABLE_COLUMNS.filter((c) => c.required)
      const missingColumns = requiredColumns.filter((col) => !columnMapping[col.key])

      console.log('[SBOM Generator] Column mapping:', columnMapping)
      console.log('[SBOM Generator] Required columns check:', { requiredColumns, missingColumns })

      if (missingColumns.length > 0) {
        setError(t('errors.missingColumns', { columns: missingColumns.map((c) => c.label).join(', ') }))
        return
      }

      // Validate excelRows is not empty
      if (!excelRows || excelRows.length === 0) {
        setError(t('errors.noDataRows'))
        setStep('error')
        return
      }

      console.log('[SBOM Generator] Processing', excelRows.length, 'rows')

      // Convert Excel rows to Components using column mapping
      const mappedComponents: Component[] = []
      for (let i = 0; i < excelRows.length; i++) {
        const row = excelRows[i]

        // Skip rows that are not objects
        if (!row || typeof row !== 'object') {
          console.log('[SBOM Generator] Skipping row', i, '- not an object')
          continue
        }

        // Build a mapped row based on column mapping with safe access
        const nameKey = columnMapping['name']
        const versionKey = columnMapping['version']

        // Skip rows without required fields
        if (!nameKey || !versionKey) {
          console.log('[SBOM Generator] Skipping row', i, '- missing required keys')
          continue
        }

        const nameValue = row[nameKey]
        const versionValue = row[versionKey]

        console.log('[SBOM Generator] Row', i, 'name:', nameValue, 'version:', versionValue)

        // Skip rows with empty name or version
        if (!nameValue || !versionValue) {
          console.log('[SBOM Generator] Skipping row', i, '- empty name or version')
          continue
        }

        // Build mapped row with proper undefined handling
        const mappedRow: ExcelRow = {
          name: String(nameValue).trim(),
          version: String(versionValue).trim(),
          type: columnMapping['type']
            ? row[columnMapping['type']]
              ? String(row[columnMapping['type']]).trim()
              : undefined
            : undefined,
          license: columnMapping['license']
            ? row[columnMapping['license']]
              ? String(row[columnMapping['license']]).trim()
              : undefined
            : undefined,
          purl: columnMapping['purl']
            ? row[columnMapping['purl']]
              ? String(row[columnMapping['purl']]).trim()
              : undefined
            : undefined,
          cpe: columnMapping['cpe']
            ? row[columnMapping['cpe']]
              ? String(row[columnMapping['cpe']]).trim()
              : undefined
            : undefined,
          description: columnMapping['description']
            ? row[columnMapping['description']]
              ? String(row[columnMapping['description']]).trim()
              : undefined
            : undefined,
          supplier: columnMapping['supplier']
            ? row[columnMapping['supplier']]
              ? String(row[columnMapping['supplier']]).trim()
              : undefined
            : undefined,
          group: columnMapping['group']
            ? row[columnMapping['group']]
              ? String(row[columnMapping['group']]).trim()
              : undefined
            : undefined,
        }

        console.log('[SBOM Generator] Mapped row', i, ':', mappedRow)

        try {
          const component = mapRowToComponent(mappedRow)
          console.log('[SBOM Generator] Created component for row', i, ':', component)
          if (component) {
            mappedComponents.push(component)
          }
        } catch (componentErr) {
          console.error('[SBOM Generator] Error creating component for row', i, ':', componentErr)
          // Continue with other rows
        }
      }

      console.log('[SBOM Generator] Total components created:', mappedComponents.length)

      if (mappedComponents.length === 0) {
        setError(t('errors.noValidComponents'))
        setStep('error')
        return
      }

      // Add CPE suggestions to components without CPE
      const componentsWithSuggestions = mappedComponents.map((component) => {
        if (component.version && !component.cpe) {
          const suggestions = suggestCPEs(component.name, component.version)
          return {
            ...component,
            suggestedCpes: suggestions,
            hasMissingCpe: true,
          }
        }
        return component
      })

      setComponents(componentsWithSuggestions)
      setStep('preview')
      console.log('[SBOM Generator] Step set to preview')
    } catch (err) {
      console.error('[SBOM Generator] Error in handleMappingConfirm:', err)
      setError(err instanceof Error ? err.message : t('errors.mappingFailed'))
      setStep('error')
    }
  }

  const handlePreviewConfirm = async () => {
    console.log('[SBOM Generator] handlePreviewConfirm called')

    // Check if there are components that need CPE selection
    if (hasComponentsNeedingCpe) {
      setStep('cpe-selection')
      return
    }

    setStep('generating')
    setIsLoading(true)

    try {
      console.log('[SBOM Generator] Components to generate:', components?.length || 0)
      console.log('[SBOM Generator] First component:', components?.[0])

      if (!components || components.length === 0) {
        setError(t('errors.noComponentsToGenerate'))
        setStep('error')
        return
      }

      const result = await generateCycloneDX(components, {
        format: 'json',
        pretty: true,
        metadata: {
          name: metadata.name,
          version: metadata.version,
          description: metadata.description,
          author: metadata.author,
        },
      })

      console.log('[SBOM Generator] Generated SBOM:', result)
      setGeneratedSbom(result)
      setStep('success')
    } catch (err) {
      console.error('[SBOM Generator] Error in handlePreviewConfirm:', err)
      setError(err instanceof Error ? err.message : t('errors.generateFailed'))
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (!generatedSbom) return

    const blob = new Blob([generatedSbom.content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = generatedSbom.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError(t('errors.invalidFileType'))
      setStep('error')
      return
    }

    // Create a synthetic event
    const syntheticEvent = {
      target: { files: [file] },
    } as unknown as React.ChangeEvent<HTMLInputElement>

    await handleFileSelect(syntheticEvent)
  }

  // Handle CPE selection for a component
  const handleSelectCpe = (componentId: string, cpe: string) => {
    setComponents((prev) =>
      prev.map((c) => {
        if (c.id === componentId) {
          return {
            ...c,
            cpe: cpe,
            hasMissingCpe: false,
          }
        }
        return c
      }),
    )
    setEditingCpeComponentId(null)
    setCustomCpeValue('')
  }

  // Handle custom CPE input
  const handleCustomCpeSubmit = (componentId: string) => {
    if (!customCpeValue.trim()) return

    // Validate CPE format
    if (!isValidCPE(customCpeValue.trim())) {
      setError(t('errors.invalidCpeFormat'))
      return
    }

    handleSelectCpe(componentId, customCpeValue.trim())
    setError('')
  }

  // Skip CPE selection for a component
  const handleSkipCpe = (componentId: string) => {
    setComponents((prev) =>
      prev.map((c) => {
        if (c.id === componentId) {
          return {
            ...c,
            hasMissingCpe: false,
          }
        }
        return c
      }),
    )
    setEditingCpeComponentId(null)
    setCustomCpeValue('')
  }

  // Skip all remaining CPE selections
  const handleSkipAllCpes = () => {
    setComponents((prev) =>
      prev.map((c) => ({
        ...c,
        hasMissingCpe: false,
      })),
    )
    setStep('generating')
  }

  // Continue to generate after CPE selection
  const handleCpeSelectionConfirm = async () => {
    setStep('generating')
    setIsLoading(true)

    try {
      if (!components || components.length === 0) {
        setError(t('errors.noComponentsToGenerate'))
        setStep('error')
        return
      }

      const result = await generateCycloneDX(components, {
        format: 'json',
        pretty: true,
        metadata: {
          name: metadata.name,
          version: metadata.version,
          description: metadata.description,
          author: metadata.author,
        },
      })

      setGeneratedSbom(result)
      setStep('success')
    } catch (err) {
      console.error('[SBOM Generator] Error in handleCpeSelectionConfirm:', err)
      setError(err instanceof Error ? err.message : t('errors.generateFailed'))
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }

  const updateColumnMapping = (field: string, excelColumn: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [field]: excelColumn || '',
    }))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <DialogHeader className="flex-row items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
        </DialogHeader>

        {/* Content */}
        <div>
          {/* Step Indicator */}
          <div className="mb-6 flex items-center justify-center gap-2 text-sm">
            <div
              className={`flex items-center gap-2 ${step === 'idle' || step === 'uploading' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                1
              </div>
              <span>{t('steps.upload')}</span>
            </div>
            <div className="h-px w-8 bg-border" />
            <div className={`flex items-center gap-2 ${step === 'mapping' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                2
              </div>
              <span>{t('steps.mapColumns')}</span>
            </div>
            <div className="h-px w-8 bg-border" />
            <div className={`flex items-center gap-2 ${step === 'preview' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                3
              </div>
              <span>{t('steps.preview')}</span>
            </div>
            <div className="h-px w-8 bg-border" />
            <div
              className={`flex items-center gap-2 ${step === 'cpe-selection' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                4
              </div>
              <span>{t('steps.cpes')}</span>
            </div>
            <div className="h-px w-8 bg-border" />
            <div
              className={`flex items-center gap-2 ${step === 'generating' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                5
              </div>
              <span>{t('steps.generate')}</span>
            </div>
            <div className="h-px w-8 bg-border" />
            <div className={`flex items-center gap-2 ${step === 'success' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                6
              </div>
              <span>{t('steps.download')}</span>
            </div>
          </div>

          {/* Step 1: Upload */}
          {step === 'idle' && (
            <div className="space-y-4">
              <div
                ref={dropZoneRef}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50 p-8 transition-colors hover:bg-muted ${
                  isLoading ? 'opacity-50' : ''
                }`}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !isLoading && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isLoading}
                />
                <Upload className="mb-3 h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium">{isLoading ? t('upload.processing') : t('upload.dropzone')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('upload.fileTypes')}</p>
              </div>

              <div className="rounded-md bg-muted p-4 text-sm">
                <p className="font-medium mb-2">{t('upload.requiredColumnsTitle')}</p>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>
                    • <strong>{t('upload.nameField.label')}</strong> - {t('upload.nameField.description')}
                  </div>
                  <div>
                    • <strong>{t('upload.versionField.label')}</strong> - {t('upload.versionField.description')}
                  </div>
                </div>
                <p className="font-medium mt-3 mb-2">{t('upload.optionalColumnsTitle')}</p>
                <div className="grid grid-cols-3 gap-2 text-muted-foreground text-xs">
                  <div>{t('upload.optionalType')}</div>
                  <div>{t('upload.optionalLicense')}</div>
                  <div>{t('upload.optionalPurl')}</div>
                  <div>{t('upload.optionalCpe')}</div>
                  <div>{t('upload.optionalDescription')}</div>
                  <div>{t('upload.optionalSupplier')}</div>
                </div>
              </div>

              <div className="rounded-md bg-blue-500/15 p-3 text-sm text-blue-600">
                <p className="font-medium">{t('upload.tipTitle')}</p>
                <p className="text-xs mt-1">{t('upload.tipText')}</p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {(step === 'uploading' || step === 'generating') && (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 text-sm font-medium">
                {step === 'uploading' ? t('loading.parsing') : t('loading.generating')}
              </p>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <p className="text-sm font-medium mb-3">
                  {t('mapping.detectedColumns', { count: excelHeaders?.length || 0 })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {excelHeaders?.map((header) => (
                    <span key={header} className="rounded bg-background px-2 py-1 text-xs font-medium">
                      {header}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-2 text-left font-medium">{t('mapping.sbomField')}</th>
                      <th className="px-4 py-2 text-left font-medium">{t('mapping.excelColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AVAILABLE_COLUMNS.map((col) => (
                      <tr key={col.key} className="border-b border-border">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {col.required && <span className="text-red-500">*</span>}
                            <span className="font-medium">{col.label}</span>
                            {!col.required && (
                              <span className="text-xs text-muted-foreground">{t('mapping.optionalTag')}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={columnMapping[col.key] || ''}
                            onChange={(e) => updateColumnMapping(col.key, e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">{t('mapping.selectColumnPlaceholder')}</option>
                            {excelHeaders?.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleClose}
                  className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  onClick={handleMappingConfirm}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                >
                  {t('mapping.nextStep')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview & Generate */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Warning for components missing CPE */}
              {hasComponentsNeedingCpe && (
                <div className="flex items-start gap-3 rounded-md bg-yellow-500/15 p-4">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600">{t('preview.missingCpeWarningTitle')}</p>
                    <p className="text-sm text-yellow-600 mt-1">
                      {t('preview.missingCpeWarningBody', { count: componentsNeedingCpe.length })}
                    </p>
                  </div>
                </div>
              )}

              {/* Metadata Form */}
              <div className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{t('preview.metadataTitle')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('preview.nameLabel')}</label>
                    <input
                      type="text"
                      value={metadata.name}
                      onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={t('preview.namePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('preview.versionLabel')}</label>
                    <input
                      type="text"
                      value={metadata.version}
                      onChange={(e) => setMetadata({ ...metadata, version: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={t('preview.versionPlaceholder')}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('preview.descriptionLabel')}</label>
                    <input
                      type="text"
                      value={metadata.description}
                      onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={t('preview.descriptionPlaceholder')}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('preview.authorLabel')}</label>
                    <input
                      type="text"
                      value={metadata.author}
                      onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={t('preview.authorPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              {/* Component Preview */}
              <div className="rounded-md border border-border">
                <div className="border-b border-border bg-muted/50 px-4 py-2">
                  <p className="text-sm font-medium">
                    {t('preview.componentsPreviewTitle', { count: components?.length || 0 })}
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {components && components.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                            {t('preview.table.name')}
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                            {t('preview.table.version')}
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                            {t('preview.table.type')}
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                            {t('preview.table.license')}
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                            {t('preview.table.cpe')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.slice(0, 10).map((component, idx) => (
                          <tr key={component.id || idx} className="border-b border-border">
                            <td className="px-4 py-2 font-medium">{component.name || '-'}</td>
                            <td className="px-4 py-2 text-muted-foreground">{component.version || '-'}</td>
                            <td className="px-4 py-2">
                              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600">
                                {component.type || 'library'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">
                              {component.licenses && component.licenses.length > 0
                                ? component.licenses.join(', ')
                                : '-'}
                            </td>
                            <td className="px-4 py-2">
                              {component.cpe ? (
                                <span
                                  className="text-xs font-mono text-green-600 truncate block max-w-[150px]"
                                  title={component.cpe}
                                >
                                  {component.cpe.length > 30 ? component.cpe.substring(0, 30) + '...' : component.cpe}
                                </span>
                              ) : component.suggestedCpes && component.suggestedCpes.length > 0 ? (
                                <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-600">
                                  {t('preview.table.suggestionsCount', { count: component.suggestedCpes.length })}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">{t('preview.noComponents')}</div>
                  )}
                  {components && components.length > 10 && (
                    <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                      {t('preview.andMoreComponents', { count: components.length - 10 })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep('mapping')}
                  className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  {t('actions.back')}
                </button>
                <button
                  onClick={handlePreviewConfirm}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                >
                  {t('preview.generateSbom')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: CPE Selection */}
          {step === 'cpe-selection' && (
            <div className="space-y-4">
              {/* Info Banner */}
              <div className="flex items-start gap-3 rounded-md bg-yellow-500/15 p-4">
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-600">{t('cpeSelection.infoTitle')}</p>
                  <p className="text-sm text-yellow-600 mt-1">{t('cpeSelection.infoBody')}</p>
                </div>
              </div>

              {/* Components needing CPE */}
              <div className="rounded-md border border-border">
                <div className="border-b border-border bg-muted/50 px-4 py-2 flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {t('cpeSelection.missingCpeHeading', { count: componentsNeedingCpe.length })}
                  </p>
                  <button
                    onClick={handleSkipAllCpes}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {t('cpeSelection.skipAllLink')}
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {componentsNeedingCpe.map((component) => (
                    <div key={component.id} className="border-b border-border last:border-b-0 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{component.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('cpeSelection.versionLabel', { version: component.version })}
                          </p>
                        </div>
                        {component.cpe && (
                          <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-600">
                            {t('cpeSelection.cpeSelectedBadge')}
                          </span>
                        )}
                      </div>

                      {/* Show selected CPE if available */}
                      {component.cpe && (
                        <div className="mb-2 p-2 rounded bg-green-500/10 text-xs font-mono text-green-700 break-all">
                          {component.cpe}
                        </div>
                      )}

                      {/* CPE Selection UI */}
                      {editingCpeComponentId === component.id ? (
                        <div className="space-y-3 mt-3">
                          {/* Suggested CPEs */}
                          {component.suggestedCpes && component.suggestedCpes.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {t('cpeSelection.suggestedCpesTitle')}
                              </p>
                              <div className="space-y-2">
                                {component.suggestedCpes.map((suggestion, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleSelectCpe(component.id, suggestion.cpe)}
                                    className="w-full text-left p-2 rounded border border-border hover:border-primary hover:bg-muted/50 transition-colors"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-mono truncate flex-1 mr-2">{suggestion.cpe}</span>
                                      <span
                                        className={`text-xs px-1.5 py-0.5 rounded ${
                                          suggestion.confidence === 'high'
                                            ? 'bg-green-500/10 text-green-600'
                                            : suggestion.confidence === 'medium'
                                              ? 'bg-yellow-500/10 text-amber-700'
                                              : 'bg-gray-500/10 text-gray-600'
                                        }`}
                                      >
                                        {suggestion.confidence}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {t('cpeSelection.vendorProduct', {
                                        vendor: suggestion.vendor,
                                        product: suggestion.product,
                                      })}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Custom CPE Input */}
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">{t('cpeSelection.customCpeTitle')}</p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customCpeValue}
                                onChange={(e) => setCustomCpeValue(e.target.value)}
                                placeholder={t('cpeSelection.customCpePlaceholder')}
                                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <button
                                onClick={() => handleCustomCpeSubmit(component.id)}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                {t('cpeSelection.apply')}
                              </button>
                            </div>
                          </div>

                          {/* Skip button */}
                          <button
                            onClick={() => handleSkipCpe(component.id)}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            {t('cpeSelection.skipComponent')}
                          </button>
                        </div>
                      ) : !component.cpe ? (
                        <button
                          onClick={() => setEditingCpeComponentId(component.id)}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-2"
                        >
                          <Edit3 className="h-3 w-3" />
                          {component.suggestedCpes && component.suggestedCpes.length > 0
                            ? t('cpeSelection.selectCpeWithCount', { count: component.suggestedCpes.length })
                            : t('cpeSelection.enterCpeManually')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingCpeComponentId(component.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
                        >
                          <Edit3 className="h-3 w-3" />
                          {t('cpeSelection.changeCpe')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress indicator */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t('cpeSelection.progressCpe', {
                    withCpe: components.filter((c) => c.cpe).length,
                    total: components.length,
                  })}
                </span>
                <span>
                  {t('cpeSelection.progressReviewed', {
                    count: components.filter((c) => !c.hasMissingCpe).length,
                  })}
                </span>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep('preview')}
                  className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  {t('actions.back')}
                </button>
                <button
                  onClick={handleSkipAllCpes}
                  className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  {t('cpeSelection.skipAllButton')}
                </button>
                <button
                  onClick={handleCpeSelectionConfirm}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                >
                  {t('cpeSelection.continue')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Success */}
          {step === 'success' && generatedSbom && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md bg-green-500/15 p-4">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-green-600">{t('success.title')}</p>
                  <p className="text-sm text-green-600 mt-1">{t('success.body', { count: components.length })}</p>
                </div>
              </div>

              {/* File Info */}
              <div className="rounded-md border border-border bg-muted p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{generatedSbom.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('success.fileInfo', {
                        count: components.length,
                        size: (generatedSbom.content.length / 1024).toFixed(1),
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleClose}
                  className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  {t('common:actions.close')}
                </button>
                <button
                  onClick={handleDownload}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  {t('success.downloadSbom')}
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md bg-destructive/15 p-4">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">{t('errorState.title')}</p>
                  <p className="text-sm text-destructive mt-1">{error}</p>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={resetState}
                  className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  {t('errorState.startOver')}
                </button>
                <button
                  onClick={handleClose}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t('common:actions.close')}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
