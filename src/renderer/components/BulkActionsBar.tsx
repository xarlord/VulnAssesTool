import React from 'react'
import { Trash2, Download, X } from 'lucide-react'

export type BulkActionType = 'delete' | 'export' | 'dismiss'

interface BulkActionsBarProps {
  selectedCount: number
  onAction: (action: BulkActionType) => void
  onClearSelection: () => void
  disabled?: boolean
  actions?: BulkActionType[]
  className?: string
}

const DEFAULT_ACTIONS: BulkActionType[] = ['delete', 'export', 'dismiss']

export function BulkActionsBar({
  selectedCount,
  onAction,
  onClearSelection,
  disabled = false,
  actions = DEFAULT_ACTIONS,
  className = '',
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null

  const handleActionClick = (action: BulkActionType) => {
    if (disabled) return

    // Show confirmation for destructive actions
    if (action === 'delete') {
      const confirmed = confirm(
        `Are you sure you want to delete ${selectedCount} item${selectedCount > 1 ? 's' : ''}? This action cannot be undone.`,
      )
      if (!confirmed) return
    }

    if (action === 'dismiss') {
      const confirmed = confirm(
        `Are you sure you want to dismiss ${selectedCount} item${selectedCount > 1 ? 's' : ''}?`,
      )
      if (!confirmed) return
    }

    onAction(action)
  }

  const getActionButton = (action: BulkActionType) => {
    switch (action) {
      case 'delete':
        return (
          <button
            key={action}
            onClick={() => handleActionClick(action)}
            disabled={disabled}
            className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Delete selected (${selectedCount})`}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )
      case 'export':
        return (
          <button
            key={action}
            onClick={() => handleActionClick(action)}
            disabled={disabled}
            className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Export selected (${selectedCount})`}
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        )
      case 'dismiss':
        return (
          <button
            key={action}
            onClick={() => handleActionClick(action)}
            disabled={disabled}
            className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Dismiss selected (${selectedCount})`}
          >
            Dismiss
          </button>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3 ${className}`}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <button
          onClick={onClearSelection}
          disabled={disabled}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="h-4 w-4" />
          Clear selection
        </button>
      </div>
      <div className="flex items-center gap-2">{actions.map(getActionButton)}</div>
    </div>
  )
}

interface CheckboxSelectAllProps {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function CheckboxSelectAll({
  checked,
  indeterminate = false,
  onChange,
  label = 'Select all',
  disabled = false,
}: CheckboxSelectAllProps) {
  const checkboxRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="text-sm">{label}</span>
    </label>
  )
}

interface CheckboxItemProps {
  checked: boolean
  onChange: (checked: boolean) => void
  id: string
  disabled?: boolean
}

export function CheckboxItem({ checked, onChange, id, disabled = false }: CheckboxItemProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
      aria-labelledby={`item-${id}`}
    />
  )
}
