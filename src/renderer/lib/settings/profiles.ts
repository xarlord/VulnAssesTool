/**
 * Settings Profiles Management
 * Manages settings profiles with localStorage persistence
 */

import type { SettingsProfile, AppSettings } from '@@/types'

const PROFILES_STORAGE_KEY = 'vuln-assess-settings-profiles'
const ACTIVE_PROFILE_ID_KEY = 'vuln-assess-active-profile-id'

/**
 * Generate a unique profile ID
 */
function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get all profiles from localStorage
 */
function loadProfilesFromStorage(): SettingsProfile[] {
  try {
    const stored = localStorage.getItem(PROFILES_STORAGE_KEY)
    if (!stored) return []

    const data = JSON.parse(stored)
    // Convert date strings back to Date objects
    return data.map((profile: Record<string, unknown>) => ({
      ...profile,
      createdAt: new Date(profile.createdAt as string),
      lastUsed: new Date(profile.lastUsed as string),
    }))
  } catch (error) {
    console.error('Failed to load profiles from storage:', error)
    return []
  }
}

/**
 * Save profiles to localStorage
 */
function saveProfilesToStorage(profiles: SettingsProfile[]): void {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles))
  } catch (error) {
    console.error('Failed to save profiles to storage:', error)
  }
}

/**
 * Get active profile ID from localStorage
 */
function loadActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_ID_KEY)
  } catch (error) {
    console.error('Failed to load active profile ID:', error)
    return null
  }
}

/**
 * Save active profile ID to localStorage
 */
function saveActiveProfileId(profileId: string): void {
  try {
    localStorage.setItem(ACTIVE_PROFILE_ID_KEY, profileId)
  } catch (error) {
    console.error('Failed to save active profile ID:', error)
  }
}

/**
 * Create a new settings profile
 */
export function createProfile(name: string, description: string | undefined, settings: AppSettings): SettingsProfile {
  const profiles = loadProfilesFromStorage()

  // Check if a profile with the same name already exists
  if (profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`A profile with the name "${name}" already exists`)
  }

  const newProfile: SettingsProfile = {
    id: generateProfileId(),
    name: name.trim(),
    description: description?.trim() || undefined,
    settings,
    isDefault: profiles.length === 0, // First profile is automatically default
    createdAt: new Date(),
    lastUsed: new Date(),
  }

  // Save updated profiles list
  saveProfilesToStorage([...profiles, newProfile])

  // If this is the first profile or is default, make it active
  if (newProfile.isDefault) {
    saveActiveProfileId(newProfile.id)
  }

  return newProfile
}

/**
 * Update an existing profile
 */
export function updateProfile(
  profileId: string,
  updates: Partial<Omit<SettingsProfile, 'id' | 'createdAt' | 'lastUsed'>>,
): void {
  const profiles = loadProfilesFromStorage()
  const profileIndex = profiles.findIndex((p) => p.id === profileId)

  if (profileIndex === -1) {
    throw new Error(`Profile with ID "${profileId}" not found`)
  }

  // If updating name, check for duplicates
  if (updates.name && updates.name !== profiles[profileIndex].name) {
    const updateName = updates.name
    const nameExists = profiles.some((p) => p.id !== profileId && p.name.toLowerCase() === updateName.toLowerCase())
    if (nameExists) {
      throw new Error(`A profile with the name "${updates.name}" already exists`)
    }
  }

  // Update the profile
  profiles[profileIndex] = {
    ...profiles[profileIndex],
    ...updates,
    name: updates.name ? updates.name.trim() : profiles[profileIndex].name,
    description: updates.description?.trim() || undefined,
  }

  saveProfilesToStorage(profiles)
}

/**
 * Delete a profile
 */
