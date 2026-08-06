/**
 * Top Critical Vulnerabilities Widget (FR-06.2)
 * Ranked list of the most severe individual CVEs across all projects.
 */

import type { TopVulnerabilityItem } from '@/lib/analytics'
import { getSeverityTextClass } from '@/lib/severity'

interface TopCriticalVulnerabilitiesProps {
  vulnerabilities: TopVulnerabilityItem[]
  onProjectClick?: (projectId: string) => void
}

export function TopCriticalVulnerabilities({ vulnerabilities, onProjectClick }: TopCriticalVulnerabilitiesProps) {
  return (
    <div data-testid="top-critical-vulnerabilities" className="bg-card rounded-lg border p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-foreground">Top Critical Vulnerabilities</h3>
        <div className="text-xs text-muted-foreground">Top {vulnerabilities.length}</div>
      </div>

      <div className="flex-1">
        {vulnerabilities.length > 0 ? (
          <ol className="space-y-1">
            {vulnerabilities.map((vuln, index) => (
              <li key={vuln.id}>
                <button
                  type="button"
                  onClick={() => onProjectClick?.(vuln.projectId)}
                  className="w-full flex items-center gap-3 rounded p-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-xs font-semibold text-muted-foreground w-5 shrink-0">{index + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{vuln.id}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span>{vuln.projectName}</span> • {vuln.affectedComponentCount} component(s)
                    </span>
                  </span>
                  <span className={`text-xs font-semibold shrink-0 ${getSeverityTextClass('critical')}`}>
                    {vuln.cvssScore !== undefined ? vuln.cvssScore.toFixed(1) : 'N/A'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No critical vulnerabilities
          </div>
        )}
      </div>
    </div>
  )
}
