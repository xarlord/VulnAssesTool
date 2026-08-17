import { useTranslation } from 'react-i18next'
import type { CvssBreakdown } from '@@/types'
import { formatCvssVector, getSeverityColorHex } from '@/lib/cvss'

interface CvssVectorStringProps {
  breakdown: CvssBreakdown
  showLegend?: boolean
  showSubScores?: boolean
}

/**
 * CVSS Vector String Display Component
 * Shows the CVSS vector string with color-coded metrics and full labels
 */
export function CvssVectorString({ breakdown, showLegend = true, showSubScores = true }: CvssVectorStringProps) {
  const { t } = useTranslation('cvssVectorString')
  const formattedVector = formatCvssVector(breakdown.vectorString)
  const scoreColor = getSeverityColorHex(breakdown.severity)

  const getMetricColor = (metric: string, value: string): string => {
    // Higher risk values - Network, Low complexity, None privileges, Changed scope, High impact
    const isHighRisk =
      (metric === 'AV' && value === 'N') || // Network attack vector
      (metric === 'AC' && value === 'L') || // Low complexity
      (metric === 'PR' && value === 'N') || // No privileges required
      (metric === 'UI' && value === 'N') || // No user interaction
      (metric === 'S' && value === 'C') || // Changed scope
      (['C', 'I', 'A'].includes(metric) && value === 'H') // High impact

    if (isHighRisk) {
      return 'bg-red-100 text-red-700 border-red-300'
    }
    // Medium risk values
    const isMediumRisk =
      (metric === 'AV' && value === 'A') || // Adjacent
      (metric === 'PR' && value === 'L') || // Low privileges
      (metric === 'UI' && value === 'R') || // Required interaction
      (['C', 'I', 'A'].includes(metric) && value === 'L') // Low impact

    if (isMediumRisk) {
      return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    }
    // Lower risk values
    return 'bg-green-100 text-green-700 border-green-300'
  }

  return (
    <div className="space-y-4">
      {/* Prominent Score Display */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
        <div className="flex-shrink-0">
          <div className="text-4xl font-extrabold tracking-tight" style={{ color: scoreColor }}>
            {breakdown.scores.baseScore}
          </div>
          <div className="text-xs text-gray-500 font-medium">{t('scoreCard.title')}</div>
        </div>
        <div className="flex-1">
          <div
            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide"
            style={{
              backgroundColor: `${scoreColor}20`,
              color: scoreColor,
              border: `2px solid ${scoreColor}40`,
            }}
          >
            {t('scoreCard.severityLabel', { severity: breakdown.severity })}
          </div>
        </div>
      </div>

      {/* Sub-scores: Impact and Exploitability */}
      {showSubScores && (
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">
              {t('subScores.impactTitle')}
            </div>
            <div className="text-2xl font-bold text-blue-800">{breakdown.scores.impactSubScore}</div>
            <div className="text-xs text-blue-700 mt-1">{t('subScores.impactDescription')}</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-purple-50 border border-purple-200">
            <div className="text-xs text-purple-600 font-medium uppercase tracking-wide mb-1">
              {t('subScores.exploitabilityTitle')}
            </div>
            <div className="text-2xl font-bold text-purple-800">{breakdown.scores.exploitabilitySubScore}</div>
            <div className="text-xs text-purple-500 mt-1">{t('subScores.exploitabilityDescription')}</div>
          </div>
        </div>
      )}

      {/* Vector String with Full Labels */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">{t('vector.title')}</h4>
        <div className="flex flex-wrap gap-1">
          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
            {t('vector.versionBadge', { version: breakdown.version })}
          </span>
          {formattedVector.map((part, index) => (
            <span
              key={index}
              className={`rounded border px-2 py-1 text-xs font-semibold ${getMetricColor(part.abbreviation, part.value)}`}
              title={t('vector.partTooltip', { label: part.label, fullLabel: part.fullLabel })}
            >
              {part.abbreviation}:{part.value}
            </span>
          ))}
        </div>
      </div>

      {/* Legend with Full Labels */}
      {showLegend && (
        <div className="mt-3 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">{t('legend.title')}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {formattedVector.map((part) => (
              <div
                key={part.abbreviation}
                className="flex items-center gap-2 p-2 rounded bg-gray-50 border border-gray-200"
              >
                <span className="font-mono font-semibold text-gray-800 bg-gray-200 px-1.5 py-0.5 rounded">
                  {part.abbreviation}:{part.value}
                </span>
                <span className="text-gray-600">
                  <span className="font-medium">{t('legend.labelPrefix', { label: part.label })}</span> {part.fullLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
