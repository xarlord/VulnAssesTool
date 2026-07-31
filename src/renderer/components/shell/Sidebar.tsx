import { NavLink, matchPath, useLocation } from 'react-router-dom'
import {
  BarChart3,
  FolderOpen,
  History,
  LayoutDashboard,
  Network,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { AppLogo } from '@/components/AppLogo'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProjects } from '@/store/useStore'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** NavLink end-matching (exact) — needed for the project Overview item. */
  end?: boolean
  dataTour?: string
}

const MAIN_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/executive', label: 'Reports', icon: BarChart3 },
  { to: '/audit', label: 'Audit Log', icon: History },
]

interface SidebarContentProps {
  collapsed: boolean
  /** Called after a nav item is activated (used to close the mobile drawer). */
  onNavigate?: () => void
}

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      data-tour={item.dataTour}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-2',
          isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Primary navigation content, shared by the desktop rail and the mobile
 * drawer. When the route is inside a project, a contextual "Project" group
 * (Overview / False Positives / Dependency Graph) replaces the three
 * inconsistent per-page back-buttons the app previously relied on.
 */
export function SidebarContent({ collapsed, onNavigate }: SidebarContentProps) {
  const location = useLocation()
  const projects = useProjects()

  const projectMatch = matchPath({ path: '/project/:projectId', end: false }, location.pathname)
  const projectId = projectMatch?.params.projectId
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined

  const projectNav: NavItem[] = projectId
    ? [
        { to: `/project/${projectId}`, label: 'Overview', icon: FolderOpen, end: true },
        { to: `/project/${projectId}/fpf`, label: 'False Positives', icon: ShieldCheck },
        { to: `/project/${projectId}/graph`, label: 'Dependency Graph', icon: Network },
      ]
    : []

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center px-4 py-4', collapsed && 'justify-center px-2')}>
        <AppLogo size="sm" showText={!collapsed} />
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        {MAIN_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        {projectId && (
          <>
            <Separator className="my-2" />
            {!collapsed && (
              <p className="truncate px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {project?.name ?? 'Project'}
              </p>
            )}
            {projectNav.map((item) => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>

      <div className="px-2 pb-4">
        <Separator className="mb-2" />
        <SidebarLink
          item={{ to: '/settings', label: 'Settings', icon: Settings, dataTour: 'settings-link' }}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  )
}
