import React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { CvssBreakdown } from '@@/types'

interface CvssMetricsGridProps {
  breakdown: CvssBreakdown
  expanded?: boolean
  onToggle?: () => void
}

/**
 * CVSS Metrics Grid Component
 * Displays detailed metric explanations in a grid layout
 */
export const CvssMetricsGrid = React.memo(function CvssMetricsGrid({
  breakdown,
  expanded = false,
  onToggle,
}: CvssMetricsGridProps) {
  const [isExpanded, setIsExpanded] = React.useState(expanded)

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
    onToggle?.()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">CVSS Metrics</h4>
        <button onClick={handleToggle} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          {isExpanded ? (
            <>
              <span>Hide</span>
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              <span>Show</span>
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="grid gap-3 md:grid-cols-2">
          {breakdown.explanations.map((explanation) => (
            <MetricCard key={explanation.metric} explanation={explanation} />
          ))}
        </div>
      )}
    </div>
  )
})

interface MetricCardProps {
  explanation: {
    metric: string
    value: string
    description: string
    implications: string
    example: string
  }
}

function MetricCard({ explanation }: MetricCardProps) {
  const getValueColor = (metric: string, value: string): string => {
    // Higher risk values in red/orange
    const highRiskValues = ['Network', 'Low', 'None', 'Changed', 'High']
    if (highRiskValues.includes(value)) {
      return 'text-red-600'
    }
    return 'text-green-600'
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h5 className="text-xs font-semibold text-gray-700">{explanation.metric}</h5>
        <span className={`text-xs font-bold ${getValueColor(explanation.metric, explanation.value)}`}>
          {explanation.value}
        </span>
      </div>
      <p className="mb-2 text-xs text-gray-600">{explanation.description}</p>
      <div className="mb-1 text-xs">
        <span className="font-semibold text-gray-700">Impact: </span>
        <span className="text-gray-600">{explanation.implications}</span>
      </div>
      <div className="text-xs">
        <span className="font-semibold text-gray-700">Example: </span>
        <span className="text-gray-600">{explanation.example}</span>
      </div>
    </div>
  )
}
