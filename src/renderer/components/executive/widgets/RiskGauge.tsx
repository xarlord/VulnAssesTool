/**
 * Risk Gauge Widget
 * Displays overall risk level with a visual gauge
 */

import React from 'react'
import { Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import type { OverallMetrics } from '@/lib/analytics'

interface RiskGaugeProps {
  metrics: OverallMetrics
}

export function RiskGauge({ metrics }: RiskGaugeProps) {
  const getRiskConfig = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return {
          icon: ShieldX,
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          gaugeColor: 'from-red-500 to-red-600',
          percentage: 10,
        }
      case 'high':
        return {
          icon: ShieldAlert,
          color: 'text-orange-700 dark:text-orange-400',
          bgColor: 'bg-orange-100',
          gaugeColor: 'from-orange-500 to-orange-600',
          percentage: 35,
        }
      case 'medium':
        return {
          icon: ShieldAlert,
          color: 'text-amber-700 dark:text-amber-400',
          bgColor: 'bg-yellow-100',
          gaugeColor: 'from-yellow-500 to-yellow-600',
          percentage: 55,
        }
      case 'low':
        return {
          icon: Shield,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          gaugeColor: 'from-green-500 to-green-600',
          percentage: 80,
        }
      case 'excellent':
        return {
          icon: ShieldCheck,
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-100',
          gaugeColor: 'from-emerald-500 to-emerald-600',
          percentage: 95,
        }
      default:
        return {
          icon: Shield,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          gaugeColor: 'from-gray-500 to-gray-600',
          percentage: 50,
        }
    }
  }

  const config = getRiskConfig(metrics.riskLevel)
  const Icon = config.icon

  return (
    <div className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">Overall Risk Level</h3>
        <div className={`p-2 rounded-lg ${config.bgColor}`}>
          <Icon className={`w-5 h-5 ${config.color}`} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Gauge */}
        <div className="relative w-40 h-20 overflow-hidden">
          <div className="absolute inset-0 bg-gray-200 rounded-t-full"></div>
          <div
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t ${config.gaugeColor} rounded-t-full transition-all duration-500`}
            style={{ height: `${config.percentage}%` }}
          ></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center mt-4">
              <div className={`text-3xl font-bold ${config.color}`}>
                {metrics.riskLevel.charAt(0).toUpperCase() + metrics.riskLevel.slice(1)}
              </div>
            </div>
          </div>
        </div>

        {/* Health Score */}
        <div className="mt-4 text-center">
          <div className="text-2xl font-bold text-foreground">
            {metrics.averageHealthScore}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </div>
          <div className="text-xs text-muted-foreground">Health Score</div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
        <div className="text-center p-2 bg-muted rounded">
          <div className="font-semibold text-red-600">{metrics.criticalCount}</div>
          <div className="text-muted-foreground">Critical</div>
        </div>
        <div className="text-center p-2 bg-muted rounded">
          <div className="font-semibold text-orange-600">{metrics.highCount}</div>
          <div className="text-muted-foreground">High</div>
        </div>
      </div>
    </div>
  )
}
