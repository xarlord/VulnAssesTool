/**
 * Tests for ProfilesSection (FR-10.2 — Set Default wiring).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfilesSection } from './ProfilesSection'
import type { SettingsProfile } from '@@/types'

const { mockState } = vi.hoisted(() => ({
  mockState: {
    settings: {} as unknown,
    settingsProfiles: [] as SettingsProfile[],
    activeProfileId: 'p1',
    loadSettingsProfiles: vi.fn(),
    createSettingsProfile: vi.fn(),
    deleteSettingsProfile: vi.fn(),
    switchSettingsProfile: vi.fn(),
    setDefaultSettingsProfile: vi.fn(),
  },
}))

vi.mock('@/store/useStore', () => ({ useStore: () => mockState }))
vi.mock('@/components/CreateProfileDialog', () => ({ CreateProfileDialog: () => null }))

const baseSettings = {
  theme: 'dark',
  fontSize: 'default',
  autoRefresh: true,
} as unknown as SettingsProfile['settings']

function profile(overrides: Partial<SettingsProfile>): SettingsProfile {
  return {
    id: 'p1',
    name: 'Profile',
    description: '',
    settings: baseSettings,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    lastUsed: new Date('2024-01-02'),
    ...overrides,
  }
}

describe('ProfilesSection — Set Default (FR-10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.settingsProfiles = [
      profile({ id: 'p1', name: 'Default one', isDefault: true }),
      profile({ id: 'p2', name: 'Other', isDefault: false }),
    ]
    global.alert = vi.fn()
  })

  it('calls setDefaultSettingsProfile with the profile id when Set Default is clicked', () => {
    render(<ProfilesSection />)

    // The non-default profile (p2) has an enabled Set Default button.
    const setDefaultButtons = screen.getAllByRole('button', { name: /set default/i })
    const enabled = setDefaultButtons.find((b) => !(b as HTMLButtonElement).disabled)
    expect(enabled).toBeDefined()
    if (enabled) fireEvent.click(enabled)

    expect(mockState.setDefaultSettingsProfile).toHaveBeenCalledWith('p2')
  })

  it('alerts when the store throws while setting the default', () => {
    mockState.setDefaultSettingsProfile.mockImplementation(() => {
      throw new Error('boom')
    })
    render(<ProfilesSection />)

    const enabled = screen
      .getAllByRole('button', { name: /set default/i })
      .find((b) => !(b as HTMLButtonElement).disabled)
    if (enabled) fireEvent.click(enabled)

    expect(global.alert).toHaveBeenCalledWith('boom')
  })
})
