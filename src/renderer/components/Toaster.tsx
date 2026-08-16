import { create } from 'zustand'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

// eslint-disable-next-line react-refresh/only-export-components -- toast store intentionally co-located with the Toaster component (dev-only fast-refresh hint)
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
// eslint-disable-next-line react-refresh/only-export-components -- toast helpers intentionally co-located with the Toaster component (dev-only fast-refresh hint)
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

// Tint + border mark the toast type; body text uses foreground (not the tinted
// color) because e.g. text-blue-600/text-green-600 on their own bg-*/15 tint
// dropped as low as 3.07:1 in dark mode, below WCAG AA 4.5:1 (NFR-04.5) — same
// fix pattern as SettingsProfileCard.tsx. The icon keeps the tinted color
// separately (iconStyles) since it's decorative, not body text axe evaluates.
const toastStyles = {
  success: 'bg-green-500/15 text-foreground border-green-500/50',
  error: 'bg-destructive/15 text-foreground border-destructive/50',
  info: 'bg-blue-500/15 text-foreground border-blue-500/50',
  warning: 'bg-yellow-500/15 text-foreground border-yellow-500/50',
}

const iconStyles = {
  success: 'text-green-600',
  error: 'text-destructive',
  info: 'text-blue-600',
  warning: 'text-yellow-600',
}

export function Toaster() {
  const { t } = useTranslation('toaster')
  const { toasts, removeToast } = useToastStore()

  // Always render the container so it acts as a persistent live region:
  // screen readers announce toasts as they are added. Errors/warnings use
  // role="alert" (assertive); success/info use role="status" (polite).
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      role="region"
      aria-label={t('regionAriaLabel')}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.type]
        const isUrgent = toast.type === 'error' || toast.type === 'warning'

        return (
          <div
            key={toast.id}
            role={isUrgent ? 'alert' : 'status'}
            className={`flex w-full max-w-md items-start gap-3 rounded-lg border p-4 shadow-lg animate-in slide-in-from-right-full ${toastStyles[toast.type]}`}
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconStyles[toast.type]}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{toast.title}</div>
              {toast.message && <div className="mt-1 text-sm opacity-90">{toast.message}</div>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label={t('dismissAriaLabel')}
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
