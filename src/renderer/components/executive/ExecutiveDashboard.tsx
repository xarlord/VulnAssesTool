/**
 * Executive Dashboard Component
 * Main dashboard page for high-level visibility
 */

import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useStore } from '@/store/useStore'
import {
  calculateExecutiveMetrics,
  generateExecutiveSummary,
  buildExecutiveReport,
  downloadExecutiveReport,
} from '@/lib/analytics'
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
import { ArrowLeft, Download, Loader2 } from 'lucide-react'

export function ExecutiveDashboard() {
  const navigate = useNavigate()
  const projects = useProjects()

  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    end: new Date(),
  })
  const [projectScope, setProjectScope] = useState<'all' | 'selected'>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Filter projects based on date range and scope
  const filteredProjects = useMemo(() => {
    let filtered = projects

    // Filter by date range (projects updated within range)
    filtered = filtered.filter((p) => {
      const updateDate = new Date(p.updatedAt)
      return updateDate >= dateRange.start && updateDate <= dateRange.end
    })

    return filtered
  }, [projects, dateRange, projectScope])

  // Calculate metrics
  const metrics = useMemo(() => {
    return calculateExecutiveMetrics(filteredProjects)
  }, [filteredProjects])

  // Generate executive summary
  const summary = useMemo(() => {
    return generateExecutiveSummary(metrics, filteredProjects)
  }, [metrics, filteredProjects])

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    // Trigger Zustand store re-hydration by accessing fresh state
    // This causes useMemo to recalculate with current store data
    const currentProjects = useStore.getState().projects
    useStore.setState({ projects: [...currentProjects] })
    setIsRefreshing(false)
  }, [])

  // Handle export report
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

  // Handle project click
  const handleProjectClick = useCallback(
    (projectId: string) => {
      navigate(`/project/${projectId}`)
    },
    [navigate],
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="rounded-md hover:bg-secondary px-3 py-1.5 text-sm font-medium flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Executive Dashboard</h1>
                <p className="text-sm text-muted-foreground">High-level security overview and compliance metrics</p>
              </div>
            </div>
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
              <button
                onClick={handleExportReport}
                disabled={isExporting || filteredProjects.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Executive Summary Banner */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-foreground">Executive Summary</h2>
            <div
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                summary.overallStatus === 'critical'
                  ? 'bg-red-100 text-red-700'
                  : summary.overallStatus === 'warning'
                    ? 'bg-yellow-100 text-yellow-700'
                    : summary.overallStatus === 'excellent'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
              }`}
            >
              Status: {summary.overallStatus.toUpperCase()}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{summary.headline}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {summary.keyPoints.slice(0, 4).map((point, index) => (
              <div key={index} className="text-xs text-muted-foreground">
                • {point}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="container mx-auto px-4 py-6">
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
              <button
                onClick={() => navigate('/')}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Dashboard
              </button>
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
            <div className="grid grid-cols-9 gap-4 auto-rows-min">
              {/* Row 1 */}
              <div className="col-span-3 row-span-4">
                <RiskGauge metrics={metrics.overall} />
              </div>
              <div className="col-span-3 row-span-4">
                <ComplianceStatus compliance={metrics.compliance} />
              </div>
              <div className="col-span-3 row-span-4">
                <TeamProductivity productivity={metrics.productivity} />
              </div>

              {/* Row 2 */}
              <div className="col-span-6 row-span-4">
                <ProjectHealthComparison projectMetrics={metrics.byProject} />
              </div>
              <div className="col-span-3 row-span-4">
                <VulnerabilityTrendChart trends={metrics.trends} />
              </div>

              {/* Row 3 */}
              <div className="col-span-9 row-span-4">
                <ActionItems
                  recommendations={summary.topRecommendations}
                  topRisks={summary.topRisks}
                  onProjectClick={handleProjectClick}
                />
              </div>
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}
