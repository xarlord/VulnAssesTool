/**
 * Audit Logger
 * Convenience utilities for logging audit events
 * Automatically captures state changes for compliance
 */

import type { AuditActionType, AuditEntityType, AuditEventMetadata } from './types'
import { useAuditStore } from './auditStore'
import type { Project, AppSettings, SettingsProfile } from '@@/types'

/**
 * Log a project creation event
 */
export function logProjectCreate(project: Project, metadata?: AuditEventMetadata): void {
  useAuditStore.getState().addEvent({
    actionType: 'CREATE',
    entityType: 'project',
    entityId: project.id,
    newState: sanitizeProject(project),
    metadata: {
      description: `Created project: ${project.name}`,
      ...metadata,
    },
  })
}

/**
 * Log a project update event
 */
export function logProjectUpdate(
  projectId: string,
  previousState: Project,
  newState: Partial<Project>,
  metadata?: AuditEventMetadata,
): void {
  useAuditStore.getState().addEvent({
    actionType: 'UPDATE',
    entityType: 'project',
    entityId: projectId,
    previousState: sanitizeProject(previousState),
    newState: sanitizePartialProject(newState),
    metadata: {
      description: `Updated project: ${previousState.name}`,
      ...metadata,
    },
  })
}

/**
 * Log a project deletion event
 */
export function logProjectDelete(project: Project, metadata?: AuditEventMetadata): void {
  useAuditStore.getState().addEvent({
    actionType: 'DELETE',
    entityType: 'project',
    entityId: project.id,
    previousState: sanitizeProject(project),
    metadata: {
      description: `Deleted project: ${project.name}`,
      ...metadata,
    },
  })
}

/**
 * Log a vulnerability scan event
 */
export function logVulnerabilityScan(
  projectId: string,
  projectName: string,
  componentsScanned: number,
  vulnerabilitiesFound: number,
  previousVulnCount: number,
  metadata?: AuditEventMetadata,
): void {
  useAuditStore.getState().addEvent({
    actionType: 'SCAN',
    entityType: 'vulnerability',
    entityId: projectId,
    previousState: { vulnerabilityCount: previousVulnCount },
    newState: { vulnerabilityCount: vulnerabilitiesFound },
    metadata: {
      description: `Scanned project: ${projectName}. Found ${vulnerabilitiesFound} vulnerabilities in ${componentsScanned} components`,
      relatedEntityIds: [projectId],
      ...metadata,
    },
  })
}

/**
 * Log a vulnerability data refresh event
 */
export function logVulnerabilityRefresh(
  projectId: string,
  projectName: string,
  newVulnerabilities: number,
  metadata?: AuditEventMetadata,
): void {
  useAuditStore.getState().addEvent({
    actionType: 'UPDATE',
    entityType: 'vulnerability',
    entityId: projectId,
    newState: { newVulnerabilitiesAdded: newVulnerabilities },
    metadata: {
      description: `Refreshed vulnerability data for project: ${projectName}. Added ${newVulnerabilities} new vulnerabilities`,
      relatedEntityIds: [projectId],
      ...metadata,
    },
  })
}

/**
 * Log an SBOM upload event
 */
export function logSbomUpload(
  projectId: string,
  projectName: string,
  filename: string,
  format: string,
  componentCount: number,
  metadata?: AuditEventMetadata,
): void {
  useAuditStore.getState().addEvent({
    actionType: 'CREATE',
    entityType: 'sbom',
    entityId: `${projectId}-${filename}`,
    newState: { filename, format, componentCount },
    metadata: {
      description: `Uploaded SBOM file "${filename}" (${format}) to project: ${projectName}`,
      relatedEntityIds: [projectId],
      ...metadata,
    },
  })
}

/**
 * Log an SBOM removal event
 */
export function logSbomRemove(
  projectId: string,
  projectName: string,
  filename: string,
  metadata?: AuditEventMetadata,
): void {
  useAuditStore.getState().addEvent({
    actionType: 'DELETE',
    entityType: 'sbom',
    entityId: `${projectId}-${filename}`,
    previousState: { filename },
    metadata: {
      description: `Removed SBOM file "${filename}" from project: ${projectName}`,
      relatedEntityIds: [projectId],
      ...metadata,
    },
  })
}

/**
 * Log a settings change event
 */
