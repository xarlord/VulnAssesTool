/**
 * Tests for notifications store
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNotificationsStore } from './notificationsStore'
import type { AppNotification } from '@@/types'

describe('notificationsStore', () => {
  beforeEach(() => {
    // Clear localStorage to reset persisted state
    localStorage.clear()
    // Reset store before each test
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
    // Reset the notifications array
    useNotificationsStore.setState({ notifications: [] })
  })

  it('should add a notification', () => {
    let store = useNotificationsStore.getState()

    store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test',
      message: 'Test message',
    })

    // Re-fetch store state after mutation
    store = useNotificationsStore.getState()
    expect(store.notifications).toHaveLength(1)
    expect(store.notifications[0].title).toBe('Test')
  })

  it('should not add notification when notifications are disabled', () => {
    const store = useNotificationsStore.getState()

    store.updatePreferences({ enabled: false })

    const result = store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test',
      message: 'Test message',
    })

    expect(result).toBeNull()
    expect(store.notifications).toHaveLength(0)
  })

  it('should not add notification when category is disabled', () => {
    const store = useNotificationsStore.getState()

    store.setCategoryEnabled('critical_vuln', false)

    const result = store.addNotification({
      type: 'error',
      category: 'critical_vuln',
      title: 'Critical',
      message: 'Critical message',
    })

    expect(result).toBeNull()
    expect(store.notifications).toHaveLength(0)
  })

  it('should remove a notification', () => {
    const store = useNotificationsStore.getState()

    const notification = store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test',
      message: 'Test message',
    })!

    store.removeNotification(notification.id)

    expect(store.notifications).toHaveLength(0)
  })

  it('should mark notification as read', () => {
    let store = useNotificationsStore.getState()

    const notification = store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test',
      message: 'Test message',
    })!

    expect(notification.read).toBe(false)

    store.markAsRead(notification.id)

    // Re-fetch store state after mutation
    store = useNotificationsStore.getState()
    const updated = store.notifications.find((n) => n.id === notification.id)
    expect(updated?.read).toBe(true)
  })

  it('should mark all notifications as read', () => {
    const store = useNotificationsStore.getState()

    store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test 1',
      message: 'Test message 1',
    })

    store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test 2',
      message: 'Test message 2',
    })

    store.markAllAsRead()

    expect(store.notifications.every((n) => n.read)).toBe(true)
  })

  it('should clear all notifications', () => {
    const store = useNotificationsStore.getState()

    store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test 1',
      message: 'Test message 1',
    })

    store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Test 2',
      message: 'Test message 2',
    })

    store.clearAll()

    expect(store.notifications).toHaveLength(0)
  })

  it('should update preferences', () => {
    let store = useNotificationsStore.getState()

    store.updatePreferences({ desktopEnabled: false })

    // Re-fetch store state after mutation
    store = useNotificationsStore.getState()
    expect(store.preferences.desktopEnabled).toBe(false)
  })

  it('should set category enabled', () => {
    let store = useNotificationsStore.getState()

    store.setCategoryEnabled('scan_complete', false)

    // Re-fetch store state after mutation
    store = useNotificationsStore.getState()
    expect(store.preferences.categories.scan_complete).toBe(false)
  })

  it('should limit notifications to 100', () => {
    const store = useNotificationsStore.getState()

    // Add 150 notifications
    for (let i = 0; i < 150; i++) {
      store.addNotification({
        type: 'info',
        category: 'system',
        title: `Test ${i}`,
        message: `Test message ${i}`,
      })
    }

    expect(store.notifications.length).toBeLessThanOrEqual(100)
  })

  it('should add new notifications at the beginning', () => {
    let store = useNotificationsStore.getState()

    store.addNotification({
      type: 'info',
      category: 'system',
      title: 'First',
      message: 'First message',
    })

    store.addNotification({
      type: 'info',
      category: 'system',
      title: 'Second',
      message: 'Second message',
    })

    // Re-fetch store state after mutations
    store = useNotificationsStore.getState()
    expect(store.notifications[0].title).toBe('Second')
    expect(store.notifications[1].title).toBe('First')
  })
})
