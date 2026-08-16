import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { getHealthChartColor, getTrendColor } from '@/lib/health'
import type { ProjectHealthSummary, ComponentHealth, Component } from '@@/types'

const HealthDistributionChart = lazy(() =>
  import('./HealthDistributionChart').then((m) => ({ default: m.HealthDistributionChart })),
)

interface HealthDashboardProps {
  projectHealth: ProjectHealthSummary
  componentHealths: ComponentHealth[]
  components: Component[]
  onViewComponent?: (component: Component) => void
}

export function HealthDashboard({
  projectHealth,
  componentHealths: _componentHealths,
  components: _components,
  onViewComponent: _onViewComponent,
}: HealthDashboardProps) {
  const { t } = useTranslation('healthDashboard')
  const TrendIcon =
    projectHealth.trend === 'improving' ? TrendingUp : projectHealth.trend === 'degrading' ? TrendingDown : Minus

  return (
    <div className="space-y-6">
      {/* Info banner when all components are excellent */}
      {projectHealth.totalComponents > 0 &&
        projectHealth.distribution.excellent === projectHealth.totalComponents &&
        projectHealth.averageScore === 100 && (
          <div className="flex items-start gap-3 rounded-md bg-blue-500/15 p-4">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-blue-600">{t('banners.allExcellent.title')}</p>
              <p className="text-sm text-blue-600 mt-1">{t('banners.allExcellent.description')}</p>
            </div>
          </div>
        )}

      {/* Info banner when trend is unknown */}
      {projectHealth.trend === 'unknown' && projectHealth.totalComponents > 0 && (
        <div className="flex items-start gap-3 rounded-md bg-gray-500/15 p-4">
          <Info className="h-5 w-5 text-gray-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-gray-600">{t('banners.noHistoricalData.title')}</p>
            <p className="text-sm text-gray-600 mt-1">{t('banners.noHistoricalData.description')}</p>
          </div>
        </div>
      )}

      {/* Overall Health Score */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('stats.averageHealthScore')}</p>
              <p className="mt-2 text-3xl font-bold">
                {Math.round(projectHealth.averageScore)}
                <span className="text-lg text-muted-foreground">{t('stats.scoreSuffix')}</span>
              </p>
            </div>
            <Shield className="h-8 w-8 text-primary" />
          </div>
          {projectHealth.trend !== 'unknown' && (
            <div className={`mt-3 flex items-center gap-1.5 text-sm ${getTrendColor(projectHealth.trend)}`}>
              <TrendIcon className="h-4 w-4" />
              <span className="capitalize">{projectHealth.trend}</span>
            </div>
          )}
        </div>

        {/* Total Components */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('stats.totalComponents')}</p>
              <p className="mt-2 text-3xl font-bold">{projectHealth.totalComponents}</p>
            </div>
            <Shield className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>

        {/* Components Needing Attention */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('stats.needsAttention')}</p>
              <p className="mt-2 text-3xl font-bold text-destructive">
                {projectHealth.distribution.poor + projectHealth.distribution.critical}
              </p>
            </div>
            <Shield className="h-8 w-8 text-destructive" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('stats.percentOfTotal', {
              percent: (
                ((projectHealth.distribution.poor + projectHealth.distribution.critical) /
                  projectHealth.totalComponents) *
                100
              ).toFixed(1),
            })}
          </p>
        </div>
      </div>

      {/* Health Distribution Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('distribution.title')}</h2>
          <Suspense
            fallback={
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t('distribution.loadingChart')}
              </div>
            }
          >
            <HealthDistributionChart distribution={projectHealth.distribution} />
          </Suspense>
        </div>

        {/* Health Categories Breakdown */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('categories.title')}</h2>
          <div className="space-y-3">
            {[
              { category: 'critical', label: t('categories.critical'), count: projectHealth.distribution.critical },
              { category: 'poor', label: t('categories.poor'), count: projectHealth.distribution.poor },
              { category: 'fair', label: t('categories.fair'), count: projectHealth.distribution.fair },
              { category: 'good', label: t('categories.good'), count: projectHealth.distribution.good },
              {
                category: 'excellent',
                label: t('categories.excellent'),
                count: projectHealth.distribution.excellent,
              },
            ].map(({ category, label, count }) => (
              <div key={category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: getHealthChartColor(category as ComponentHealth['category']) }}
                  />
                  <span className="text-sm">{label}</span>
                </div>
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('metrics.title')}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{projectHealth.distribution.excellent}</p>
            <p className="text-sm text-muted-foreground">{t('metrics.excellent')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{projectHealth.distribution.good}</p>
            <p className="text-sm text-muted-foreground">{t('metrics.good')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{projectHealth.distribution.fair}</p>
            <p className="text-sm text-muted-foreground">{t('metrics.fair')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">
              {projectHealth.distribution.poor + projectHealth.distribution.critical}
            </p>
            <p className="text-sm text-muted-foreground">{t('metrics.needsWork')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
