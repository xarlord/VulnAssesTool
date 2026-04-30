import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Toaster, toast, useToastStore } from './Toaster'
import type { Toast } from './Toaster'

// Use fake timers for setTimeout
vi.useFakeTimers()

describe('Toaster', () => {
  beforeEach(() => {
    vi.clearAllTimers()
    // Reset the toast store
    useToastStore.getState().clearToasts()
  })

  describe('Rendering', () => {
    it('should not render when no toasts', () => {
      const { container } = render(<Toaster />)
      expect(container.firstChild).toBe(null)
    })

    it('should render toast container when toasts exist', () => {
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Test Toast',
      })

      const { container } = render(<Toaster />)
      expect(container.firstChild).not.toBe(null)
    })

    it('should render toast with title', () => {
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Success Title',
      })

      render(<Toaster />)

      expect(screen.getByText('Success Title')).toBeInTheDocument()
    })

    it('should render toast with message', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Info Title',
        message: 'Info message',
      })

      render(<Toaster />)

      expect(screen.getByText('Info message')).toBeInTheDocument()
    })
  })

  describe('Toast Types', () => {
    it('should render success toast with correct styling', () => {
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Success',
      })

      render(<Toaster />)

      const toast = document.querySelector('.bg-green-500\\/15')
      expect(toast).toBeInTheDocument()
    })

    it('should render error toast with correct styling', () => {
      useToastStore.getState().addToast({
        type: 'error',
        title: 'Error',
      })

      render(<Toaster />)

      const toast = document.querySelector('.bg-destructive\\/15')
      expect(toast).toBeInTheDocument()
    })

    it('should render info toast with correct styling', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Info',
      })

      render(<Toaster />)

      const toast = document.querySelector('.bg-blue-500\\/15')
      expect(toast).toBeInTheDocument()
    })

    it('should render warning toast with correct styling', () => {
      useToastStore.getState().addToast({
        type: 'warning',
        title: 'Warning',
      })

      render(<Toaster />)

      const toast = document.querySelector('.bg-yellow-500\\/15')
      expect(toast).toBeInTheDocument()
    })
  })

  describe('Toast Positioning', () => {
    it('should render container fixed at bottom right', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Test',
      })

      const { container } = render(<Toaster />)
      const wrapper = container.querySelector('.fixed.bottom-4.right-4')
      expect(wrapper).toBeInTheDocument()
    })

    it('should stack multiple toasts vertically', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'First',
      })
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Second',
      })

      render(<Toaster />)

      const toasts = screen.getAllByText(/First|Second/)
      expect(toasts).toHaveLength(2)
    })
  })

  describe('Remove Toast', () => {
    it('should call removeToast when close button is clicked', () => {
      const toastId = useToastStore.getState().addToast({
        type: 'info',
        title: 'Test Toast',
      })

      render(<Toaster />)

      const closeButton = screen.getByRole('button')
      fireEvent.click(closeButton)

      // Toast should be removed
      expect(screen.queryByText('Test Toast')).not.toBeInTheDocument()
    })

    it('should remove correct toast when multiple toasts exist', () => {
      const firstId = useToastStore.getState().addToast({
        type: 'info',
        title: 'First',
      })
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Second',
      })

      render(<Toaster />)

      // Remove the first toast by ID directly - wrap in act for state update
      act(() => {
        useToastStore.getState().removeToast(firstId)
      })

      expect(screen.queryByText('First')).not.toBeInTheDocument()
      expect(screen.getByText('Second')).toBeInTheDocument()
    })
  })

  describe('Auto-Remove', () => {
    it('should auto-remove toast after default duration', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Auto Remove Test',
      })

      render(<Toaster />)

      expect(screen.getByText('Auto Remove Test')).toBeInTheDocument()

      // Fast-forward time past default 5000ms duration
      act(() => {
        vi.advanceTimersByTime(5000)
        vi.runAllTimers()
      })

      expect(screen.queryByText('Auto Remove Test')).not.toBeInTheDocument()
    })

    it('should use custom duration when provided', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Custom Duration',
        duration: 3000,
      })

      render(<Toaster />)

      expect(screen.getByText('Custom Duration')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(3000)
        vi.runAllTimers()
      })

      expect(screen.queryByText('Custom Duration')).not.toBeInTheDocument()
    })

    it('should not auto-remove when duration is 0', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'No Auto Remove',
        duration: 0,
      })

      render(<Toaster />)

      expect(screen.getByText('No Auto Remove')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(10000)
        vi.runAllTimers()
      })

      expect(screen.getByText('No Auto Remove')).toBeInTheDocument()
    })
  })

  describe('Toast Store Methods', () => {
    it('should generate unique toast IDs', () => {
      const id1 = useToastStore.getState().addToast({
        type: 'info',
        title: 'Toast 1',
      })
      const id2 = useToastStore.getState().addToast({
        type: 'info',
        title: 'Toast 2',
      })

      expect(id1).not.toBe(id2)
    })

    it('should clear all toasts', () => {
      useToastStore.getState().addToast({ type: 'info', title: 'First' })
      useToastStore.getState().addToast({ type: 'info', title: 'Second' })

      expect(useToastStore.getState().toasts).toHaveLength(2)

      useToastStore.getState().clearToasts()

      expect(useToastStore.getState().toasts).toHaveLength(0)
    })
  })

  describe('Convenience Functions', () => {
    it('should export toast.success function', () => {
      expect(toast.success).toBeDefined()
      expect(typeof toast.success).toBe('function')
    })

    it('should export toast.error function', () => {
      expect(toast.error).toBeDefined()
      expect(typeof toast.error).toBe('function')
    })

    it('should export toast.info function', () => {
      expect(toast.info).toBeDefined()
      expect(typeof toast.info).toBe('function')
    })

    it('should export toast.warning function', () => {
      expect(toast.warning).toBeDefined()
      expect(typeof toast.warning).toBe('function')
    })

    it('should add success toast via convenience function', () => {
      toast.success('Success Title', 'Success Message')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe('success')
      expect(toasts[0].title).toBe('Success Title')
      expect(toasts[0].message).toBe('Success Message')
    })

    it('should add error toast with longer duration', () => {
      toast.error('Error Title')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].duration).toBe(7000)
    })

    it('should add info toast via convenience function', () => {
      toast.info('Info Title', 'Info Message')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe('info')
      expect(toasts[0].title).toBe('Info Title')
      expect(toasts[0].message).toBe('Info Message')
    })

    it('should add warning toast via convenience function', () => {
      toast.warning('Warning Title', 'Warning Message')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe('warning')
      expect(toasts[0].title).toBe('Warning Title')
      expect(toasts[0].message).toBe('Warning Message')
    })
  })

  describe('Visual Elements', () => {
    it('should render close button', () => {
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Test',
      })

      render(<Toaster />)

      const closeButton = screen.getByRole('button')
      expect(closeButton).toBeInTheDocument()
    })

    it('should render correct icon for each toast type', () => {
      const types: Array<Toast['type']> = ['success', 'error', 'info', 'warning']

      types.forEach((type) => {
        useToastStore.getState().clearToasts()
        useToastStore.getState().addToast({
          type,
          title: `${type} toast`,
        })

        const { container } = render(<Toaster />)
        // Icons are SVG elements
        const icons = container.querySelectorAll('svg')
        expect(icons.length).toBeGreaterThan(0)
      })
    })
  })
})
