/**
 * About Dialog Component
 *
 * Displays application information, version, and links to documentation.
 *
 * @module components/AboutDialog
 */

import React from 'react'
import { getPlatform } from '@/lib/platform'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Shield, ExternalLink, Github, FileText, Mail, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface AboutDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Called when dialog closes */
  onOpenChange: (open: boolean) => void
}

// ============================================================================
// VERSION INFO
// ============================================================================

const APP_INFO = {
  name: 'VulnAssesTool',
  version: '2.0.0',
  description: 'Vulnerability Assessment Tool',
  buildDate: new Date().toISOString().split('T')[0],
  author: 'VulnAssesTool Team',
  license: 'MIT',
  repository: 'https://github.com/xarlord/d-fence-vulnerability-assesment-tool',
  documentation: 'https://github.com/xarlord/d-fence-vulnerability-assesment-tool#readme',
  issues: 'https://github.com/xarlord/d-fence-vulnerability-assesment-tool/issues',
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * AboutDialog displays application information and useful links
 */
export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const handleOpenExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">About VulnAssesTool</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center text-center py-4">
          {/* Logo */}
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Shield className="h-12 w-12 text-primary" />
          </div>

          {/* App Name */}
          <h2 className="text-2xl font-bold text-foreground">{APP_INFO.name}</h2>

          {/* Version */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">Version {APP_INFO.version}</span>
            <span className="text-xs text-muted-foreground">• {APP_INFO.buildDate}</span>
          </div>

          {/* Description */}
          <p className="text-muted-foreground mt-3 max-w-xs">{APP_INFO.description}</p>

          {/* Features */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <FeatureBadge>SBOM Analysis</FeatureBadge>
            <FeatureBadge>KEV Intelligence</FeatureBadge>
            <FeatureBadge>EPSS Scores</FeatureBadge>
            <FeatureBadge>VEX Export</FeatureBadge>
            <FeatureBadge>FPF System</FeatureBadge>
            <FeatureBadge>Offline Mode</FeatureBadge>
          </div>

          {/* Links */}
          <div className="mt-6 space-y-2 w-full">
            <LinkButton
              icon={FileText}
              label="Documentation"
              onClick={() => handleOpenExternal(APP_INFO.documentation)}
            />
            <LinkButton icon={Github} label="View on GitHub" onClick={() => handleOpenExternal(APP_INFO.repository)} />
            <LinkButton icon={Mail} label="Report an Issue" onClick={() => handleOpenExternal(APP_INFO.issues)} />
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-border w-full">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {APP_INFO.author}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Licensed under {APP_INFO.license}</p>
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-2">
              Made with <Heart className="h-3 w-3 text-red-500 fill-red-500" /> for secure software
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function FeatureBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground">
      {children}
    </span>
  )
}

interface LinkButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}

function LinkButton({ icon: Icon, label, onClick }: LinkButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-between w-full px-3 py-2 rounded-md',
        'text-sm text-foreground hover:bg-muted transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </button>
  )
}

// ============================================================================
// VERSION CHECKER (FUTURE ENHANCEMENT)
// ============================================================================

/**
 * Check for application updates via GitHub Releases API
 */
export async function checkForUpdates(): Promise<{
  hasUpdate: boolean
  latestVersion?: string
  downloadUrl?: string
  releaseNotes?: string
}> {
  try {
    const currentVersion = await getPlatform().getAppVersion()
    const response = await fetch(
      'https://api.github.com/repos/xarlord/d-fence-vulnerability-assesment-tool/releases/latest',
    )

    if (!response.ok) {
      return { hasUpdate: false }
    }

    const release = await response.json()
    const latestTag = release.tag_name?.replace(/^v/, '') || ''

    // Compare semantic versions
    if (latestTag && isNewerVersion(currentVersion, latestTag)) {
      return {
        hasUpdate: true,
        latestVersion: latestTag,
        downloadUrl: release.html_url,
        releaseNotes: release.body?.substring(0, 200),
      }
    }

    return { hasUpdate: false, latestVersion: latestTag || currentVersion }
  } catch {
    return { hasUpdate: false }
  }
}

/**
 * Compare two semver strings — returns true if `remote` is newer than `local`
 */
function isNewerVersion(local: string, remote: string): boolean {
  const parseVer = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0)

  const localParts = parseVer(local)
  const remoteParts = parseVer(remote)

  for (let i = 0; i < 3; i++) {
    const l = localParts[i] || 0
    const r = remoteParts[i] || 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

export default AboutDialog
