import React from 'react'
import { X, AlertTriangle, Shield, ExternalLink, Copy, Check } from 'lucide-react'
import type { Component, Vulnerability } from '@@/types'
import { VirtualList } from './VirtualList'
import { toast } from './Toaster'
import { formatVulnerabilityId } from '@/lib/utils/vulnIdFormat'

interface ComponentVulnerabilitiesPopupProps {
  component: Component
  vulnerabilities: Vulnerability[]
  open: boolean
  onClose: () => void
  onViewVulnerability: (vulnerability: Vulnerability) => void
}

const severityConfig = {
  critical: {
    label: 'Critical',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badgeColor: 'bg-red-100 text-red-700',
  },
  high: {
    label: 'High',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    badgeColor: 'bg-orange-100 text-orange-700',
  },
  medium: {
    label: 'Medium',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    badgeColor: 'bg-yellow-100 text-amber-700',
  },
  low: {
    label: 'Low',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  none: {
    label: 'None',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    badgeColor: 'bg-gray-100 text-gray-700',
  },
}

export function ComponentVulnerabilitiesPopup({
  component,
  vulnerabilities,
  open,
  onClose,
  onViewVulnerability,
}: ComponentVulnerabilitiesPopupProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  // Sort vulnerabilities by severity
  const sortedVulnerabilities = React.useMemo(() => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
    return [...vulnerabilities].sort((a, b) => {
      return severityOrder[a.severity] - severityOrder[b.severity]
    })
  }, [vulnerabilities])

  // Count by severity
  const severityCounts = React.useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, none: 0 }
    for (const vuln of vulnerabilities) {
      counts[vuln.severity]++
    }
    return counts
  }, [vulnerabilities])

  // Handle copy to clipboard
  const handleCopyId = async (vulnId: string) => {
    try {
      await navigator.clipboard.writeText(vulnId)
      setCopiedId(vulnId)
      toast.success(`Copied ${vulnId} to clipboard`)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

  // Handle escape key
  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Popup */}
      <div
        className="relative z-50 w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="vulnerabilities-popup"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5 bg-gradient-to-r from-muted/50 to-background">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground truncate">{component.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {component.version}
                  <span className="mx-2">-</span>
                  <span className="capitalize">{component.type}</span>
                  {component.purl && (
                    <>
                      <span className="mx-2">-</span>
                      <span className="font-mono text-xs">{component.purl}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close popup"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Severity Summary */}
        <div className="border-b border-border px-5 py-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {vulnerabilities.length} {vulnerabilities.length === 1 ? 'Vulnerability' : 'Vulnerabilities'} Found
            </span>
            <div className="flex items-center gap-2">
              {severityCounts.critical > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  {severityCounts.critical} Critical
                </span>
              )}
              {severityCounts.high > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  {severityCounts.high} High
                </span>
              )}
              {severityCounts.medium > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                  {severityCounts.medium} Medium
                </span>
              )}
              {severityCounts.low > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {severityCounts.low} Low
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {vulnerabilities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="mb-3 h-12 w-12 text-green-500" />
              <p className="text-muted-foreground font-medium">No vulnerabilities found</p>
              <p className="text-sm text-muted-foreground mt-1">This component appears to be secure</p>
            </div>
          ) : (
            <VirtualList
              items={sortedVulnerabilities}
              itemKey="id"
              renderItem={(vuln) => {
                const config = severityConfig[vuln.severity]
                const { primaryId, aliases } = formatVulnerabilityId(vuln)
                return (
                  <div className="flex flex-col gap-2 border-b border-border p-4 hover:bg-muted/30 transition-colors last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-foreground">{primaryId}</span>
                          {aliases.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              (aka: {aliases.slice(0, 2).join(', ')}
                              {aliases.length > 2 ? ` +${aliases.length - 2}` : ''})
                            </span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeColor}`}>
                            {config.label}
                          </span>
                          {vuln.cvssScore !== undefined && (
                            <span className="text-xs text-muted-foreground">CVSS: {vuln.cvssScore.toFixed(1)}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{vuln.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>
                            Source:{' '}
                            {vuln.sources
                              ? vuln.sources.map((s) => s.toUpperCase()).join(' + ')
                              : vuln.source.toUpperCase()}
                          </span>
                          {vuln.patchInfo && (
                            <span
                              className={`${
                                vuln.patchInfo.patchAvailability === 'available'
                                  ? 'text-green-600'
                                  : vuln.patchInfo.patchAvailability === 'partial'
                                    ? 'text-yellow-600'
                                    : vuln.patchInfo.patchAvailability === 'none'
                                      ? 'text-red-600'
                                      : 'text-gray-600'
                              }`}
                            >
                              Patch:{' '}
                              {vuln.patchInfo.patchAvailability === 'available'
                                ? 'Available'
                                : vuln.patchInfo.patchAvailability === 'partial'
                                  ? 'Partial'
                                  : vuln.patchInfo.patchAvailability === 'upstream'
                                    ? 'Upstream'
                                    : vuln.patchInfo.patchAvailability === 'investigating'
                                      ? 'Investigating'
                                      : vuln.patchInfo.patchAvailability === 'none'
                                        ? 'None'
                                        : vuln.patchInfo.patchAvailability}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleCopyId(primaryId)}
                          className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                          aria-label={`Copy ${primaryId} to clipboard`}
                        >
                          {copiedId === primaryId ? (
                            <>
                              <Check className="h-3 w-3 text-green-600" />
                              <span className="text-green-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => onViewVulnerability(vuln)}
                          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }}
              defaultItemHeight={120}
              height="400px"
              className="border-0"
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border p-4 bg-muted/30">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
