import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale, Check } from 'lucide-react'
import { scanComponentLicenses, createDefaultLicensePolicy } from '@/lib/services/license'
import type { LicenseScanInput, LicenseVerdict, ComponentLicenseFinding } from '@/lib/services/license'

interface LicenseComplianceCardProps {
  components: LicenseScanInput[]
  /** License ids already approved for this project (drive the 'allowed' verdict). */
  allowedLicenses?: string[]
  /** Approve the given license ids for the project (added to the allow-list). */
  onAllowLicenses?: (licenseIds: string[]) => void
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
 * License ids that approving this component would add to the allow-list: the
 * parsed SPDX atoms, or the raw declared strings when nothing parsed to a known
 * id. Empty when the component declares no license (nothing to allow by id).
 */
function allowableLicenseIds(finding: ComponentLicenseFinding): string[] {
  const ids = new Set<string>()
  for (const assessment of finding.assessments) {
    for (const id of assessment.spdxIds) {
      if (id.trim()) ids.add(id.trim())
    }
  }
  if (ids.size === 0) {
    for (const assessment of finding.assessments) {
      if (assessment.raw.trim()) ids.add(assessment.raw.trim())
    }
  }
  return Array.from(ids)
}

/**
 * Offline license-compliance summary for a project's components. Additive UI —
 * runs the local license scanner (no network) and surfaces verdict counts plus
 * the components that need review or are denied. Flagged components can be
 * approved into the project's per-project allow-list.
 */
export function LicenseComplianceCard({ components, allowedLicenses, onAllowLicenses }: LicenseComplianceCardProps) {
  const { t } = useTranslation('licenseComplianceCard')
  const policy = useMemo(
    () => ({ ...createDefaultLicensePolicy(), allowedLicenses: allowedLicenses ?? [] }),
    [allowedLicenses],
  )
  const result = useMemo(() => scanComponentLicenses(components, policy), [components, policy])

  if (components.length === 0) return null

  const { summary, findings } = result
  const flagged = findings.filter((f) => f.worstVerdict !== 'allowed')

  const stats: Array<{ label: string; value: number; testId: string; className: string }> = [
    {
      label: t('stats.allowed'),
      value: summary.byVerdict.allowed,
      testId: 'license-allowed-count',
      className: 'text-green-600',
    },
    {
      label: t('stats.review'),
      value: summary.byVerdict.review,
      testId: 'license-review-count',
      className: 'text-yellow-600',
    },
    {
      label: t('stats.denied'),
      value: summary.byVerdict.denied,
      testId: 'license-denied-count',
      className: 'text-red-600',
    },
    {
      label: t('stats.noLicense'),
      value: summary.componentsWithoutLicense,
      testId: 'license-missing-count',
      className: 'text-muted-foreground',
    },
  ]

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">{t('title')}</h3>
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
          <p className="text-sm font-medium text-foreground">{t('flagged.heading', { count: flagged.length })}</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {flagged.map((finding) => {
              const allowable = allowableLicenseIds(finding)
              return (
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${verdictBadgeClass[finding.worstVerdict]}`}
                    >
                      {finding.worstVerdict}
                    </span>
                    {onAllowLicenses &&
                      finding.worstVerdict !== 'denied' &&
                      (allowable.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => onAllowLicenses(allowable)}
                          title={t('flagged.allowTitle', { licenses: allowable.join(', ') })}
                          className="inline-flex items-center gap-1 rounded-md border border-green-600/40 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900/30"
                        >
                          <Check className="h-3 w-3" />
                          {t('flagged.allow')}
                        </button>
                      ) : (
                        <span
                          className="text-[10px] italic text-muted-foreground"
                          title={t('flagged.noLicenseIdTitle')}
                        >
                          {t('flagged.noLicenseId')}
                        </span>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
