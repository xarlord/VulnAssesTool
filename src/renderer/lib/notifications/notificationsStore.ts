import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AppNotification, NotificationPreferences } from '@@/types'

interface NotificationsState {
  notifications: AppNotification[]
  preferences: NotificationPreferences

  // Notification actions
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => AppNotification | null
  removeNotification: (id: string) => void
  dismissNotification: (id: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void

  // Preference actions
  updatePreferences: (preferences: Partial<NotificationPreferences>) => void
  setCategoryEnabled: (category: keyof NotificationPreferences['categories'], enabled: boolean) => void
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  desktopEnabled: true,
  categories: {
    critical_vuln: true,
    scan_complete: true,
    update_available: true,
    system: true,
  },
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      preferences: DEFAULT_PREFERENCES,

      addNotification: (notification) => {
        const state = get()

        // Check if notifications are enabled and category is enabled
        if (!state.preferences.enabled || !state.preferences.categories[notification.category]) {
          return null
        }

        const newNotification: AppNotification = {
          ...notification,
          id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          read: false,
        }

        set((state) => ({
          notifications: [newNotification, ...state.notifications].slice(0, 100), // Keep max 100 notifications
        }))

        return newNotification
      },

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      dismissNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      clearAll: () => set({ notifications: [] }),

      updatePreferences: (preferences) =>
        set((state) => ({
          preferences: { ...state.preferences, ...preferences },
        })),

      setCategoryEnabled: (category, enabled) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            categories: {
              ...state.preferences.categories,
              [category]: enabled,
            },
          },
        })),
    }),
    {
      name: 'vuln-assess-notifications',
      partialize: (state) => ({
        preferences: state.preferences,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

// Selector hooks for better performance
export const useNotifications = () => useNotificationsStore((state) => state.notifications)
export const useUnreadCount = () => useNotificationsStore((state) => state.notifications.filter((n) => !n.read).length)
export const useNotificationPreferences = () => useNotificationsStore((state) => state.preferences)
