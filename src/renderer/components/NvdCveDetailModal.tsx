import { useState, useEffect } from 'react'
import { getPlatform } from '@/lib/platform'
import {
  ExternalLink,
  AlertTriangle,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Link2,
  Wrench,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from './Toaster'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

// Types matching the database types
interface CpeMatchFull {
  id: number
  cveId: string
  cpe23Uri: string
  vulnerable: boolean
  versionStartIncluding?: string
  versionStartExcluding?: string
  versionEndIncluding?: string
  versionEndExcluding?: string
}

interface CweReference {
  id: number
  cveId: string
  cweId: string
  description?: string
}

interface ReferenceFull {
  id: number
  cveId: string
  url: string
  source?: string
  tags?: string[]
  referenceType?: string
}

interface CvssMetric {
  source: string
  type: string
  version: '3.1' | '3.0' | '2.0'
  score: number
  severity: string
  vector: string
  exploitabilityScore?: number
  impactScore?: number
}

interface CveFullDetails {
  id: string
  description: string
  cvssV31Score?: number
  cvssV31Vector?: string
  cvssV31Severity?: string
  cvssV30Score?: number
  cvssV30Vector?: string
  cvssV30Severity?: string
  cvssV2Score?: number
  cvssV2Vector?: string
  cvssV2Severity?: string
  cvssScore?: number
  cvssVector?: string
  severity: string
  publishedAt: string
  modifiedAt: string
  source: string
  vulnStatus?: string
  assigner?: string
  cpeMatches: CpeMatchFull[]
  cweReferences: CweReference[]
  references: ReferenceFull[]
  referenceTags: string[]
  cvssMetrics?: CvssMetric[]
}

interface NvdCveDetailModalProps {
  cveId: string
  open: boolean
  onClose: () => void
}

// Reference type tag colors - more prominent styling
const REFERENCE_TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  patch: { bg: 'bg-green-500', text: 'text-white', border: 'border-green-600' },
  vendor: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600' },
  advisory: { bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-600' },
  exploit: { bg: 'bg-red-500', text: 'text-white', border: 'border-red-600' },
  default: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' },
}

const SEVERITY_COLORS = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-700 dark:text-orange-400',
  MEDIUM: 'text-amber-700 dark:text-amber-400',
  LOW: 'text-green-600',
  NONE: 'text-muted-foreground',
}

const SEVERITY_BG_COLORS = {
  CRITICAL: 'bg-red-100',
  HIGH: 'bg-orange-100',
  MEDIUM: 'bg-yellow-100',
  LOW: 'bg-green-100',
  NONE: 'bg-muted',
}

// Parse CPE URI to extract readable info
const parseCpe = (cpeUri: string): { vendor: string; product: string; version: string } => {
  const parts = cpeUri.split(':')
  if (parts.length >= 6) {
    return {
      vendor: parts[3].replace(/_/g, ' '),
      product: parts[4].replace(/_/g, ' '),
      version: parts[5] || '*',
    }
  }
  return { vendor: '', product: '', version: '' }
}

// Format version range for display
const formatVersionRange = (match: CpeMatchFull, t: TFunction): string => {
  const parts: string[] = []

  if (match.versionStartIncluding) {
    parts.push(t('cpe.range.fromInclusive', { version: match.versionStartIncluding }))
  } else if (match.versionStartExcluding) {
    parts.push(t('cpe.range.fromExclusive', { version: match.versionStartExcluding }))
  }

  if (match.versionEndIncluding) {
    parts.push(t('cpe.range.toInclusive', { version: match.versionEndIncluding }))
  } else if (match.versionEndExcluding) {
    parts.push(t('cpe.range.toExclusive', { version: match.versionEndExcluding }))
  }

  if (parts.length === 0) {
    return t('cpe.range.allVersions')
  }

  return parts.join(' ')
}

