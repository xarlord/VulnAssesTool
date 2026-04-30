import { useNotificationsStore } from './notificationsStore'
import type { AppNotification } from '@@/types'
import { isElectron } from '@/lib/platform'

/**
 * Notification Service
 * Handles both in-app and desktop notifications
 */

// Request notification permission for web
const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

// Show desktop notification (web or Electron)
const showDesktopNotification = (title: string, body: string, onClick?: () => void): void => {
  const preferences = useNotificationsStore.getState().preferences

  if (!preferences.desktopEnabled) {
    return
  }

  // Electron notifications (handled by main process)
  if (isElectron()) {
    // In a real Electron app, you'd call the main process here
    // For now, we'll use the web Notification API as fallback
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/icon.png', // You'd want to use your actual app icon
        tag: Date.now().toString(),
      })

      if (onClick) {
        notification.onclick = onClick
      }
    }
    return
  }

  // Web notifications
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: '/icon.png',
      tag: Date.now().toString(),
    })

    if (onClick) {
      notification.onclick = onClick
    }
  }
}

/**
 * Add a notification and optionally show desktop notification
 */
export const addNotification = (
  notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>,
  showDesktop: boolean = true,
): AppNotification | null => {
  const newNotification = useNotificationsStore.getState().addNotification(notification)

  if (newNotification && showDesktop) {
    showDesktopNotification(
      notification.title,
      notification.message,
      notification.actionUrl
        ? () => {
            // Navigate to action URL
            if (notification.actionUrl) {
              window.location.href = notification.actionUrl
            }
          }
        : undefined,
    )
  }

  return newNotification
}

/**
 * Convenience functions for common notification types
 */

export const notifyCriticalVuln = (vulnId: string, projectName: string, severity: string): AppNotification | null => {
  return addNotification({
    type: 'error',
    category: 'critical_vuln',
    title: 'Critical Vulnerability Detected',
    message: `${severity} vulnerability ${vulnId} found in ${projectName}`,
    projectId: projectName,
    actionUrl: `/project/${projectName}`,
  })
}

export const notifyScanComplete = (projectName: string, vulnCount: number): AppNotification | null => {
  return addNotification({
    type: 'success',
    category: 'scan_complete',
    title: 'Scan Complete',
    message: `Found ${vulnCount} vulnerabilities in ${projectName}`,
    projectId: projectName,
    actionUrl: `/project/${projectName}`,
  })
}

export const notifyUpdateAvailable = (currentVersion: string, newVersion: string): AppNotification | null => {
  return addNotification({
    type: 'info',
    category: 'update_available',
    title: 'Update Available',
    message: `Version ${newVersion} is available (you're on ${currentVersion})`,
  })
}

export const notifySystem = (
  title: string,
  message: string,
  type: AppNotification['type'] = 'info',
): AppNotification | null => {
  return addNotification({
    type,
    category: 'system',
    title,
    message,
  })
}

/**
 * Initialize the notification service
 * Requests permission for desktop notifications if needed
 */
export const initializeNotifications = async (): Promise<void> => {
  const preferences = useNotificationsStore.getState().preferences

  if (!preferences.enabled || !preferences.desktopEnabled) {
    return
  }

  // Request permission for web notifications
  if (!isElectron()) {
    await requestNotificationPermission()
  }
}

/**
 * Notification management functions
 */
export const removeNotification = (id: string): void => {
  useNotificationsStore.getState().removeNotification(id)
}

export const dismissNotification = (id: string): void => {
  useNotificationsStore.getState().dismissNotification(id)
}

export const markAsRead = (id: string): void => {
  useNotificationsStore.getState().markAsRead(id)
}

export const markAllAsRead = (): void => {
  useNotificationsStore.getState().markAllAsRead()
}

export const clearAllNotifications = (): void => {
  useNotificationsStore.getState().clearAll()
}

/**
 * Notification preferences management
 */
export const updateNotificationPreferences = (preferences: Partial<AppNotification>): void => {
  useNotificationsStore.getState().updatePreferences(preferences)
}

export const setCategoryEnabled = (category: keyof AppNotification['category'], enabled: boolean): void => {
  useNotificationsStore.getState().setCategoryEnabled(category, enabled)
}
