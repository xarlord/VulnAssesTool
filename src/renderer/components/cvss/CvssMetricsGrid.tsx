import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { CvssBreakdown } from '@@/types'

interface CvssMetricsGridProps {
  breakdown: CvssBreakdown
  expanded?: boolean
  onToggle?: () => void
}

/**
 * CVSS Metrics Grid Component
 * Displays detailed metric explanations in a grid layout
 */
export const CvssMetricsGrid = React.memo(function CvssMetricsGrid({
  breakdown,
  expanded = false,
  onToggle,
}: CvssMetricsGridProps) {
  const { t } = useTranslation('cvssMetricsGrid')
  const [isExpanded, setIsExpanded] = React.useState(expanded)

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
    onToggle?.()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">{t('title')}</h4>
        <button onClick={handleToggle} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          {isExpanded ? (
            <>
              <span>{t('toggle.hide')}</span>
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              <span>{t('toggle.show')}</span>
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="grid gap-3 md:grid-cols-2">
          {breakdown.explanations.map((explanation) => (
            <MetricCard key={explanation.metric} explanation={explanation} />
          ))}
        </div>
      )}

      {isExpanded && breakdown.temporalMetrics && <TemporalMetricsBlock temporal={breakdown.temporalMetrics} />}
    </div>
  )
})

interface TemporalMetricsBlockProps {
  temporal: NonNullable<CvssBreakdown['temporalMetrics']>
}

/**
 * Renders the optional CVSS temporal metrics (E/RL/RC) when the vector supplies them (FR-04.3).
 * Only the metrics actually present are shown, so a base-only vector renders nothing here.
 */
function TemporalMetricsBlock({ temporal }: TemporalMetricsBlockProps) {
  const { t } = useTranslation('cvssMetricsGrid')
  const rows: Array<{ label: string; value: string }> = []
  if (temporal.exploitCodeMaturity)
    rows.push({ label: t('temporal.exploitCodeMaturity'), value: temporal.exploitCodeMaturity })
  if (temporal.remediationLevel) rows.push({ label: t('temporal.remediationLevel'), value: temporal.remediationLevel })
  if (temporal.reportConfidence) rows.push({ label: t('temporal.reportConfidence'), value: temporal.reportConfidence })

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <h5 className="text-xs font-semibold text-gray-700">{t('temporal.title')}</h5>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">{row.label}</span>
              <span className="text-xs font-bold text-gray-900">{row.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface MetricCardProps {
  explanation: {
    metric: string
    value: string
    description: string
    implications: string
    example: string
  }
}

function MetricCard({ explanation }: MetricCardProps) {
  const { t } = useTranslation('cvssMetricsGrid')
  const getValueColor = (metric: string, value: string): string => {
    // Which value is HIGH risk depends on the metric, not the value string alone: "None" is high
    // risk for Privileges Required / User Interaction but LOW risk for the C/I/A impacts, and
    // "High" is high risk for the impacts but LOW risk for Privileges Required. The old blanket
    // list painted PR:High and Impact:None red, contradicting the implications text below.
    const base = metric.replace(/\s*\([^)]*\)\s*$/, '').trim() // strip a trailing "(AV)" abbreviation
    const highRiskByMetric: Record<string, string[]> = {
      'Attack Vector': ['Network'],
      'Attack Complexity': ['Low'],
      'Privileges Required': ['None'],
      'User Interaction': ['None'],
      Scope: ['Changed'],
      Confidentiality: ['High'],
      Integrity: ['High'],
      Availability: ['High'],
      'Confidentiality Impact': ['High'],
      'Integrity Impact': ['High'],
      'Availability Impact': ['High'],
    }
    return highRiskByMetric[base]?.includes(value) ? 'text-red-600' : 'text-green-600'
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h5 className="text-xs font-semibold text-gray-700">{explanation.metric}</h5>
        <span className={`text-xs font-bold ${getValueColor(explanation.metric, explanation.value)}`}>
          {explanation.value}
        </span>
      </div>
      <p className="mb-2 text-xs text-gray-600">{explanation.description}</p>
      <div className="mb-1 text-xs">
        <span className="font-semibold text-gray-700">{t('metricCard.impact')}</span>
        <span className="text-gray-600">{explanation.implications}</span>
      </div>
      <div className="text-xs">
        <span className="font-semibold text-gray-700">{t('metricCard.example')}</span>
        <span className="text-gray-600">{explanation.example}</span>
      </div>
    </div>
  )
}