export function deleteProfile(profileId: string): void {
  const profiles = loadProfilesFromStorage()
  const profileIndex = profiles.findIndex((p) => p.id === profileId)

  if (profileIndex === -1) {
    throw new Error(`Profile with ID "${profileId}" not found`)
  }

  const profile = profiles[profileIndex]

  // Prevent deleting the default profile if it's the only one
  if (profile.isDefault && profiles.length === 1) {
    throw new Error('Cannot delete the only remaining profile')
  }

  // Remove the profile
  const updatedProfiles = profiles.filter((p) => p.id !== profileId)

  // If we deleted the default profile, make another one default
  if (profile.isDefault && updatedProfiles.length > 0) {
    updatedProfiles[0].isDefault = true

    // Update active profile if it was the deleted one
    const activeId = loadActiveProfileId()
    if (activeId === profileId) {
      saveActiveProfileId(updatedProfiles[0].id)
    }
  }

  saveProfilesToStorage(updatedProfiles)
}

/**
 * Set a profile as the default
 */
export function setDefaultProfile(profileId: string): void {
  const profiles = loadProfilesFromStorage()
  const profileIndex = profiles.findIndex((p) => p.id === profileId)

  if (profileIndex === -1) {
    throw new Error(`Profile with ID "${profileId}" not found`)
  }

  // Remove default flag from all profiles
  const updatedProfiles = profiles.map((p) => ({
    ...p,
    isDefault: p.id === profileId,
  }))

  saveProfilesToStorage(updatedProfiles)
}

/**
 * Get all profiles
 */
export function getProfiles(): SettingsProfile[] {
  return loadProfilesFromStorage()
}

/**
 * Get the active profile
 */
export function getActiveProfile(): SettingsProfile {
  const profiles = loadProfilesFromStorage()
  const activeId = loadActiveProfileId()

  // If no active ID is set, use the default profile
  let activeProfile: SettingsProfile | undefined

  if (activeId) {
    activeProfile = profiles.find((p) => p.id === activeId)
  }

  // If no active profile found, use the default profile
  if (!activeProfile) {
    activeProfile = profiles.find((p) => p.isDefault)
  }

  // If still no profile found (empty profiles list), create default profile
  if (!activeProfile) {
    const defaultSettings = getDefaultSettings()
    activeProfile = createProfile('Default Profile', undefined, defaultSettings)
  }

  return activeProfile
}

/**
 * Switch to a different profile (makes it active)
 */
export function switchProfile(profileId: string): SettingsProfile {
  const profiles = loadProfilesFromStorage()
  const profile = profiles.find((p) => p.id === profileId)

  if (!profile) {
    throw new Error(`Profile with ID "${profileId}" not found`)
  }

  // Update the last used timestamp
  const updatedProfiles = profiles.map((p) => (p.id === profileId ? { ...p, lastUsed: new Date() } : p))

  saveProfilesToStorage(updatedProfiles)
  saveActiveProfileId(profileId)

  // Return the updated profile
  return { ...profile, lastUsed: new Date() }
}

/**
 * Get default settings
 * This is a fallback to create initial profile
 */
function getDefaultSettings(): AppSettings {
  return {
    theme: 'system',
    fontSize: 'default',
    dataRetentionDays: 30,
    autoRefresh: false,
    autoRefreshInterval: 24,
    vulnDataCacheTTL: 1,
    vulnProviders: {
      nvd: {
        enabled: true,
        priority: 1,
        rateLimit: {
          requestsPerHour: 600,
          requestsPerMinute: 10,
        },
      },
      osv: {
        enabled: true,
        priority: 2,
        rateLimit: {
          requestsPerHour: 1000,
        },
      },
      ossIndex: {
        enabled: false,
        priority: 3,
        rateLimit: {
          requestsPerHour: 1000,
          requestsPerMinute: 16,
        },
      },
      githubAdvisory: {
        enabled: false,
        priority: 4,
        rateLimit: {
          requestsPerHour: 5000,
          requestsPerMinute: 83,
        },
      },
      snyk: {
        enabled: false,
        priority: 5,
        rateLimit: {
          requestsPerHour: 200,
        },
      },
    },
    cvssVersion: '3.1',
    showCvssBreakdown: true,
    maxGraphNodes: 500,
    showVulnerableOnly: false,
  }
}

/**
 * Initialize profiles if they don't exist
 * This ensures there's always at least one profile
 */
export function initializeProfiles(): void {
  const profiles = loadProfilesFromStorage()

  if (profiles.length === 0) {
    const defaultSettings = getDefaultSettings()
    createProfile('Default Profile', 'Default settings profile', defaultSettings)
  }
}
