/**
 * Tests for CvssSection (FR-10.5): CVSS version, breakdown-default toggle, and
 * per-band severity thresholds. Each control must push the right partial payload
 * to updateSettings — the only path that persists these preferences.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { mockUpdateSettings, settingsRef } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn(),
  settingsRef: {
    current: {
      cvssVersion: '3.1' as '3.0' | '3.1',
      showCvssBreakdown: true,
      severityThresholds: { critical: 9.0, high: 7.0, medium: 4.0, low: 0.1 },
    },
  },
}))

vi.mock('@/store/useStore', () => ({
  useStore: () => ({ settings: settingsRef.current, updateSettings: mockUpdateSettings }),
}))

import { CvssSection } from './CvssSection'

describe('CvssSection (FR-10.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsRef.current = {
      cvssVersion: '3.1',
      showCvssBreakdown: true,
      severityThresholds: { critical: 9.0, high: 7.0, medium: 4.0, low: 0.1 },
    }
  })

  it('persists the preferred CVSS version', () => {
    render(<CvssSection />)
    fireEvent.change(screen.getByLabelText(/cvss version/i), { target: { value: '3.0' } })
    expect(mockUpdateSettings).toHaveBeenCalledWith({ cvssVersion: '3.0' })
  })

  it('toggles the show-breakdown default', () => {
    render(<CvssSection />)
    fireEvent.click(screen.getByRole('switch', { name: /show cvss breakdown/i }))
    expect(mockUpdateSettings).toHaveBeenCalledWith({ showCvssBreakdown: false })
  })

  it('updates one severity threshold while preserving the others', () => {
    // WHY: the payload must carry the WHOLE thresholds object; sending only the
    // changed band would wipe the rest to undefined on the next parser call.
    render(<CvssSection />)
    fireEvent.change(screen.getByLabelText(/critical threshold/i), { target: { value: '8.5' } })
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      severityThresholds: { critical: 8.5, high: 7.0, medium: 4.0, low: 0.1 },
    })
  })
})
