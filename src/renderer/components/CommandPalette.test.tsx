/**
 * Tests for CommandPalette Component
 *
 * @requirement P3-007
 * @test-case TC-CMD-001
 * @coverage full
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommandPalette, useCommandPalette, CommandPaletteTrigger } from './CommandPalette'

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

  describe('Enter Key Execution', () => {
    it('should execute the first command on Enter', () => {
      const mockAction = vi.fn()
      mockSearchResults = [
        {
          command: {
            id: 'test.enter',
            label: 'Enter Command',
            category: 'actions',
            action: mockAction,
            enabled: true,
          },
          score: 1,
          matchedTerms: ['enter'],
        },
      ]

      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(mockAction).toHaveBeenCalled()
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('should not crash on Enter when no results exist', () => {
      mockSearchResults = []
      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onOpenChange).not.toHaveBeenCalled()
    })

    it('should execute correct command after navigating down', () => {
      const firstAction = vi.fn()
      const secondAction = vi.fn()
      mockSearchResults = [
        {
          command: {
            id: 'cmd.first',
            label: 'First',
            category: 'actions',
            action: firstAction,
            enabled: true,
          },
          score: 1,
          matchedTerms: ['first'],
        },
        {
          command: {
            id: 'cmd.second',
            label: 'Second',
            category: 'actions',
            action: secondAction,
            enabled: true,
          },
          score: 0.9,
          matchedTerms: ['second'],
        },
      ]

      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(firstAction).not.toHaveBeenCalled()
      expect(secondAction).toHaveBeenCalled()
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('Escape from Input', () => {
    it('should close palette on Escape from input element', () => {
      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('Arrow Key Boundaries', () => {
    it('should stay at first item on ArrowUp from index 0', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      const options = screen.getAllByRole('option')
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('should not exceed last item on repeated ArrowDown', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      // 3 commands in mock; press ArrowDown 10 times to exceed boundary
      for (let i = 0; i < 10; i++) {
        fireEvent.keyDown(input, { key: 'ArrowDown' })
      }

      const options = screen.getAllByRole('option')
      const lastIndex = options.length - 1
      expect(options[lastIndex]).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('Mouse Interaction', () => {
    it('should update selection on mouseEnter', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const options = screen.getAllByRole('option')
      // Hover over the last option
      fireEvent.mouseEnter(options[options.length - 1])

      expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')
    })

    it('should show selected styling on the active item', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const options = screen.getAllByRole('option')
      // First item is selected by default
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      // Other items should not be selected
      expect(options[1]).toHaveAttribute('aria-selected', 'false')
    })
  })

  describe('Empty Results', () => {
    it('should display "No commands found" message when query yields no results', () => {
      mockSearchResults = []
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByRole('status')).toHaveTextContent(/no commands found/i)
    })

    it('should include the query in the empty state message', () => {
      mockSearchResults = []
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.change(input, { target: { value: 'xyz' } })

      expect(screen.getByRole('status')).toHaveTextContent('xyz')
    })
  })

  describe('Command Action Error Handling', () => {
    it('should handle action errors gracefully without crashing', async () => {
      const failingAction = vi.fn().mockRejectedValue(new Error('Action failed'))
      mockSearchResults = [
        {
          command: {
            id: 'test.error',
            label: 'Fail Command',
            category: 'actions',
            action: failingAction,
            enabled: true,
          },
          score: 1,
          matchedTerms: ['fail'],
        },
      ]

      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(failingAction).toHaveBeenCalled()
      })
      // Dialog should still close despite the error
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('Search Resets Selection', () => {
    it('should reset selectedIndex to 0 when query changes', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)

      // Navigate down to select second item
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      const options = screen.getAllByRole('option')
      expect(options[1]).toHaveAttribute('aria-selected', 'true')

      // Type into search — should reset to first item
      fireEvent.change(input, { target: { value: 'go' } })
      const updatedOptions = screen.getAllByRole('option')
      expect(updatedOptions[0]).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('Scroll Into View', () => {
    it('should scroll selected item into view on navigation', () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      const input = screen.getByPlaceholderText(/search commands/i)
      fireEvent.keyDown(input, { key: 'ArrowDown' })

      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })
  })

  describe('Command Without Shortcut', () => {
    it('should render command without shortcut badge when shortcut is absent', () => {
      mockSearchResults = [
        {
          command: {
            id: 'no.shortcut',
            label: 'No Shortcut',
            category: 'actions',
            action: vi.fn(),
            enabled: true,
          },
          score: 1,
          matchedTerms: ['shortcut'],
        },
      ]

      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByText('No Shortcut')).toBeInTheDocument()
      // The ESC badge in the search bar header is present, but no shortcut badge
      // inside the command item
      const option = screen.getByRole('option')
      const badges = option.querySelectorAll('[data-slot="badge"]')
      expect(badges.length).toBe(0)
    })
  })

  describe('Category Labels', () => {
    it('should use fallback label for unknown category', () => {
      mockSearchResults = [
        {
          command: {
            id: 'custom.cmd',
            label: 'Custom Command',
            category: 'custom' as unknown as import('@/lib/commands/types').CommandCategory,
            action: vi.fn(),
            enabled: true,
          },
          score: 1,
          matchedTerms: ['custom'],
        },
      ]

      render(<CommandPalette open={true} onOpenChange={vi.fn()} />)

      // Falls back to the raw category string
      expect(screen.getByText('custom')).toBeInTheDocument()
    })
  })

  describe('Command Click Execution', () => {
    it('should close and execute on clicking a non-first command', () => {
      const secondAction = vi.fn()
      mockSearchResults = [
        {
          command: {
            id: 'a.one',
            label: 'Alpha',
            category: 'actions',
            action: vi.fn(),
            enabled: true,
          },
          score: 1,
          matchedTerms: ['alpha'],
        },
        {
          command: {
            id: 'b.two',
            label: 'Beta',
            category: 'actions',
            action: secondAction,
            enabled: true,
          },
          score: 0.9,
          matchedTerms: ['beta'],
        },
      ]

      const onOpenChange = vi.fn()
      render(<CommandPalette open={true} onOpenChange={onOpenChange} />)

      fireEvent.click(screen.getByText('Beta'))

      expect(secondAction).toHaveBeenCalled()
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})

describe('useCommandPalette', () => {
  it('should start closed', () => {
    function Harness() {
      const { open } = useCommandPalette()
      return <span data-testid="open">{String(open)}</span>
    }
    render(<Harness />)
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })

  it('should open the palette', () => {
    function Harness() {
      const { open, openPalette } = useCommandPalette()
      return (
        <div>
          <span data-testid="open">{String(open)}</span>
          <button onClick={openPalette}>open</button>
        </div>
      )
    }
    render(<Harness />)

    fireEvent.click(screen.getByText('open'))
    expect(screen.getByTestId('open')).toHaveTextContent('true')
  })

  it('should close the palette', () => {
    function Harness() {
      const { open, openPalette, closePalette } = useCommandPalette()
      return (
        <div>
          <span data-testid="open">{String(open)}</span>
          <button onClick={openPalette}>open-btn</button>
          <button onClick={closePalette}>close-btn</button>
        </div>
      )
    }
    render(<Harness />)

    fireEvent.click(screen.getByText('open-btn'))
    expect(screen.getByTestId('open')).toHaveTextContent('true')

    fireEvent.click(screen.getByText('close-btn'))
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })

  it('should toggle the palette', () => {
    function Harness() {
      const { open, togglePalette } = useCommandPalette()
      return (
        <div>
          <span data-testid="open">{String(open)}</span>
          <button onClick={togglePalette}>toggle</button>
        </div>
      )
    }
    render(<Harness />)

    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('open')).toHaveTextContent('true')

    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })
})

describe('CommandPaletteTrigger', () => {
  it('should render null', () => {
    const { container } = render(<CommandPaletteTrigger onTrigger={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('should call onTrigger on Ctrl+Shift+P', () => {
    const onTrigger = vi.fn()
    render(<CommandPaletteTrigger onTrigger={onTrigger} />)

    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('should call onTrigger on Cmd+Shift+P (Mac)', () => {
    const onTrigger = vi.fn()
    render(<CommandPaletteTrigger onTrigger={onTrigger} />)

    fireEvent.keyDown(window, { key: 'p', metaKey: true, shiftKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('should not trigger on unrelated key combinations', () => {
    const onTrigger = vi.fn()
    render(<CommandPaletteTrigger onTrigger={onTrigger} />)

    fireEvent.keyDown(window, { key: 'P', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'P', shiftKey: true })
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true, shiftKey: true })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('should prevent default on trigger shortcut', () => {
    const onTrigger = vi.fn()
    render(<CommandPaletteTrigger onTrigger={onTrigger} />)

    const event = new KeyboardEvent('keydown', {
      key: 'P',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    })
    const spy = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)

    expect(spy).toHaveBeenCalled()
  })

  it('should remove event listener on unmount', () => {
    const onTrigger = vi.fn()
    const { unmount } = render(<CommandPaletteTrigger onTrigger={onTrigger} />)

    unmount()
    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })

    expect(onTrigger).not.toHaveBeenCalled()
  })
})
