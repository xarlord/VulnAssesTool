import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AppSettings, Project, SettingsProfile, NotificationPreferences } from '@@/types'
import { DEFAULT_SETTINGS } from '@@/constants'
import { refreshVulnerabilityData as refreshData } from '@/lib/refresh'
import {
  createProfile,
  updateProfile,
  deleteProfile,
  setDefaultProfile,
  getProfiles,
  switchProfile,
  initializeProfiles,
  exportSettingsToFile,
  importSettingsFromFile,
} from '@/lib/settings'

interface AppState {
  // Settings
  settings: AppSettings
  updateSettings: (settings: Partial<AppSettings>) => void

  // Settings Profiles
  settingsProfiles: SettingsProfile[]
  activeProfileId: string
  loadSettingsProfiles: () => void
  createSettingsProfile: (name: string, description: string | undefined, settings: AppSettings) => void
  updateSettingsProfile: (profileId: string, updates: Partial<SettingsProfile>) => void
  deleteSettingsProfile: (profileId: string) => void
  switchSettingsProfile: (profileId: string) => void
  setDefaultSettingsProfile: (profileId: string) => void
  importSettingsProfiles: (file: File) => Promise<{ success: boolean; error?: string }>
  exportSettingsProfiles: () => void

  // Projects
  projects: Project[]
  currentProject: Project | null
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  setCurrentProject: (project: Project | null) => void
  refreshVulnerabilityData: (projectId: string) => Promise<void>

  // UI State
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  refreshingProjectIds: Set<string>
  setRefreshingProject: (projectId: string, isRefreshing: boolean) => void

  // Notification Preferences
  notificationPreferences: NotificationPreferences
  updateNotificationPreferences: (preferences: Partial<NotificationPreferences>) => void

