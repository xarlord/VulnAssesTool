/**
 * Audit Export Dialog
 * UI for exporting audit logs
 */

import { useState } from 'react'
import { useAuditStore } from '@/lib/audit'
import { exportAuditLogs, type AuditExportFormat, type AuditExportOptions } from '@/lib/audit'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, FileJson, FileSpreadsheet, FileText, Calendar } from 'lucide-react'

interface AuditExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuditExportDialog({ open, onOpenChange }: AuditExportDialogProps) {
  const [format, setFormat] = useState<AuditExportFormat>('json')
  const [includeFullState, setIncludeFullState] = useState(false)
  const [anonymize, setAnonymize] = useState(false)
  const [dateRange, setDateRange] = useState<'all' | '7days' | '30days' | '90days'>('all')
  const [isExporting, setIsExporting] = useState(false)

  const stats = useAuditStore((state) => state.getStatistics())
  const totalEvents = stats.totalEvents

  function handleExport() {
    setIsExporting(true)

    try {
      const options: AuditExportOptions = {
        format,
        includeFullState,
        anonymize,
      }

      // Apply date range filter if selected
      if (dateRange !== 'all') {
        const days = parseInt(dateRange.replace('days', ''))
        const end = new Date()
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
        options.filter = { dateRange: { start, end } }
      }

      void exportAuditLogs(options)
      onOpenChange(false)
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const formatOptions: Array<{
    value: AuditExportFormat
    label: string
    icon: React.ReactNode
    description: string
  }> = [
    {
      value: 'json',
      label: 'JSON',
      icon: <FileJson className="w-5 h-5" />,
      description: 'Machine-readable format with full event data',
    },
    {
      value: 'csv',
      label: 'CSV',
      icon: <FileSpreadsheet className="w-5 h-5" />,
      description: 'Spreadsheet-compatible format for analysis',
    },
    {
      value: 'pdf',
      icon: <FileText className="w-5 h-5" />,
      label: 'PDF',
      description: 'Human-readable report format',
    },
  ]

  const dateRangeOptions = [
    { value: 'all' as const, label: 'All time', days: null },
    { value: '7days' as const, label: 'Last 7 days', days: 7 },
    { value: '30days' as const, label: 'Last 30 days', days: 30 },
    { value: '90days' as const, label: 'Last 90 days', days: 90 },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Audit Log</DialogTitle>
          <DialogDescription>
            Export audit events for compliance and analysis. Total events: {totalEvents}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div>
            <Label className="text-base font-semibold mb-3">Export Format</Label>
            <div className="grid grid-cols-3 gap-3">
              {formatOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormat(option.value)}
                  className={`flex flex-col items-center p-4 border-2 rounded-lg transition-colors ${
                    format === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  {option.icon}
                  <span className="mt-2 text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">{formatOptions.find((f) => f.value === format)?.description}</p>
          </div>

          {/* Date Range */}
          <div>
            <Label className="text-base font-semibold mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date Range
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {dateRangeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateRange(option.value)}
                  className={`px-3 py-2 text-sm border rounded-md text-left transition-colors ${
                    dateRange === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Options</Label>

            <div className="flex items-start gap-3">
              <Checkbox
                id="include-full-state"
                checked={includeFullState}
                onCheckedChange={(checked) => setIncludeFullState(checked as boolean)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="include-full-state" className="text-sm font-medium cursor-pointer">
                  Include full state data
                </Label>
                <p className="text-xs text-gray-500">Include complete before/after states (increases file size)</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="anonymize"
                checked={anonymize}
                onCheckedChange={(checked) => setAnonymize(checked as boolean)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="anonymize" className="text-sm font-medium cursor-pointer">
                  Anonymize sensitive data
                </Label>
                <p className="text-xs text-gray-500">Remove user IDs, IP addresses, and full session IDs</p>
              </div>
            </div>
          </div>

          {/* Estimated size warning */}
          {includeFullState && totalEvents > 1000 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <span className="text-yellow-600 dark:text-yellow-400 text-sm">
                ⚠️ Warning: Including full state data for {totalEvents} events may result in a large file. Consider
                filtering by date range.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>Exporting...</>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export {format.toUpperCase()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
