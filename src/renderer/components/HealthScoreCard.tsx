import React, { useState } from 'react'
import { Shield, TrendingUp, TrendingDown, Minus, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { getHealthColor, getTrendColor } from '@/lib/health'
import type { ComponentHealth, Component } from '@@/types'

interface HealthScoreCardProps {
  component: Component
  health: ComponentHealth
  showFactors?: boolean
  onViewDetails?: (component: Component) => void
}

const HealthScoreCard = React.memo(function HealthScoreCard({
  component,
  health,
  showFactors: initialShowFactors = false,
  onViewDetails,
}: HealthScoreCardProps) {
  const [showFactors, setShowFactors] = useState(initialShowFactors)

  const TrendIcon =
    health.trend === 'improving'
      ? TrendingUp
      : health.trend === 'degrading'
        ? TrendingDown
        : health.trend === 'stable'
          ? Minus
          : HelpCircle

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <Shield
            className={`h-5 w-5 ${
              health.category === 'critical' || health.category === 'poor'
                ? 'text-destructive'
                : health.category === 'fair'
                  ? 'text-yellow-600'
                  : 'text-primary'
            }`}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">{component.name}</h3>
              <span className="text-sm text-muted-foreground">{component.version}</span>
            </div>

            <div className="mt-2 flex items-center gap-3">
              {/* Health Score Badge */}
              <div className={`rounded-full border px-3 py-1 text-sm font-medium ${getHealthColor(health.category)}`}>
                {health.score}/100
              </div>

              {/* Category Badge */}
              <span
                className={`rounded-full border px-2 py-1 text-xs font-medium capitalize ${getHealthColor(
                  health.category,
                )}`}
              >
                {health.category}
              </span>

              {/* Trend Indicator */}
              {health.trend !== 'unknown' && (
                <div className={`flex items-center gap-1 text-xs ${getTrendColor(health.trend)}`}>
                  <TrendIcon className="h-3.5 w-3.5" />
                  <span className="capitalize">{health.trend}</span>
                </div>
              )}
            </div>

            {/* Factor Breakdown Toggle */}
            {(health.factors.vulnerabilityScore > 0 ||
              health.factors.ageScore > 0 ||
              health.factors.patchScore > 0 ||
              health.factors.versionScore > 0) && (
              <button
                onClick={() => setShowFactors(!showFactors)}
                className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showFactors ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show details
                  </>
                )}
              </button>
            )}

            {/* Factor Breakdown */}
            {showFactors && (
              <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Vulnerabilities:</span>
                    <span
                      className={
                        health.factors.vulnerabilityScore > 0 ? 'text-destructive font-medium' : 'text-green-600'
                      }
                    >
                      -{health.factors.vulnerabilityScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Age:</span>
                    <span className={health.factors.ageScore > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                      -{health.factors.ageScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Patches:</span>
                    <span className={health.factors.patchScore > 0 ? 'text-yellow-600 font-medium' : 'text-green-600'}>
                      -{health.factors.patchScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Version:</span>
                    <span className={health.factors.versionScore > 0 ? 'text-blue-600 font-medium' : 'text-green-600'}>
                      -{health.factors.versionScore}
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-border text-xs text-center text-muted-foreground">
                  Total penalty: -
                  {health.factors.vulnerabilityScore +
                    health.factors.ageScore +
                    health.factors.patchScore +
                    health.factors.versionScore}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* View Details Button */}
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(component)}
            className="text-sm text-primary hover:underline whitespace-nowrap"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  )
})
export default HealthScoreCard
