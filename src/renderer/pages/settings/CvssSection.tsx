import { ShieldAlert } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DEFAULT_SEVERITY_THRESHOLDS } from '@/lib/cvss/parser'
import type { SeverityThresholds } from '@@/types'

/**
 * CVSS preferences (FR-10.5). Self-contained: reads/writes the shared AppSettings
 * via the store. All three controls affect the CVSS detail view only — they never
 * recompute stored scores or reclassify the persisted `.severity` field.
 */

const SEVERITY_BANDS: Array<keyof SeverityThresholds> = ['critical', 'high', 'medium', 'low']

export function CvssSection() {
  const { settings, updateSettings } = useStore()
  // Guard against settings persisted before this field existed.
  const thresholds = settings.severityThresholds ?? DEFAULT_SEVERITY_THRESHOLDS

  return (
    <div id="cvss" className="rounded-lg border border-border bg-card scroll-mt-6">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">CVSS</h2>
      </div>
      <div className="p-4 space-y-6">
        {/* Preferred CVSS version */}
        <div>
          <label htmlFor="cvss-version" className="mb-2 block text-sm font-medium">
            Preferred CVSS Version
          </label>
          <select
            id="cvss-version"
            value={settings.cvssVersion}
            onChange={(e) => updateSettings({ cvssVersion: e.target.value as '3.0' | '3.1' })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="3.1">CVSS 3.1</option>
            <option value="3.0">CVSS 3.0</option>
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            Applies to the CVSS detail view only. Scores are never recalculated between versions; a CVE that only
            carries the other version shows an informational note.
          </p>
        </div>

        {/* Expand-breakdown default */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Expand CVSS Breakdown by Default</p>
            <p className="text-xs text-muted-foreground">
              Open the full metric grid without clicking &quot;Show Details&quot;.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showCvssBreakdown}
            aria-label="Show CVSS breakdown"
            onClick={() => updateSettings({ showCvssBreakdown: !settings.showCvssBreakdown })}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              settings.showCvssBreakdown ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.showCvssBreakdown ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Severity thresholds */}
        <div>
          <label className="mb-2 block text-sm font-medium">Severity Thresholds</label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SEVERITY_BANDS.map((band) => (
              <div key={band}>
                <label htmlFor={`threshold-${band}`} className="mb-1 block text-xs capitalize text-muted-foreground">
                  {band} threshold
                </label>
                <input
                  id={`threshold-${band}`}
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={thresholds[band]}
                  onChange={(e) =>
                    updateSettings({ severityThresholds: { ...thresholds, [band]: Number(e.target.value) } })
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Base-score cutoffs used for the CVSS detail view only. They do not change stored severities or the
            list/dashboard/filter classifications.
          </p>
        </div>
      </div>
    </div>
  )
}
