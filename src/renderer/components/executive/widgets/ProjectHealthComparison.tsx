/**
 * Project Health Comparison Widget
 * Bar chart comparing health scores across projects
 */

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { useTranslation } from 'react-i18next'
import type { ProjectMetrics } from '@/lib/analytics'
import { getHealthCategory, getHealthChartColor } from '@/lib/health'

interface ProjectHealthComparisonProps {
  projectMetrics: ProjectMetrics[]
}

export function ProjectHealthComparison({ projectMetrics }: ProjectHealthComparisonProps) {
  const { t } = useTranslation('projectHealthComparison')
  // Get top 8 projects by risk (worst health first)
  const topProjects = projectMetrics.slice(0, 8)

  const data = topProjects.map((p) => ({
    name: p.projectName.length > 15 ? p.projectName.substring(0, 15) + '...' : p.projectName,
    healthScore: p.healthScore,
    fullName: p.projectName,
    projectId: p.projectId,
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-foreground">{data.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {t('tooltip.healthScoreLabel')}
            <span className="font-semibold text-foreground">
              {data.healthScore}
              {t('tooltip.healthScoreSuffix')}
            </span>
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">{t('title')}</h3>
        <div className="text-xs text-muted-foreground">{t('topProjectsCount', { count: topProjects.length })}</div>
      </div>

      <div className="flex-1">
        {data.length > 0 ? (
          <div
            role="img"
            aria-label={t('chart.ariaLabel', {
              count: data.length,
              list: data
                .map((entry) => t('chart.ariaLabelItem', { name: entry.fullName, score: entry.healthScore }))
                .join(', '),
            })}
            className="h-full"
          >
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
                    <Cell key={`cell-${index}`} fill={getHealthChartColor(getHealthCategory(entry.healthScore))} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{t('noData')}</div>
        )}
      </div>
    </div>
  )
}
