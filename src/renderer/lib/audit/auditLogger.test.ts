/**
 * Audit Logger Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  logProjectCreate,
  logProjectUpdate,
  logProjectDelete,
  logVulnerabilityScan,
  logVulnerabilityRefresh,
  logSbomUpload,
  logSbomRemove,
  logSettingsChange,
  logProfileEvent,
  logExport,
  logBulkOperation,
  logAuditEvent,
} from './auditLogger'
import { useAuditStore } from './auditStore'
import type { Project, AppSettings, SettingsProfile } from '@@/types'

describe('Audit Logger', () => {
  const mockProject: Project = {
    id: 'project-1',
    name: 'Test Project',
    description: 'Test Description',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 0,
      vulnerableComponents: 0,
    },
  }

  const mockSettings: AppSettings = {
    theme: 'dark',
    fontSize: 'default',
    dataRetentionDays: 7,
    autoRefresh: false,
    autoRefreshInterval: 24,
    vulnDataCacheTTL: 24,
    vulnProviders: {
      nvd: {
        enabled: true,
        priority: 1,
        rateLimit: { requestsPerHour: 50 },
      },
      osv: {
        enabled: true,
        priority: 2,
        rateLimit: { requestsPerHour: 100 },
      },
    },
    cvssVersion: '3.1',
    showCvssBreakdown: true,
    maxGraphNodes: 100,
    showVulnerableOnly: false,
  }

  const mockProfile: SettingsProfile = {
    id: 'profile-1',
    name: 'Work Profile',
    description: 'Settings for work',
    settings: mockSettings,
    isDefault: false,
    createdAt: new Date(),
    lastUsed: new Date(),
  }

  beforeEach(() => {
    useAuditStore.getState().resetStore()
  })

  describe('Project Events', () => {
    it('should log project creation', () => {
      logProjectCreate(mockProject)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('CREATE')
      expect(event.entityType).toBe('project')
      expect(event.entityId).toBe(mockProject.id)
      expect(event.newState).toBeDefined()
      expect(event.metadata?.description).toContain('Test Project')
    })

    it('should log project update', () => {
      logProjectUpdate(mockProject.id, mockProject, { name: 'Updated Name' })

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('UPDATE')
      expect(event.entityType).toBe('project')
      expect(event.previousState).toBeDefined()
      expect(event.newState).toBeDefined()
    })

    it('should log project deletion', () => {
      logProjectDelete(mockProject)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('DELETE')
      expect(event.entityType).toBe('project')
      expect(event.previousState).toBeDefined()
      expect(event.newState).toBeUndefined()
    })
  })

  describe('Vulnerability Events', () => {
    it('should log vulnerability scan', () => {
      logVulnerabilityScan('project-1', 'Test Project', 10, 5, 2)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('SCAN')
      expect(event.entityType).toBe('vulnerability')
      expect(event.previousState).toEqual({ vulnerabilityCount: 2 })
      expect(event.newState).toEqual({ vulnerabilityCount: 5 })
      expect(event.metadata?.description).toContain('Test Project')
    })

    it('should log vulnerability data refresh', () => {
      logVulnerabilityRefresh('project-1', 'Test Project', 10)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('UPDATE')
      expect(event.entityType).toBe('vulnerability')
      expect(event.newState).toEqual({ newVulnerabilitiesAdded: 10 })
    })
  })

  describe('SBOM Events', () => {
    it('should log SBOM upload', () => {
      logSbomUpload('project-1', 'Test Project', 'sbom.json', 'cyclonedx', 25)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('CREATE')
      expect(event.entityType).toBe('sbom')
      expect(event.entityId).toBe('project-1-sbom.json')
      expect(event.newState).toEqual({
        filename: 'sbom.json',
        format: 'cyclonedx',
        componentCount: 25,
      })
    })

    it('should log SBOM removal', () => {
      logSbomRemove('project-1', 'Test Project', 'sbom.json')

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('DELETE')
      expect(event.entityType).toBe('sbom')
      expect(event.previousState).toEqual({ filename: 'sbom.json' })
    })
  })

  describe('Settings Events', () => {
    it('should log settings change', () => {
      const newSettings: Partial<AppSettings> = {
        theme: 'light',
        fontSize: 'large',
      }

      logSettingsChange(mockSettings, newSettings)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('SETTINGS_CHANGE')
      expect(event.entityType).toBe('settings')
      expect(event.previousState).toEqual({ changedFields: ['theme', 'fontSize'] })
      expect(event.newState).toEqual(newSettings)
    })

    it('should detect changed fields correctly', () => {
      const newSettings: Partial<AppSettings> = {
        theme: 'light',
        autoRefresh: true,
      }

      logSettingsChange(mockSettings, newSettings)

      const events = useAuditStore.getState().events
      expect(events[0].previousState).toEqual({
        changedFields: ['theme', 'autoRefresh'],
      })
    })
  })

  describe('Profile Events', () => {
    it('should log profile creation', () => {
      logProfileEvent('CREATE', mockProfile)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('CREATE')
      expect(event.entityType).toBe('profile')
      expect(event.entityId).toBe(mockProfile.id)
      expect(event.newState).toEqual(mockProfile)
    })

    it('should log profile update', () => {
      logProfileEvent('UPDATE', mockProfile, mockProfile)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('UPDATE')
      expect(event.previousState).toBeDefined()
      expect(event.newState).toBeDefined()
    })

    it('should log profile deletion', () => {
      logProfileEvent('DELETE', mockProfile, mockProfile)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('DELETE')
      expect(event.previousState).toEqual(mockProfile)
      expect(event.newState).toBeUndefined()
    })
  })

  describe('Export Events', () => {
    it('should log export event', () => {
      logExport('project', 'csv', 10, 'project-1')

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('EXPORT')
      expect(event.entityType).toBe('project')
      expect(event.entityId).toBe('project-1')
      expect(event.newState).toEqual({ format: 'csv', itemCount: 10 })
    })

    it('should log export for all items', () => {
      logExport('all', 'json', 50)

      const events = useAuditStore.getState().events
      expect(events[0].entityId).toBe('all')
      expect(events[0].metadata?.relatedEntityIds).toBeUndefined()
    })
  })

  describe('Bulk Operations', () => {
    it('should log bulk delete', () => {
      const entityIds = ['project-1', 'project-2', 'project-3']

      logBulkOperation('DELETE', 'project', entityIds)

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('DELETE')
      expect(event.entityType).toBe('project')
      expect(event.entityId).toBe('bulk')
      expect(event.metadata?.isBulkOperation).toBe(true)
      expect(event.metadata?.bulkItemCount).toBe(3)
      expect(event.metadata?.relatedEntityIds).toEqual(entityIds)
    })

    it('should log bulk export', () => {
      const entityIds = ['vuln-1', 'vuln-2']

      logBulkOperation('EXPORT', 'vulnerability', entityIds)

      const events = useAuditStore.getState().events
      expect(events[0].actionType).toBe('EXPORT')
    })
  })

  describe('Custom Audit Event', () => {
    it('should log custom event with all fields', () => {
      logAuditEvent('CREATE', 'component', 'component-1', {
        previousState: { version: '1.0.0' },
        newState: { version: '2.0.0' },
        metadata: {
          description: 'Upgraded component',
          isBulkOperation: false,
        },
      })

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('CREATE')
      expect(event.entityType).toBe('component')
      expect(event.entityId).toBe('component-1')
      expect(event.previousState).toEqual({ version: '1.0.0' })
      expect(event.newState).toEqual({ version: '2.0.0' })
      expect(event.metadata?.description).toBe('Upgraded component')
    })

    it('should log minimal custom event', () => {
      logAuditEvent('DELETE', 'settings', 'setting-1')

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(1)

      const event = events[0]
      expect(event.actionType).toBe('DELETE')
      expect(event.previousState).toBeUndefined()
      expect(event.newState).toBeUndefined()
      expect(event.metadata).toBeUndefined()
    })
  })

  describe('Data Sanitization', () => {
    it('should sanitize large arrays in project data', () => {
      const projectWithManyItems: Project = {
        ...mockProject,
        components: Array.from({ length: 100 }, (_, i) => ({
          id: `comp-${i}`,
          name: `Component ${i}`,
          version: '1.0.0',
          type: 'library' as const,
          licenses: [],
          vulnerabilities: [],
        })),
        vulnerabilities: Array.from({ length: 50 }, (_, i) => ({
          id: `vuln-${i}`,
          source: 'nvd' as const,
          severity: 'high' as const,
          description: `Vuln ${i}`,
          affectedComponents: [],
          references: [],
        })),
      }

      logProjectCreate(projectWithManyItems)

      const events = useAuditStore.getState().events
      const event = events[0]

      expect(event.newState).toBeDefined()
      if (typeof event.newState === 'object' && event.newState !== null) {
        expect(event.newState).toHaveProperty('componentCount', 100)
        expect(event.newState).toHaveProperty('vulnerabilityCount', 50)
        expect(event.newState).not.toHaveProperty('components')
        expect(event.newState).not.toHaveProperty('vulnerabilities')
      }
    })
  })
})
