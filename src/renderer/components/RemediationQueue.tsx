import React, { useState } from 'react'
import { AlertTriangle, Shield, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { getHealthColor } from '@/lib/health'
import { formatVulnerabilityId } from '@/lib/utils/vulnIdFormat'
import type { ComponentHealth, Component, Vulnerability } from '@@/types'

interface RemediationQueueProps {
  componentHealths: ComponentHealth[]
  components: Component[]
  vulnerabilities: Vulnerability[]
  onViewComponent?: (component: Component) => void
  onViewVulnerability?: (vulnerability: Vulnerability) => void
}

interface GroupedRemediation {
  critical: Array<{ component: Component; health: ComponentHealth }>
  high: Array<{ component: Component; health: ComponentHealth }>
  medium: Array<{ component: Component; health: ComponentHealth }>
  low: Array<{ component: Component; health: ComponentHealth }>
}

export default function RemediationQueue({
  componentHealths,
  components,
  vulnerabilities,
  onViewComponent,
  onViewVulnerability,
}: RemediationQueueProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['critical', 'high']))

  // Sort component healths by score (worst first) and group by severity
  const sortedHealths = [...componentHealths].sort((a, b) => a.score - b.score)

  const grouped: GroupedRemediation = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  }

  // Use a Set to track which components have already been added to prevent duplicates
  const addedComponentIds = new Set<string>()

  for (const health of sortedHealths) {
    // Skip if this component has already been added to a group
    if (addedComponentIds.has(health.componentId)) {
      continue
    }

    const component = components.find((c) => c.id === health.componentId)
    if (!component) continue

    // Get the highest severity vulnerability for this component
    const componentVulns = vulnerabilities.filter((v) => v.affectedComponents.includes(health.componentId))

    // Skip components with no vulnerabilities and excellent/good health
    if (componentVulns.length === 0 && (health.category === 'excellent' || health.category === 'good')) {
      continue
    }

    // Mark this component as added
    addedComponentIds.add(health.componentId)

    if (componentVulns.length === 0) {
      grouped.low.push({ component, health })
      continue
    }

    // Determine the highest severity vulnerability and add to appropriate group
    const hasCritical = componentVulns.some((v) => v.severity === 'critical')
    const hasHigh = componentVulns.some((v) => v.severity === 'high')
    const hasMedium = componentVulns.some((v) => v.severity === 'medium')

    if (hasCritical) {
      grouped.critical.push({ component, health })
    } else if (hasHigh) {
      grouped.high.push({ component, health })
    } else if (hasMedium) {
      grouped.medium.push({ component, health })
    } else {
      grouped.low.push({ component, health })
    }
  }

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  const totalItems = grouped.critical.length + grouped.high.length + grouped.medium.length + grouped.low.length

  if (totalItems === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <Shield className="mx-auto mb-4 h-12 w-12 text-green-600" />
        <h3 className="text-lg font-medium">All components are healthy!</h3>
        <p className="mt-2 text-sm text-muted-foreground">No components require immediate attention</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Critical Components */}
      {grouped.critical.length > 0 && (
        <RemediationGroup
          title="Critical Priority"
          subtitle={`${grouped.critical.length} component${grouped.critical.length > 1 ? 's' : ''} requiring immediate attention`}
          count={grouped.critical.length}
          color="destructive"
          expanded={expandedGroups.has('critical')}
          onToggle={() => toggleGroup('critical')}
        >
          {grouped.critical.map(({ component, health }) => (
            <RemediationItem
              key={component.id}
              component={component}
              health={health}
              vulnerabilities={vulnerabilities.filter((v) => v.affectedComponents.includes(component.id))}
              onViewComponent={onViewComponent}
              onViewVulnerability={onViewVulnerability}
            />
          ))}
        </RemediationGroup>
      )}

      {/* High Priority Components */}
      {grouped.high.length > 0 && (
        <RemediationGroup
          title="High Priority"
          subtitle={`${grouped.high.length} component${grouped.high.length > 1 ? 's' : ''} with high-severity vulnerabilities`}
          count={grouped.high.length}
          color="orange"
          expanded={expandedGroups.has('high')}
          onToggle={() => toggleGroup('high')}
        >
          {grouped.high.map(({ component, health }) => (
            <RemediationItem
              key={component.id}
              component={component}
              health={health}
              vulnerabilities={vulnerabilities.filter((v) => v.affectedComponents.includes(component.id))}
              onViewComponent={onViewComponent}
              onViewVulnerability={onViewVulnerability}
            />
          ))}
        </RemediationGroup>
      )}

      {/* Medium Priority Components */}
      {grouped.medium.length > 0 && (
        <RemediationGroup
          title="Medium Priority"
          subtitle={`${grouped.medium.length} component${grouped.medium.length > 1 ? 's' : ''} with medium-severity vulnerabilities`}
          count={grouped.medium.length}
          color="yellow"
          expanded={expandedGroups.has('medium')}
          onToggle={() => toggleGroup('medium')}
        >
          {grouped.medium.map(({ component, health }) => (
            <RemediationItem
              key={component.id}
              component={component}
              health={health}
              vulnerabilities={vulnerabilities.filter((v) => v.affectedComponents.includes(component.id))}
              onViewComponent={onViewComponent}
              onViewVulnerability={onViewVulnerability}
            />
          ))}
        </RemediationGroup>
      )}

      {/* Low Priority Components */}
      {grouped.low.length > 0 && (
        <RemediationGroup
          title="Low Priority"
          subtitle={`${grouped.low.length} component${grouped.low.length > 1 ? 's' : ''} with minor issues`}
          count={grouped.low.length}
          color="blue"
          expanded={expandedGroups.has('low')}
          onToggle={() => toggleGroup('low')}
        >
          {grouped.low.map(({ component, health }) => (
            <RemediationItem
              key={component.id}
              component={component}
              health={health}
              vulnerabilities={vulnerabilities.filter((v) => v.affectedComponents.includes(component.id))}
              onViewComponent={onViewComponent}
              onViewVulnerability={onViewVulnerability}
            />
          ))}
        </RemediationGroup>
      )}
    </div>
  )
}

