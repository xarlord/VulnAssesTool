import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import CPEMatchDialog, { type AmbiguousComponent, type CPEMatchResult } from './CPEMatchDialog'

// Helper to create mock CPE match result
function createMockCPEResult(overrides: Partial<CPEMatchResult> = {}): CPEMatchResult {
  return {
    cpe: 'cpe:2.3:a:vendor:product:1.0.0:*:*:*:*:*:*:*',
    vendor: 'vendor',
    product: 'product',
    version: '1.0.0',
    confidence: 85,
    matchType: 'exact',
    ...overrides,
  }
}

// Helper to create mock ambiguous component
function createMockComponent(overrides: Partial<AmbiguousComponent> = {}): AmbiguousComponent {
  return {
    id: 'comp-1',
    name: 'Test Component',
    version: '1.0.0',
    suggestedCPEs: [createMockCPEResult()],
    ...overrides,
  }
}

describe('CPEMatchDialog', () => {
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnClose.mockReset()
    mockOnConfirm.mockReset()
  })

  const renderDialog = (open: boolean = true, components: AmbiguousComponent[] = []) => {
    return render(
      <CPEMatchDialog open={open} onClose={mockOnClose} onConfirm={mockOnConfirm} ambiguousComponents={components} />,
    )
  }

  describe('Rendering', () => {
    it('should not render dialog when open is false', () => {
      renderDialog(false)

      expect(screen.queryByTestId('cpe-match-dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('CPE Estimation Required')).not.toBeInTheDocument()
    })

    it('should render dialog when open is true', () => {
      renderDialog(true, [createMockComponent()])

      expect(screen.getByTestId('cpe-match-dialog')).toBeInTheDocument()
      expect(screen.getByText('CPE Estimation Required')).toBeInTheDocument()
    })

    it('should render description text', () => {
      renderDialog(true, [createMockComponent()])

      expect(screen.getByText(/The following components need CPE confirmation/)).toBeInTheDocument()
    })

    it('should render close button', () => {
      renderDialog(true, [createMockComponent()])

      expect(screen.getByTestId('cpe-dialog-close')).toBeInTheDocument()
      expect(screen.getByLabelText('Close dialog')).toBeInTheDocument()
    })

    it('should render footer buttons', () => {
      renderDialog(true, [createMockComponent()])

      expect(screen.getByTestId('accept-all-high-confidence')).toBeInTheDocument()
      expect(screen.getByTestId('skip-cpes')).toBeInTheDocument()
      expect(screen.getByTestId('confirm-selections')).toBeInTheDocument()
    })

    it('should render table headers', () => {
      renderDialog(true, [createMockComponent()])

      expect(screen.getByText('Component Name')).toBeInTheDocument()
      expect(screen.getByText('Version')).toBeInTheDocument()
      expect(screen.getByText('Suggested CPE')).toBeInTheDocument()
      expect(screen.getByText('Confidence')).toBeInTheDocument()
    })

    it('should show empty state when no components provided', () => {
      renderDialog(true, [])

      expect(screen.getByText('No components require CPE estimation')).toBeInTheDocument()
      expect(screen.getByText(/All components already have CPE values assigned/)).toBeInTheDocument()
    })
  })

  describe('Single CPE Display', () => {
    it('should display component with single CPE suggestion', () => {
      const component = createMockComponent({
        name: 'OpenSSL',
        version: '1.1.1',
        suggestedCPEs: [
          createMockCPEResult({
            cpe: 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*',
            vendor: 'openssl',
            product: 'openssl',
            confidence: 95,
            matchType: 'exact',
          }),
        ],
      })

      renderDialog(true, [component])

      expect(screen.getByText('OpenSSL')).toBeInTheDocument()
      expect(screen.getByText('1.1.1')).toBeInTheDocument()
      expect(screen.getByText('openssl / openssl')).toBeInTheDocument()
      expect(screen.getByText('95%')).toBeInTheDocument()
    })

    it('should show checkmark for single CPE (auto-selected)', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult()],
      })

      renderDialog(true, [component])

      // Check for the checkmark icon (it's rendered as an SVG)
      const checkIcon = document.querySelector('.text-green-500')
      expect(checkIcon).toBeInTheDocument()
    })

    it('should show match type label', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ matchType: 'exact' })],
      })

      renderDialog(true, [component])

      expect(screen.getByText('Exact Match')).toBeInTheDocument()
    })
  })

  describe('Multiple CPE Selection', () => {
    it('should display radio buttons for components with multiple CPE suggestions', () => {
      const component = createMockComponent({
        name: 'libxml2',
        version: '2.9.10',
        suggestedCPEs: [
          createMockCPEResult({
            cpe: 'cpe:2.3:a:xmlsoft:libxml2:2.9.10:*:*:*:*:*:*:*',
            vendor: 'xmlsoft',
            product: 'libxml2',
            confidence: 90,
            matchType: 'exact',
          }),
          createMockCPEResult({
            cpe: 'cpe:2.3:a:gnome:libxml2:2.9.10:*:*:*:*:*:*:*',
            vendor: 'gnome',
            product: 'libxml2',
            confidence: 75,
            matchType: 'token',
          }),
        ],
      })

      renderDialog(true, [component])

      const radioButtons = screen.getAllByRole('radio')
      expect(radioButtons).toHaveLength(2)
    })

    it('should auto-select highest confidence CPE by default', () => {
      const component = createMockComponent({
        suggestedCPEs: [
          createMockCPEResult({
            cpe: 'cpe:2.3:a:vendor1:product:1.0:*:*:*:*:*:*:*',
            confidence: 90,
          }),
          createMockCPEResult({
            cpe: 'cpe:2.3:a:vendor2:product:1.0:*:*:*:*:*:*:*',
            confidence: 70,
          }),
        ],
      })

      renderDialog(true, [component])

      const radioButtons = screen.getAllByRole('radio') as HTMLInputElement[]
      expect(radioButtons[0].checked).toBe(true)
      expect(radioButtons[1].checked).toBe(false)
    })

    it('should allow selecting different CPE option', async () => {
      const component = createMockComponent({
        suggestedCPEs: [
          createMockCPEResult({
            cpe: 'cpe:2.3:a:vendor1:product:1.0:*:*:*:*:*:*:*',
            confidence: 90,
          }),
          createMockCPEResult({
            cpe: 'cpe:2.3:a:vendor2:product:1.0:*:*:*:*:*:*:*',
            confidence: 70,
          }),
        ],
      })

      renderDialog(true, [component])

      const radioButtons = screen.getAllByRole('radio') as HTMLInputElement[]

      // Click the second radio button
      await act(async () => {
        fireEvent.click(radioButtons[1])
      })

      expect(radioButtons[0].checked).toBe(false)
      expect(radioButtons[1].checked).toBe(true)
    })

    it('should use selectedCPE from component if provided', () => {
      const component = createMockComponent({
        selectedCPE: 'cpe:2.3:a:vendor2:product:1.0:*:*:*:*:*:*:*',
        suggestedCPEs: [
          createMockCPEResult({
            cpe: 'cpe:2.3:a:vendor1:product:1.0:*:*:*:*:*:*:*',
            confidence: 90,
          }),
          createMockCPEResult({
            cpe: 'cpe:2.3:a:vendor2:product:1.0:*:*:*:*:*:*:*',
            confidence: 70,
          }),
        ],
      })

      renderDialog(true, [component])

      const radioButtons = screen.getAllByRole('radio') as HTMLInputElement[]
      expect(radioButtons[0].checked).toBe(false)
      expect(radioButtons[1].checked).toBe(true)
    })
  })

  describe('Confidence Color Coding', () => {
    it('should show green badge for high confidence (>80%)', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ confidence: 95 })],
      })

      renderDialog(true, [component])

      const badge = screen.getByText('95%')
      expect(badge.className).toContain('bg-green-500')
    })

    it('should show yellow badge for medium confidence (60-80%)', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ confidence: 70 })],
      })

      renderDialog(true, [component])

      const badge = screen.getByText('70%')
      expect(badge.className).toContain('bg-yellow-500')
    })

    it('should show red badge for low confidence (<60%)', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ confidence: 45 })],
      })

      renderDialog(true, [component])

      const badge = screen.getByText('45%')
      expect(badge.className).toContain('bg-red-500')
    })
  })

  describe('Footer Actions', () => {
    it('should show component count in footer', () => {
      const components = [
        createMockComponent({ id: 'comp-1', name: 'Component 1' }),
        createMockComponent({ id: 'comp-2', name: 'Component 2' }),
      ]

      renderDialog(true, components)

      expect(screen.getByText('2 components require CPE estimation')).toBeInTheDocument()
    })

    it('should show singular form for single component', () => {
      renderDialog(true, [createMockComponent()])

      expect(screen.getByText('1 component requires CPE estimation')).toBeInTheDocument()
    })

    it('should show high confidence count when applicable', () => {
      const components = [
        createMockComponent({
          suggestedCPEs: [createMockCPEResult({ confidence: 95 })],
        }),
        createMockComponent({
          suggestedCPEs: [createMockCPEResult({ confidence: 70 })],
        }),
      ]

      renderDialog(true, components)

      expect(screen.getByText('(1 with high confidence >80%)')).toBeInTheDocument()
    })

    it('should call onConfirm with selections when Confirm is clicked', async () => {
      const components = [createMockComponent()]

      renderDialog(true, components)

      const confirmButton = screen.getByTestId('confirm-selections')
      await act(async () => {
        fireEvent.click(confirmButton)
      })

      expect(mockOnConfirm).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should call onConfirm with empty map when Skip is clicked', async () => {
      renderDialog(true, [createMockComponent()])

      const skipButton = screen.getByTestId('skip-cpes')
      await act(async () => {
        fireEvent.click(skipButton)
      })

      expect(mockOnConfirm).toHaveBeenCalledWith(new Map())
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should accept all high confidence CPEs when button is clicked', async () => {
      const components = [
        createMockComponent({
          id: 'comp-1',
          suggestedCPEs: [
            createMockCPEResult({
              cpe: 'cpe:2.3:a:vendor1:product1:1.0:*:*:*:*:*:*:*',
              confidence: 95,
            }),
            createMockCPEResult({
              cpe: 'cpe:2.3:a:vendor2:product1:1.0:*:*:*:*:*:*:*',
              confidence: 60,
            }),
          ],
        }),
        createMockComponent({
          id: 'comp-2',
          suggestedCPEs: [
            createMockCPEResult({
              cpe: 'cpe:2.3:a:vendor1:product2:1.0:*:*:*:*:*:*:*',
              confidence: 70,
            }),
          ],
        }),
      ]

      renderDialog(true, components)

      const acceptButton = screen.getByTestId('accept-all-high-confidence')
      await act(async () => {
        fireEvent.click(acceptButton)
      })

      // The high confidence CPE should be selected
      // We verify by checking the radio button state
      const radioButtons = screen.getAllByRole('radio') as HTMLInputElement[]
      expect(radioButtons[0].checked).toBe(true) // First CPE of first component (95% confidence)
    })

    it('should disable Confirm button when no selections', () => {
      renderDialog(true, [])

      const confirmButton = screen.getByTestId('confirm-selections')
      expect(confirmButton).toBeDisabled()
    })

    it('should disable Accept All button when no high confidence CPEs', () => {
      const components = [
        createMockComponent({
          suggestedCPEs: [createMockCPEResult({ confidence: 50 })],
        }),
      ]

      renderDialog(true, components)

      const acceptButton = screen.getByTestId('accept-all-high-confidence')
      expect(acceptButton).toBeDisabled()
    })
  })

  describe('Dialog Actions', () => {
    it('should close dialog when close button is clicked', () => {
      renderDialog(true, [createMockComponent()])

      const closeButton = screen.getByTestId('cpe-dialog-close')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close dialog when backdrop is clicked', () => {
      renderDialog(true, [createMockComponent()])

      // Find the backdrop by its aria-hidden attribute
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50')
      expect(backdrop).toBeInTheDocument()

      fireEvent.click(backdrop!)
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Keyboard Accessibility', () => {
    it('should close dialog on Escape key', () => {
      renderDialog(true, [createMockComponent()])

      fireEvent.keyDown(screen.getByTestId('cpe-match-dialog'), {
        key: 'Escape',
      })

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('CPE Truncation', () => {
    it('should truncate long CPE strings', () => {
      const longCPE = 'cpe:2.3:a:very-long-vendor-name:very-long-product-name-with-lots-of-text:1.0.0:*:*:*:*:*:*:*'

      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ cpe: longCPE })],
      })

      renderDialog(true, [component])

      // The truncated version should end with '...'
      const truncatedElement = screen.getByTitle(longCPE)
      expect(truncatedElement.textContent).toContain('...')
    })

    it('should show full CPE on tooltip', () => {
      const longCPE = 'cpe:2.3:a:very-long-vendor-name:very-long-product-name:1.0.0:*:*:*:*:*:*:*'

      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ cpe: longCPE })],
      })

      renderDialog(true, [component])

      const elementWithTitle = screen.getByTitle(longCPE)
      expect(elementWithTitle).toBeInTheDocument()
    })
  })

  describe('Match Type Labels', () => {
    it('should display "Exact Match" for exact matches', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ matchType: 'exact' })],
      })

      renderDialog(true, [component])

      expect(screen.getByText('Exact Match')).toBeInTheDocument()
    })

    it('should display "Token Match" for token matches', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ matchType: 'token' })],
      })

      renderDialog(true, [component])

      expect(screen.getByText('Token Match')).toBeInTheDocument()
    })

    it('should display "Fuzzy Match" for fuzzy matches', () => {
      const component = createMockComponent({
        suggestedCPEs: [createMockCPEResult({ matchType: 'fuzzy' })],
      })

      renderDialog(true, [component])

      expect(screen.getByText('Fuzzy Match')).toBeInTheDocument()
    })
  })

  describe('No CPE Suggestions', () => {
    it('should show message when component has no CPE suggestions', () => {
      const component = createMockComponent({
        name: 'UnknownLib',
        suggestedCPEs: [],
      })

      renderDialog(true, [component])

      expect(screen.getByText('UnknownLib')).toBeInTheDocument()
      expect(screen.getByText('- No CPE suggestions available')).toBeInTheDocument()
    })
  })

  describe('Multiple Components', () => {
    it('should display multiple components', () => {
      const components = [
        createMockComponent({ id: 'comp-1', name: 'OpenSSL' }),
        createMockComponent({ id: 'comp-2', name: 'zlib' }),
        createMockComponent({ id: 'comp-3', name: 'curl' }),
      ]

      renderDialog(true, components)

      expect(screen.getByText('OpenSSL')).toBeInTheDocument()
      expect(screen.getByText('zlib')).toBeInTheDocument()
      expect(screen.getByText('curl')).toBeInTheDocument()
    })

    it('should maintain separate selections for each component', async () => {
      const components = [
        createMockComponent({
          id: 'comp-1',
          name: 'OpenSSL',
          suggestedCPEs: [
            createMockCPEResult({ cpe: 'cpe:2.3:a:openssl:openssl:1.0:*:*:*:*:*:*:*', confidence: 90 }),
            createMockCPEResult({ cpe: 'cpe:2.3:a:openssl-project:openssl:1.0:*:*:*:*:*:*:*', confidence: 80 }),
          ],
        }),
        createMockComponent({
          id: 'comp-2',
          name: 'zlib',
          suggestedCPEs: [createMockCPEResult({ cpe: 'cpe:2.3:a:zlib:zlib:1.0:*:*:*:*:*:*:*', confidence: 95 })],
        }),
      ]

      renderDialog(true, components)

      // Change selection for first component
      const radioButtons = screen.getAllByRole('radio') as HTMLInputElement[]
      await act(async () => {
        fireEvent.click(radioButtons[1]) // Second option of first component
      })

      // Verify first component's second option is selected
      expect(radioButtons[1].checked).toBe(true)

      // Confirm selections
      const confirmButton = screen.getByTestId('confirm-selections')
      await act(async () => {
        fireEvent.click(confirmButton)
      })

      // Check that onConfirm was called with a Map
      expect(mockOnConfirm).toHaveBeenCalled()
      const calledMap = mockOnConfirm.mock.calls[0][0] as Map<string, string>
      expect(calledMap).toBeInstanceOf(Map)
      expect(calledMap.size).toBe(2)
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      renderDialog(true, [createMockComponent()])

      const dialog = screen.getByTestId('cpe-match-dialog')
      expect(dialog).toHaveAttribute('role', 'dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'cpe-dialog-title')
    })

    it('should have accessible radio button labels', () => {
      const component = createMockComponent({
        name: 'TestLib',
        suggestedCPEs: [
          createMockCPEResult({ cpe: 'cpe:2.3:a:vendor1:product:1.0:*:*:*:*:*:*:*' }),
          createMockCPEResult({ cpe: 'cpe:2.3:a:vendor2:product:1.0:*:*:*:*:*:*:*' }),
        ],
      })

      renderDialog(true, [component])

      const radioButtons = screen.getAllByRole('radio')
      expect(radioButtons[0]).toHaveAttribute(
        'aria-label',
        'Select CPE cpe:2.3:a:vendor1:product:1.0:*:*:*:*:*:*:* for TestLib',
      )
      expect(radioButtons[1]).toHaveAttribute(
        'aria-label',
        'Select CPE cpe:2.3:a:vendor2:product:1.0:*:*:*:*:*:*:* for TestLib',
      )
    })
  })
})
