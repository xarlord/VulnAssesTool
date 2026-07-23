import { useState, useEffect } from 'react'
import { UserCircle, Plus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { SettingsProfileCard } from '@/components/SettingsProfileCard'
import { CreateProfileDialog } from '@/components/CreateProfileDialog'
import type { AppSettings } from '@@/types'

/**
 * Settings-profile management (create / switch / delete + the create dialog).
 * Self-contained: owns its dialog state and reaches profile actions through
 * the store. Profile import/export lives in the Data Management section.
 */
export function ProfilesSection() {
  const {
    settings,
    settingsProfiles,
    activeProfileId,
    loadSettingsProfiles,
    createSettingsProfile,
    deleteSettingsProfile,
    switchSettingsProfile,
  } = useStore()

  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false)

  // Load profiles on mount
  useEffect(() => {
    loadSettingsProfiles()
  }, [])

  const handleCreateProfile = (name: string, description: string | undefined, profileSettings: AppSettings) => {
    try {
      createSettingsProfile(name, description, profileSettings)
    } catch (error) {
      console.error('Failed to create profile:', error)
      alert(error instanceof Error ? error.message : 'Failed to create profile')
    }
  }

  const handleDeleteProfile = (profileId: string) => {
    try {
      deleteSettingsProfile(profileId)
    } catch (error) {
      console.error('Failed to delete profile:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete profile')
    }
  }

  const handleSwitchProfile = (profileId: string) => {
    try {
      switchSettingsProfile(profileId)
      // Note: API key is NOT synced from profiles anymore
      // It remains in secure storage
    } catch (error) {
      console.error('Failed to switch profile:', error)
      alert(error instanceof Error ? error.message : 'Failed to switch profile')
    }
  }

  return (
    <>
      <div id="profiles" className="rounded-lg border border-border bg-card scroll-mt-6">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Settings Profiles</h2>
          </div>
          <button
            onClick={() => setShowCreateProfileDialog(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create New Profile
          </button>
        </div>
        <div className="p-4">
          {settingsProfiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No settings profiles yet. Create your first profile to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {settingsProfiles.map((profile) => (
                <SettingsProfileCard
                  key={profile.id}
                  profile={profile}
                  isActive={profile.id === activeProfileId}
                  onSwitch={handleSwitchProfile}
                  onDelete={handleDeleteProfile}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Profile Dialog */}
      <CreateProfileDialog
        open={showCreateProfileDialog}
        onClose={() => setShowCreateProfileDialog(false)}
        onCreate={handleCreateProfile}
        existingProfiles={settingsProfiles}
        currentSettings={settings}
      />
    </>
  )
}
