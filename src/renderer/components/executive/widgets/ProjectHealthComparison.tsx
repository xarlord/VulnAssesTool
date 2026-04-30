/**
 * Project Health Comparison Widget
 * Bar chart comparing health scores across projects
 */

import React from 'react'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import type { ProjectMetrics } from '@/lib/analytics'

interface ProjectHealthComparisonProps {
  projectMetrics: ProjectMetrics[]
}

export function ProjectHealthComparison({ projectMetrics }: ProjectHealthComparisonProps) {
  // Get top 8 projects by risk (worst health first)
  const topProjects = projectMetrics.slice(0, 8)

  const data = topProjects.map((p) => ({
    name: p.projectName.length > 15 ? p.projectName.substring(0, 15) + '...' : p.projectName,
    healthScore: p.healthScore,
    fullName: p.projectName,
    projectId: p.projectId,
  }))

  const getHealthColor = (score: number): string => {
    if (score >= 90) return '#10b981' // green
    if (score >= 70) return '#22c55e' // light green
    if (score >= 50) return '#eab308' // yellow
    if (score >= 30) return '#f97316' // orange
    return '#ef4444' // red
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-foreground">{data.fullName}</p>
          <p className="text-sm text-muted-foreground">
            Health Score: <span className="font-semibold text-foreground">{data.healthScore}/100</span>
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">Project Health Comparison</h3>
        <div className="text-xs text-muted-foreground">Top {topProjects.length} projects</div>
      </div>

      <div className="flex-1">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={75}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="healthScore" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getHealthColor(entry.healthScore)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No project data available
          </div>
        )}
      </div>
    </div>
  )
}