// Parse CVSS vector string to components
const parseCvssVector = (
  vector: string | undefined,
  t: TFunction,
): { code: string; name: string; value: string; valueName: string }[] => {
  if (!vector) return []

  const cvss3Metrics: Record<string, { nameKey: string; values: Record<string, string> }> = {
    AV: {
      nameKey: 'cvssVector.metricNames.attackVector',
      values: {
        N: 'cvssVector.values.network',
        A: 'cvssVector.values.adjacent',
        L: 'cvssVector.values.local',
        P: 'cvssVector.values.physical',
      },
    },
    AC: {
      nameKey: 'cvssVector.metricNames.attackComplexity',
      values: { L: 'cvssVector.values.low', H: 'cvssVector.values.high' },
    },
    PR: {
      nameKey: 'cvssVector.metricNames.privilegesRequired',
      values: { N: 'cvssVector.values.none', L: 'cvssVector.values.low', H: 'cvssVector.values.high' },
    },
    UI: {
      nameKey: 'cvssVector.metricNames.userInteraction',
      values: { N: 'cvssVector.values.none', R: 'cvssVector.values.required' },
    },
    S: {
      nameKey: 'cvssVector.metricNames.scope',
      values: { U: 'cvssVector.values.unchanged', C: 'cvssVector.values.changed' },
    },
    C: {
      nameKey: 'cvssVector.metricNames.confidentiality',
      values: { N: 'cvssVector.values.none', L: 'cvssVector.values.low', H: 'cvssVector.values.high' },
    },
    I: {
      nameKey: 'cvssVector.metricNames.integrity',
      values: { N: 'cvssVector.values.none', L: 'cvssVector.values.low', H: 'cvssVector.values.high' },
    },
    A: {
      nameKey: 'cvssVector.metricNames.availability',
      values: { N: 'cvssVector.values.none', L: 'cvssVector.values.low', H: 'cvssVector.values.high' },
    },
  }

  const cvss2Metrics: Record<string, { nameKey: string; values: Record<string, string> }> = {
    AV: {
      nameKey: 'cvssVector.metricNames.accessVector',
      values: { N: 'cvssVector.values.network', A: 'cvssVector.values.adjacent', L: 'cvssVector.values.local' },
    },
    AC: {
      nameKey: 'cvssVector.metricNames.accessComplexity',
      values: { L: 'cvssVector.values.low', M: 'cvssVector.values.medium', H: 'cvssVector.values.high' },
    },
    Au: {
      nameKey: 'cvssVector.metricNames.authentication',
      values: { N: 'cvssVector.values.none', S: 'cvssVector.values.single', M: 'cvssVector.values.multiple' },
    },
    C: {
      nameKey: 'cvssVector.metricNames.confidentiality',
      values: { N: 'cvssVector.values.none', P: 'cvssVector.values.partial', C: 'cvssVector.values.complete' },
    },
    I: {
      nameKey: 'cvssVector.metricNames.integrity',
      values: { N: 'cvssVector.values.none', P: 'cvssVector.values.partial', C: 'cvssVector.values.complete' },
    },
    A: {
      nameKey: 'cvssVector.metricNames.availability',
      values: { N: 'cvssVector.values.none', P: 'cvssVector.values.partial', C: 'cvssVector.values.complete' },
    },
  }

  const isCvss2 = vector.includes('CVSS:2.0') || (!vector.includes('CVSS:3') && vector.includes('Au'))
  const metrics = isCvss2 ? cvss2Metrics : cvss3Metrics

  const result: { code: string; name: string; value: string; valueName: string }[] = []

  // Extract metric pairs (e.g., AV:N)
  const regex = /([A-Za-z]+):([A-Za-z]+)/g
  let match
  while ((match = regex.exec(vector)) !== null) {
    const code = match[1]
    const value = match[2]
    const metric = metrics[code]
    if (metric) {
      result.push({
        code,
        name: t(metric.nameKey),
        value,
        valueName: metric.values[value] ? t(metric.values[value]) : value,
      })
    }
  }

  return result
}

