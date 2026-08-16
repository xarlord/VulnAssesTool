import React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Shield, ExternalLink, Copy, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { Component, Vulnerability } from '@@/types'
import { VirtualList } from './VirtualList'
import { toast } from './Toaster'
import { formatVulnerabilityId } from '@/lib/utils/vulnIdFormat'
import { getSeverityClass } from '@/lib/severity'

interface ComponentVulnerabilitiesPopupProps {
  component: Component
  vulnerabilities: Vulnerability[]
  open: boolean
  onClose: () => void
  onViewVulnerability: (vulnerability: Vulnerability) => void
}

const severityConfig = {
  critical: {
    labelKey: 'severity.critical',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  high: {
    labelKey: 'severity.high',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  medium: {
    labelKey: 'severity.medium',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  low: {
    labelKey: 'severity.low',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  none: {
    labelKey: 'severity.none',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
}

export function ComponentVulnerabilitiesPopup({
  component,
  vulnerabilities,
  open,
  onClose,
  onViewVulnerability,
}: ComponentVulnerabilitiesPopupProps) {
  const { t } = useTranslation('componentVulnerabilitiesPopup')
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const copiedIdTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
      toast.success(t('toast.copied', { id: vulnId }))
      if (copiedIdTimerRef.current) clearTimeout(copiedIdTimerRef.current)
      copiedIdTimerRef.current = setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error(t('toast.copyFailed'))
    }
  }

  // Clear any pending "Copied" reset on unmount so it never fires setState after unmount.
  React.useEffect(() => {
    return () => {
      if (copiedIdTimerRef.current) clearTimeout(copiedIdTimerRef.current)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden bg-card p-0"
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
                <DialogTitle className="truncate">{component.name}</DialogTitle>
                <DialogDescription>
                  {component.version}
                  <span className="mx-2">-</span>
                  <span className="capitalize">{component.type}</span>
                  {component.purl && (
                    <>
                      <span className="mx-2">-</span>
                      <span className="font-mono text-xs">{component.purl}</span>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* Severity Summary */}
        <div className="border-b border-border px-5 py-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {t('summary.found', { count: vulnerabilities.length })}
            </span>
            <div className="flex items-center gap-2">
              {severityCounts.critical > 0 && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${getSeverityClass('critical')}`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {t('summary.critical', { count: severityCounts.critical })}
                </span>
              )}
              {severityCounts.high > 0 && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${getSeverityClass('high')}`}
                >
                  {t('summary.high', { count: severityCounts.high })}
                </span>
              )}
              {severityCounts.medium > 0 && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${getSeverityClass('medium')}`}
                >
                  {t('summary.medium', { count: severityCounts.medium })}
                </span>
              )}
              {severityCounts.low > 0 && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${getSeverityClass('low')}`}
                >
                  {t('summary.low', { count: severityCounts.low })}
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
              <p className="text-muted-foreground font-medium">{t('empty.title')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.subtitle')}</p>
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
                              {t('item.akaPrefix')}
                              {aliases.slice(0, 2).join(', ')}
                              {aliases.length > 2 ? ` +${aliases.length - 2}` : ''}
                              {t('item.akaSuffix')}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getSeverityClass(vuln.severity)}`}
                          >
                            {t(config.labelKey)}
                          </span>
                          {vuln.cvssScore !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              {t('item.cvss', { score: vuln.cvssScore.toFixed(1) })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{vuln.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>
                            {t('item.source')}{' '}
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
                              {t('item.patch')}{' '}
                              {vuln.patchInfo.patchAvailability === 'available'
                                ? t('patchStatus.available')
                                : vuln.patchInfo.patchAvailability === 'partial'
                                  ? t('patchStatus.partial')
                                  : vuln.patchInfo.patchAvailability === 'upstream'
                                    ? t('patchStatus.upstream')
                                    : vuln.patchInfo.patchAvailability === 'investigating'
                                      ? t('patchStatus.investigating')
                                      : vuln.patchInfo.patchAvailability === 'none'
                                        ? t('patchStatus.none')
                                        : vuln.patchInfo.patchAvailability}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleCopyId(primaryId)}
                          className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                          aria-label={t('item.copyAriaLabel', { id: primaryId })}
                        >
                          {copiedId === primaryId ? (
                            <>
                              <Check className="h-3 w-3 text-green-600" />
                              <span className="text-green-600">{t('item.copied')}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>{t('item.copy')}</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => onViewVulnerability(vuln)}
                          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t('item.viewDetails')}
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
            {t('common:actions.close')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
