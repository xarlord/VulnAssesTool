/**
 * Action Items Widget
 * Shows critical items requiring attention
 */

import { AlertTriangle, AlertCircle, Info, CheckCircle2, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Recommendation, RiskItem } from '@/lib/analytics'
import { getSeverityClass, getSeverityTextClass, type Severity } from '@/lib/severity'

/**
 * The Severity union is lowercase, so normalize (falling back to 'none' for unrecognized or
 * missing values) before looking up a token class — same approach as Search.tsx:420.
 */
function normalizeSeverity(severity?: string): Severity {
  const s = severity?.toLowerCase()
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low' || s === 'none') return s
  return 'none'
}

interface ActionItemsProps {
  recommendations: Recommendation[]
  topRisks: RiskItem[]
  onProjectClick?: (projectId: string) => void
}

export function ActionItems({ recommendations, topRisks, onProjectClick }: ActionItemsProps) {
  const { t } = useTranslation('actionItems')

  // These are priority/severity scales, NOT the Severity union, so they can't use lib/severity's
  // token classes: `immediate` has no severity equivalent and `low` is deliberately blue here.
  // The shades are therefore chosen to clear WCAG AA against the bg-*-100 card they render on
  // (both sides hardcoded, so the ratio is the same in either theme). Measured: the previous
  // text-red-600 was 3.95:1, text-orange-600 3.11:1, text-green-600 3.00:1, and
  // `text-amber-700 dark:text-amber-400` was 1.55:1 in dark mode — that last one had a dark TEXT
  // variant with no matching dark BACKGROUND, so amber-400 landed on light bg-yellow-100. Do not
  // "restore" a -600 shade or re-add a bare dark: text variant; the a11y contrast sweep on a
  // populated /executive measures these directly and will fail.
  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'immediate':
        return {
          icon: AlertTriangle,
          color: 'text-red-700',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
        }
      case 'high':
        return {
          icon: AlertCircle,
          color: 'text-orange-800',
          bgColor: 'bg-orange-100',
          borderColor: 'border-orange-200',
        }
      case 'medium':
        return {
          icon: Info,
          color: 'text-amber-800',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
        }
      case 'low':
        return {
          icon: CheckCircle2,
          color: 'text-blue-700',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
        }
      default:
        return {
          icon: Info,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
        }
    }
  }

  // Unlike getPriorityConfig above, this IS the Severity union, so it uses lib/severity's tokens.
  // It has to: its two consumers render on DIFFERENT surfaces. `badgeClass` fills the small icon
  // box with an AA-verified fg/bg pair, while `textClass` colors the risk score sitting directly
  // on the theme-aware `bg-muted` row. A single hardcoded shade cannot satisfy both — darkening
  // the text for the light icon box drove the score to 2.21:1 on the dark row, which is what the
  // /executive contrast sweep caught. The tokens resolve per theme, so each surface stays AA.
  const getSeverityConfig = (severity: string) => {
    const normalized = normalizeSeverity(severity)
    return { badgeClass: getSeverityClass(normalized), textClass: getSeverityTextClass(normalized) }
  }

  const topRecommendations = recommendations.slice(0, 5)

  return (
    <div className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">{t('title')}</h3>
        <div className="text-xs text-muted-foreground">
          {t('recommendationCount', { count: recommendations.length })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Recommendations */}
        {topRecommendations.map((rec) => {
          const config = getPriorityConfig(rec.priority)
          const Icon = config.icon

          return (
            <div
              key={rec.title}
              className={`p-3 rounded-lg border ${config.borderColor} ${config.bgColor} hover:opacity-80 transition-opacity`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`w-4 h-4 ${config.color} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold uppercase ${config.color}`}>{rec.priority}</span>
                    <span className="text-xs text-muted-foreground">{t('effort', { effort: rec.effort })}</span>
                  </div>
                  <div className="text-sm font-medium text-foreground mb-1">{rec.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{rec.description}</div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Top Risks */}
        {topRisks.slice(0, 3).map((risk) => {
          const config = getSeverityConfig(risk.severity)

          return (
            <div
              key={risk.projectId}
              className="p-3 rounded-lg border border-gray-200 bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
              onClick={() => onProjectClick?.(risk.projectId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`p-1 rounded ${config.badgeClass}`}>
                    <AlertTriangle className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{risk.projectName}</div>
                    <div className="text-xs text-muted-foreground truncate">{risk.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${config.textClass}`}>{risk.risk}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {recommendations.length > 5 && (
        <div className="border-t pt-3 mt-3 text-center">
          <div className="text-xs text-muted-foreground">
            {t('moreRecommendations', { count: recommendations.length - 5 })}
          </div>
        </div>
      )}
    </div>
  )
}