interface RemediationGroupProps {
  title: string
  subtitle: string
  count: number
  color: 'destructive' | 'orange' | 'yellow' | 'blue'
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

function RemediationGroup({ title, subtitle, count, color, expanded, onToggle, children }: RemediationGroupProps) {
  const colorClasses = {
    destructive: 'text-destructive bg-destructive/10 border-destructive/20',
    orange: 'text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
    yellow: 'text-amber-700 dark:text-amber-400 bg-yellow-500/10 border-yellow-500/20',
    blue: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  }

  return (
    <div className={`rounded-lg border ${colorClasses[color]}`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" />
          <div className="text-left">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm opacity-80">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{count}</span>
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>
      {expanded && <div className="border-t border-current/20 p-4 space-y-2">{children}</div>}
    </div>
  )
}

interface RemediationItemProps {
  component: Component
  health: ComponentHealth
  vulnerabilities: Vulnerability[]
  onViewComponent?: (component: Component) => void
  onViewVulnerability?: (vulnerability: Vulnerability) => void
}

function RemediationItem({
  component,
  health,
  vulnerabilities,
  onViewComponent,
  onViewVulnerability,
}: RemediationItemProps) {
  // Check if component has high or critical vulnerabilities
  const hasHighOrCritical = vulnerabilities.some((v) => v.severity === 'critical' || v.severity === 'high')

  return (
    <div className="rounded-md border border-border bg-background p-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium">{component.name}</h4>
            <span className="text-sm text-muted-foreground">{component.version}</span>
            <div className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getHealthColor(health.category)}`}>
              {health.score}/100
            </div>
            {hasHighOrCritical && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200">
                Needs Attention
              </span>
            )}
          </div>

          {vulnerabilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {vulnerabilities.slice(0, 3).map((vuln) => {
                const { primaryId } = formatVulnerabilityId(vuln)
                return (
                  <button
                    key={vuln.id}
                    onClick={() => onViewVulnerability?.(vuln)}
                    className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-0.5 text-xs hover:bg-secondary/80 transition-colors"
                  >
                    <AlertTriangle
                      className={`h-3 w-3 ${
                        vuln.severity === 'critical'
                          ? 'text-destructive'
                          : vuln.severity === 'high'
                            ? 'text-orange-700 dark:text-orange-400'
                            : vuln.severity === 'medium'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-blue-700 dark:text-blue-400'
                      }`}
                    />
                    <span>{primaryId}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </button>
                )
              })}
              {vulnerabilities.length > 3 && (
                <span className="text-xs text-muted-foreground">+{vulnerabilities.length - 3} more</span>
              )}
            </div>
          )}

          {/* Recommended Action */}
          {component.patchInfo?.hasFixAvailable && component.patchInfo.recommendedVersion && (
            <div className="mt-2 text-xs text-green-600">
              Update available: {component.patchInfo.recommendedVersion}
            </div>
          )}
        </div>

        {onViewComponent && (
          <button
            onClick={() => onViewComponent(component)}
            className="ml-2 text-sm text-primary hover:underline whitespace-nowrap"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  )
}
