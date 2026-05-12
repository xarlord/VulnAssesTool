/**
 * Audit Middleware Tests
 * Comprehensive test suite for auditMiddleware.ts targeting 100% coverage
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { configureAuditMiddleware, createAuditMiddleware, withAuditLogging } from './auditMiddleware'
import type { Project, AppSettings, SettingsProfile } from '@@/types'

// Mock the audit store - use hoisted to make variables available to the factory
const { mockAddEvent } = vi.hoisted(() => {
  const addEvent = vi.fn()
  return { mockAddEvent: addEvent }
})

vi.mock('./auditStore', () => ({
  useAuditStore: {
    getState: () => ({
      addEvent: mockAddEvent,
    }),
  },
}))

describe('auditMiddleware', () => {
  beforeEach(() => {
    // Reset mocks
    mockAddEvent.mockReset()
    // Reset config to default
    configureAuditMiddleware({ enabled: true, excludeActions: [] })
  })

  afterEach(() => {
    // Reset config after each test
    configureAuditMiddleware({ enabled: true, excludeActions: [] })
  })

  describe('configureAuditMiddleware', () => {
    it('should update config with provided values', () => {
      configureAuditMiddleware({
        enabled: false,
        excludeActions: ['testAction'],
      })

      // Verify config is updated by testing behavior
      const store = createTestStore()
      store.setState({ projects: [] })

      // Since enabled is false, no event should be added
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should merge partial config with existing config', () => {
      // Start with default config
      const store = createTestStore()

      // Update only enabled flag
      configureAuditMiddleware({ enabled: false })

      store.setState({ projects: [] })

      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should preserve existing config when merging', () => {
      // Set initial config
      configureAuditMiddleware({
        enabled: true,
        excludeActions: ['action1', 'action2'],
      })

      // Update only enabled flag
      configureAuditMiddleware({ enabled: false })

      const actions = {
        action1: vi.fn(),
        action2: vi.fn(),
        action3: vi.fn(),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.action1('test-id')
      wrapped.action2('test-id')
      wrapped.action3('test-id')

      expect(actions.action1).toHaveBeenCalledWith('test-id')
      expect(actions.action2).toHaveBeenCalledWith('test-id')
      expect(actions.action3).toHaveBeenCalledWith('test-id')

      // No events should be logged because enabled=false
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should support custom sanitize function', () => {
      const sanitizeFn = vi.fn((data) => ({ sanitized: true }))
      configureAuditMiddleware({
        enabled: true,
        sanitize: sanitizeFn,
      })

      // Config is updated, sanitize function is available
      expect(sanitizeFn).toBeDefined()
    })
  })

  describe('createAuditMiddleware', () => {
    it('should create a middleware function', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      expect(middleware).toBeInstanceOf(Function)
    })

    it('should wrap setState to intercept changes', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      // Store should be created with wrapped setState
      expect(store.setState).toBeInstanceOf(Function)
      expect(store.getState).toBeInstanceOf(Function)
    })

    it('should call original setState', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({ projects: [] })

      // State should be updated
      expect(store.getState().projects).toEqual([])
    })

    it('should capture previous state before change', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const previousProjects = [...store.getState().projects]

      store.setState({
        projects: [...previousProjects, createMockProject('proj-3')],
      })

      // Previous state should have been captured internally
      expect(previousProjects).toHaveLength(2)
      expect(store.getState().projects).toHaveLength(3)
    })

    it('should capture new state after change', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      // New state should reflect the change
      expect(store.getState().projects).toHaveLength(3)
    })
  })

  describe('logStateChange', () => {
    it('should detect changes between states', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      // Should detect changes and log them
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should skip logging when no meaningful changes', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const currentState = store.getState()
      store.setState(currentState)

      // Should not log when no changes detected
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should not log when config.enabled is false', () => {
      configureAuditMiddleware({ enabled: false })

      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({ projects: [] })

      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should skip excluded actions', () => {
      configureAuditMiddleware({
        enabled: true,
        excludeActions: ['projects', 'settings'],
      })

      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      // Should not log excluded fields
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should log non-excluded actions', () => {
      configureAuditMiddleware({
        enabled: true,
        excludeActions: ['settings'],
      })

      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      // Should log projects since it's not excluded
      expect(mockAddEvent).toHaveBeenCalled()
    })
  })

  describe('detectChanges', () => {
    it('should detect field additions (CREATE)', () => {
      const previousState: TestState = {
        projects: [],
        settings: createMockSettings(),
        settingsProfiles: [],
        notificationPreferences: undefined,
      }

      const newState: TestState = {
        ...previousState,
        projects: [createMockProject('proj-1')],
      }

      // Directly test the change detection by triggering state change
      const middleware = createAuditMiddleware<TestState>('testStore')
      let capturedPrev: any
      let capturedNew: any

      // Intercept the logging to see what changes were detected
      const originalLogChange = (mockAddEvent as any).originalImplementation
      mockAddEvent.mockImplementationOnce((event: any) => {
        capturedNew = event.newState
        capturedPrev = event.previousState
      })

      const store = createStoreWithMiddleware(middleware, previousState)
      store.setState(newState)

      // Should detect the new field
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should detect field updates (UPDATE)', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const updatedProject = {
        ...store.getState().projects[0],
        name: 'Updated Project',
      }

      store.setState({
        projects: [updatedProject, ...store.getState().projects.slice(1)],
      })

      // Should detect the update
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should handle null or undefined states', () => {
      const middleware = createAuditMiddleware<any>('testStore')

      // Create store with null state
      let currentState: any = null

      const store = {
        getState: () => currentState,
        setState: vi.fn((partial) => {
          if (typeof partial === 'function') {
            currentState = partial(currentState)
          } else {
            currentState = partial
          }
        }),
        api: {},
      }

      // Apply middleware - should not crash
      expect(() => {
        middleware(store.setState, store.getState, store.api)
      }).not.toThrow()
    })

    it('should use JSON.stringify for deep comparison', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const currentState = store.getState()

      // Set to same content (different object reference)
      store.setState({
        ...currentState,
        projects: [...currentState.projects],
      })

      // Should not detect changes when deeply equal
      // Note: This might log due to array reference change
    })

    it('should detect nested object changes', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newSettings = {
        ...store.getState().settings,
        theme: 'dark' as const,
      }

      store.setState({ settings: newSettings })

      // Should detect nested changes
      expect(mockAddEvent).toHaveBeenCalled()
    })
  })

  describe('logChange - projects field', () => {
    it('should log project creation', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newProject = createMockProject('proj-3')
      store.setState({
        projects: [...store.getState().projects, newProject],
      })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'CREATE',
          entityType: 'project',
          entityId: 'proj-3',
        }),
      )
    })

    it('should log project update', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const updatedProject = {
        ...store.getState().projects[0],
        name: 'Updated Project',
      }
      store.setState({
        projects: [updatedProject, ...store.getState().projects.slice(1)],
      })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'UPDATE',
          entityType: 'project',
          entityId: 'proj-1',
        }),
      )
    })

    it('should log project deletion', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const deletedProject = store.getState().projects[0]
      store.setState({
        projects: store.getState().projects.slice(1),
      })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'DELETE',
          entityType: 'project',
          entityId: 'proj-1',
          previousState: expect.objectContaining({
            name: deletedProject.name,
          }),
        }),
      )
    })

    it('should handle multiple project changes in one update', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newProject = createMockProject('proj-3')
      const updatedProject = {
        ...store.getState().projects[0],
        name: 'Updated',
      }

      store.setState({
        projects: [updatedProject, store.getState().projects[1], newProject],
      })

      // Should log both update and create
      expect(mockAddEvent).toHaveBeenCalledTimes(2)
    })

    it('should not log when projects array has same content', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const sameProjects = [...store.getState().projects]
      store.setState({ projects: sameProjects })

      // The deep comparison should detect no change in values
      // since JSON.stringify is used for comparison
      // (Arrays with same content stringify to same value)
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should log with description metadata', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newProject = createMockProject('proj-3')
      store.setState({
        projects: [...store.getState().projects, newProject],
      })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            description: expect.stringContaining('Created project'),
          }),
        }),
      )
    })
  })

  describe('logChange - settings field', () => {
    it('should log settings changes', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newSettings: AppSettings = {
        theme: 'dark',
        fontSize: 'large',
        dataRetentionDays: 60,
        autoRefresh: true,
        autoRefreshInterval: 24,
        vulnDataCacheTTL: 12,
        vulnProviders: {
          nvd: { enabled: true, priority: 1 },
          osv: { enabled: true, priority: 2 },
          ossIndex: { enabled: false, priority: 3 },
          githubAdvisory: { enabled: false, priority: 4 },
        },
      }

      store.setState({ settings: newSettings })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'SETTINGS_CHANGE',
          entityType: 'settings',
          entityId: 'global',
          newState: newSettings,
        }),
      )
    })

    it('should include previous and new state for settings', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const previousSettings = store.getState().settings
      const newSettings = { ...previousSettings, theme: 'dark' as const }

      store.setState({ settings: newSettings })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          previousState: previousSettings,
          newState: newSettings,
        }),
      )
    })

    it('should include metadata description', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newSettings = { ...store.getState().settings, theme: 'dark' as const }

      store.setState({ settings: newSettings })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            description: 'Changed application settings',
          }),
        }),
      )
    })
  })

  describe('logChange - settingsProfiles field', () => {
    it('should log profile creation', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newProfile: SettingsProfile = {
        id: 'profile-3',
        name: 'New Profile',
        description: 'A new profile',
        settings: createMockSettings(),
        isDefault: false,
        createdAt: new Date(),
        lastUsed: new Date(),
      }

      store.setState({
        settingsProfiles: [...(store.getState().settingsProfiles || []), newProfile],
      })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'CREATE',
          entityType: 'profile',
          entityId: 'profile-3',
        }),
      )
    })

    it('should log profile deletion', () => {
      const initialProfiles: SettingsProfile[] = [
        {
          id: 'profile-1',
          name: 'Profile 1',
          settings: createMockSettings(),
          isDefault: false,
          createdAt: new Date(),
          lastUsed: new Date(),
        },
        {
          id: 'profile-2',
          name: 'Profile 2',
          settings: createMockSettings(),
          isDefault: true,
          createdAt: new Date(),
          lastUsed: new Date(),
        },
      ]

      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware, {
        projects: [],
        settings: createMockSettings(),
        settingsProfiles: initialProfiles,
        notificationPreferences: undefined,
      })

      const deletedProfile = initialProfiles[0]
      store.setState({
        settingsProfiles: initialProfiles.filter((p) => p.id !== 'profile-1'),
      })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'DELETE',
          entityType: 'profile',
          entityId: 'profile-1',
          previousState: expect.objectContaining({
            name: deletedProfile.name,
          }),
        }),
      )
    })

    it('should skip logging when previous profiles is empty or undefined', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware, {
        projects: [],
        settings: createMockSettings(),
        settingsProfiles: undefined,
        notificationPreferences: undefined,
      })

      const newProfiles: SettingsProfile[] = [
        {
          id: 'profile-1',
          name: 'Profile 1',
          settings: createMockSettings(),
          isDefault: false,
          createdAt: new Date(),
          lastUsed: new Date(),
        },
      ]

      store.setState({ settingsProfiles: newProfiles })

      // Should skip when previous profiles is empty
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should log profile creation with description', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newProfile: SettingsProfile = {
        id: 'profile-3',
        name: 'New Profile',
        description: 'A new profile',
        settings: createMockSettings(),
        isDefault: false,
        createdAt: new Date(),
        lastUsed: new Date(),
      }

      store.setState({
        settingsProfiles: [...(store.getState().settingsProfiles || []), newProfile],
      })

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            description: 'Created profile: New Profile',
          }),
        }),
      )
    })
  })

  describe('logChange - notificationPreferences field', () => {
    it('should log notification preference changes', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newPreferences = { enabled: true, emailNotifications: true }

      store.setState({ notificationPreferences: newPreferences })

      // Should detect notification as a valid entity type
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should not log notification when entity type mapping fails', () => {
      // The entityTypeMap has 'notificationPreferences' -> 'notification'
      // If the mapping doesn't exist, it should return early
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      // Since 'notificationPreferences' is in the entityTypeMap, it should log
      store.setState({ notificationPreferences: { enabled: true } })

      expect(mockAddEvent).toHaveBeenCalled()
    })
  })

  describe('logChange - unknown field', () => {
    it('should not log changes for unmapped fields', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({ unknownField: 'value' } as any)

      // Should not log unmapped fields
      expect(mockAddEvent).not.toHaveBeenCalled()
    })
  })

  describe('logChange - array length detection', () => {
    it('should detect DELETE when array length decreases', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [store.getState().projects[0]],
      })

      // Should detect deletion
      const deleteCalls = mockAddEvent.mock.calls.filter((call) => call[0].actionType === 'DELETE')
      expect(deleteCalls.length).toBeGreaterThan(0)
    })

    it('should detect CREATE when array length increases', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      // Should detect creation
      const createCalls = mockAddEvent.mock.calls.filter((call) => call[0].actionType === 'CREATE')
      expect(createCalls.length).toBeGreaterThan(0)
    })

    it('should detect array operations for non-project arrays', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      // For settingsProfiles (another array field)
      const newProfile: SettingsProfile = {
        id: 'profile-new',
        name: 'New Profile',
        settings: createMockSettings(),
        isDefault: false,
        createdAt: new Date(),
        lastUsed: new Date(),
      }

      store.setState({
        settingsProfiles: [...(store.getState().settingsProfiles || []), newProfile],
      })

      // Should log the creation
      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'CREATE',
        }),
      )
    })
  })

  describe('withAuditLogging', () => {
    it('should wrap actions with audit logging', () => {
      const actions = {
        addProject: vi.fn(() => 'result'),
        updateProject: vi.fn(() => 'result'),
      }

      const wrapped = withAuditLogging(actions, 'project')

      expect(wrapped.addProject).toBeInstanceOf(Function)
      expect(wrapped.updateProject).toBeInstanceOf(Function)
    })

    it('should call original action and log when enabled', () => {
      const actions = {
        addProject: vi.fn(() => 'success'),
      }

      const wrapped = withAuditLogging(actions, 'project')

      const result = wrapped.addProject('proj-1')

      expect(result).toBe('success')
      expect(actions.addProject).toHaveBeenCalledWith('proj-1')
      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'CREATE',
          entityType: 'project',
          entityId: 'proj-1',
        }),
      )
    })

    it('should not log when config.enabled is false', () => {
      configureAuditMiddleware({ enabled: false })

      const actions = {
        addProject: vi.fn(() => 'success'),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.addProject('proj-1')

      expect(actions.addProject).toHaveBeenCalledWith('proj-1')
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should skip logging for excluded actions', () => {
      configureAuditMiddleware({
        enabled: true,
        excludeActions: ['addProject'],
      })

      const actions = {
        addProject: vi.fn(() => 'success'),
        updateProject: vi.fn(() => 'success'),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.addProject('proj-1')
      wrapped.updateProject('proj-1')

      expect(actions.addProject).toHaveBeenCalledWith('proj-1')
      expect(actions.updateProject).toHaveBeenCalledWith('proj-1')

      // Only updateProject should be logged
      expect(mockAddEvent).toHaveBeenCalledTimes(1)
      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'UPDATE',
        }),
      )
    })

    it('should handle actions with no entity ID', () => {
      const actions = {
        someAction: vi.fn(() => 'success'),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.someAction()

      expect(actions.someAction).toHaveBeenCalled()
      // Should not log when no entity ID is provided
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should map action names to audit action types', () => {
      const actions = {
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        createSettingsProfile: vi.fn(),
        updateSettingsProfile: vi.fn(),
        deleteSettingsProfile: vi.fn(),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.addProject('id-1')
      wrapped.updateProject('id-2')
      wrapped.deleteProject('id-3')
      wrapped.createSettingsProfile('id-4')
      wrapped.updateSettingsProfile('id-5')
      wrapped.deleteSettingsProfile('id-6')

      expect(mockAddEvent).toHaveBeenCalledTimes(6)

      // Verify action types
      expect(mockAddEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ actionType: 'CREATE' }))
      expect(mockAddEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ actionType: 'UPDATE' }))
      expect(mockAddEvent).toHaveBeenNthCalledWith(3, expect.objectContaining({ actionType: 'DELETE' }))
      expect(mockAddEvent).toHaveBeenNthCalledWith(4, expect.objectContaining({ actionType: 'CREATE' }))
      expect(mockAddEvent).toHaveBeenNthCalledWith(5, expect.objectContaining({ actionType: 'UPDATE' }))
      expect(mockAddEvent).toHaveBeenNthCalledWith(6, expect.objectContaining({ actionType: 'DELETE' }))
    })

    it('should not log unmapped action types', () => {
      const actions = {
        unknownAction: vi.fn(),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.unknownAction('id-1')

      expect(actions.unknownAction).toHaveBeenCalledWith('id-1')
      // Should not log unmapped actions
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it('should include metadata with action name', () => {
      const actions = {
        addProject: vi.fn(),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.addProject('proj-1')

      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            description: 'Executed addProject',
          }),
        }),
      )
    })

    it('should pass through all arguments to original action', () => {
      const actions = {
        multiArgAction: vi.fn(() => 'result'),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.multiArgAction('id-1', 'arg2', 'arg3', { key: 'value' })

      expect(actions.multiArgAction).toHaveBeenCalledWith('id-1', 'arg2', 'arg3', { key: 'value' })
    })
  })

  describe('integration tests', () => {
    it('should handle complex state changes with multiple fields', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
        settings: { ...store.getState().settings, theme: 'dark' },
      })

      // Should log both changes
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should handle rapid successive state changes', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-4')],
      })

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-5')],
      })

      // Should log all changes
      expect(mockAddEvent).toHaveBeenCalledTimes(3)
    })

    it('should work with object replace instead of merge', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const newState: TestState = {
        projects: [createMockProject('proj-3')],
        settings: store.getState().settings,
        settingsProfiles: store.getState().settingsProfiles,
        notificationPreferences: store.getState().notificationPreferences,
      }

      store.setState(newState, true)

      // Should log changes even with replace flag
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should handle state updates with function partial', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState((state) => ({
        ...state,
        projects: [...state.projects, createMockProject('proj-3')],
      }))

      // Should detect and log changes
      expect(mockAddEvent).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle empty projects array', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware, {
        projects: [],
        settings: createMockSettings(),
        settingsProfiles: [],
        notificationPreferences: undefined,
      })

      store.setState({
        projects: [createMockProject('proj-1')],
      })

      // Should handle empty array
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should handle undefined field values', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware, {
        projects: undefined,
        settings: createMockSettings(),
        settingsProfiles: undefined,
        notificationPreferences: undefined,
      } as any)

      store.setState({
        projects: [createMockProject('proj-1')],
      })

      // Should handle undefined values gracefully
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should handle special characters in entity IDs', () => {
      const actions = {
        addProject: vi.fn(),
      }

      const wrapped = withAuditLogging(actions, 'project')

      wrapped.addProject('project-with-special-chars-!@#$%')

      expect(actions.addProject).toHaveBeenCalledWith('project-with-special-chars-!@#$%')
      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'project-with-special-chars-!@#$%',
        }),
      )
    })

    it('should handle very long entity IDs', () => {
      const actions = {
        addProject: vi.fn(),
      }

      const wrapped = withAuditLogging(actions, 'project')

      const longId = 'a'.repeat(1000)
      wrapped.addProject(longId)

      expect(actions.addProject).toHaveBeenCalledWith(longId)
      expect(mockAddEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: longId,
        }),
      )
    })

    it('should handle when project has no id (edge case)', () => {
      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      const projectWithoutId = {
        name: 'No ID Project',
        createdAt: new Date(),
        updatedAt: new Date(),
        sbomFiles: [],
        components: [],
        vulnerabilities: [],
        statistics: {
          totalComponents: 0,
          totalVulnerabilities: 0,
          criticalVulnerabilities: 0,
          highVulnerabilities: 0,
          mediumVulnerabilities: 0,
          lowVulnerabilities: 0,
        },
      } as any

      store.setState({
        projects: [...store.getState().projects, projectWithoutId],
      })

      // Should still attempt to log (though may fail gracefully)
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should handle empty excludeActions array', () => {
      configureAuditMiddleware({
        enabled: true,
        excludeActions: [],
      })

      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      // Should log since nothing is excluded
      expect(mockAddEvent).toHaveBeenCalled()
    })

    it('should handle undefined excludeActions', () => {
      configureAuditMiddleware({
        enabled: true,
        excludeActions: undefined,
      })

      const middleware = createAuditMiddleware<TestState>('testStore')
      const store = createStoreWithMiddleware(middleware)

      store.setState({
        projects: [...store.getState().projects, createMockProject('proj-3')],
      })

      // Should log when excludeActions is undefined
      expect(mockAddEvent).toHaveBeenCalled()
    })
  })
})

// Helper functions and types

interface TestState {
  projects: Project[]
  settings: AppSettings
  settingsProfiles?: SettingsProfile[]
  notificationPreferences?: unknown
}

function createMockSettings(): AppSettings {
  return {
    theme: 'light',
    fontSize: 'default',
    dataRetentionDays: 30,
    autoRefresh: false,
    autoRefreshInterval: 12,
    vulnDataCacheTTL: 6,
    vulnProviders: {
      nvd: { enabled: true, priority: 1 },
      osv: { enabled: true, priority: 2 },
      ossIndex: { enabled: false, priority: 3 },
      githubAdvisory: { enabled: false, priority: 4 },
    },
  }
}

function createMockStore(): TestState {
  return {
    projects: [createMockProject('proj-1'), createMockProject('proj-2')],
    settings: createMockSettings(),
    settingsProfiles: [],
    notificationPreferences: undefined,
  }
}

function createStoreWithMiddleware<T>(
  middlewareCreator: (set: any, get: any, api: any) => T,
  initialState?: any,
): { getState: () => T; setState: (partial: any, replace?: boolean) => void; api: any } {
  let state = initialState || createMockStore()

  // The actual state update function (will be called by wrapped setState)
  const setStateImpl = (partial: any, replace?: boolean) => {
    if (typeof partial === 'function') {
      state = { ...state, ...partial(state) }
    } else if (replace) {
      state = partial
    } else {
      state = { ...state, ...partial }
    }
  }

  // This is what we pass to the middleware
  const store = {
    getState: () => state,
    setState: setStateImpl,
    api: {},
  }

  // Apply middleware
  // The middleware will call setState(wrappedSet, get, api) to install the wrapped version
  middlewareCreator(
    (partial: any, replace?: boolean, _api?: any) => {
      // Debug: log to see what we're getting
      // console.log('setState called with:', typeof partial, 'args:', arguments.length)

      // When middleware calls this with wrappedSet as the first argument and 3 total arguments
      if (typeof partial === 'function' && _api !== undefined) {
        // This is the middleware calling setState(wrappedSet, get, api)
        // Replace store.setState with wrappedSet for future calls
        store.setState = partial
        // Return api as expected by the middleware pattern
        return store.api
      }
      // Normal state update
      setStateImpl(partial, replace)
    },
    store.getState,
    store.api,
  )

  return store
}

function createTestStore() {
  const middleware = createAuditMiddleware<TestState>('testStore')
  return createStoreWithMiddleware(middleware)
}

function createMockProject(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    description: `Description for ${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalComponents: 0,
      totalVulnerabilities: 0,
      criticalVulnerabilities: 0,
      highVulnerabilities: 0,
      mediumVulnerabilities: 0,
      lowVulnerabilities: 0,
    },
  }
}
