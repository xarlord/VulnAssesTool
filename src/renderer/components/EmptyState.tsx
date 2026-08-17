import React from 'react'
import { useTranslation } from 'react-i18next'
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

const PRESET_ICONS = {
  projects: Shield,
  components: Shield,
  vulnerabilities: AlertTriangle,
  sbom: FileText,
  search: Search,
} as const

export function EmptyState({ type, icon, title, description, action }: EmptyStateProps) {
  const { t } = useTranslation('emptyState')
  // Use preset icon/text if type is provided, otherwise use direct props
  const Icon = icon || (type ? PRESET_ICONS[type] : null) || Search
  const displayTitle = title || (type ? t(`presets.${type}.title`) : '') || t('default.title')
  const displayDescription = description || (type ? t(`presets.${type}.description`) : '') || t('default.description')

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
