import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { getHealthChartColor } from '@/lib/health'
import type { ComponentHealth } from '@@/types'

interface HealthDistributionChartProps {
  distribution: Record<ComponentHealth['category'], number>
}

export default function HealthDistributionChart({ distribution }: HealthDistributionChartProps) {
  const chartData = [
    { name: 'Excellent', value: distribution.excellent, color: getHealthChartColor('excellent') },
    { name: 'Good', value: distribution.good, color: getHealthChartColor('good') },
    { name: 'Fair', value: distribution.fair, color: getHealthChartColor('fair') },
    { name: 'Poor', value: distribution.poor, color: getHealthChartColor('poor') },
    { name: 'Critical', value: distribution.critical, color: getHealthChartColor('critical') },
  ].filter((item) => item.value > 0)

  if (chartData.length === 0) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">No health data available</div>
  }

  return (
    <div className="h-64" style={{ minHeight: '256px', minWidth: '300px' }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={256}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(entry) => `${entry.name}: ${entry.value}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
