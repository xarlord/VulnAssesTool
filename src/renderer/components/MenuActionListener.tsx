import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useSidebarOpen, useSetSidebarOpen } from '@/store/useStore'
import { getPlatform } from '@/lib/platform'

/**
 * Global component that listens for menu actions from the Electron main process
 * and triggers the corresponding actions in the renderer process.
 *
 * This should be placed near the root of the component tree to catch all menu actions.
 */
export function MenuActionListener() {
  const navigate = useNavigate()
  const projects = useProjects()
  const sidebarOpen = useSidebarOpen()
  const setSidebarOpen = useSetSidebarOpen()

  useEffect(() => {
    // Only set up menu listener in Electron environment
    if (typeof window === 'undefined' || !getPlatform()) {
      return
    }

    const handleMenuAction = (action: string) => {
      switch (action) {
        case 'new-project':
          // Dispatch custom event to open create project dialog
          window.dispatchEvent(new CustomEvent('menu-open-create-project'))
          break

        case 'import-sbom':
          // Dispatch custom event to open SBOM upload dialog
          window.dispatchEvent(new CustomEvent('menu-open-upload-sbom'))
          break

        case 'generate-sbom':
          // Dispatch custom event to open SBOM generator dialog
          window.dispatchEvent(new CustomEvent('menu-open-sbom-generator'))
          break

        case 'export-all':
          // Only show export dialog if there are projects
          if (projects.length > 0) {
            window.dispatchEvent(new CustomEvent('menu-open-export', { detail: { projects } }))
          }
          break

        case 'settings':
          navigate('/settings')
          break

        case 'navigate-dashboard':
          navigate('/')
          break

        case 'toggle-sidebar':
          setSidebarOpen(!sidebarOpen)
          break

        case 'check-updates':
          // Open check updates dialog or show notification
          window.dispatchEvent(new CustomEvent('menu-check-updates'))
          break

        case 'about':
          // Open about dialog
          window.dispatchEvent(new CustomEvent('menu-about'))
          break

        case 'show-tour':
          // Start onboarding tour
          window.dispatchEvent(new CustomEvent('menu-show-tour'))
          break

        case 'open-command-palette':
          // Open command palette
          window.dispatchEvent(new CustomEvent('menu-open-command-palette'))
          break

        default:
          console.warn('Unknown menu action:', action)
      }
    }

    // Register the menu action listener
    const cleanup = getPlatform().onMenuAction(handleMenuAction)

    // Cleanup on unmount
    return cleanup
  }, [navigate, setSidebarOpen, sidebarOpen, projects])

  // This component doesn't render anything
  return null
}

/**
 * Hook to listen for specific menu action events
 */
export function useMenuActionListener(eventName: string, handler: () => void) {
  useEffect(() => {
    const handleEvent = () => handler()

    window.addEventListener(eventName, handleEvent)

    return () => {
      window.removeEventListener(eventName, handleEvent)
    }
  }, [eventName, handler])
}
