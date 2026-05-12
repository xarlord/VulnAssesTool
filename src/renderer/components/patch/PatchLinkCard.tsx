import React from 'react'
import { ExternalLink, GitCommit, GitPullRequest, Package, AlertTriangle } from 'lucide-react'
import type { PatchLink } from '@@/types'

interface PatchLinkCardProps {
  links: PatchLink[]
  onLinkClick?: (url: string) => void
}

/**
 * Patch Link Card Component
 * Displays links to patches, commits, PRs, and advisories
 */
export function PatchLinkCard({ links, onLinkClick }: PatchLinkCardProps) {
  if (links.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">No patch links available</p>
      </div>
    )
  }

  const getIcon = (type: PatchLink['type']) => {
    switch (type) {
      case 'commit':
        return <GitCommit className="h-4 w-4 text-purple-600" />
      case 'pr':
        return <GitPullRequest className="h-4 w-4 text-green-600" />
      case 'release':
        return <Package className="h-4 w-4 text-blue-600" />
      case 'advisory':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />
      default:
        return <ExternalLink className="h-4 w-4 text-gray-600" />
    }
  }

  const getTypeLabel = (type: PatchLink['type']) => {
    const labels = {
      commit: 'Commit',
      pr: 'Pull Request',
      advisory: 'Advisory',
      release: 'Release',
      vendor: 'Vendor',
    }
    return labels[type] || type
  }

  return (
    <div className="space-y-2">
      {links.map((link, index) => (
        <a
          key={index}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onLinkClick?.(link.url)}
          className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 hover:border-gray-300"
        >
          <div className="mt-0.5 flex-shrink-0">{getIcon(link.type)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-gray-500">{getTypeLabel(link.type)}</span>
              <span className="text-xs text-gray-400">from {link.source}</span>
            </div>
            {link.description && <p className="mt-1 text-sm text-gray-700 line-clamp-2">{link.description}</p>}
            <p className="mt-1 text-xs text-gray-500 truncate">{link.url}</p>
          </div>
          <ExternalLink className="h-4 w-4 flex-shrink-0 text-gray-400" />
        </a>
      ))}
    </div>
  )
}
