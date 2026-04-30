import React from 'react'
import { Shield, FileText, AlertTriangle, Search } from 'lucide-react'
import type { LucideProps } from 'lucide-react'

interface EmptyStateProps {
  type?: 'projects' | 'components' | 'vulnerabilities' | 'sbom' | 'search'
  icon?: React.ComponentType<LucideProps>
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

const PRESET_CONFIGS = {
  projects: {
    icon: Shield,
    title: 'No projects yet',
    description: 'Create a new project to get started with vulnerability assessment',
  },
  components: {
    icon: Shield,
    title: 'No components found',
    description: 'Upload an SBOM file to view and analyze components',
  },
  vulnerabilities: {
    icon: AlertTriangle,
    title: 'No vulnerabilities found',
    description: 'Run a vulnerability scan to check for security issues',
  },
  sbom: {
    icon: FileText,
    title: 'No SBOM files uploaded',
    description: 'Upload a CycloneDX or SPDX file to get started',
  },
  search: {
    icon: Search,
    title: 'No results found',
    description: 'Try adjusting your filters or search terms',
  },
} as const

export default function EmptyState({ type, icon, title, description, action }: EmptyStateProps) {
  // Use preset config if type is provided, otherwise use direct props
  const presetConfig = type ? PRESET_CONFIGS[type] : null
  const Icon = icon || presetConfig?.icon || Search
  const displayTitle = title || presetConfig?.title || 'No results'
  const displayDescription = description || presetConfig?.description || 'Try adjusting your search'

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">{displayTitle}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm">{displayDescription}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
