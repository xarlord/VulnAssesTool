import { create } from 'zustand'
import React from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = {
      id,
      duration: 5000,
      ...toast,
    }

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))

    // Auto-remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, newToast.duration)
    }

    return id
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}))

// Convenience functions
export const toast = {
  success: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: 'success', title, message })
  },
  error: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: 'error', title, message, duration: 7000 })
  },
  info: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: 'info', title, message })
  },
  warning: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: 'warning', title, message })
  },
}

const toastIcons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const toastStyles = {
  success: 'bg-green-500/15 text-green-600 border-green-500/50',
  error: 'bg-destructive/15 text-destructive border-destructive/50',
  info: 'bg-blue-500/15 text-blue-600 border-blue-500/50',
  warning: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/50',
}

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.type]

        return (
          <div
            key={toast.id}
            className={`flex w-full max-w-md items-start gap-3 rounded-lg border p-4 shadow-lg animate-in slide-in-from-right-full ${toastStyles[toast.type]}`}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{toast.title}</div>
              {toast.message && <div className="mt-1 text-sm opacity-90">{toast.message}</div>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
