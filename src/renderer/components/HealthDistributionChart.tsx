import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { useTranslation } from 'react-i18next'
import { getHealthChartColor } from '@/lib/health'
import type { ComponentHealth } from '@@/types'

interface HealthDistributionChartProps {
  distribution: Record<ComponentHealth['category'], number>
}

export function HealthDistributionChart({ distribution }: HealthDistributionChartProps) {
  const { t } = useTranslation('healthDistributionChart')

  const chartData = [
    { name: t('categories.excellent'), value: distribution.excellent, color: getHealthChartColor('excellent') },
    { name: t('categories.good'), value: distribution.good, color: getHealthChartColor('good') },
    { name: t('categories.fair'), value: distribution.fair, color: getHealthChartColor('fair') },
    { name: t('categories.poor'), value: distribution.poor, color: getHealthChartColor('poor') },
    { name: t('categories.critical'), value: distribution.critical, color: getHealthChartColor('critical') },
  ].filter((item) => item.value > 0)

  if (chartData.length === 0) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">{t('empty')}</div>
  }

  const ariaLabel = t('ariaLabel', {
    list: chartData.map((item) => t('itemFormat', { name: item.name, value: item.value })).join(', '),
  })

  return (
    <div className="h-64" style={{ minHeight: '256px', minWidth: '300px' }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={256}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(entry) => t('itemFormat', { name: entry.name, value: entry.value })}
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
