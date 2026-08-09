import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { SidebarContent } from './Sidebar'
import { TopBar } from './TopBar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSidebarOpen, useSetSidebarOpen, useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'

interface AppShellProps {
  onOpenCommandPalette: () => void
}

/**
 * The application shell: persistent left sidebar + top bar wrapping every
 * route via a layout <Outlet>. Desktop collapse state reuses the store's
 * `sidebarOpen` (already wired to Ctrl+Shift+S and the command palette's
 * "Toggle Sidebar" — which toggled nothing before this shell existed).
 *
 * Mobile (< lg) uses a Radix-Dialog drawer with LOCAL state instead of the
 * persisted flag, so a persisted `false` can never strand mobile users
 * without navigation.
 */
export function AppShell({ onOpenCommandPalette }: AppShellProps) {
  const sidebarOpen = useSidebarOpen()
  const setSidebarOpen = useSetSidebarOpen()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const { t } = useTranslation('shell')

  // Close the mobile drawer when the route changes (covers programmatic
  // navigation, e.g. from the command palette). Render-time state adjustment —
  // the React-documented alternative to a setState-in-effect.
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname)
    if (mobileNavOpen) setMobileNavOpen(false)
  }

  // Global Ctrl/Cmd+Shift+S toggles the sidebar — the shortcut the command palette
  // advertises for "Toggle Sidebar" but which nothing bound to a raw keypress (only
  // Ctrl+K / Ctrl+Shift+P were global). Read fresh store state so the listener binds once.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        const { sidebarOpen: open, setSidebarOpen: setOpen } = useStore.getState()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar rail (collapsible) */}
        <aside
          aria-label={t('sidebar.primaryNavigation')}
          className={cn(
            'hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex',
            sidebarOpen ? 'w-60' : 'w-16',
          )}
        >
          <SidebarContent collapsed={!sidebarOpen} />
        </aside>

        {/* Mobile drawer — Radix Dialog gives focus trap, Escape, and aria for free */}
        <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 lg:hidden" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden"
            >
              <DialogPrimitive.Title className="sr-only">{t('sidebar.navigation')}</DialogPrimitive.Title>
              <SidebarContent collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onOpenCommandPalette={onOpenCommandPalette}
          />
          {/* The skip link's target and the app's single <main> landmark —
              focusable so skipping lands correctly. Pages must not render their
              own <main> (that would nest landmarks); they render plain wrappers. */}
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
