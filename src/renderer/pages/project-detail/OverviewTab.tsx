import { Shield, Upload, FileText, AlertTriangle, Container, Binary } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LicenseComplianceCard } from '@/components/LicenseComplianceCard'
import { getSeverityTextClass } from '@/lib/severity'
import type { Project } from '@@/types'

interface OverviewTabProps {
  project: Project
  onUpdateProject: (id: string, updates: Partial<Project>) => void
  onOpenContainerScan: () => void
  onOpenBinarySbom: () => void
  onOpenUpload: () => void
  onRemoveSbom: (sbomFileId: string) => void
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

export function OverviewTab({
  project,
  onUpdateProject,
  onOpenContainerScan,
  onOpenBinarySbom,
  onOpenUpload,
  onRemoveSbom,
}: OverviewTabProps) {
  const { t } = useTranslation('overviewTab')
  return (
    <div className="mx-auto max-w-7xl mt-6 space-y-6">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span className="text-sm">{t('stats.components')}</span>
          </div>
          <div className="mt-2 text-3xl font-bold">{project.statistics.totalComponents}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className={`flex items-center gap-2 ${getSeverityTextClass('critical')}`}>
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{t('stats.critical')}</span>
          </div>
          <div className={`mt-2 text-3xl font-bold ${getSeverityTextClass('critical')}`}>
            {project.statistics.criticalCount}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className={`flex items-center gap-2 ${getSeverityTextClass('high')}`}>
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{t('stats.high')}</span>
          </div>
          <div className={`mt-2 text-3xl font-bold ${getSeverityTextClass('high')}`}>
            {project.statistics.highCount}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{t('stats.totalVulns')}</span>
          </div>
          <div className="mt-2 text-3xl font-bold">{project.statistics.totalVulnerabilities}</div>
        </div>
      </div>

      {/* License Compliance (offline) */}
      <LicenseComplianceCard
        components={project.components}
        allowedLicenses={project.allowedLicenses}
        onAllowLicenses={(licenseIds) => {
          const current = project.allowedLicenses ?? []
          const merged = Array.from(new Set([...current, ...licenseIds]))
          onUpdateProject(project.id, { allowedLicenses: merged, updatedAt: new Date() })
        }}
      />

      {/* SBOM Files Section */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">{t('sbom.title')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenContainerScan}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
            >
              <Container className="h-4 w-4" />
              {t('sbom.scanContainer')}
            </button>
            <button
              onClick={onOpenBinarySbom}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
            >
              <Binary className="h-4 w-4" />
              {t('sbom.generateFromBinary')}
            </button>
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
            >
              <Upload className="h-4 w-4" />
              {t('sbom.uploadSbom')}
            </button>
          </div>
        </div>
        <div className="p-4">
          {project.sbomFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{t('sbom.empty.title')}</p>
              <p className="text-sm text-muted-foreground">{t('sbom.empty.hint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {project.sbomFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{file.filename}</div>
                      <div className="text-sm text-muted-foreground">
                        {t('sbom.fileMeta', { format: file.format, count: file.componentCount })}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveSbom(file.id)}
                    className="text-sm text-muted-foreground hover:text-destructive"
                  >
                    {t('common:actions.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 font-semibold">{t('metadata.title')}</h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">{t('metadata.created')}</div>
            <div className="font-medium">{formatDate(project.createdAt)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('metadata.lastUpdated')}</div>
            <div className="font-medium">{formatDate(project.updatedAt)}</div>
          </div>
          {project.lastScanAt && (
            <div>
              <div className="text-muted-foreground">{t('metadata.lastScan')}</div>
              <div className="font-medium">{formatDate(project.lastScanAt)}</div>
            </div>
          )}
          <div>
            <div className="text-muted-foreground">{t('metadata.vulnerableComponents')}</div>
            <div className="font-medium">{project.statistics.vulnerableComponents}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
