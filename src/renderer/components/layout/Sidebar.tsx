import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, LayoutDashboard, Search, Settings, ChevronLeft, ChevronRight, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarOpen, useSetSidebarOpen } from '@/store/useStore'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'

interface NavItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const open = useSidebarOpen()
  const setOpen = useSetSidebarOpen()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
          open ? 'w-56' : 'w-14',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b border-sidebar-border px-3',
            open ? 'justify-between' : 'justify-center',
          )}
        >
          {open && (
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-400" />
              <span className="text-sm font-bold tracking-wide">D-Fence</span>
            </div>
          )}
          {!open && <Shield className="h-6 w-6 text-blue-400" />}
        </div>

        <nav className="flex-1 space-y-1 px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path)
            const Icon = item.icon

            const button = (
              <button
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-white'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  !open && 'justify-center px-0',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {open && <span className="truncate">{item.label}</span>}
              </button>
            )

            if (!open) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }

            return <React.Fragment key={item.path}>{button}</React.Fragment>
          })}
        </nav>

        <div className={cn('border-t border-sidebar-border p-2', !open && 'flex justify-center')}>
          <button
            onClick={() => setOpen(!open)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              !open && 'px-0',
            )}
          >
            {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {open && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
