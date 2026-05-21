/**
 * StalenessIndicator Tests
 * Tests for staleness display, refresh button, compact mode, and StalenessBadge
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StalenessIndicator, StalenessBadge } from './StalenessIndicator'

// Hoisted mock state
const mockIsVulnDataStale = vi.hoisted(() => vi.fn())
const mockGetStalenessText = vi.hoisted(() => vi.fn())

vi.mock('@/lib/cache', () => ({
  isVulnDataStale: mockIsVulnDataStale,
  getStalenessText: mockGetStalenessText,
}))

function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    theme: 'light' as const,
    fontSize: 'default' as const,
    dataRetentionDays: 90,
    autoRefresh: true,
    autoRefreshInterval: 24,
    vulnDataCacheTTL: 48,
    vulnProviders: {
      nvd: { enabled: true, apiKey: '' },
      osv: { enabled: true },
    },
    cvssVersion: '3.1' as const,
    showCvssBreakdown: false,
    maxGraphNodes: 500,
    showVulnerableOnly: false,
    ...overrides,
  }
}

describe('StalenessIndicator', () => {
  const baseProps = {
    lastRefresh: new Date(),
    settings: createSettings(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsVulnDataStale.mockReturnValue(false)
    mockGetStalenessText.mockReturnValue('5 minutes ago')
  })

  // ---- Non-compact mode (default) ----

  it('should render staleness text in non-compact mode', () => {
    render(<StalenessIndicator {...baseProps} />)

    expect(screen.getByText('5 minutes ago')).toBeInTheDocument()
  })

  it('should render "Last refreshed:" label', () => {
    render(<StalenessIndicator {...baseProps} />)

    expect(screen.getByText(/Last refreshed:/)).toBeInTheDocument()
  })

  it('should display staleness text in a strong element', () => {
    render(<StalenessIndicator {...baseProps} />)

    const strongEl = screen.getByText('5 minutes ago')
    expect(strongEl.tagName).toBe('STRONG')
  })

  it('should apply non-stale styles when data is fresh', () => {
    mockIsVulnDataStale.mockReturnValue(false)

    render(<StalenessIndicator {...baseProps} />)

    const container = screen.getByText(/Last refreshed:/).closest('div')
    expect(container?.className).toContain('bg-gray-50')
    expect(container?.className).toContain('text-gray-600')
  })

  it('should apply stale styles when data is stale', () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('3 days ago')

    render(<StalenessIndicator {...baseProps} />)

    const container = screen.getByText(/Last refreshed:/).closest('div')
    expect(container?.className).toContain('bg-orange-50')
    expect(container?.className).toContain('text-orange-700')
  })

  it('should show refresh button when data is stale', () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('2 days ago')

    render(<StalenessIndicator {...baseProps} />)

    expect(screen.getByText('Refresh Now')).toBeInTheDocument()
  })

  it('should not show refresh button when data is fresh', () => {
    mockIsVulnDataStale.mockReturnValue(false)

    render(<StalenessIndicator {...baseProps} />)

    expect(screen.queryByText('Refresh Now')).not.toBeInTheDocument()
    expect(screen.queryByText('Refreshing...')).not.toBeInTheDocument()
  })

  it('should call onRefresh when refresh button is clicked', async () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('1 day ago')
    const onRefresh = vi.fn()

    render(<StalenessIndicator {...baseProps} onRefresh={onRefresh} />)

    await userEvent.click(screen.getByText('Refresh Now'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('should show "Refreshing..." text when isRefreshing is true', () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('1 day ago')

    render(<StalenessIndicator {...baseProps} isRefreshing />)

    expect(screen.getByText('Refreshing...')).toBeInTheDocument()
    expect(screen.queryByText('Refresh Now')).not.toBeInTheDocument()
  })

  it('should disable refresh button when isRefreshing is true', () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('1 day ago')

    render(<StalenessIndicator {...baseProps} isRefreshing />)

    const button = screen.getByText('Refreshing...').closest('button')
    expect(button).toBeDisabled()
  })

  it('should pass lastRefresh and cacheTTL to isVulnDataStale', () => {
    const lastRefresh = new Date('2025-01-01')
    const settings = createSettings({ vulnDataCacheTTL: 24 })

    render(<StalenessIndicator lastRefresh={lastRefresh} settings={settings} />)

    expect(mockIsVulnDataStale).toHaveBeenCalledWith(lastRefresh, 24)
  })

  it('should pass lastRefresh and cacheTTL to getStalenessText', () => {
    const lastRefresh = new Date('2025-06-15')
    const settings = createSettings({ vulnDataCacheTTL: 12 })

    render(<StalenessIndicator lastRefresh={lastRefresh} settings={settings} />)

    expect(mockGetStalenessText).toHaveBeenCalledWith(lastRefresh, 12)
  })

  it('should handle undefined lastRefresh', () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('Never refreshed')

    render(<StalenessIndicator lastRefresh={undefined} settings={createSettings()} />)

    expect(mockIsVulnDataStale).toHaveBeenCalledWith(undefined, expect.any(Number))
    expect(mockGetStalenessText).toHaveBeenCalledWith(undefined, expect.any(Number))
    expect(screen.getByText('Never refreshed')).toBeInTheDocument()
  })

  // ---- Compact mode ----

  describe('compact mode', () => {
    it('should render compact layout when compact is true', () => {
      mockGetStalenessText.mockReturnValue('2 hours ago')

      render(<StalenessIndicator {...baseProps} compact />)

      // Compact mode doesn't have "Last refreshed:" label
      expect(screen.queryByText(/Last refreshed:/)).not.toBeInTheDocument()
      expect(screen.getByText('2 hours ago')).toBeInTheDocument()
    })

    it('should have title attribute for tooltip in compact mode', () => {
      mockGetStalenessText.mockReturnValue('30 minutes ago')

      render(<StalenessIndicator {...baseProps} compact />)

      const textEl = screen.getByText('30 minutes ago')
      const container = textEl.closest('div')
      expect(container?.getAttribute('title')).toBe('Last refreshed: 30 minutes ago')
    })

    it('should apply non-stale text color in compact mode', () => {
      mockIsVulnDataStale.mockReturnValue(false)
      mockGetStalenessText.mockReturnValue('10 minutes ago')

      render(<StalenessIndicator {...baseProps} compact />)

      const container = screen.getByText('10 minutes ago').closest('div')
      expect(container?.className).toContain('text-gray-500')
    })

    it('should apply stale text color in compact mode', () => {
      mockIsVulnDataStale.mockReturnValue(true)
      mockGetStalenessText.mockReturnValue('5 hours ago')

      render(<StalenessIndicator {...baseProps} compact />)

      const container = screen.getByText('5 hours ago').closest('div')
      expect(container?.className).toContain('text-orange-600')
    })

    it('should not show refresh button in compact mode even when stale', () => {
      mockIsVulnDataStale.mockReturnValue(true)
      mockGetStalenessText.mockReturnValue('3 days ago')

      render(<StalenessIndicator {...baseProps} compact />)

      expect(screen.queryByText('Refresh Now')).not.toBeInTheDocument()
    })

    it('should use smaller text in compact mode', () => {
      mockGetStalenessText.mockReturnValue('1 hour ago')

      render(<StalenessIndicator {...baseProps} compact />)

      const container = screen.getByText('1 hour ago').closest('div')
      expect(container?.className).toContain('text-xs')
    })
  })
})

describe('StalenessBadge', () => {
  const baseProps = {
    lastRefresh: new Date(),
    settings: createSettings(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsVulnDataStale.mockReturnValue(false)
    mockGetStalenessText.mockReturnValue('5 minutes ago')
  })

  it('should render staleness text in badge', () => {
    render(<StalenessBadge {...baseProps} />)

    expect(screen.getByText('5 minutes ago')).toBeInTheDocument()
  })

  it('should apply fresh badge styles when data is fresh', () => {
    mockIsVulnDataStale.mockReturnValue(false)

    render(<StalenessBadge {...baseProps} />)

    const badge = screen.getByText('5 minutes ago').closest('div')
    expect(badge?.className).toContain('bg-green-100')
    expect(badge?.className).toContain('text-green-700')
  })

  it('should apply stale badge styles when data is stale', () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('2 days ago')

    render(<StalenessBadge {...baseProps} />)

    const badge = screen.getByText('2 days ago').closest('div')
    expect(badge?.className).toContain('bg-orange-100')
    expect(badge?.className).toContain('text-orange-700')
  })

  it('should have title attribute for tooltip', () => {
    mockGetStalenessText.mockReturnValue('15 minutes ago')

    render(<StalenessBadge {...baseProps} />)

    const badge = screen.getByText('15 minutes ago').closest('div')
    expect(badge?.getAttribute('title')).toBe('Last refreshed: 15 minutes ago')
  })

  it('should render as inline element with rounded-full class', () => {
    render(<StalenessBadge {...baseProps} />)

    const badge = screen.getByText('5 minutes ago').closest('div')
    expect(badge?.className).toContain('rounded-full')
    expect(badge?.className).toContain('inline-flex')
  })

  it('should use text-xs font size', () => {
    render(<StalenessBadge {...baseProps} />)

    const badge = screen.getByText('5 minutes ago').closest('div')
    expect(badge?.className).toContain('text-xs')
  })

  it('should handle undefined lastRefresh', () => {
    mockIsVulnDataStale.mockReturnValue(true)
    mockGetStalenessText.mockReturnValue('Never refreshed')

    render(<StalenessBadge lastRefresh={undefined} settings={createSettings()} />)

    expect(screen.getByText('Never refreshed')).toBeInTheDocument()
  })

  it('should pass lastRefresh and cacheTTL to utility functions', () => {
    const lastRefresh = new Date('2025-03-01')
    const settings = createSettings({ vulnDataCacheTTL: 72 })

    render(<StalenessBadge lastRefresh={lastRefresh} settings={settings} />)

    expect(mockIsVulnDataStale).toHaveBeenCalledWith(lastRefresh, 72)
    expect(mockGetStalenessText).toHaveBeenCalledWith(lastRefresh, 72)
  })
})
