import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useStore } from '@/store/useStore'
import {
  calculateExecutiveMetrics,
  generateExecutiveSummary,
  buildExecutiveReport,
  downloadExecutiveReport,
} from '@/lib/analytics'
import { AppHeader } from '@/components/layout/AppHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Shield, CheckCircle, Activity, BarChart, TrendingUp, AlertTriangle } from 'lucide-react'

const RiskGauge = lazy(() => import('./widgets/RiskGauge').then((m) => ({ default: m.RiskGauge })))
const ProjectHealthComparison = lazy(() =>
  import('./widgets/ProjectHealthComparison').then((m) => ({ default: m.ProjectHealthComparison })),
)
const VulnerabilityTrendChart = lazy(() =>
  import('./widgets/VulnerabilityTrendChart').then((m) => ({ default: m.VulnerabilityTrendChart })),
)
const TeamProductivity = lazy(() => import('./widgets/TeamProductivity').then((m) => ({ default: m.TeamProductivity })))
const ComplianceStatus = lazy(() => import('./widgets/ComplianceStatus').then((m) => ({ default: m.ComplianceStatus })))
const ActionItems = lazy(() => import('./widgets/ActionItems').then((m) => ({ default: m.ActionItems })))
const DashboardConfig = lazy(() => import('./widgets/DashboardConfig').then((m) => ({ default: m.DashboardConfig })))

const STATUS_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  excellent: 'bg-emerald-100 text-emerald-700',
}

export function ExecutiveDashboard() {
  const navigate = useNavigate()
  const projects = useProjects()

  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  })
  const [projectScope, setProjectScope] = useState<'all' | 'selected'>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const filteredProjects = useMemo(() => {
    let filtered = projects

    filtered = filtered.filter((p) => {
      const updateDate = new Date(p.updatedAt)
      return updateDate >= dateRange.start && updateDate <= dateRange.end
    })

    return filtered
  }, [projects, dateRange, projectScope])

  const metrics = useMemo(() => {
    return calculateExecutiveMetrics(filteredProjects)
  }, [filteredProjects])

  const summary = useMemo(() => {
    return generateExecutiveSummary(metrics, filteredProjects)
  }, [metrics, filteredProjects])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    const currentProjects = useStore.getState().projects
    useStore.setState({ projects: [...currentProjects] })
    setIsRefreshing(false)
  }, [])

  const handleExportReport = useCallback(() => {
    setIsExporting(true)
    try {
      const doc = buildExecutiveReport(summary, metrics, filteredProjects)
      downloadExecutiveReport(doc)
    } catch (error) {
      console.error('Failed to generate report:', error)
    } finally {
      setIsExporting(false)
    }
  }, [summary, metrics, filteredProjects])

  const handleProjectClick = useCallback(
    (projectId: string) => {
      navigate(`/project/${projectId}`)
    },
    [navigate],
  )

  return (
    <div className="flex flex-col h-full bg-background">
      <AppHeader
        title="Executive Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
              <DashboardConfig
                dateRange={dateRange}
                projectScope={projectScope}
                projects={filteredProjects}
                onDateRangeChange={setDateRange}
                onProjectScopeChange={setProjectScope}
                onExportReport={handleExportReport}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
              />
            </Suspense>
            <Button onClick={handleExportReport} disabled={isExporting || filteredProjects.length === 0} size="sm">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Report
            </Button>
          </div>
        }
      />

      <div className="border-b bg-gradient-to-r from-slate-50 to-blue-50/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-foreground">Executive Summary</h2>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                STATUS_STYLES[summary.overallStatus] ?? 'bg-blue-100 text-blue-700'
              }`}
            >
              {summary.overallStatus}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{summary.headline}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {summary.keyPoints.slice(0, 4).map((point, index) => (
              <div key={index} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="mt-0.5 shrink-0">&#x2022;</span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Download className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Data Available</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              {projects.length === 0
                ? 'Create projects and upload SBOMs to see executive dashboard data.'
                : 'No projects match the selected date range. Adjust the filters or add new projects.'}
            </p>
            {projects.length === 0 && (
              <Button onClick={() => navigate('/dashboard')} variant="outline">
                Go to Dashboard
              </Button>
            )}
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4 text-blue-600" />
                    Risk Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RiskGauge metrics={metrics.overall} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    Compliance Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ComplianceStatus compliance={metrics.compliance} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4 text-blue-600" />
                    Team Productivity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TeamProductivity productivity={metrics.productivity} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart className="h-4 w-4 text-blue-600" />
                    Project Health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProjectHealthComparison projectMetrics={metrics.byProject} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    Vulnerability Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <VulnerabilityTrendChart trends={metrics.trends} />
                </CardContent>
              </Card>

              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-blue-600" />
                    Action Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ActionItems
                    recommendations={summary.topRecommendations}
                    topRisks={summary.topRisks}
                    onProjectClick={handleProjectClick}
                  />
                </CardContent>
              </Card>
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}