export function logSettingsChange(
  previousSettings: AppSettings,
  newSettings: Partial<AppSettings>,
  metadata?: AuditEventMetadata,
): void {
  // Identify what changed
  const changedFields: string[] = []
  for (const key in newSettings) {
    if (
      JSON.stringify(previousSettings[key as keyof AppSettings]) !==
      JSON.stringify(newSettings[key as keyof AppSettings])
    ) {
      changedFields.push(key)
    }
  }

  useAuditStore.getState().addEvent({
    actionType: 'SETTINGS_CHANGE',
    entityType: 'settings',
    entityId: 'global',
    previousState: { changedFields },
    newState: newSettings,
    metadata: {
      description: `Changed application settings: ${changedFields.join(', ')}`,
      ...metadata,
    },
  })
}

/**
 * Log a settings profile event
 */
export function logProfileEvent(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  profile: SettingsProfile,
  previousProfile?: SettingsProfile,
  metadata?: AuditEventMetadata,
): void {
  const actionText = action === 'CREATE' ? 'Created' : action === 'UPDATE' ? 'Updated' : 'Deleted'

  useAuditStore.getState().addEvent({
    actionType: action === 'DELETE' ? 'DELETE' : action === 'CREATE' ? 'CREATE' : 'UPDATE',
    entityType: 'profile',
    entityId: profile.id,
    previousState: previousProfile,
    newState: action !== 'DELETE' ? profile : undefined,
    metadata: {
      description: `${actionText} settings profile: ${profile.name}`,
      ...metadata,
    },
  })
}

/**
 * Log an export event
 */
export function logExport(
  entityType: 'project' | 'vulnerability' | 'component' | 'all',
  format: string,
  itemCount: number,
  projectId?: string,
  metadata?: AuditEventMetadata,
): void {
  useAuditStore.getState().addEvent({
    actionType: 'EXPORT',
    entityType,
    entityId: projectId || 'all',
    newState: { format, itemCount },
    metadata: {
      description: `Exported ${itemCount} ${entityType}(s) as ${format}`,
      relatedEntityIds: projectId ? [projectId] : undefined,
      ...metadata,
    },
  })
}

/**
 * Log a bulk operation event
 */
export function logBulkOperation(
  action: 'DELETE' | 'UPDATE' | 'EXPORT',
  entityType: 'project' | 'vulnerability' | 'component',
  entityIds: string[],
  metadata?: AuditEventMetadata,
): void {
  useAuditStore.getState().addEvent({
    actionType: action === 'EXPORT' ? 'EXPORT' : action,
    entityType,
    entityId: 'bulk',
    previousState: { count: entityIds.length },
    newState: { affectedIds: entityIds },
    metadata: {
      description: `Bulk ${action.toLowerCase()} on ${entityIds.length} ${entityType}(s)`,
      relatedEntityIds: entityIds,
      isBulkOperation: true,
      bulkItemCount: entityIds.length,
      ...metadata,
    },
  })
}

/**
 * Log a custom audit event
 */
export function logAuditEvent(
  actionType: AuditActionType,
  entityType: AuditEntityType,
  entityId: string,
  data?: {
    previousState?: unknown
    newState?: unknown
    metadata?: AuditEventMetadata
  },
): void {
  useAuditStore.getState().addEvent({
    actionType,
    entityType,
    entityId,
    previousState: data?.previousState,
    newState: data?.newState,
    metadata: data?.metadata,
  })
}

/**
 * Sanitize project data for audit log (remove large arrays)
 */
function sanitizeProject(project: Project): unknown {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastScanAt: project.lastScanAt,
    lastVulnDataRefresh: project.lastVulnDataRefresh,
    sbomFileCount: project.sbomFiles.length,
    componentCount: project.components.length,
    vulnerabilityCount: project.vulnerabilities.length,
    statistics: project.statistics,
  }
}

/**
 * Sanitize partial project data
 */
function sanitizePartialProject(project: Partial<Project>): unknown {
  const sanitized: Record<string, unknown> = {}

  for (const key in project) {
    if (key === 'components') {
      sanitized[key] = `Array(${project[key]?.length || 0})`
    } else if (key === 'vulnerabilities') {
      sanitized[key] = `Array(${project[key]?.length || 0})`
    } else if (key === 'sbomFiles') {
      sanitized[key] = `Array(${project[key]?.length || 0})`
    } else {
      sanitized[key] = project[key as keyof Project]
    }
  }

  return sanitized
}
