/**
 * Executive Dashboard Component
 * Main dashboard page for high-level visibility
 */

import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useProjects, useStore } from '@/store/useStore'
import {
  calculateExecutiveMetrics,
  generateExecutiveSummary,
  buildExecutiveReport,
  downloadExecutiveReport,
  computeNextComplianceReview,
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
const TopCriticalVulnerabilities = lazy(() =>
  import('./widgets/TopCriticalVulnerabilities').then((m) => ({ default: m.TopCriticalVulnerabilities })),
)
const DashboardConfig = lazy(() => import('./widgets/DashboardConfig').then((m) => ({ default: m.DashboardConfig })))
const DashboardLayoutEditor = lazy(() =>
  import('./widgets/DashboardLayoutEditor').then((m) => ({ default: m.DashboardLayoutEditor })),
)
import { Download, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { WIDGET_SIZE_CLASSES, type DashboardWidgetId } from '@/lib/dashboard/dashboardLayout'

// Compliance-review cadence used to derive the next-review date from the last assessment.
// A configurable default (quarterly) rather than the fabricated "today + 7 days" (M3).
const COMPLIANCE_REVIEW_INTERVAL_DAYS = 90

export function ExecutiveDashboard() {
  const { t } = useTranslation('executiveDashboard')
  const navigate = useNavigate()
  const projects = useProjects()

  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    end: new Date(),
  })
  const [projectScope, setProjectScope] = useState<'all' | 'selected'>('all')
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Projects within the selected date range — the pool the config picker chooses from.
  const dateFilteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const updateDate = new Date(p.updatedAt)
      return updateDate >= dateRange.start && updateDate <= dateRange.end
    })
  }, [projects, dateRange])

  // Metrics pool: further narrowed to the chosen projects when scope is 'selected' (H4).
  const filteredProjects = useMemo(() => {
    if (projectScope === 'selected') {
      return dateFilteredProjects.filter((p) => selectedProjectIds.includes(p.id))
    }
    return dateFilteredProjects
  }, [dateFilteredProjects, projectScope, selectedProjectIds])

  // Real next compliance-review date (M3): last assessment + cadence, or null when nothing
  // has been assessed yet (rendered as "not scheduled" rather than a fabricated date).
  const nextComplianceReview = useMemo(
    () => computeNextComplianceReview(filteredProjects, COMPLIANCE_REVIEW_INTERVAL_DAYS),
    [filteredProjects],
  )

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

  // Active dashboard layout profile (FR-06.3) drives which widgets render, in
  // what order, at what size.
  const dashboardProfiles = useStore((s) => s.dashboardLayoutProfiles)
  const activeDashboardProfileId = useStore((s) => s.activeDashboardLayoutProfileId)
  const activeProfile = dashboardProfiles.find((p) => p.id === activeDashboardProfileId) ?? dashboardProfiles[0]

  // Exhaustive per-widget renderer. A missing case is a compile error, so a
  // widget can never be silently dropped or mis-supplied when the grid is
  // data-driven instead of hardcoded.
  const renderWidget = (id: DashboardWidgetId) => {
    switch (id) {
      case 'risk-gauge':
        return <RiskGauge metrics={metrics.overall} />
      case 'compliance-status':
        return <ComplianceStatus compliance={metrics.compliance} nextReviewDate={nextComplianceReview} />
      case 'team-productivity':
        return <TeamProductivity productivity={metrics.productivity} />
      case 'project-health-comparison':
        return <ProjectHealthComparison projectMetrics={metrics.byProject} />
      case 'vulnerability-trend-chart':
        return <VulnerabilityTrendChart trends={metrics.trends} />
      case 'top-critical-vulnerabilities':
        return (
          <TopCriticalVulnerabilities
            vulnerabilities={metrics.topCriticalVulnerabilities}
            onProjectClick={handleProjectClick}
          />
        )
      case 'action-items':
        return (
          <ActionItems
            recommendations={summary.topRecommendations}
            topRisks={summary.topRisks}
            onProjectClick={handleProjectClick}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-6">
        <PageHeader
          title={t('header.title')}
          description={t('header.description')}
          actions={
            <>
              <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
                <DashboardLayoutEditor />
              </Suspense>
              <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
                <DashboardConfig
                  dateRange={dateRange}
                  projectScope={projectScope}
                  projects={dateFilteredProjects}
                  selectedProjectIds={selectedProjectIds}
                  onSelectedProjectsChange={setSelectedProjectIds}
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
                {t('header.exportReport')}
              </button>
            </>
          }
        />
      </div>

      {/* Executive Summary Banner */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-foreground">{t('summary.title')}</h2>
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
              {t('summary.statusLabel', { status: summary.overallStatus.toUpperCase() })}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{summary.headline}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {summary.keyPoints.slice(0, 4).map((point, index) => (
              <div key={index} className="text-xs text-muted-foreground">
                {t('summary.keyPoint', { point })}
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
            <h3 className="text-lg font-semibold text-foreground mb-2">{t('empty.title')}</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              {projects.length === 0 ? t('empty.noProjects') : t('empty.noMatch')}
            </p>
            {projects.length === 0 && (
              <button
                onClick={() => navigate('/dashboard')}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t('empty.goToDashboard')}
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
              {activeProfile.widgets
                .filter((slot) => slot.visible)
                .map((slot) => (
                  <div key={slot.id} className={WIDGET_SIZE_CLASSES[slot.size]}>
                    {renderWidget(slot.id)}
                  </div>
                ))}
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}
