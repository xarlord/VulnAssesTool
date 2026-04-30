import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

global.ResizeObserver = ResizeObserverMock as any

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

global.IntersectionObserver = IntersectionObserverMock as any

// Mock Notification API for desktop notifications
class MockNotification {
  static permission: NotificationPermission = 'granted'

  onclick: ((this: Notification, ev: Event) => any) | null = null
  onshow: ((this: Notification, ev: Event) => any) | null = null
  onerror: ((this: Notification, ev: Event) => any) | null = null
  onclose: ((this: Notification, ev: Event) => any) | null = null

  constructor(
    public title: string,
    public options: NotificationOptions = {},
  ) {
    // Track notification creation for testing
    if (typeof (window as any).__mockNotifications === 'undefined') {
      ;(window as any).__mockNotifications = []
    }
    ;(window as any).__mockNotifications.push({ title, options })
  }

  close() {
    // Mock close method
    const notifications = (window as any).__mockNotifications || []
    const index = notifications.findIndex((n: any) => n.title === this.title)
    if (index !== -1) {
      notifications.splice(index, 1)
    }
  }

  static requestPermission = vi.fn((): Promise<NotificationPermission> => Promise.resolve(MockNotification.permission))
}

// Add Notification mock to global scope
global.Notification = MockNotification as any

// Helper to get mock notifications for testing
Object.defineProperty(window, 'getMockNotifications', {
  value: () => (window as any).__mockNotifications || [],
})

// Helper to clear mock notifications for testing
Object.defineProperty(window, 'clearMockNotifications', {
  value: () => {
    ;(window as any).__mockNotifications = []
  },
})
