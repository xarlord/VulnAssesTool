import { useMemo } from 'react'
import { Scale } from 'lucide-react'
import { scanComponentLicenses, createDefaultLicensePolicy } from '@/lib/services/license'
import type { LicenseScanInput, LicenseVerdict, ComponentLicenseFinding } from '@/lib/services/license'

interface LicenseComplianceCardProps {
  components: LicenseScanInput[]
}

const verdictBadgeClass: Record<LicenseVerdict, string> = {
  allowed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

/** Unique risk categories across a finding's assessments, comma-joined. */
function categoriesOf(finding: ComponentLicenseFinding): string {
  return Array.from(new Set(finding.assessments.map((a) => a.category))).join(', ')
}

/**
 * Offline license-compliance summary for a project's components. Additive UI —
 * runs the local license scanner (no network) and surfaces verdict counts plus
 * the components that need review or are denied.
 */
export function LicenseComplianceCard({ components }: LicenseComplianceCardProps) {
  const result = useMemo(() => scanComponentLicenses(components, createDefaultLicensePolicy()), [components])

  if (components.length === 0) return null

  const { summary, findings } = result
  const flagged = findings.filter((f) => f.worstVerdict !== 'allowed')

  const stats: Array<{ label: string; value: number; testId: string; className: string }> = [
    { label: 'Allowed', value: summary.byVerdict.allowed, testId: 'license-allowed-count', className: 'text-green-600' },
    { label: 'Review', value: summary.byVerdict.review, testId: 'license-review-count', className: 'text-yellow-600' },
    { label: 'Denied', value: summary.byVerdict.denied, testId: 'license-denied-count', className: 'text-red-600' },
    {
      label: 'No license',
      value: summary.componentsWithoutLicense,
      testId: 'license-missing-count',
      className: 'text-muted-foreground',
    },
  ]

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">License Compliance</h3>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.testId} className="rounded-md border border-border bg-muted/40 p-2.5">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-lg font-bold ${stat.className}`} data-testid={stat.testId}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {flagged.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Flagged components ({flagged.length})</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {flagged.map((finding) => (
              <div
                key={finding.componentId}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0 truncate">
                  <span className="font-medium text-foreground">{finding.componentName}</span>
                  <span className="text-muted-foreground"> {finding.componentVersion}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{categoriesOf(finding)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${verdictBadgeClass[finding.worstVerdict]}`}>
                    {finding.worstVerdict}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
