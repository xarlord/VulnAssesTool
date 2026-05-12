import React from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { Vulnerability } from '@@/types'
import { SEVERITY_COLORS } from '@@/constants'

interface SeverityDistributionChartProps {
  vulnerabilities: Vulnerability[]
  height?: number
  showLegend?: boolean
  showLabels?: boolean
}

export interface SeverityDistributionItem {
  name: string
  value: number
  color: string
}

/**
 * Calculate severity distribution from vulnerabilities
 * @internal - exported for testing
 */
export function calculateSeverityDistribution(vulnerabilities: Vulnerability[]): SeverityDistributionItem[] {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  }

  for (const vuln of vulnerabilities) {
    counts[vuln.severity]++
  }

  return [
    { name: 'Critical', value: counts.critical, color: SEVERITY_COLORS.critical },
    { name: 'High', value: counts.high, color: SEVERITY_COLORS.high },
    { name: 'Medium', value: counts.medium, color: SEVERITY_COLORS.medium },
    { name: 'Low', value: counts.low, color: SEVERITY_COLORS.low },
    { name: 'None', value: counts.none, color: SEVERITY_COLORS.none },
  ].filter((item) => item.value > 0)
}

/**
 * Severity Distribution Chart Component
 * Displays a donut chart showing the distribution of vulnerabilities by severity
 */
export const SeverityDistributionChart = React.memo(function SeverityDistributionChart({
  vulnerabilities,
  height = 300,
  showLegend = true,
  showLabels = true,
}: SeverityDistributionChartProps) {
  // Calculate distribution
  const distribution = React.useMemo(() => {
    return calculateSeverityDistribution(vulnerabilities)
  }, [vulnerabilities])

  const total = distribution.reduce((sum, item) => sum + item.value, 0)

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <p className="text-sm">No vulnerabilities found</p>
      </div>
    )
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const percentage = ((data.value / total) * 100).toFixed(1)
      return (
        <div className="rounded-lg border bg-white px-3 py-2 shadow-md">
          <p className="text-sm font-semibold">{data.name}</p>
          <p className="text-xs text-gray-600">
            {data.value} vulnerabilities ({percentage}%)
          </p>
        </div>
      )
    }
    return null
  }

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (!showLabels) return null

    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={distribution}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={CustomLabel}
          outerRadius={80}
          innerRadius={50}
          paddingAngle={2}
          dataKey="value"
        >
          {distribution.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        {showLegend && (
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value, entry: any) => (
              <span className="text-sm text-gray-700">
                {value}: {entry.payload.value}
              </span>
            )}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  )
})
