/**
 * Dashboard Configuration Widget
 * Provides layout customization and filtering options
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Filter, Calendar, Download, RefreshCw, Check } from 'lucide-react'
import type { Project } from '@@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface DashboardConfigProps {
  dateRange: { start: Date; end: Date }
  projectScope: 'all' | 'selected'
  projects: Project[]
  // Parent-owned selection (H4): the picker reports changes up rather than keeping its own
  // state that the dashboard never reads, so "Selected Projects" actually filters the view.
  selectedProjectIds: string[]
  onSelectedProjectsChange: (ids: string[]) => void
  onDateRangeChange: (range: { start: Date; end: Date }) => void
  onProjectScopeChange: (scope: 'all' | 'selected') => void
  onExportReport: () => void
  onRefresh: () => void
  isRefreshing?: boolean
}

interface Props extends DashboardConfigProps {
  open?: boolean
  onClose?: () => void
}

export function DashboardConfig({
  open,
  onClose,
  dateRange,
  projectScope,
  projects,
  selectedProjectIds,
  onSelectedProjectsChange,
  onDateRangeChange,
  onProjectScopeChange,
  onExportReport,
  onRefresh,
  isRefreshing = false,
}: Props) {
  const { t } = useTranslation('dashboardConfig')
  const [localOpen, setLocalOpen] = useState(false)

  const isOpen = open !== undefined ? open : localOpen
  const setIsOpen = onClose ? () => onClose() : () => setLocalOpen(false)

  const dateRangeOptions = [
    { label: t('dateRange.options.7'), days: 7 },
    { label: t('dateRange.options.30'), days: 30 },
    { label: t('dateRange.options.90'), days: 90 },
    { label: t('dateRange.options.365'), days: 365 },
  ]

  const handleDateRangeSelect = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days)

    const newRange = { start, end }
    onDateRangeChange(newRange)
  }

  const handleToggleProject = (projectId: string) => {
    const next = selectedProjectIds.includes(projectId)
      ? selectedProjectIds.filter((id) => id !== projectId)
      : [...selectedProjectIds, projectId]
    onSelectedProjectsChange(next)
  }

  const handleExport = () => {
    onExportReport()
    setIsOpen()
  }

  const TriggerButton = () => (
    <button
      onClick={() => (open !== undefined ? onClose?.() : setLocalOpen(true))}
      className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-secondary/80 flex items-center gap-2"
    >
      <Settings className="w-4 h-4" />
      {t('trigger')}
    </button>
  )

  if (!isOpen && open === undefined) {
    return <TriggerButton />
  }

  if (!isOpen) return null

  return (
    <>
      <TriggerButton />
      <Dialog open={isOpen} onOpenChange={(next) => !next && setIsOpen()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          {/* Content */}
          <div className="space-y-6">
            {/* Date Range */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-semibold">{t('dateRange.label')}</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dateRangeOptions.map((option) => {
                  const optionStart = new Date(Date.now() - option.days * 24 * 60 * 60 * 1000)
                  const isSelected = Math.abs(dateRange.start.getTime() - optionStart.getTime()) < 1000

                  return (
                    <button
                      key={option.days}
                      onClick={() => handleDateRangeSelect(option.days)}
                      className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                        isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                {dateRange.start.toLocaleDateString()} - {dateRange.end.toLocaleDateString()}
              </div>
            </div>

            {/* Project Scope */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-semibold">{t('projectScope.label')}</label>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => onProjectScopeChange('all')}
                  className={`w-full px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-between ${
                    projectScope === 'all' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  }`}
                >
                  <span>{t('projectScope.all')}</span>
                  {projectScope === 'all' && <Check className="w-4 h-4 text-primary" />}
                </button>
                <button
                  onClick={() => onProjectScopeChange('selected')}
                  className={`w-full px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-between ${
                    projectScope === 'selected' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  }`}
                >
                  <span>{t('projectScope.selected')}</span>
                  {projectScope === 'selected' && <Check className="w-4 h-4 text-primary" />}
                </button>

                {projectScope === 'selected' && (
                  <div className="border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                    {projects.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-2">
                        {t('projectScope.noProjects')}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {projects.map((project) => (
                          <label
                            key={project.id}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={selectedProjectIds.includes(project.id)}
                              onChange={() => handleToggleProject(project.id)}
                              className="rounded"
                            />
                            <span className="flex-1 truncate">{project.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {projectScope === 'all'
                  ? t('projectScope.summaryAll', { count: projects.length })
                  : t('projectScope.summarySelected', { count: selectedProjectIds.length })}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {t('common:actions.refresh')}
            </button>
            <button
              onClick={handleExport}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {t('exportReport')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
