import React from 'react'
import { Check, Code, AlertCircle, TrendingUp } from 'lucide-react'
import type { RemediationAdvice } from '@@/types'

interface RemediationStepsProps {
  advice: RemediationAdvice
  onCopyCommand?: (command: string) => void
}

/**
 * Remediation Steps Component
 * Displays step-by-step remediation instructions
 */
export function RemediationSteps({ advice, onCopyCommand }: RemediationStepsProps) {
  const getPriorityIcon = () => {
    switch (advice.priority) {
      case 'immediate':
        return <AlertCircle className="h-5 w-5 text-red-600" />
      case 'high':
        return <AlertCircle className="h-5 w-5 text-orange-600" />
      case 'medium':
        return <TrendingUp className="h-5 w-5 text-yellow-600" />
      case 'low':
        return <Check className="h-5 w-5 text-green-600" />
    }
  }

  const getPriorityColor = () => {
    switch (advice.priority) {
      case 'immediate':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300'
    }
  }

  const getCategoryIcon = () => {
    switch (advice.category) {
      case 'upgrade':
        return <TrendingUp className="h-4 w-4" />
      case 'patch':
        return <Code className="h-4 w-4" />
      case 'mitigation':
        return <AlertCircle className="h-4 w-4" />
      case 'monitor':
        return <Check className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-4">
      {/* Priority Badge */}
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${getPriorityColor()}`}>
        {getPriorityIcon()}
        <span className="font-semibold capitalize">{advice.priority} Priority</span>
        <span className="mx-1">•</span>
        <span className="flex items-center gap-1 capitalize text-sm">
          {getCategoryIcon()}
          {advice.category}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Remediation Steps</h4>
        <div className="space-y-3">
          {advice.steps.map((step) => (
            <StepItem key={step.step} step={step} onCopyCommand={onCopyCommand} />
          ))}
        </div>
      </div>

      {/* Workarounds */}
      {advice.workarounds && advice.workarounds.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Temporary Workarounds</h4>
          <ul className="space-y-1">
            {advice.workarounds.map((workaround, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-yellow-600" />
                <span>{workaround}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Estimated Effort */}
      {advice.estimatedEffort && (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <span className="text-xs text-gray-500">Estimated Effort: </span>
          <span className="text-sm font-semibold text-gray-700 capitalize">{advice.estimatedEffort}</span>
        </div>
      )}
    </div>
  )
}

interface StepItemProps {
  step: {
    step: number
    action: string
    command?: string
    description: string
  }
  onCopyCommand?: (command: string) => void
}

function StepItem({ step, onCopyCommand }: StepItemProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = () => {
    if (step.command) {
      navigator.clipboard.writeText(step.command)
      setCopied(true)
      onCopyCommand?.(step.command)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
        {step.step}
      </div>
      <div className="flex-1">
        <h5 className="text-sm font-semibold text-gray-800">{step.action}</h5>
        <p className="mt-1 text-sm text-gray-600">{step.description}</p>
        {step.command && (
          <div className="mt-2 relative group">
            <pre className="overflow-x-auto rounded bg-gray-900 px-3 py-2 text-xs font-mono text-gray-100">
              <code>{step.command}</code>
            </pre>
            <button
              onClick={handleCopy}
              className="absolute right-2 top-2 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
