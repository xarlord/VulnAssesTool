/**
 * Action Items Widget
 * Shows critical items requiring attention
 */

import React from 'react'
import { AlertTriangle, AlertCircle, Info, CheckCircle2, ArrowRight } from 'lucide-react'
import type { Recommendation, RiskItem } from '@/lib/analytics'

interface ActionItemsProps {
  recommendations: Recommendation[]
  topRisks: RiskItem[]
  onProjectClick?: (projectId: string) => void
}

export function ActionItems({ recommendations, topRisks, onProjectClick }: ActionItemsProps) {
  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'immediate':
        return {
          icon: AlertTriangle,
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
        }
      case 'high':
        return {
          icon: AlertCircle,
          color: 'text-orange-600',
          bgColor: 'bg-orange-100',
          borderColor: 'border-orange-200',
        }
      case 'medium':
        return {
          icon: Info,
          color: 'text-amber-700 dark:text-amber-400',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
        }
      case 'low':
        return {
          icon: CheckCircle2,
          color: 'text-blue-600',
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

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { color: 'text-red-600', bgColor: 'bg-red-100' }
      case 'high':
        return { color: 'text-orange-600', bgColor: 'bg-orange-100' }
      case 'medium':
        return { color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-yellow-100' }
      case 'low':
        return { color: 'text-green-600', bgColor: 'bg-green-100' }
      default:
        return { color: 'text-gray-600', bgColor: 'bg-gray-100' }
    }
  }

  const topRecommendations = recommendations.slice(0, 5)

  return (
    <div className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">Action Items</h3>
        <div className="text-xs text-muted-foreground">
          {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
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
                    <span className="text-xs text-muted-foreground">Effort: {rec.effort}</span>
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
                  <div className={`p-1 rounded ${config.bgColor}`}>
                    <AlertTriangle className={`w-3 h-3 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{risk.projectName}</div>
                    <div className="text-xs text-muted-foreground truncate">{risk.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${config.color}`}>{risk.risk}</span>
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
            +{recommendations.length - 5} more recommendation{recommendations.length - 5 !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
