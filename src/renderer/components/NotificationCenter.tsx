import React, { useState, useRef, useEffect } from 'react'
import { Bell, CheckCheck, Trash2, AlertCircle, AlertTriangle, Info, CheckCircle2, X } from 'lucide-react'
import {
  useNotifications,
  useUnreadCount,
  useNotificationPreferences,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
  dismissNotification,
} from '@/lib/notifications'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'

export function NotificationCenter() {
  const notifications = useNotifications()
  const unreadCount = useUnreadCount()
  const preferences = useNotificationPreferences()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (notification: (typeof notifications)[0]) => {
    // Mark as read
    markAsRead(notification.id)

    // Navigate to action URL if provided
    if (notification.actionUrl) {
      navigate(notification.actionUrl)
      setIsOpen(false)
    }
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead()
  }

  const handleClearAll = () => {
    if (confirm('Clear all notifications?')) {
      clearAllNotifications()
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error':
        return AlertCircle
      case 'warning':
        return AlertTriangle
      case 'success':
        return CheckCircle2
      case 'info':
      default:
        return Info
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-destructive bg-destructive/10'
      case 'warning':
        return 'text-yellow-600 bg-yellow-100'
      case 'success':
        return 'text-green-600 bg-green-100'
      case 'info':
      default:
        return 'text-blue-600 bg-blue-100'
    }
  }

  if (!preferences.enabled) {
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-md p-2 hover:bg-muted transition-colors"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        data-testid="notification-bell"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-border bg-card shadow-lg"
          data-testid="notification-dropdown"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <h3 className="font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                  title="Clear all notifications"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="mb-3 h-12 w-12 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type)
                  const iconColor = getNotificationColor(notification.type)

                  return (
                    <div
                      key={notification.id}
                      className={`flex gap-3 p-4 hover:bg-muted/50 transition-colors cursor-pointer ${
                        !notification.read ? 'bg-muted/30' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className={`flex-shrink-0 rounded-full p-2 ${iconColor}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{notification.title}</p>
                          {!notification.read && <span className="flex-shrink-0 rounded-full bg-primary h-2 w-2" />}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          dismissNotification(notification.id)
                        }}
                        className="flex-shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border p-3">
              <button
                onClick={() => {
                  setIsOpen(false)
                  // Could navigate to a notifications page if we had one
                }}
                className="w-full rounded-md px-3 py-2 text-center text-sm font-medium text-primary hover:bg-primary/10"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