  // Test helpers (only exposed in test mode)
  _resetStore: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }))
      },

      // Settings Profiles
      settingsProfiles: [],
      activeProfileId: '',
      loadSettingsProfiles: () => {
        // Initialize profiles if needed
        initializeProfiles()
        const profiles = getProfiles()

        // Preserve the current active profile if it exists and is valid
        // Otherwise fall back to default profile or first profile
        const currentActiveId = get().activeProfileId
        const currentActiveProfile = profiles.find((p) => p.id === currentActiveId)
        const activeProfile = currentActiveProfile || profiles.find((p) => p.isDefault) || profiles[0]

        set({
          settingsProfiles: profiles,
          activeProfileId: activeProfile?.id || '',
          settings: activeProfile?.settings || DEFAULT_SETTINGS,
        })
      },
      createSettingsProfile: (name, description, settings) => {
        try {
          const newProfile = createProfile(name, description, settings)
          set((state) => ({
            settingsProfiles: [...state.settingsProfiles, newProfile],
          }))
        } catch (error) {
          console.error('Failed to create profile:', error)
          throw error
        }
      },
      updateSettingsProfile: (profileId, updates) => {
        try {
          updateProfile(profileId, updates)
          set((state) => ({
            settingsProfiles: state.settingsProfiles.map((p) => (p.id === profileId ? { ...p, ...updates } : p)),
          }))
        } catch (error) {
          console.error('Failed to update profile:', error)
          throw error
        }
      },
      deleteSettingsProfile: (profileId) => {
        try {
          deleteProfile(profileId)
          set((state) => {
            const updatedProfiles = state.settingsProfiles.filter((p) => p.id !== profileId)
            const newActiveId =
              state.activeProfileId === profileId
                ? updatedProfiles.find((p) => p.isDefault)?.id || updatedProfiles[0]?.id || ''
                : state.activeProfileId

            return {
              settingsProfiles: updatedProfiles,
              activeProfileId: newActiveId,
              settings: updatedProfiles.find((p) => p.id === newActiveId)?.settings || state.settings,
            }
          })
        } catch (error) {
          console.error('Failed to delete profile:', error)
          throw error
        }
      },
      switchSettingsProfile: (profileId) => {
        try {
          const updatedProfile = switchProfile(profileId)
          set((state) => ({
            settingsProfiles: state.settingsProfiles.map((p) => (p.id === profileId ? updatedProfile : p)),
            activeProfileId: profileId,
            settings: updatedProfile.settings,
          }))
        } catch (error) {
          console.error('Failed to switch profile:', error)
          throw error
        }
      },
      setDefaultSettingsProfile: (profileId) => {
        try {
          setDefaultProfile(profileId)
          set((state) => ({
            settingsProfiles: state.settingsProfiles.map((p) => ({
              ...p,
              isDefault: p.id === profileId,
            })),
          }))
        } catch (error) {
          console.error('Failed to set default profile:', error)
          throw error
        }
      },
      importSettingsProfiles: async (file) => {
        try {
          const result = await importSettingsFromFile(file)
          if (result.success && result.data) {
            // Load current profiles to check for conflicts
            const currentProfiles = getProfiles()
            const existingNames = new Set(currentProfiles.map((p) => p.name.toLowerCase()))

            // Merge profiles, avoiding name conflicts
            const _importedProfiles = result.data.profiles.map((profile) => {
              let finalName = profile.name
              let counter = 1

              // Resolve name conflicts
              while (existingNames.has(finalName.toLowerCase())) {
                finalName = `${profile.name} (${counter})`
                counter++
              }

              existingNames.add(finalName.toLowerCase())

              // Create profile with resolved name
              return createProfile(finalName, profile.description, profile.settings)
            })

            // Reload all profiles
            const allProfiles = getProfiles()
            set({
              settingsProfiles: allProfiles,
            })

            return { success: true }
          }
          return result
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
          }
        }
      },
      exportSettingsProfiles: () => {
        const { settingsProfiles } = get()
        if (settingsProfiles.length === 0) {
          throw new Error('No profiles to export')
        }
        exportSettingsToFile(settingsProfiles)
      },

      // Projects
      projects: [],
      currentProject: null,
      addProject: (project) =>
        set((state) => ({
          projects: [...state.projects, project],
        })),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
          currentProject:
            state.currentProject?.id === id ? { ...state.currentProject, ...updates } : state.currentProject,
        })),
      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject: state.currentProject?.id === id ? null : state.currentProject,
        })),
      setCurrentProject: (project) => set({ currentProject: project }),
      refreshVulnerabilityData: async (projectId) => {
        const state = get()
        const project = state.projects.find((p) => p.id === projectId)
        if (!project) return

        // Set refreshing state
        set({ refreshingProjectIds: new Set([...state.refreshingProjectIds, projectId]) })

        try {
          // API key is now fetched from secure storage, not state
          const result = await refreshData(project.components, {
            cacheTTL: state.settings.vulnDataCacheTTL,
          })

          if (result.success) {
            // Merge new vulnerabilities with existing ones (deduplicated by ID)
            const existingVulnerabilities = project.vulnerabilities || []
            const newVulnerabilities = result.vulnerabilities.filter(
              (newVuln) => !existingVulnerabilities.some((existing) => existing.id === newVuln.id),
            )
            const allVulnerabilities = [...existingVulnerabilities, ...newVulnerabilities]

            // Calculate statistics from all vulnerabilities
            const stats = {
              totalVulnerabilities: allVulnerabilities.length,
              criticalCount: allVulnerabilities.filter((v) => v.severity === 'critical').length,
              highCount: allVulnerabilities.filter((v) => v.severity === 'high').length,
              mediumCount: allVulnerabilities.filter((v) => v.severity === 'medium').length,
              lowCount: allVulnerabilities.filter((v) => v.severity === 'low').length,
              none: allVulnerabilities.filter((v) => v.severity === 'none').length,
            }

            // Calculate vulnerable components (unique component IDs from affectedComponents)
            const vulnerableComponentIds = new Set<string>()
            for (const vuln of allVulnerabilities) {
              for (const affectedId of vuln.affectedComponents || []) {
                vulnerableComponentIds.add(affectedId)
              }
            }

            // Update project with new vulnerabilities and timestamp
            set((state) => ({
              projects: state.projects.map((p) =>
                p.id === projectId
                  ? {
                      ...p,
                      vulnerabilities: allVulnerabilities,
                      lastVulnDataRefresh: new Date(),
                      statistics: {
                        ...p.statistics,
                        ...stats,
                        vulnerableComponents: vulnerableComponentIds.size,
                      },
                    }
                  : p,
              ),
              currentProject:
                state.currentProject?.id === projectId
                  ? {
                      ...state.currentProject,
                      vulnerabilities: allVulnerabilities,
                      lastVulnDataRefresh: new Date(),
                      statistics: {
                        ...state.currentProject.statistics,
                        ...stats,
                        vulnerableComponents: vulnerableComponentIds.size,
                      },
                    }
                  : state.currentProject,
              refreshingProjectIds: new Set([...state.refreshingProjectIds].filter((id) => id !== projectId)),
            }))
          }
        } finally {
          // Always clear refreshing state
          set((state) => ({
            refreshingProjectIds: new Set([...state.refreshingProjectIds].filter((id) => id !== projectId)),
          }))
        }
      },

      // UI State
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      refreshingProjectIds: new Set<string>(),
      setRefreshingProject: (projectId, isRefreshing) =>
        set((state) => {
          const newSet = new Set(state.refreshingProjectIds)
          if (isRefreshing) {
            newSet.add(projectId)
          } else {
            newSet.delete(projectId)
          }
          return { refreshingProjectIds: newSet }
        }),

      // Notification Preferences
      notificationPreferences: {
        enabled: true,
        desktopEnabled: true,
        categories: {
          critical_vuln: true,
          scan_complete: true,
          update_available: true,
          system: true,
        },
      },
      updateNotificationPreferences: (preferences) =>
        set((state) => ({
          notificationPreferences: { ...state.notificationPreferences, ...preferences },
        })),

      // Test helpers - reset store to initial state
      _resetStore: () =>
        set({
          settings: DEFAULT_SETTINGS,
          settingsProfiles: [],
          activeProfileId: '',
          projects: [],
          currentProject: null,
          sidebarOpen: true,
          refreshingProjectIds: new Set(),
          notificationPreferences: {
            enabled: true,
            desktopEnabled: true,
            categories: {
              critical_vuln: true,
              scan_complete: true,
              update_available: true,
              system: true,
            },
          },
        }),
    }),
    {
      name: 'vuln-assess-storage',
      partialize: (state) => ({
        settings: state.settings,
        projects: state.projects,
        activeProfileId: state.activeProfileId,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

// Selector hooks for fine-grained subscriptions (prevents unnecessary re-renders)
export const useSettings = () => useStore((s) => s.settings)
export const useUpdateSettings = () => useStore((s) => s.updateSettings)
export const useProjects = () => useStore((s) => s.projects)
export const useCurrentProject = () => useStore((s) => s.currentProject)
export const useSidebarOpen = () => useStore((s) => s.sidebarOpen)
export const useSetSidebarOpen = () => useStore((s) => s.setSidebarOpen)
export const useRefreshingProjectIds = () => useStore((s) => s.refreshingProjectIds)
export const useSettingsProfiles = () => useStore((s) => s.settingsProfiles)
export const useActiveProfileId = () => useStore((s) => s.activeProfileId)
export const useNotificationPreferences = () => useStore((s) => s.notificationPreferences)
