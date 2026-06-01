import { useState } from 'react'
import { Download, FileSpreadsheet, FileJson, FileText } from 'lucide-react'
import { exportProjectData, exportAllProjects } from '@/lib/export'
import type { ExportFormat, ExportDataType } from '@/lib/export/types'
import type { Project } from '@@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  project?: Project
  projects?: Project[]
}

export function ExportDialog({ open, onClose, project, projects }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv')
  const [selectedDataType, setSelectedDataType] = useState<ExportDataType>('vulnerabilities')

  const isAllProjects = !!projects && !project

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 0))

      if (isAllProjects && projects) {
        exportAllProjects(projects, selectedFormat)
      } else if (project) {
        exportProjectData(project, selectedFormat, selectedDataType)
      }

      handleCancel()
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
      label: 'CSV',
      icon: FileSpreadsheet,
      description: 'Spreadsheet-compatible format, ideal for data analysis',
    },
    {
      value: 'json',
      label: 'JSON',
      icon: FileJson,
      description: 'Machine-readable format, ideal for integration',
    },
    {
      value: 'pdf',
      label: 'PDF',
      icon: FileText,
      description: 'Formatted report, ideal for sharing and documentation',
    },
  ]

  const dataTypes: { value: ExportDataType; label: string }[] = isAllProjects
    ? [{ value: 'all-projects', label: 'All Projects Summary' }]
    : [
        { value: 'project', label: 'Full Project Report' },
        { value: 'vulnerabilities', label: 'Vulnerabilities Only' },
        { value: 'components', label: 'Components Only' },
      ]

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleCancel()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Data</DialogTitle>
          <DialogDescription>Choose the export format and data type for your report.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium">Export Format</label>
            <div className="grid grid-cols-3 gap-3">
              {formats.map((format) => {
                const Icon = format.icon
                const isSelected = selectedFormat === format.value
                return (
                  <Button
                    key={format.value}
                    variant={isSelected ? 'default' : 'outline'}
                    onClick={() => setSelectedFormat(format.value)}
                    className={`flex flex-col items-center gap-2 h-auto py-3 ${isSelected ? '' : 'text-foreground'}`}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{format.label}</span>
                  </Button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {formats.find((f) => f.value === selectedFormat)?.description}
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Data Type</label>
            <div className="space-y-2">
              {dataTypes.map((dataType) => (
                <Button
                  key={dataType.value}
                  variant={selectedDataType === dataType.value ? 'default' : 'outline'}
                  onClick={() => setSelectedDataType(dataType.value)}
                  className={`w-full justify-start h-auto py-3 ${selectedDataType === dataType.value ? '' : 'text-foreground'}`}
                >
                  <span className="text-sm font-medium">{dataType.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-2 text-sm">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Export Preview</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAllProjects
                ? `Exporting ${projects?.length || 0} projects as ${selectedFormat.toUpperCase()}`
                : `Exporting "${project?.name}" - ${dataTypes.find((d) => d.value === selectedDataType)?.label} as ${selectedFormat.toUpperCase()}`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
