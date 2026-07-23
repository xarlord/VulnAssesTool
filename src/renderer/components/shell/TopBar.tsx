import { Link, matchPath, useLocation } from 'react-router-dom'
import { Menu, Monitor, Moon, PanelLeft, Search, Sun } from 'lucide-react'
import { NotificationCenter } from '@/components/NotificationCenter'
import { OfflineIndicator } from '@/components/OfflineIndicator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettings, useUpdateSettings, useProjects } from '@/store/useStore'
import type { AppSettings } from '@@/types'

interface Crumb {
  label: string
  to?: string
}

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/search': 'Search',
  '/executive': 'Reports',
  '/settings': 'Settings',
}

/** Derive breadcrumbs from the location; project routes get Dashboard / name / sub-page. */
function useBreadcrumbs(): Crumb[] {
  const location = useLocation()
  const projects = useProjects()

  const projectMatch = matchPath({ path: '/project/:projectId/*', end: false }, location.pathname)
  if (projectMatch?.params.projectId) {
    const project = projects.find((p) => p.id === projectMatch.params.projectId)
    const crumbs: Crumb[] = [
      { label: 'Dashboard', to: '/dashboard' },
      { label: project?.name ?? 'Project', to: `/project/${projectMatch.params.projectId}` },
    ]
    const sub = projectMatch.params['*']
    if (sub === 'fpf') crumbs.push({ label: 'False Positives' })
    else if (sub === 'graph') crumbs.push({ label: 'Dependency Graph' })
    else crumbs.pop() // Overview: the project crumb is the current page
    if (crumbs.length === 1) crumbs.push({ label: project?.name ?? 'Project' })
    return crumbs
  }

  const label = PAGE_LABELS[location.pathname]
  return label ? [{ label }] : []
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenMobileNav: () => void
  onOpenCommandPalette: () => void
}

/**
 * Persistent top bar: sidebar controls, breadcrumb, and the global
 * affordances that previously existed only on the Dashboard header
 * (offline indicator, notification center) plus a theme toggle that was
 * previously reachable only by navigating to Settings.
 */
export function TopBar({ onToggleSidebar, onOpenMobileNav, onOpenCommandPalette }: TopBarProps) {
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
  const crumbs = useBreadcrumbs()
  const ThemeIcon = THEME_ICONS[settings.theme]

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
      <button
        onClick={onOpenMobileNav}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>
      <button
        onClick={onToggleSidebar}
        className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:inline-flex"
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && <span className="text-muted-foreground/60">/</span>}
              {crumb.to ? (
                <Link to={crumb.to} className="truncate text-muted-foreground hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-medium" aria-current="page">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <button
        onClick={onOpenCommandPalette}
        className="hidden items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted sm:flex"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Commands...</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">Ctrl+K</kbd>
      </button>

      <OfflineIndicator compact />
      <NotificationCenter />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Change theme"
          >
            <ThemeIcon className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.theme}
            onValueChange={(value) => updateSettings({ theme: value as AppSettings['theme'] })}
          >
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
