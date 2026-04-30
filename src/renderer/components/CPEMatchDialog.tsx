import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { X, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react'

/**
 * CPE Match result from the NVD matching service
 */
export interface CPEMatchResult {
  cpe: string
  vendor: string
  product: string
  version: string
  confidence: number // 0-100
  matchType: 'exact' | 'token' | 'fuzzy'
}

/**
 * Component with ambiguous CPE matches requiring user confirmation
 */
export interface AmbiguousComponent {
  id: string
  name: string
  version: string
  suggestedCPEs: CPEMatchResult[]
  selectedCPE?: string
}

interface CPEMatchDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (selections: Map<string, string>) => void // componentId -> selected CPE
  ambiguousComponents: AmbiguousComponent[]
}

/**
 * Get confidence color classes based on percentage
 */
function getConfidenceColor(confidence: number): { bg: string; text: string; badge: string } {
  if (confidence >= 80) {
    return {
      bg: 'bg-green-100',
      text: 'text-green-700',
      badge: 'bg-green-500 text-white',
    }
  }
  if (confidence >= 60) {
    return {
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      badge: 'bg-yellow-500 text-white',
    }
  }
  return {
    bg: 'bg-red-100',
    text: 'text-red-700',
    badge: 'bg-red-500 text-white',
  }
}

/**
 * Truncate CPE string for display with ellipsis
 */
function truncateCPE(cpe: string, maxLength: number = 40): string {
  if (cpe.length <= maxLength) return cpe
  return cpe.substring(0, maxLength - 3) + '...'
}

/**
 * Get match type label
 */
function getMatchTypeLabel(matchType: CPEMatchResult['matchType']): string {
  switch (matchType) {
    case 'exact':
      return 'Exact Match'
    case 'token':
      return 'Token Match'
    case 'fuzzy':
      return 'Fuzzy Match'
    default:
      return 'Unknown'
  }
}

