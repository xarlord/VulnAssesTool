/**
 * Audit Middleware
 * Wraps Zustand store actions to automatically log state changes
 * Integrates with the main application store
 */

import type { StateCreator } from 'zustand'
import type { AuditEvent } from './types'
import { useAuditStore } from './auditStore'
import type { Project, SettingsProfile } from '@@/types'

/**
 * Audit middleware configuration
 */
interface AuditMiddlewareConfig {
  /** Enable/disable audit logging */
  enabled: boolean
  /** Exclude specific action types from logging */
  excludeActions?: string[]
  /** Sanitize sensitive data before logging */
  sanitize?: (data: unknown) => unknown
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AuditMiddlewareConfig = {
  enabled: true,
  excludeActions: ['setSidebarOpen', 'setRefreshingProject', 'setCurrentProject'],
}

let config = DEFAULT_CONFIG

/**
 * Configure audit middleware
 */
export function configureAuditMiddleware(newConfig: Partial<AuditMiddlewareConfig>) {
  config = { ...config, ...newConfig }
}

/**
 * Create audit middleware for Zustand store
 */
export function createAuditMiddleware<T extends object>(_storeName: string): StateCreator<T> {
  return (set, get, api) => {
    const originalSet = set

    // Wrap setState to intercept changes
    const wrappedSet: typeof set = (partial, replace) => {
      const previousState = get()

      // Apply the state change
      originalSet(partial, replace)

      // Log the change if audit is enabled
      if (config.enabled) {
        const newState = get()
        logStateChange(previousState, newState, partial)
      }
    }

    // Create store with wrapped set
    // Zustand middleware re-invokes set as the store initializer.
    return (set as (...args: unknown[]) => unknown)(wrappedSet, get, api) as T
  }
}

/**
 * Log state changes
 */
function logStateChange(previousState: unknown, newState: unknown, _partial: unknown) {
  // Determine what changed
  const changes = detectChanges(previousState, newState)

  // Skip if no meaningful changes
  if (changes.length === 0) return

  // Log each change
  for (const change of changes) {
    if (config.excludeActions?.includes(change.field)) {
      continue
    }

    logChange(change)
  }
}

/**
 * Detect changes between states
 */
interface StateChange {
  field: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  previousValue?: unknown
  newValue?: unknown
}

function detectChanges(previousState: unknown, newState: unknown): StateChange[] {
  const changes: StateChange[] = []

  if (!previousState || !newState) return changes

  const prev = previousState as Record<string, unknown>
  const next = newState as Record<string, unknown>

  for (const key in next) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      changes.push({
        field: key,
        action: prev[key] === undefined ? 'CREATE' : 'UPDATE',
        previousValue: prev[key],
        newValue: next[key],
      })
    }
  }

  return changes
}

/**
 * Log a specific change
 */
