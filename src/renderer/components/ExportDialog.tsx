import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileSpreadsheet, FileJson, FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { ExportFormat, ExportDataType } from '@/lib/export/types'
import type { Project } from '@@/types'
import { logExport } from '@/lib/audit'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  project?: Project
  projects?: Project[]
}

/**
 * Maps the user's single-project export selection to the audit event's entity type and
 * the count of records the export covers, so the EXPORT audit trail records what was
 * actually exported (e.g. N vulnerabilities) rather than a generic "1 project".
 */
function describeProjectExport(
  project: Project,
  dataType: ExportDataType,
): { entityType: 'project' | 'vulnerability' | 'component'; itemCount: number } {
  if (dataType === 'components') {
    return { entityType: 'component', itemCount: project.components?.length ?? 0 }
  }
  if (dataType === 'project') {
    return { entityType: 'project', itemCount: 1 }
  }
  // 'vulnerabilities' (the default) — 'all-projects' never reaches this single-project branch.
  return { entityType: 'vulnerability', itemCount: project.vulnerabilities?.length ?? 0 }
}

export function ExportDialog({ open, onClose, project, projects }: ExportDialogProps) {
  const { t } = useTranslation('exportDialog')
  const [isExporting, setIsExporting] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv')
  const [selectedDataType, setSelectedDataType] = useState<ExportDataType>('vulnerabilities')

  const isAllProjects = !!projects && !project

  const handleExport = async () => {
    setIsExporting(true)
    try {
      // Small delay to allow UI to update
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Loaded on demand so the export subsystem (and its heavy jsPDF/autoTable
      // dependency) stays out of the Dashboard/ProjectDetail page bundles and is
      // only fetched when the user actually runs an export.
      const { exportProjectData, exportAllProjects } = await import('@/lib/export')

      if (isAllProjects && projects) {
        exportAllProjects(projects, selectedFormat)
        // Record an EXPORT audit event so the exported compliance evidence is itself auditable.
        logExport('all', selectedFormat, projects.length)
      } else if (project) {
        exportProjectData(project, selectedFormat, selectedDataType)
        const audited = describeProjectExport(project, selectedDataType)
        logExport(audited.entityType, selectedFormat, audited.itemCount, project.id)
      }

      // Close dialog after export completes
      onClose()
    } catch (error) {
      console.error('Export failed:', error)
      setIsExporting(false)
    }
  }

  const handleCancel = () => {
    setSelectedFormat('csv')
    setSelectedDataType('vulnerabilities')
    onClose()
  }

  const formats: { value: ExportFormat; label: string; icon: typeof FileSpreadsheet; description: string }[] = [
    {
      value: 'csv',
      label: t('format.csv.label'),
      icon: FileSpreadsheet,
      description: t('format.csv.description'),
    },
    {
      value: 'json',
      label: t('format.json.label'),
      icon: FileJson,
      description: t('format.json.description'),
    },
    {
      value: 'pdf',
      label: t('format.pdf.label'),
      icon: FileText,
      description: t('format.pdf.description'),
    },
  ]

  const dataTypes: { value: ExportDataType; label: string }[] = isAllProjects
    ? [{ value: 'all-projects', label: t('dataType.allProjects') }]
    : [
        { value: 'project', label: t('dataType.project') },
        { value: 'vulnerabilities', label: t('dataType.vulnerabilities') },
        { value: 'components', label: t('dataType.components') },
      ]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Radix fires this for Escape, overlay click, and the close button.
        if (!next) handleCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="space-y-6">
          {/* Format Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">{t('format.label')}</label>
            <div className="grid grid-cols-3 gap-3">
              {formats.map((format) => {
                const Icon = format.icon
                const isSelected = selectedFormat === format.value
                return (
                  <button
                    key={format.value}
                    onClick={() => setSelectedFormat(format.value)}
                    aria-pressed={isSelected}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors ${
                      isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{format.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {formats.find((f) => f.value === selectedFormat)?.description}
            </p>
          </div>

          {/* Data Type Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">{t('dataType.label')}</label>
            <div className="space-y-2">
              {dataTypes.map((dataType) => (
                <button
                  key={dataType.value}
                  onClick={() => setSelectedDataType(dataType.value)}
                  aria-pressed={selectedDataType === dataType.value}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedDataType === dataType.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <span className="text-sm font-medium">{dataType.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-2 text-sm">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t('preview.label')}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAllProjects
                ? t('preview.allProjects', { count: projects?.length || 0, format: selectedFormat.toUpperCase() })
                : t('preview.singleProject', {
                    name: project?.name,
                    label: dataTypes.find((d) => d.value === selectedDataType)?.label,
                    format: selectedFormat.toUpperCase(),
                  })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={handleCancel}
            disabled={isExporting}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none"
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isExporting ? t('exporting') : t('common:actions.export')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
