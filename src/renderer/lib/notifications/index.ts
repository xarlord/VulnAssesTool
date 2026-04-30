/**
 * Notifications Module
 *
 * Exports all notification-related functionality
 */

// Store
export {
  useNotificationsStore,
  useNotifications,
  useUnreadCount,
  useNotificationPreferences,
} from './notificationsStore'

// Service
export {
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