function logChange(change: StateChange) {
  // Map field names to entity types
  const entityTypeMap: Record<string, string> = {
    projects: 'project',
    settings: 'settings',
    settingsProfiles: 'profile',
    notificationPreferences: 'notification',
  }

  const entityType = entityTypeMap[change.field]

  if (!entityType) return

  // For projects array, check individual project changes
  if (change.field === 'projects' && Array.isArray(change.newValue)) {
    const prevProjects = (Array.isArray(change.previousValue) ? change.previousValue : []) as Project[]
    const newProjects = change.newValue as Project[]

    // Detect deleted projects
    for (const prevProject of prevProjects) {
      if (!newProjects.find((p) => p.id === prevProject.id)) {
        useAuditStore.getState().addEvent({
          actionType: 'DELETE',
          entityType: 'project',
          entityId: prevProject.id,
          previousState: { name: prevProject.name, description: prevProject.description },
          metadata: { description: `Deleted project: ${prevProject.name}` },
        })
      }
    }

    // Detect created/updated projects
    for (const newProject of newProjects) {
      const prevProject = prevProjects.find((p) => p.id === newProject.id)

      if (!prevProject) {
        useAuditStore.getState().addEvent({
          actionType: 'CREATE',
          entityType: 'project',
          entityId: newProject.id,
          newState: { name: newProject.name, description: newProject.description },
          metadata: { description: `Created project: ${newProject.name}` },
        })
      } else if (JSON.stringify(prevProject) !== JSON.stringify(newProject)) {
        useAuditStore.getState().addEvent({
          actionType: 'UPDATE',
          entityType: 'project',
          entityId: newProject.id,
          previousState: { name: prevProject.name },
          newState: { name: newProject.name },
          metadata: { description: `Updated project: ${newProject.name}` },
        })
      }
    }
  }

  // For settings changes
  if (change.field === 'settings') {
    useAuditStore.getState().addEvent({
      actionType: 'SETTINGS_CHANGE',
      entityType: 'settings',
      entityId: 'global',
      previousState: change.previousValue,
      newState: change.newValue,
      metadata: { description: 'Changed application settings' },
    })
  }

  // For settings profiles
  if (change.field === 'settingsProfiles') {
    const prevProfiles = change.previousValue as SettingsProfile[] | undefined
    const newProfiles = change.newValue as SettingsProfile[]

    // Skip logging when previous profiles is undefined (initial load), but allow logging for empty array
    if (prevProfiles === undefined) return

    // Detect deleted profiles
    for (const prevProfile of prevProfiles) {
      if (!newProfiles.find((p) => p.id === prevProfile.id)) {
        useAuditStore.getState().addEvent({
          actionType: 'DELETE',
          entityType: 'profile',
          entityId: prevProfile.id,
          previousState: { name: prevProfile.name },
          metadata: { description: `Deleted profile: ${prevProfile.name}` },
        })
      }
    }

    // Detect created profiles
    for (const newProfile of newProfiles) {
      if (!prevProfiles.find((p) => p.id === newProfile.id)) {
        useAuditStore.getState().addEvent({
          actionType: 'CREATE',
          entityType: 'profile',
          entityId: newProfile.id,
          newState: { name: newProfile.name },
          metadata: { description: `Created profile: ${newProfile.name}` },
        })
      }
    }
  }

  // For notification preferences
  if (change.field === 'notificationPreferences') {
    useAuditStore.getState().addEvent({
      actionType: 'UPDATE',
      entityType: 'notification',
      entityId: 'global',
      previousState: change.previousValue,
      newState: change.newValue,
      metadata: { description: 'Changed notification preferences' },
    })
  }
}

/**
 * Hook to integrate audit logging with existing store actions
 * Wraps specific store actions to log their execution
 */
export function withAuditLogging<T extends Record<string, (...args: unknown[]) => unknown>>(
  actions: T,
  entityType: AuditEvent['entityType'],
): T {
  const wrapped = {} as T

  for (const [key, action] of Object.entries(actions)) {
    wrapped[key as keyof T] = ((...args: unknown[]) => {
      const result = action(...args)

      // Log the action
      if (config.enabled && !config.excludeActions?.includes(key)) {
        logActionExecution(key, entityType, args)
      }

      return result
    }) as T[keyof T]
  }

  return wrapped
}

/**
 * Log action execution
 */
function logActionExecution(actionName: string, entityType: AuditEvent['entityType'], args: unknown[]) {
  // Extract entity ID from args if available
  const entityId = args[0] as string | undefined

  if (!entityId) return

  // Map action names to audit action types
  const actionTypeMap: Record<string, AuditEvent['actionType']> = {
    addProject: 'CREATE',
    updateProject: 'UPDATE',
    deleteProject: 'DELETE',
    createSettingsProfile: 'CREATE',
    updateSettingsProfile: 'UPDATE',
    deleteSettingsProfile: 'DELETE',
  }

  const auditActionType = actionTypeMap[actionName]

  if (!auditActionType) return

  useAuditStore.getState().addEvent({
    actionType: auditActionType,
    entityType,
    entityId,
    metadata: { description: `Executed ${actionName}` },
  })
}
