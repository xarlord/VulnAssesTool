/**
 * Team Productivity Widget
 * Shows scans completed, SBOMs processed, and other productivity metrics
 */

import React from 'react'
import { Activity, FileText, Scan, Clock, Calendar } from 'lucide-react'
import type { ProductivityMetrics } from '@/lib/analytics'

interface TeamProductivityProps {
  productivity: ProductivityMetrics
}

export function TeamProductivity({ productivity }: TeamProductivityProps) {
  const stats = [
    {
      label: 'Total Scans',
      value: productivity.totalScans,
      icon: Scan,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'SBOMs Processed',
      value: productivity.sbomsProcessed,
      icon: FileText,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      label: 'Components Analyzed',
      value: productivity.componentsAnalyzed.toLocaleString(),
      icon: Activity,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      label: 'Vulnerabilities Assessed',
      value: productivity.vulnerabilitiesAssessed.toLocaleString(),
      icon: Activity,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ]

  const recentActivity = [
    {
      label: 'This Week',
      value: productivity.scansThisWeek,
      icon: Calendar,
    },
    {
      label: 'This Month',
      value: productivity.scansThisMonth,
      icon: Calendar,
    },
    {
      label: 'Avg Scan Time',
      value: `${productivity.averageScanTime}m`,
      icon: Clock,
    },
  ]

  return (
    <div className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">Team Productivity</h3>
        <Activity className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-muted rounded-lg p-3">
              <div className={`inline-flex p-2 rounded-lg ${stat.bgColor} mb-2`}>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </div>
          )
        })}
      </div>

      {/* Recent Activity */}
      <div className="border-t pt-4 mt-auto">
        <div className="text-xs font-semibold text-foreground mb-3">Recent Activity</div>
        <div className="space-y-2">
          {recentActivity.map((activity) => {
            const Icon = activity.icon
            return (
              <div key={activity.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{activity.label}</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{activity.value}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
