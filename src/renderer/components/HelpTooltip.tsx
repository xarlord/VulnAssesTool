/**
 * Help Tooltip Component
 *
 * Provides contextual help and tooltips for UI elements.
 * Uses Radix UI Tooltip primitives for accessibility.
 *
 * @module components/HelpTooltip
 */

import React from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { HelpCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface HelpTooltipProps {
  /** Content to display in the tooltip */
  content: React.ReactNode
  /** Icon to use (defaults to HelpCircle) */
  icon?: 'help' | 'info'
  /** Side to position the tooltip */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Additional class name */
  className?: string
  /** Whether the tooltip is disabled */
  disabled?: boolean
  /** Delay in milliseconds before showing */
  delayDuration?: number
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * HelpTooltip provides contextual help for UI elements
 */
export function HelpTooltip({
  content,
  icon = 'help',
  _side = 'top',
  className,
  disabled = false,
  delayDuration = 300,
}: HelpTooltipProps) {
  if (disabled) {
    return null
  }

  const IconComponent = icon === 'info' ? Info : HelpCircle

  return (
    <Tooltip.Root delayDuration={delayDuration}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center rounded-full',
            'text-muted-foreground hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'transition-colors',
            className,
          )}
          aria-label="Help"
        >
          <IconComponent className="h-4 w-4" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className={cn(
            'z-50 px-3 py-2 rounded-md',
            'bg-popover text-popover-foreground text-sm',
            'shadow-lg border border-border',
            'max-w-xs animate-in fade-in-0 zoom-in-95',
            'data-[state=open]:animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out fade-out-0 zoom-out-95',
          )}
          sideOffset={5}
        >
          {content}
          <Tooltip.Arrow className="fill-popover border-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface HelpTextProps {
  /** Text content */
  children: React.ReactNode
  /** Additional class name */
  className?: string
}

/**
 * HelpText displays help text with an info icon prefix
 */
export function HelpText({ children, className }: HelpTextProps) {
  return (
    <div className={cn('flex items-start gap-2 text-sm text-muted-foreground', className)}>
      <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}
// ============================================================================
// CONTEXTUAL HELP DEFINITIONS
// ============================================================================

/**
 * Help content for common UI elements
 */
export const HELP_CONTENT = {
  // Vulnerability severity
  severity: (
    <>
      <strong>Severity Levels</strong>
      <ul className="mt-1 space-y-1 text-xs">
        <li>
          <strong>Critical:</strong> Requires immediate attention
        </li>
        <li>
          <strong>High:</strong> Should be addressed soon
        </li>
        <li>
          <strong>Medium:</strong> Moderate risk
        </li>
        <li>
          <strong>Low:</strong> Minor issues
        </li>
      </ul>
    </>
  ),

  // CVSS Score
  cvss: (
    <>
      <strong>CVSS Score</strong>
      <p className="mt-1 text-xs">
        Common Vulnerability Scoring System (0-10 scale) measures the severity of security vulnerabilities.
      </p>
    </>
  ),

  // KEV Status
  kev: (
    <>
      <strong>Known Exploited Vulnerability</strong>
      <p className="mt-1 text-xs">
        This CVE is listed in CISA&apos;s Known Exploited Vulnerabilities catalog, indicating active exploitation in the
        wild.
      </p>
    </>
  ),

  // EPSS Score
  epss: (
    <>
      <strong>Exploit Prediction Scoring System</strong>
      <p className="mt-1 text-xs">
        EPSS provides probability scores (0-1) for the likelihood of exploitation in the next 30 days.
      </p>
    </>
  ),

  // VEX Status
  vex: (
    <>
      <strong>Vulnerability Exploitability eXchange</strong>
      <p className="mt-1 text-xs">
        VEX documents communicate the exploitability status of vulnerabilities in your software supply chain.
      </p>
    </>
  ),

  // FPF Status
  fpf: (
    <>
      <strong>False Positive Filter</strong>
      <p className="mt-1 text-xs">
        Mark vulnerabilities as false positives with ISO 21434 compliant just justifications.
      </p>
    </>
  ),

  // SBOM
  sbom: (
    <>
      <strong>Software Bill of Materials</strong>
      <p className="mt-1 text-xs">
        A list of components, libraries, and dependencies in your software, Helps track supply chain security.
      </p>
    </>
  ),

  // Project Health
  health: (
    <>
      <strong>Project Health Score</strong>
      <p className="mt-1 text-xs">
        Overall security health based on vulnerability severity, count, and recency. Higher is better.
      </p>
    </>
  ),

  // Component Dependencies
  dependencies: (
    <>
      <strong>Dependency Analysis</strong>
      <p className="mt-1 text-xs">
        Visualize component relationships and identify potential vulnerabilities in your dependency tree.
      </p>
    </>
  ),
} as const

/**
 * Get help content by key
 */
export function getHelpContent(key: keyof typeof HELP_CONTENT): React.ReactNode {
  return HELP_CONTENT[key]
}

export default HelpTooltip
