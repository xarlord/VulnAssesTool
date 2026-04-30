import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useSettings, useSetSidebarOpen, useSidebarOpen } from './store/useStore'
import { Toaster } from './components/Toaster'
import { MenuActionListener } from './components/MenuActionListener'
// NotificationCenter is used via Toaster notification system
import { ErrorBoundary } from './components/ErrorBoundary'
import { CommandPalette, useCommandPalette, CommandPaletteTrigger } from './components/CommandPalette'
import { OnboardingTour, useOnboardingTour } from './components/onboarding'
import { useSyncNotifications } from './lib/hooks'
import { registerAppCommands, unregisterAppCommands } from './lib/commands'

// Lazy-loaded pages for better startup performance
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Search = lazy(() => import('./pages/Search'))
const FalsePositiveFilterPage = lazy(() => import('./pages/FalsePositiveFilter'))
const DependencyGraphPage = lazy(() => import('./pages/DependencyGraphPage'))

const ExecutiveDashboard = lazy(() => import('./components/executive').then((m) => ({ default: m.ExecutiveDashboard })))

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  )
}

function App() {
  const settings = useSettings()
  const setSidebarOpen = useSetSidebarOpen()
  const sidebarOpen = useSidebarOpen()
  const navigate = useNavigate()
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen, togglePalette } = useCommandPalette()
  const { hasLaunchedBefore, markAsLaunched } = useOnboardingTour()
  const [showTour, setShowTour] = React.useState(false)

  // Expose navigate for E2E testing
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__navigate = navigate
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as Record<string, unknown>).__navigate
      }
    }
  }, [navigate])

  // Initialize sync notifications for offline queue
  useSyncNotifications()

  // Register app commands on mount
  React.useEffect(() => {
    const toggleSidebar = () => setSidebarOpen(!sidebarOpen)
    registerAppCommands(navigate, toggleSidebar)

    return () => {
      unregisterAppCommands()
    }
  }, [navigate, setSidebarOpen, sidebarOpen])

  // First launch tour logic
  React.useEffect(() => {
    if (!hasLaunchedBefore) {
      markAsLaunched()
      // Show tour after a short delay to let the UI render
      const timer = setTimeout(() => {
        setShowTour(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [hasLaunchedBefore, markAsLaunched])

  // Listen for menu actions to show tour and command palette
  React.useEffect(() => {
    const handleShowTour = () => {
      setShowTour(true)
    }
    const handleOpenCommandPalette = () => {
      togglePalette()
    }

    window.addEventListener('menu-show-tour', handleShowTour)
    window.addEventListener('menu-open-command-palette', handleOpenCommandPalette)

    return () => {
      window.removeEventListener('menu-show-tour', handleShowTour)
      window.removeEventListener('menu-open-command-palette', handleOpenCommandPalette)
    }
  }, [togglePalette])

  // Handle tour completion
  const handleTourComplete = React.useCallback(() => {
    setShowTour(false)
  }, [])

  // Apply theme class
  React.useEffect(() => {
    const root = document.documentElement
    const theme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : settings.theme

    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [settings.theme])

  // Apply font size
  React.useEffect(() => {
    const fontSizes = { small: '12px', default: '14px', large: '16px' }
    document.documentElement.style.fontSize = fontSizes[settings.fontSize]
  }, [settings.fontSize])

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <MenuActionListener />
        <CommandPaletteTrigger onTrigger={togglePalette} />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/executive" element={<ExecutiveDashboard />} />
            <Route path="/search" element={<Search />} />
            <Route path="/project/:projectId" element={<ProjectDetail />} />
            <Route path="/project/:projectId/fpf" element={<FalsePositiveFilterPage />} />
            <Route path="/project/:projectId/graph" element={<DependencyGraphPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster />

        {/* Command Palette */}
        <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />

        {/* Onboarding Tour */}
        <OnboardingTour startImmediately={showTour} onComplete={handleTourComplete} onSkip={handleTourComplete} />
      </div>
    </ErrorBoundary>
  )
}

export default App
