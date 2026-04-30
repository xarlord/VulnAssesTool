import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug, Trash2, RotateCcw } from 'lucide-react'

// Configuration constants
const MAX_RETRIES = 3
const ERROR_HISTORY_SIZE = 5

export interface ErrorEvent {
  id: string
  error: Error
  errorInfo: ErrorInfo | null
  timestamp: number
  retryCount: number
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
  /** Maximum number of retry attempts before showing extended options */
  maxRetries?: number
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void
  /** Called when retry limit is exceeded */
  onRetryExhausted?: (errorHistory: ErrorEvent[]) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string | null
  retryCount: number
  errorHistory: ErrorEvent[]
  isRetrying: boolean
}

/**
 * ErrorBoundary component that catches JavaScript errors anywhere in the child
 * component tree, logs those errors, and displays a fallback UI.
 *
 * Features:
 * - Graceful error display with user-friendly message
 * - Retry mechanism with attempt tracking and limits
 * - Error history for debugging patterns
 * - Navigation back to home
 * - Error details for debugging (collapsible)
 * - State preservation hook via onReset callback
 * - Extended recovery options when retries exhausted
 */
export class ErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      errorHistory: [],
      isRetrying: false,
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId)
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    return {
      hasError: true,
      error,
      errorId,
      isRetrying: false,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError } = this.props
    const { retryCount, errorHistory } = this.state
    const errorId = this.state.errorId || `err_${Date.now()}`

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary] Caught error:', error)
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    }

    // Create error event for history
    const errorEvent: ErrorEvent = {
      id: errorId,
      error,
      errorInfo,
      timestamp: Date.now(),
      retryCount,
    }

    // Update error history (keep last N errors)
    const newHistory = [...errorHistory, errorEvent].slice(-ERROR_HISTORY_SIZE)

    // Update state
    this.setState({
      errorInfo,
      errorHistory: newHistory,
    })

    // Call optional error callback
    if (onError) {
      onError(error, errorInfo, errorId)
    }
  }

  private getMaxRetries(): number {
    return this.props.maxRetries ?? MAX_RETRIES
  }

  get isRetryExhausted(): boolean {
    return this.state.retryCount >= this.getMaxRetries()
  }

  handleRetry = (): void => {
    const { onReset, onRetryExhausted } = this.props
    const { retryCount, errorHistory } = this.state
    const maxRetries = this.getMaxRetries()

    // Check if retry limit exceeded
    if (retryCount >= maxRetries) {
      if (onRetryExhausted) {
        onRetryExhausted(errorHistory)
      }
      return
    }

    // Show retrying state
    this.setState({ isRetrying: true })

    // Small delay before retry for UX
    this.retryTimeoutId = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: retryCount + 1,
        isRetrying: false,
      })

      if (onReset) {
        onReset()
      }
    }, 300)
  }

  handleHardReset = (): void => {
    // Clear any cached data and do a full page reload
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      errorHistory: [],
      isRetrying: false,
    })

    // Full page reload to clear all state
    window.location.reload()
  }

  handleClearDataAndReload = (): void => {
    // Clear local storage (except critical preferences)
    const keysToPreserve = ['theme', 'fontSize']
    const preservedData: Record<string, string> = {}

    keysToPreserve.forEach((key) => {
      const value = localStorage.getItem(key)
      if (value) preservedData[key] = value
    })

    // Clear all storage
    localStorage.clear()
    sessionStorage.clear()

    // Restore preserved preferences
    Object.entries(preservedData).forEach(([key, value]) => {
      localStorage.setItem(key, value)
    })

    // Reload the page
    window.location.reload()
  }

  handleGoHome = (): void => {
    // Reset error state and navigate to home
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0, // Reset retry count on navigation
    })
    // Use window.location for a full page reset
    window.location.href = '/'
  }

  handleCopyError = (): void => {
    const { error, errorInfo, errorId, retryCount, errorHistory } = this.state
    const errorText = `
Error ID: ${errorId}
Retry Attempts: ${retryCount}/${this.getMaxRetries()}
Time: ${new Date().toISOString()}

Message: ${error?.message}
Stack: ${error?.stack}
Component Stack: ${errorInfo?.componentStack}

Recent Errors (${errorHistory.length}):
${errorHistory.map((e) => `- ${e.id}: ${e.error.message}`).join('\n')}
    `.trim()

    navigator.clipboard.writeText(errorText).then(() => {
      // Could show a toast notification here
      console.log('Error details copied to clipboard')
    })
  }

  render(): ReactNode {
    const { hasError, error, errorInfo, errorId, retryCount, isRetrying, errorHistory } = this.state
    const { children, fallback } = this.props
    const maxRetries = this.getMaxRetries()
    const retryExhausted = this.isRetryExhausted

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-card border border-border rounded-lg shadow-lg p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${retryExhausted ? 'bg-destructive/20' : 'bg-destructive/10'}`}>
                <AlertTriangle className={`w-6 h-6 ${retryExhausted ? 'text-destructive' : 'text-destructive'}`} />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {retryExhausted ? 'Multiple errors detected' : 'Something went wrong'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {retryExhausted ? 'The application encountered repeated errors' : 'An unexpected error occurred'}
                </p>
              </div>
            </div>

            {/* Retry counter */}
            {retryCount > 0 && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${
                  retryExhausted ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-muted-foreground'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-sm">
                  Retry attempt {retryCount} of {maxRetries}
                  {retryExhausted && ' - Limit reached'}
                </span>
              </div>
            )}

            {/* Error message */}
            <div className="bg-muted/50 rounded-lg p-3 mb-4">
              <p className="text-sm text-foreground font-mono break-words">{error?.message || 'Unknown error'}</p>
              {errorId && <p className="text-xs text-muted-foreground mt-2">Error ID: {errorId}</p>}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-4">
              {!retryExhausted ? (
                <button
                  onClick={this.handleRetry}
                  disabled={isRetrying}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying ? 'Retrying...' : 'Try Again'}
                </button>
              ) : (
                <button
                  onClick={this.handleHardReset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload App
                </button>
              )}
              <button
                onClick={this.handleGoHome}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            </div>

            {/* Extended recovery options (when retries exhausted) */}
            {retryExhausted && (
              <div className="border-t border-border pt-4 mb-4">
                <p className="text-sm text-muted-foreground mb-3">Recovery options:</p>
                <button
                  onClick={this.handleClearDataAndReload}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Cache & Reload
                </button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  This will clear cached data but preserve your preferences
                </p>
              </div>
            )}

            {/* Copy error details */}
            <button
              onClick={this.handleCopyError}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            >
              <Bug className="w-4 h-4" />
              Copy Error Details
              {errorHistory.length > 0 && ` (${errorHistory.length} errors)`}
            </button>

            {/* Collapsible error details (development only) */}
            {process.env.NODE_ENV === 'development' && errorInfo && (
              <details className="mt-4">
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                  Technical Details
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-48 font-mono">
                  {error?.stack}
                  {'\n\nComponent Stack:\n'}
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return children
  }
}

/**
 * Higher-order component to wrap a component with an ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>,
) {
  const WithErrorBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  )

  WithErrorBoundary.displayName = `WithErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`

  return WithErrorBoundary
}

export default ErrorBoundary