export default function CPEMatchDialog({ open, onClose, onConfirm, ambiguousComponents }: CPEMatchDialogProps) {
  const [selections, setSelections] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Initialize selections with highest confidence CPE for each component
  useEffect(() => {
    if (open && ambiguousComponents.length > 0) {
      const initialSelections = new Map<string, string>()

      ambiguousComponents.forEach((component) => {
        // Use selectedCPE if provided, otherwise use highest confidence CPE
        if (component.selectedCPE) {
          initialSelections.set(component.id, component.selectedCPE)
        } else if (component.suggestedCPEs.length > 0) {
          // Sort by confidence and pick highest
          const sortedCPEs = [...component.suggestedCPEs].sort((a, b) => b.confidence - a.confidence)
          initialSelections.set(component.id, sortedCPEs[0].cpe)
        }
      })

      setSelections(initialSelections)
    }
  }, [open, ambiguousComponents])

  // Focus trap and keyboard handler for accessibility
  useEffect(() => {
    if (!open) return

    // Store the previously focused element
    previousActiveElement.current = document.activeElement as HTMLElement

    const modalElement = modalRef.current
    if (!modalElement) return

    // Get all focusable elements
    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    const getFocusableElements = () => modalElement.querySelectorAll<HTMLElement>(focusableSelectors)

    // Focus the first focusable element
    const focusableElements = getFocusableElements()
    if (focusableElements.length > 0) {
      focusableElements[0].focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Close on Escape
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Focus trap on Tab
      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements()
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    modalElement.addEventListener('keydown', handleKeyDown)

    return () => {
      modalElement.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the previously focused element
      previousActiveElement.current?.focus()
    }
  }, [open, onClose])

  // Handle CPE selection change
  const handleSelectionChange = useCallback((componentId: string, cpe: string) => {
    setSelections((prev) => {
      const newSelections = new Map(prev)
      newSelections.set(componentId, cpe)
      return newSelections
    })
  }, [])

  // Accept all high confidence CPEs (>80%)
  const handleAcceptAllHighConfidence = useCallback(() => {
    const newSelections = new Map<string, string>()

    ambiguousComponents.forEach((component) => {
      const highConfidenceCPE = component.suggestedCPEs.find((cpe) => cpe.confidence > 80)
      if (highConfidenceCPE) {
        newSelections.set(component.id, highConfidenceCPE.cpe)
      } else if (component.suggestedCPEs.length > 0) {
        // Fall back to highest confidence if none > 80%
        const sortedCPEs = [...component.suggestedCPEs].sort((a, b) => b.confidence - a.confidence)
        newSelections.set(component.id, sortedCPEs[0].cpe)
      }
    })

    setSelections(newSelections)
  }, [ambiguousComponents])

  // Skip CPEs - confirm with empty selections
  const handleSkip = useCallback(() => {
    onConfirm(new Map())
    onClose()
  }, [onConfirm, onClose])

  // Confirm selections
  const handleConfirm = useCallback(() => {
    setIsLoading(true)
    try {
      onConfirm(selections)
      onClose()
    } finally {
      setIsLoading(false)
    }
  }, [selections, onConfirm, onClose])

  // Count high confidence CPEs
  const highConfidenceCount = useMemo(() => {
    return ambiguousComponents.reduce((count, component) => {
      const hasHighConfidence = component.suggestedCPEs.some((cpe) => cpe.confidence > 80)
      return hasHighConfidence ? count + 1 : count
    }, 0)
  }, [ambiguousComponents])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        data-testid="cpe-match-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cpe-dialog-title"
        className="relative z-50 w-full max-w-4xl rounded-lg border border-border bg-card shadow-lg max-h-[95vh] md:max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-6 bg-gradient-to-r from-muted to-card">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-amber-500" />
              <h2 id="cpe-dialog-title" className="text-xl font-semibold text-foreground">
                CPE Estimation Required
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              The following components need CPE confirmation before export. Please review and select the appropriate CPE
              for each component.
            </p>
          </div>
          <button
            onClick={onClose}
            data-testid="cpe-dialog-close"
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Processing CPE selections...</p>
              </div>
            </div>
          ) : ambiguousComponents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <HelpCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">No components require CPE estimation</p>
              <p className="text-sm text-muted-foreground mt-1">All components already have CPE values assigned.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="text-left p-3 font-semibold text-foreground w-12">Select</th>
                    <th className="text-left p-3 font-semibold text-foreground">Component Name</th>
                    <th className="text-left p-3 font-semibold text-foreground w-24">Version</th>
                    <th className="text-left p-3 font-semibold text-foreground">Suggested CPE</th>
                    <th className="text-center p-3 font-semibold text-foreground w-24">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {ambiguousComponents.map((component) => (
                    <ComponentRow
                      key={component.id}
                      component={component}
                      selectedCPE={selections.get(component.id)}
                      onSelectionChange={handleSelectionChange}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border p-4 bg-muted/50">
          <div className="text-sm text-muted-foreground">
            {ambiguousComponents.length} component{ambiguousComponents.length !== 1 ? 's' : ''}{' '}
            {ambiguousComponents.length === 1 ? 'requires' : 'require'} CPE estimation
            {highConfidenceCount > 0 && (
              <span className="ml-2">({highConfidenceCount} with high confidence &gt;80%)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAcceptAllHighConfidence}
              disabled={isLoading || highConfidenceCount === 0}
              data-testid="accept-all-high-confidence"
              className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Accept All High Confidence (&gt;80%)
            </button>
            <button
              onClick={handleSkip}
              disabled={isLoading}
              data-testid="skip-cpes"
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip CPEs
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading || selections.size === 0}
              data-testid="confirm-selections"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Confirming...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Component row with CPE selection options
 */
interface ComponentRowProps {
  component: AmbiguousComponent
  selectedCPE?: string
  onSelectionChange: (componentId: string, cpe: string) => void
}

function ComponentRow({ component, selectedCPE, onSelectionChange }: ComponentRowProps) {
  const hasMultipleCPEs = component.suggestedCPEs.length > 1

  // Sort CPEs by confidence (highest first)
  const sortedCPEs = useMemo(() => {
    return [...component.suggestedCPEs].sort((a, b) => b.confidence - a.confidence)
  }, [component.suggestedCPEs])

  if (sortedCPEs.length === 0) {
    return (
      <tr className="border-b border-border bg-red-50">
        <td colSpan={5} className="p-3">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">{component.name}</span>
            <span className="text-muted-foreground">- No CPE suggestions available</span>
          </div>
        </td>
      </tr>
    )
  }

  // Single CPE - show as simple row
  if (!hasMultipleCPEs) {
    const cpe = sortedCPEs[0]
    const colors = getConfidenceColor(cpe.confidence)

    return (
      <tr className="border-b border-border hover:bg-muted/30 transition-colors">
        <td className="p-3">
          <div className="flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
        </td>
        <td className="p-3 font-medium text-foreground">{component.name}</td>
        <td className="p-3 text-muted-foreground font-mono text-xs">{component.version}</td>
        <td className="p-3">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-muted-foreground truncate max-w-xs" title={cpe.cpe}>
              {truncateCPE(cpe.cpe, 50)}
            </span>
            <span className="text-xs text-muted-foreground">
              {cpe.vendor} / {cpe.product}
            </span>
          </div>
        </td>
        <td className="p-3 text-center">
          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${colors.badge}`}>
            {cpe.confidence}%
          </span>
          <div className="text-xs text-muted-foreground mt-1">{getMatchTypeLabel(cpe.matchType)}</div>
        </td>
      </tr>
    )
  }

  // Multiple CPEs - show with radio buttons
  return (
    <>
      {sortedCPEs.map((cpe, index) => {
        const colors = getConfidenceColor(cpe.confidence)
        const isSelected = selectedCPE === cpe.cpe
        const isFirst = index === 0

        return (
          <tr
            key={`${component.id}-${cpe.cpe}`}
            className={`border-b border-border transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
          >
            <td className="p-3">
              <div className="flex items-center justify-center">
                <input
                  type="radio"
                  name={`cpe-${component.id}`}
                  value={cpe.cpe}
                  checked={isSelected}
                  onChange={() => onSelectionChange(component.id, cpe.cpe)}
                  className="h-4 w-4 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  aria-label={`Select CPE ${cpe.cpe} for ${component.name}`}
                />
              </div>
            </td>
            <td className="p-3">
              {isFirst ? (
                <span className="font-medium text-foreground">{component.name}</span>
              ) : (
                <span className="text-muted-foreground text-xs pl-4">alternative</span>
              )}
            </td>
            <td className="p-3">
              {isFirst && <span className="text-muted-foreground font-mono text-xs">{component.version}</span>}
            </td>
            <td className="p-3">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-xs" title={cpe.cpe}>
                  {truncateCPE(cpe.cpe, 50)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cpe.vendor} / {cpe.product}
                </span>
              </div>
            </td>
            <td className="p-3 text-center">
              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${colors.badge}`}>
                {cpe.confidence}%
              </span>
              <div className="text-xs text-muted-foreground mt-1">{getMatchTypeLabel(cpe.matchType)}</div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
