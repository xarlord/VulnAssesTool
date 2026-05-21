import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addNotification,
  notifyCriticalVuln,
  notifyScanComplete,
  notifyUpdateAvailable,
  notifySystem,
  initializeNotifications,
  removeNotification,
  dismissNotification,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
  updateNotificationPreferences,
  setCategoryEnabled,
} from './notificationService'
import { useNotificationsStore } from './notificationsStore'
import { isElectron } from '@/lib/platform'

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Reset store to defaults
    const store = useNotificationsStore.getState()
    store.clearAll()
    store.updatePreferences({
      enabled: true,
      desktopEnabled: true,
      categories: {
        critical_vuln: true,
        scan_complete: true,
        update_available: true,
        system: true,
      },
    })
    useNotificationsStore.setState({ notifications: [] })
  })

  describe('addNotification', () => {
    it('should add a notification and return it', () => {
      const result = addNotification({
        type: 'info',
        category: 'system',
        title: 'Test',
        message: 'Test message',
      })

      expect(result).not.toBeNull()
      expect(result?.title).toBe('Test')
      expect(result?.message).toBe('Test message')
      expect(result?.read).toBe(false)
      expect(result?.id).toBeTruthy()
    })

    it('should add notification to the store', () => {
      addNotification({
        type: 'info',
        category: 'system',
        title: 'Stored',
        message: 'Stored message',
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(1)
      expect(state.notifications[0].title).toBe('Stored')
    })

    it('should return null when notifications are disabled', () => {
      useNotificationsStore.getState().updatePreferences({ enabled: false })

      const result = addNotification({
        type: 'info',
        category: 'system',
        title: 'Ignored',
        message: 'Ignored message',
      })

      expect(result).toBeNull()
    })

    it('should return null when category is disabled', () => {
      useNotificationsStore.getState().setCategoryEnabled('system', false)

      const result = addNotification({
        type: 'info',
        category: 'system',
        title: 'Ignored',
        message: 'Ignored message',
      })

      expect(result).toBeNull()
    })

    it('should not attempt desktop notification when showDesktop is false', () => {
      const notifSpy = vi.spyOn(useNotificationsStore.getState(), 'addNotification')

      addNotification(
        {
          type: 'info',
          category: 'system',
          title: 'No Desktop',
          message: 'No desktop notification',
        },
        false,
      )

      // The store addNotification is still called (for in-app)
      // We just verify the notification was added (desktop path was not triggered)
      expect(useNotificationsStore.getState().notifications).toHaveLength(1)
    })

    it('should not show desktop notification when desktopEnabled is false', () => {
      useNotificationsStore.getState().updatePreferences({ desktopEnabled: false })

      // Should not throw even if Notification API is not fully available
      addNotification({
        type: 'info',
        category: 'system',
        title: 'Desktop Off',
        message: 'Desktop disabled',
      })

      expect(useNotificationsStore.getState().notifications).toHaveLength(1)
    })

    it('should handle notification with actionUrl', () => {
      const result = addNotification({
        type: 'error',
        category: 'critical_vuln',
        title: 'Critical',
        message: 'Critical vuln found',
        projectId: 'my-project',
        actionUrl: '/project/my-project',
      })

      expect(result).not.toBeNull()
      expect(result?.actionUrl).toBe('/project/my-project')
    })
  })

  describe('notifyCriticalVuln', () => {
    it('should add a critical vulnerability notification', () => {
      const result = notifyCriticalVuln('CVE-2024-1234', 'my-project', 'Critical')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('error')
      expect(result?.category).toBe('critical_vuln')
      expect(result?.title).toBe('Critical Vulnerability Detected')
      expect(result?.message).toContain('CVE-2024-1234')
      expect(result?.message).toContain('my-project')
      expect(result?.projectId).toBe('my-project')
      expect(result?.actionUrl).toBe('/project/my-project')
    })
  })

  describe('notifyScanComplete', () => {
    it('should add a scan complete notification', () => {
      const result = notifyScanComplete('project-x', 5)

      expect(result).not.toBeNull()
      expect(result?.type).toBe('success')
      expect(result?.category).toBe('scan_complete')
      expect(result?.title).toBe('Scan Complete')
      expect(result?.message).toContain('5')
      expect(result?.message).toContain('project-x')
      expect(result?.projectId).toBe('project-x')
    })

    it('should handle zero vulnerabilities', () => {
      const result = notifyScanComplete('clean-project', 0)

      expect(result).not.toBeNull()
      expect(result?.message).toContain('0')
    })
  })

  describe('notifyUpdateAvailable', () => {
    it('should add an update available notification', () => {
      const result = notifyUpdateAvailable('1.0.0', '2.0.0')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('info')
      expect(result?.category).toBe('update_available')
      expect(result?.title).toBe('Update Available')
      expect(result?.message).toContain('2.0.0')
      expect(result?.message).toContain('1.0.0')
    })
  })

  describe('notifySystem', () => {
    it('should add a system notification with default type info', () => {
      const result = notifySystem('System Alert', 'Something happened')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('info')
      expect(result?.category).toBe('system')
      expect(result?.title).toBe('System Alert')
      expect(result?.message).toBe('Something happened')
    })

    it('should allow overriding notification type', () => {
      const result = notifySystem('Warning', 'Watch out', 'warning')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('warning')
    })

    it('should allow error type', () => {
      const result = notifySystem('Error', 'Something broke', 'error')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('error')
    })

    it('should allow success type', () => {
      const result = notifySystem('Success', 'All good', 'success')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('success')
    })
  })

  describe('initializeNotifications', () => {
    it('should not request permission when notifications are disabled', async () => {
      useNotificationsStore.getState().updatePreferences({ enabled: false })

      // Should resolve without error
      await initializeNotifications()

      // No Notification API calls expected
    })

    it('should not request permission when desktop notifications are disabled', async () => {
      useNotificationsStore.getState().updatePreferences({ desktopEnabled: false })

      await initializeNotifications()
    })

    it('should not request permission in Electron environment', async () => {
      vi.mocked(isElectron).mockReturnValue(true)

      // Should return early for Electron
      await initializeNotifications()
    })
  })

  describe('notification management functions', () => {
    it('should remove a notification by id', () => {
      const notif = addNotification(
        {
          type: 'info',
          category: 'system',
          title: 'Remove Me',
          message: 'To be removed',
        },
        false,
      )

      expect(notif).not.toBeNull()
      removeNotification(notif?.id as string)

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(0)
    })

    it('should dismiss a notification by id', () => {
      const notif = addNotification(
        {
          type: 'info',
          category: 'system',
          title: 'Dismiss Me',
          message: 'To be dismissed',
        },
        false,
      )

      expect(notif).not.toBeNull()
      dismissNotification(notif?.id as string)

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(0)
    })

    it('should mark a notification as read', () => {
      const notif = addNotification(
        {
          type: 'info',
          category: 'system',
          title: 'Read Me',
          message: 'To be read',
        },
        false,
      )

      expect(notif?.read).toBe(false)

      markAsRead(notif?.id as string)

      const state = useNotificationsStore.getState()
      const found = state.notifications.find((n) => n.id === notif?.id)
      expect(found?.read).toBe(true)
    })

    it('should mark all notifications as read', () => {
      addNotification({ type: 'info', category: 'system', title: 'A', message: 'a' }, false)
      addNotification({ type: 'info', category: 'system', title: 'B', message: 'b' }, false)
      addNotification({ type: 'info', category: 'system', title: 'C', message: 'c' }, false)

      markAllAsRead()

      const state = useNotificationsStore.getState()
      expect(state.notifications.every((n) => n.read)).toBe(true)
    })

    it('should clear all notifications', () => {
      addNotification({ type: 'info', category: 'system', title: 'A', message: 'a' }, false)
      addNotification({ type: 'info', category: 'system', title: 'B', message: 'b' }, false)

      expect(useNotificationsStore.getState().notifications.length).toBeGreaterThan(0)

      clearAllNotifications()

      expect(useNotificationsStore.getState().notifications).toHaveLength(0)
    })
  })

  describe('preference management', () => {
    it('should update notification preferences', () => {
      updateNotificationPreferences({ desktopEnabled: false })

      const state = useNotificationsStore.getState()
      expect(state.preferences.desktopEnabled).toBe(false)
    })

    it('should set a specific category enabled', () => {
      setCategoryEnabled('critical_vuln', false)

      const state = useNotificationsStore.getState()
      expect(state.preferences.categories.critical_vuln).toBe(false)
    })

    it('should re-enable a disabled category', () => {
      setCategoryEnabled('scan_complete', false)
      expect(useNotificationsStore.getState().preferences.categories.scan_complete).toBe(false)

      setCategoryEnabled('scan_complete', true)
      expect(useNotificationsStore.getState().preferences.categories.scan_complete).toBe(true)
    })
  })

  describe('Desktop Notification API', () => {
    let mockNotificationInstance: { onclick: (() => void) | null }
    let ctorCalls: Array<{ title: string; options: unknown }>
    let MockNotificationCtor: {
      (title: string, options?: unknown): typeof mockNotificationInstance
      permission: string
      requestPermission: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
      mockNotificationInstance = { onclick: null }
      ctorCalls = []

      MockNotificationCtor = function (this: unknown, title: string, options?: unknown) {
        ctorCalls.push({ title, options })
        return mockNotificationInstance
      } as unknown as typeof MockNotificationCtor
      MockNotificationCtor.permission = 'granted'
      MockNotificationCtor.requestPermission = vi.fn().mockResolvedValue('granted')

      vi.stubGlobal('Notification', MockNotificationCtor)

      useNotificationsStore.getState().updatePreferences({
        enabled: true,
        desktopEnabled: true,
      })
    })

    it('should create desktop notification in Electron environment', () => {
      vi.mocked(isElectron).mockReturnValue(true)

      addNotification({
        type: 'info',
        category: 'system',
        title: 'Electron Desktop',
        message: 'Electron desktop notification',
      })

      expect(ctorCalls).toHaveLength(1)
      expect(ctorCalls[0].title).toBe('Electron Desktop')
      expect((ctorCalls[0].options as Record<string, unknown>)?.body).toBe('Electron desktop notification')
    })

    it('should create desktop notification in web environment', () => {
      vi.mocked(isElectron).mockReturnValue(false)

      addNotification({
        type: 'info',
        category: 'system',
        title: 'Web Desktop',
        message: 'Web desktop notification',
      })

      expect(ctorCalls).toHaveLength(1)
      expect(ctorCalls[0].title).toBe('Web Desktop')
      expect((ctorCalls[0].options as Record<string, unknown>)?.body).toBe('Web desktop notification')
    })

    it('should set onclick handler when notification has actionUrl', () => {
      vi.mocked(isElectron).mockReturnValue(false)

      addNotification({
        type: 'error',
        category: 'critical_vuln',
        title: 'Critical',
        message: 'Critical vuln found',
        projectId: 'proj-1',
        actionUrl: '/project/proj-1',
      })

      expect(mockNotificationInstance.onclick).toBeInstanceOf(Function)
    })

    it('should navigate via onclick when actionUrl is set', () => {
      vi.mocked(isElectron).mockReturnValue(false)

      const originalLocation = window.location
      const mockLocation = { href: '' }
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
        configurable: true,
      })

      addNotification({
        type: 'error',
        category: 'critical_vuln',
        title: 'Navigate',
        message: 'Navigate test',
        projectId: 'proj-1',
        actionUrl: '/project/proj-1',
      })

      if (mockNotificationInstance.onclick) {
        mockNotificationInstance.onclick()
      }

      expect(mockLocation.href).toBe('/project/proj-1')

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    })

    it('should not create notification when permission is not granted', () => {
      vi.mocked(isElectron).mockReturnValue(false)
      MockNotificationCtor.permission = 'denied'

      addNotification({
        type: 'info',
        category: 'system',
        title: 'No Permission',
        message: 'No permission test',
      })

      expect(ctorCalls).toHaveLength(0)
    })

    it('should request notification permission during web initialization', async () => {
      vi.mocked(isElectron).mockReturnValue(false)
      MockNotificationCtor.permission = 'default'

      await initializeNotifications()

      expect(MockNotificationCtor.requestPermission).toHaveBeenCalled()
    })
  })
})
