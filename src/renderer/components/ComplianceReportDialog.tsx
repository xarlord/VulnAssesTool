import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { COMPLIANCE_FRAMEWORK_META, type ComplianceFramework } from '@/lib/export/types'
import { useAuditStore } from '@/lib/audit'
import type { Project } from '@@/types'

interface ComplianceReportDialogProps {
  open: boolean
  onClose: () => void
  project: Project
}

const FRAMEWORKS = Object.entries(COMPLIANCE_FRAMEWORK_META) as Array<
  [ComplianceFramework, (typeof COMPLIANCE_FRAMEWORK_META)[ComplianceFramework]]
>

/**
 * Generates a framework-specific compliance report (FR-09.3) for a single project. The user picks a
 * framework; the report itself (framework header, executive summary, due-diligence statement, audit
 * trail, and unremediated-critical-findings table) is built in `prepareCompliancePdf`. The heavy
 * jsPDF module is loaded on demand so it stays out of the ProjectDetail page bundle.
 */
export function ComplianceReportDialog({ open, onClose, project }: ComplianceReportDialogProps) {
  const { t } = useTranslation('complianceReportDialog')
  const [framework, setFramework] = useState<ComplianceFramework>('soc2')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      // Let the "Generating..." state paint before the synchronous PDF build.
      await new Promise((resolve) => setTimeout(resolve, 0))

      const { prepareCompliancePdf, downloadPdf } = await import('@/lib/export/pdf')

      // The project's audit-trail events — evidence for the report's audit section. Use
      // getEventsForEntity (not queryEvents' strict entityId equality) so SBOM upload/remove events,
      // which record the project id in metadata.relatedEntityIds rather than entityId, are included.
      // The generator sorts newest-first and caps the rows.
      const events = useAuditStore.getState().getEventsForEntity(project.id)

      const doc = prepareCompliancePdf(project, framework, events)
      const safeName = project.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
      downloadPdf(doc, `${safeName}-${framework}-compliance-report.pdf`)

      onClose()
    } catch (error) {
      console.error('Compliance report generation failed:', error)
      setIsGenerating(false)
    }
  }

  const handleCancel = () => {
    setFramework('soc2')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: project.name })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="text-sm font-medium">{t('frameworkLabel')}</label>
          <div className="space-y-2">
            {FRAMEWORKS.map(([value, info]) => (
              <button
                key={value}
                onClick={() => setFramework(value)}
                aria-pressed={framework === value}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  framework === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
                }`}
              >
                <span className="block text-sm font-medium">{info.label}</span>
                <span className="block text-xs text-muted-foreground">{info.standard}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('disclaimer')}</p>
        </div>

        <DialogFooter>
          <button
            onClick={handleCancel}
            disabled={isGenerating}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none"
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isGenerating ? t('generating') : t('generate')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
