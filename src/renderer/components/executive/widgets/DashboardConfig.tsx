/**
 * Dashboard Configuration Widget
 * Provides layout customization and filtering options
 */

import React, { useState } from 'react'
import { Settings, Filter, Calendar, Download, RefreshCw, X, Check } from 'lucide-react'
import type { Project } from '@@/types'

interface DashboardConfigProps {
  dateRange: { start: Date; end: Date }
  projectScope: 'all' | 'selected'
  projects: Project[]
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
  onDateRangeChange,
  onProjectScopeChange,
  onExportReport,
  onRefresh,
  isRefreshing = false,
}: Props) {
  const [localOpen, setLocalOpen] = useState(false)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])

  const isOpen = open !== undefined ? open : localOpen
  const setIsOpen = onClose ? () => onClose() : () => setLocalOpen(false)

  const dateRangeOptions = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 12 months', days: 365 },
  ]

  const handleDateRangeSelect = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days)

    const newRange = { start, end }
    onDateRangeChange(newRange)
  }

  const handleToggleProject = (projectId: string) => {
    setSelectedProjects((prev) => {
      if (prev.includes(projectId)) {
        return prev.filter((id) => id !== projectId)
      } else {
        return [...prev, projectId]
      }
    })
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
      Dashboard Settings
    </button>
  )

  if (!isOpen && open === undefined) {
    return <TriggerButton />
  }

  if (!isOpen) return null

  return (
    <>
      <TriggerButton />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={setIsOpen} aria-hidden="true" />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        >
          {/* Close Button */}
          <button
            onClick={setIsOpen}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="mb-4">
            <h2 id="dialog-title" className="text-lg font-semibold">
              Dashboard Configuration
            </h2>
            <p className="text-sm text-muted-foreground">Customize your executive dashboard view and export options</p>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Date Range */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-semibold">Date Range</label>
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
                <label className="text-sm font-semibold">Project Scope</label>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => onProjectScopeChange('all')}
                  className={`w-full px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-between ${
                    projectScope === 'all' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  }`}
                >
                  <span>All Projects</span>
                  {projectScope === 'all' && <Check className="w-4 h-4 text-primary" />}
                </button>
                <button
                  onClick={() => onProjectScopeChange('selected')}
                  className={`w-full px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-between ${
                    projectScope === 'selected' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                  }`}
                >
                  <span>Selected Projects</span>
                  {projectScope === 'selected' && <Check className="w-4 h-4 text-primary" />}
                </button>

                {projectScope === 'selected' && (
                  <div className="border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                    {projects.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-2">No projects available</div>
                    ) : (
                      <div className="space-y-1">
                        {projects.map((project) => (
                          <label
                            key={project.id}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={selectedProjects.includes(project.id)}
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
                  ? `Showing data from all ${projects.length} project(s)`
                  : `Showing data from ${selectedProjects.length} selected project(s)`}
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
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