// Get tag color by checking if it contains known types
const getTagStyle = (tag: string): { bg: string; text: string; border: string } => {
  const lowerTag = tag.toLowerCase()
  for (const [key, style] of Object.entries(REFERENCE_TAG_COLORS)) {
    if (key !== 'default' && lowerTag.includes(key)) {
      return style
    }
  }
  return REFERENCE_TAG_COLORS.default
}

export function NvdCveDetailModal({ cveId, open, onClose }: NvdCveDetailModalProps) {
  const { t } = useTranslation('nvdCveDetailModal')
  const [cve, setCve] = useState<CveFullDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [cpeExpanded, setCpeExpanded] = useState(true)
  const [cweExpanded, setCweExpanded] = useState(true)
  const [refsExpanded, setRefsExpanded] = useState(true)
  const [cvssExpanded, setCvssExpanded] = useState(true)

  // Fetch CVE details when opened
  useEffect(() => {
    if (open && cveId) {
      fetchCveDetails()
    }
    // Intentional: re-fetch only when open/cveId change; fetchCveDetails is a stable closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cveId])

  const fetchCveDetails = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getPlatform().database.getCveFull({ cveId })
      if (response.success) {
        setCve(response.cve)
      } else {
        setError(response.error || t('errors.fetchFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  // Handle copy to clipboard
  const handleCopyId = async () => {
    if (!cve) return
    try {
      await navigator.clipboard.writeText(cve.id)
      setCopied(true)
      toast.success(t('toast.copied', { id: cve.id }))
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error(t('errors.copyFailed'))
    }
  }

  // Check if patch is available
  const hasPatch = (tags: string[]): boolean => {
    return tags.some((t) => t.toLowerCase().includes('patch'))
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t('dateUnknown')
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(dateStr))
    } catch {
      return dateStr
    }
  }

  const getSeverityColor = (severity: string) => {
    const s = severity?.toUpperCase() as keyof typeof SEVERITY_COLORS
    return SEVERITY_COLORS[s] || SEVERITY_COLORS.LOW
  }

  const getSeverityBgColor = (severity: string) => {
    const s = severity?.toUpperCase() as keyof typeof SEVERITY_BG_COLORS
    return SEVERITY_BG_COLORS[s] || SEVERITY_BG_COLORS.LOW
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="cve-detail-modal"
        aria-modal="true"
        className="max-w-4xl max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-6 bg-gradient-to-r from-muted to-card">
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center gap-3">
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                <div className="h-6 w-20 bg-muted animate-pulse rounded" />
              </div>
            ) : error ? (
              <div className="text-destructive">{error}</div>
            ) : cve ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 id="cve-modal-title" className="text-xl font-semibold text-foreground">
                    {cve.id}
                  </h2>
                  <button
                    onClick={handleCopyId}
                    data-testid="cve-copy-id"
                    className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    aria-label={t('header.copyAriaLabel', { id: cve.id })}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-green-600">{t('header.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>{t('header.copy')}</span>
                      </>
                    )}
                  </button>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${getSeverityBgColor(cve.severity)} ${getSeverityColor(cve.severity)}`}
                  >
                    {cve.severity.toUpperCase()}
                  </span>
                  {cve.cvssScore !== undefined && cve.cvssScore > 0 && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${getSeverityBgColor(cve.severity)} ${getSeverityColor(cve.severity)}`}
                    >
                      {t('header.cvssBadge', { score: cve.cvssScore.toFixed(1) })}
                    </span>
                  )}
                  {/* Show reference type tags prominently */}
                  {cve.referenceTags
                    .filter((t) =>
                      ['patch', 'vendor', 'advisory', 'exploit'].some((type) => t.toLowerCase().includes(type)),
                    )
                    .map((tag) => {
                      const style = getTagStyle(tag)
                      return (
                        <span
                          key={tag}
                          className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${style.bg} ${style.text}`}
                        >
                          {tag}
                        </span>
                      )
                    })}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('header.source', { source: cve.source })}
                  {cve.assigner && t('header.assigner', { assigner: cve.assigner })}
                  {cve.vulnStatus && t('header.vulnStatus', { status: cve.vulnStatus })}
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">{t('noCveData')}</div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {/* Description skeleton */}
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-1/2" />
              {/* CVSS skeleton */}
              <div className="h-32 bg-muted rounded" />
              {/* CPE skeleton */}
              <div className="h-24 bg-muted rounded" />
              {/* References skeleton */}
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-24 bg-muted rounded" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">{t('errorBanner.title')}</span>
              </div>
              <p className="mt-1 text-sm text-destructive">{error}</p>
              <button onClick={fetchCveDetails} className="mt-3 text-sm text-destructive underline hover:no-underline">
                {t('errorBanner.retry')}
              </button>
            </div>
          ) : cve ? (
            <>
              {/* Patch Available Alert */}
              {hasPatch(cve.referenceTags) && (
                <div className="rounded-lg border-2 border-green-400 bg-green-50 p-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <Wrench className="h-5 w-5" />
                    <span className="font-bold text-lg">{t('patchAlert.title')}</span>
                  </div>
                  <p className="mt-1 text-sm text-green-600">{t('patchAlert.description')}</p>
                </div>
              )}

              {/* Description */}
              <div>
                <h3 className="font-semibold mb-2 text-foreground">{t('description.heading')}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{cve.description}</p>
              </div>

              {/* CVSS Scores with Aligned Vector Tables */}
              {(cve.cvssV31Score ||
                cve.cvssV30Score ||
                cve.cvssV2Score ||
                (cve.cvssMetrics && cve.cvssMetrics.length > 0)) && (
                <div className="rounded-lg border border-border bg-gradient-to-br from-muted to-card">
                  <button
                    data-testid="cvss-section"
                    onClick={() => setCvssExpanded(!cvssExpanded)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      {t('cvss.heading')}
                    </h3>
                    {cvssExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${cvssExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <div className="border-t border-border p-4 space-y-6">
                      {/* Multiple CVSS Sources Summary */}
                      {cve.cvssMetrics && cve.cvssMetrics.length > 1 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-muted-foreground mb-2 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {t('cvss.multiSourceHeading')}
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-muted">
                                  <th className="text-left p-2 border border-border font-semibold">
                                    {t('cvss.multiTable.source')}
                                  </th>
                                  <th className="text-left p-2 border border-border font-semibold">
                                    {t('cvss.multiTable.type')}
                                  </th>
                                  <th className="text-left p-2 border border-border font-semibold">
                                    {t('cvss.multiTable.version')}
                                  </th>
                                  <th className="text-center p-2 border border-border font-semibold">
                                    {t('cvss.multiTable.score')}
                                  </th>
                                  <th className="text-left p-2 border border-border font-semibold">
                                    {t('cvss.multiTable.severity')}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {cve.cvssMetrics.map((metric, idx) => (
                                  <tr key={idx} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                                    <td className="p-2 border border-border font-medium text-foreground">
                                      {metric.source}
                                    </td>
                                    <td className="p-2 border border-border">
                                      <span
                                        className={`px-2 py-0.5 rounded text-xs font-medium ${metric.type === 'Primary' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}
                                      >
                                        {metric.type}
                                      </span>
                                    </td>
                                    <td className="p-2 border border-border font-mono">
                                      {t('cvss.multiTable.versionPrefix', { version: metric.version })}
                                    </td>
                                    <td className="p-2 border border-border text-center">
                                      <span className={`text-lg font-bold ${getSeverityColor(metric.severity)}`}>
                                        {metric.score.toFixed(1)}
                                      </span>
                                    </td>
                                    <td className="p-2 border border-border">
                                      <span
                                        className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getSeverityBgColor(metric.severity)} ${getSeverityColor(metric.severity)}`}
                                      >
                                        {metric.severity}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* CVSS v3.1 */}
                      {cve.cvssV31Score !== undefined && cve.cvssV31Score > 0 && (
                        <div>
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                              {t('cvss.v31.heading')}
                            </span>
                            <span
                              className={`text-2xl font-bold ${getSeverityColor(cve.cvssV31Severity || cve.severity)}`}
                            >
                              {cve.cvssV31Score.toFixed(1)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getSeverityBgColor(cve.cvssV31Severity || cve.severity)} ${getSeverityColor(cve.cvssV31Severity || cve.severity)}`}
                            >
                              {cve.cvssV31Severity || cve.severity}
                            </span>
                          </div>
                          {cve.cvssV31Vector && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-muted">
                                    <th className="text-left p-2 border border-border font-semibold w-16">
                                      {t('cvss.vectorTable.code')}
                                    </th>
                                    <th className="text-left p-2 border border-border font-semibold">
                                      {t('cvss.vectorTable.metric')}
                                    </th>
                                    <th className="text-center p-2 border border-border font-semibold w-16">
                                      {t('cvss.vectorTable.value')}
                                    </th>
                                    <th className="text-left p-2 border border-border font-semibold">
                                      {t('cvss.vectorTable.description')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {parseCvssVector(cve.cvssV31Vector, t).map((metric, idx) => (
                                    <tr key={metric.code} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                                      <td className="p-2 border border-border font-mono font-bold text-muted-foreground">
                                        {metric.code}
                                      </td>
                                      <td className="p-2 border border-border text-muted-foreground">{metric.name}</td>
                                      <td className="p-2 border border-border text-center font-mono font-bold text-foreground">
                                        {metric.value}
                                      </td>
                                      <td className="p-2 border border-border text-muted-foreground">
                                        {metric.valueName}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* CVSS v3.0 */}
                      {cve.cvssV30Score !== undefined && cve.cvssV30Score > 0 && (
                        <div>
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                              {t('cvss.v30.heading')}
                            </span>
                            <span
                              className={`text-2xl font-bold ${getSeverityColor(cve.cvssV30Severity || cve.severity)}`}
                            >
                              {cve.cvssV30Score.toFixed(1)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getSeverityBgColor(cve.cvssV30Severity || cve.severity)} ${getSeverityColor(cve.cvssV30Severity || cve.severity)}`}
                            >
                              {cve.cvssV30Severity || cve.severity}
                            </span>
                          </div>
                          {cve.cvssV30Vector && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-muted">
                                    <th className="text-left p-2 border border-border font-semibold w-16">
                                      {t('cvss.vectorTable.code')}
                                    </th>
                                    <th className="text-left p-2 border border-border font-semibold">
                                      {t('cvss.vectorTable.metric')}
                                    </th>
                                    <th className="text-center p-2 border border-border font-semibold w-16">
                                      {t('cvss.vectorTable.value')}
                                    </th>
                                    <th className="text-left p-2 border border-border font-semibold">
                                      {t('cvss.vectorTable.description')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {parseCvssVector(cve.cvssV30Vector, t).map((metric, idx) => (
                                    <tr key={metric.code} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                                      <td className="p-2 border border-border font-mono font-bold text-muted-foreground">
                                        {metric.code}
                                      </td>
                                      <td className="p-2 border border-border text-muted-foreground">{metric.name}</td>
                                      <td className="p-2 border border-border text-center font-mono font-bold text-foreground">
                                        {metric.value}
                                      </td>
                                      <td className="p-2 border border-border text-muted-foreground">
                                        {metric.valueName}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* CVSS v2.0 */}
                      {cve.cvssV2Score !== undefined && cve.cvssV2Score > 0 && (
                        <div>
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                              {t('cvss.v2.heading')}
                            </span>
                            <span
                              className={`text-2xl font-bold ${getSeverityColor(cve.cvssV2Severity || cve.severity)}`}
                            >
                              {cve.cvssV2Score.toFixed(1)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getSeverityBgColor(cve.cvssV2Severity || cve.severity)} ${getSeverityColor(cve.cvssV2Severity || cve.severity)}`}
                            >
                              {cve.cvssV2Severity || cve.severity}
                            </span>
                          </div>
                          {cve.cvssV2Vector && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-muted">
                                    <th className="text-left p-2 border border-border font-semibold w-16">
                                      {t('cvss.vectorTable.code')}
                                    </th>
                                    <th className="text-left p-2 border border-border font-semibold">
                                      {t('cvss.vectorTable.metric')}
                                    </th>
                                    <th className="text-center p-2 border border-border font-semibold w-16">
                                      {t('cvss.vectorTable.value')}
                                    </th>
                                    <th className="text-left p-2 border border-border font-semibold">
                                      {t('cvss.vectorTable.description')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {parseCvssVector(cve.cvssV2Vector, t).map((metric, idx) => (
                                    <tr key={metric.code} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                                      <td className="p-2 border border-border font-mono font-bold text-muted-foreground">
                                        {metric.code}
                                      </td>
                                      <td className="p-2 border border-border text-muted-foreground">{metric.name}</td>
                                      <td className="p-2 border border-border text-center font-mono font-bold text-foreground">
                                        {metric.value}
                                      </td>
                                      <td className="p-2 border border-border text-muted-foreground">
                                        {metric.valueName}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Affected Software Configurations (CPE Matches) */}
              {cve.cpeMatches.length > 0 && (
                <div className="rounded-lg border border-border bg-card">
                  <button
                    data-testid="cpe-section"
                    onClick={() => setCpeExpanded(!cpeExpanded)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Layers className="h-5 w-5 text-muted-foreground" />
                      {t('cpe.heading', { count: cve.cpeMatches.filter((m) => m.vulnerable).length })}
                    </h3>
                    {cpeExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${cpeExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <div className="border-t border-border p-4 space-y-3">
                      {cve.cpeMatches
                        .filter((m) => m.vulnerable)
                        .map((match) => {
                          const parsed = parseCpe(match.cpe23Uri)
                          const hasVersionRange =
                            match.versionStartIncluding ||
                            match.versionStartExcluding ||
                            match.versionEndIncluding ||
                            match.versionEndExcluding
                          return (
                            <div key={match.id} className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
                              <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  {/* Product Info */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="font-bold text-foreground">
                                      {parsed.product || t('cpe.unknownProduct')}
                                    </span>
                                    {parsed.vendor && (
                                      <span className="text-muted-foreground text-sm">
                                        {t('cpe.byVendor', { vendor: parsed.vendor })}
                                      </span>
                                    )}
                                  </div>

                                  {/* CPE URI */}
                                  <div className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded mb-2 break-words">
                                    {match.cpe23Uri}
                                  </div>

                                  {/* Version Range */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                                      {t('cpe.affectedVersionsLabel')}
                                    </span>
                                    <span className="text-sm text-red-700 font-medium">
                                      {hasVersionRange
                                        ? formatVersionRange(match, t)
                                        : t('cpe.versionFallback', { version: parsed.version })}
                                    </span>
                                  </div>

                                  {/* Version range details */}
                                  {hasVersionRange && (
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                      {match.versionStartIncluding && (
                                        <span className="bg-muted px-2 py-1 rounded">
                                          <span className="font-medium">{t('cpe.rangeLabel.fromInclusive')}</span>{' '}
                                          {match.versionStartIncluding}
                                        </span>
                                      )}
                                      {match.versionStartExcluding && (
                                        <span className="bg-muted px-2 py-1 rounded">
                                          <span className="font-medium">{t('cpe.rangeLabel.fromExclusive')}</span>{' '}
                                          {match.versionStartExcluding}
                                        </span>
                                      )}
                                      {match.versionEndIncluding && (
                                        <span className="bg-muted px-2 py-1 rounded">
                                          <span className="font-medium">{t('cpe.rangeLabel.toInclusive')}</span>{' '}
                                          {match.versionEndIncluding}
                                        </span>
                                      )}
                                      {match.versionEndExcluding && (
                                        <span className="bg-muted px-2 py-1 rounded">
                                          <span className="font-medium">{t('cpe.rangeLabel.toExclusive')}</span>{' '}
                                          {match.versionEndExcluding}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}

                      {/* Non-vulnerable configurations */}
                      {cve.cpeMatches.filter((m) => !m.vulnerable).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                            {t('cpe.notAffectedHeading')}
                          </h4>
                          <div className="space-y-2">
                            {cve.cpeMatches
                              .filter((m) => !m.vulnerable)
                              .map((match) => {
                                const parsed = parseCpe(match.cpe23Uri)
                                return (
                                  <div
                                    key={match.id}
                                    className="rounded border border-green-200 bg-green-50 p-2 text-sm"
                                  >
                                    <span className="font-medium text-green-700">{parsed.product}</span>
                                    <span className="text-muted-foreground">
                                      {' '}
                                      {t('cpe.notAffectedSuffix', { version: parsed.version })}
                                    </span>
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CWE References */}
              {cve.cweReferences.length > 0 && (
                <div className="rounded-lg border border-border bg-card">
                  <button
                    data-testid="cwe-section"
                    onClick={() => setCweExpanded(!cweExpanded)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                      {t('cwe.heading', { count: cve.cweReferences.length })}
                    </h3>
                    {cweExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${cweExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <div className="border-t border-border p-4">
                      <div className="flex flex-wrap gap-2">
                        {cve.cweReferences.map((cwe) => {
                          const cweNum = cwe.cweId.match(/\d+/)?.[0] || ''
                          return (
                            <a
                              key={cwe.id}
                              href={`https://cwe.mitre.org/data/definitions/${cweNum}.html`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted hover:border-muted-foreground/30 transition-colors"
                            >
                              <span className="font-medium text-foreground">{cwe.cweId}</span>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* External References with Tags */}
              {cve.references.length > 0 && (
                <div className="rounded-lg border border-border bg-card">
                  <button
                    data-testid="references-section"
                    onClick={() => setRefsExpanded(!refsExpanded)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-muted-foreground" />
                      {t('references.heading', { count: cve.references.length })}
                    </h3>
                    {refsExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${refsExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <div className="border-t border-border p-4 space-y-3">
                      {cve.references.map((ref) => {
                        // Collect all tags for this reference
                        const allTags: string[] = []
                        if (ref.referenceType) {
                          allTags.push(ref.referenceType)
                        }
                        if (ref.tags && ref.tags.length > 0) {
                          allTags.push(...ref.tags)
                        }
                        const isPatch = allTags.some((t) => t.toLowerCase().includes('patch'))

                        return (
                          <a
                            key={ref.id}
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-start justify-between rounded-lg border-2 p-3 text-sm hover:bg-muted/50 transition-colors ${
                              isPatch ? 'border-green-300 bg-green-50' : 'border-border bg-card'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              {/* Tags displayed prominently */}
                              {allTags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {allTags.map((tag, idx) => {
                                    const style = getTagStyle(tag)
                                    return (
                                      <span
                                        key={idx}
                                        className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${style.bg} ${style.text}`}
                                      >
                                        {tag}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}

                              {/* URL */}
                              <div className="text-muted-foreground truncate">{ref.url}</div>

                              {/* Source */}
                              {ref.source && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {t('references.source', { source: ref.source })}
                                </div>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 ml-2 mt-0.5" />
                          </a>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <h3 className="font-semibold mb-3 text-foreground flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  {t('timeline.heading')}
                </h3>
                <div className="space-y-2">
                  {cve.publishedAt && (
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground">{t('timeline.published')}</div>
                        <div className="text-sm font-medium text-foreground">{formatDate(cve.publishedAt)}</div>
                      </div>
                    </div>
                  )}
                  {cve.modifiedAt && (
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground">{t('timeline.lastModified')}</div>
                        <div className="text-sm font-medium text-foreground">{formatDate(cve.modifiedAt)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border p-4 bg-muted/50">
          {cve && (
            <a
              href={`https://nvd.nist.gov/vuln/detail/${cve.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              {t('footer.viewOnNvd')}
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t('common:actions.close')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
