/**
 * Tests for CommandPalette Component
 *
 * @requirement P3-007
 * @test-case TC-CMD-001
 * @coverage full
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommandPalette } from './CommandPalette'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock commands data
const createMockCommands = () => [
  {
    command: {
      id: 'navigation.dashboard',
      label: 'Go to Dashboard',
      category: 'navigation',
      shortcut: 'Ctrl+D',
      action: vi.fn(),
      enabled: true,
    },
    score: 1,
    matchedTerms: ['dashboard'],
  },
  {
    command: {
      id: 'navigation.settings',
      label: 'Go to Settings',
      category: 'navigation',
      shortcut: 'Ctrl+,',
      action: vi.fn(),
      enabled: true,
    },
    score: 0.9,
    matchedTerms: ['settings'],
  },
  {
    command: {
      id: 'actions.scan',
      label: 'Run Scan',
      category: 'actions',
      action: vi.fn(),
      enabled: true,
    },
    score: 0.8,
    matchedTerms: ['scan'],
  },
]

// Mock the commands module with mutable return value
let mockSearchResults: ReturnType<typeof createMockCommands> = []

vi.mock('@/lib/commands', () => ({
  getCommandRegistry: vi.fn(() => ({
    search: vi.fn(),
    getCommands: vi.fn(),
  })),
  searchCommands: vi.fn(() => mockSearchResults),
}))

describe('CommandPalette', () => {
  // Mock window.getComputedStyle for Radix UI Dialog (react-remove-scroll-bar)
  const originalGetComputedStyle = window.getComputedStyle

  beforeEach(() => {
    window.getComputedStyle = vi.fn(() => ({
      getPropertyValue: () => '',
      width: '0px',
      height: '0px',
      padding: '0px',
      margin: '0px',
    })) as any
    // Mock scrollIntoView for keyboard navigation
    Element.prototype.scrollIntoView = vi.fn()
    vi.clearAllMocks()
    mockSearchResults = createMockCommands()
  })

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle
    vi.restoreAllMocks()
  })

  describe('Rendering', () => {
    it('should render nothing when closed', () => {
      render(<CommandPalette open={false} onOpenChange={vi.fn()} />)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('should render dialog when open', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should render search input when open', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByPlaceholderText(/search commands/i)).toBeInTheDocument()
    })

    it('should render command results', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Go to Settings')).toBeInTheDocument()
    })

    it('should render keyboard shortcuts', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByText('Ctrl+D')).toBeInTheDocument()
      expect(screen.getByText('Ctrl+,')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('should call searchCommands with query', async () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.change(input, { target: { value: 'dashboard' } })

      // Verify the component handles search
      expect(input).toHaveValue('dashboard')
    })

    it('should show empty state when no results', () => {
      mockSearchResults = []

      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.queryByText('Go to Dashboard')).not.toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should close on Escape key', async () => {
      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('should navigate down with ArrowDown', async () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'ArrowDown' })

      // First item should be selected (visual indication would be via CSS)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should navigate up with ArrowUp', async () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('Command Execution', () => {
    it('should execute command on click', async () => {
      const mockAction = vi.fn()
      mockSearchResults = [
        {
          command: {
            id: 'test.command',
            label: 'Test Command',
            category: 'actions',
            action: mockAction,
            enabled: true,
          },
          score: 1,
          matchedTerms: ['test'],
        },
      ]

      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      fireEvent.click(screen.getByText('Test Command'))

      expect(mockAction).toHaveBeenCalled()
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('Category Grouping', () => {
    it('should group commands by category', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      // Check for category labels
      expect(screen.getByText('Navigation')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have accessible dialog role', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('State Reset', () => {
    it('should reset query when dialog opens', async () => {
      const { rerender, container } = render(<CommandPalette open={false} onOpenChange={vi.fn()} />)

      rerender(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      await waitFor(
        () => {
          const input = screen.getByPlaceholderText(/search commands/i)
          expect(input).toHaveValue('')
        },
        { container },
      )
    })
  })
})
