import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTranslation } from 'react-i18next'
import type { HealthSnapshot } from '@/lib/health/healthHistory'

interface HealthTrendChartProps {
  history: HealthSnapshot[]
}

/**
 * Line chart of a project's average health score over time (FR-05.3). Needs at least two
 * daily points to draw a trend; below that it explains how history accrues instead of
 * rendering an empty axis.
 */
export function HealthTrendChart({ history }: HealthTrendChartProps) {
  const { t } = useTranslation('healthTrendChart')

  if (history.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t('emptyState')}
      </div>
    )
  }

  const points = history.map((point) => `${point.date}: ${point.score}`).join(', ')
  const ariaLabel = t('ariaLabel', { points })

  return (
    <div className="h-64" style={{ minHeight: '256px', minWidth: '300px' }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={256}>
        <LineChart data={history} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" fontSize={12} tickMargin={8} />
          <YAxis domain={[0, 100]} fontSize={12} width={32} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
