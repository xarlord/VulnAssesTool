/**
 * Compliance Status Widget
 * Shows regulatory compliance indicators and SLA metrics
 */

import React from 'react'
import { Shield, CheckCircle, AlertCircle, Clock, TrendingUp } from 'lucide-react'
import type { ComplianceMetrics } from '@/lib/analytics'

interface ComplianceStatusProps {
  compliance: ComplianceMetrics
}

export function ComplianceStatus({ compliance }: ComplianceStatusProps) {
  const getComplianceStatus = (score: number) => {
    if (score >= 90) return { color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle }
    if (score >= 70) return { color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: AlertCircle }
    return { color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertCircle }
  }

  const slaStatus = getComplianceStatus(compliance.slaCompliance.slaOverall)
  const SlaIcon = slaStatus.icon

  const metrics = [
    {
      label: 'Overall SLA',
      value: `${compliance.slaCompliance.slaOverall}%`,
      target: '80%',
      status: compliance.slaCompliance.slaOverall >= 80,
    },
    {
      label: 'Critical SLA',
      value: `${compliance.slaCompliance.slaCritical}%`,
      target: '90%',
      status: compliance.slaCompliance.slaCritical >= 90,
    },
    {
      label: 'High SLA',
      value: `${compliance.slaCompliance.slaHigh}%`,
      target: '70%',
      status: compliance.slaCompliance.slaHigh >= 70,
    },
    {
      label: 'Scan Coverage',
      value: `${compliance.scanCoverage}%`,
      target: '80%',
      status: compliance.scanCoverage >= 80,
    },
    {
      label: 'Data Freshness',
      value: `${compliance.dataFreshness}%`,
      target: '70%',
      status: compliance.dataFreshness >= 70,
    },
    {
      label: 'Remediation Rate',
      value: `${compliance.remediationRate}%`,
      target: '60%',
      status: compliance.remediationRate >= 60,
    },
  ]

  const ProgressBar = ({ value, target }: { value: number; target: number }) => {
    const percentage = Math.min(100, (value / target) * 100)
    const color = value >= target ? 'bg-green-500' : 'bg-yellow-500'

    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">Compliance Status</h3>
        <div className={`p-2 rounded-lg ${slaStatus.bgColor}`}>
          <SlaIcon className={`w-4 h-4 ${slaStatus.color}`} />
        </div>
      </div>

      {/* Overall SLA Badge */}
      <div className="text-center mb-4 p-3 bg-muted rounded-lg">
        <div className="text-xs text-muted-foreground mb-1">Overall SLA Compliance</div>
        <div className={`text-3xl font-bold ${slaStatus.color}`}>{compliance.slaCompliance.slaOverall}%</div>
        <div className="text-xs text-muted-foreground mt-1">Target: 80%</div>
      </div>

      {/* Detailed Metrics */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {metrics.map((metric) => {
          const status = getComplianceStatus(parseFloat(metric.value))
          const StatusIcon = status.icon

          return (
            <div key={metric.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon className={`w-3 h-3 ${status.color}`} />
                  <span className="text-xs font-medium text-foreground">{metric.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{metric.value}</span>
                  <span className="text-xs text-muted-foreground">/ {metric.target}</span>
                </div>
              </div>
              <ProgressBar value={parseFloat(metric.value)} target={parseFloat(metric.target)} />
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t pt-3 mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Next compliance review</span>
          <span className="font-medium text-foreground">
            {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  )
}
