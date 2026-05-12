import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RemediationSteps } from './RemediationSteps'
import type { RemediationAdvice } from '@@/types'

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
})

describe('RemediationSteps', () => {
  const createMockAdvice = (overrides?: Partial<RemediationAdvice>): RemediationAdvice => ({
    priority: 'immediate',
    category: 'upgrade',
    steps: [
      {
        step: 1,
        action: 'Update vulnerable package',
        description: 'Upgrade to the latest patched version',
        command: 'npm update lodash@4.17.21',
      },
      {
        step: 2,
        action: 'Verify update',
        description: 'Check that the update was successful',
      },
    ],
    workarounds: ['Disable affected functionality until patch can be applied'],
    estimatedEffort: 'low',
    ...overrides,
  })

  describe('Rendering', () => {
    it('should render priority badge', () => {
      const advice = createMockAdvice({ priority: 'immediate' })
      const { container } = render(<RemediationSteps advice={advice} />)

      // Check that the container has the priority text
      expect(container.textContent).toContain('immediate')
      expect(container.textContent).toContain('Priority')
    })

    it('should render category', () => {
      const advice = createMockAdvice({ category: 'upgrade' })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('upgrade')).toBeInTheDocument()
    })

    it('should render remediation steps header', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('Remediation Steps')).toBeInTheDocument()
    })

    it('should render all steps', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('Update vulnerable package')).toBeInTheDocument()
      expect(screen.getByText('Verify update')).toBeInTheDocument()
    })

    it('should render step numbers', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('should render step descriptions', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('Upgrade to the latest patched version')).toBeInTheDocument()
      expect(screen.getByText('Check that the update was successful')).toBeInTheDocument()
    })

    it('should render workarounds section when present', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('Temporary Workarounds')).toBeInTheDocument()
      expect(screen.getByText('Disable affected functionality until patch can be applied')).toBeInTheDocument()
    })

    it('should not render workarounds section when not present', () => {
      const advice = createMockAdvice({ workarounds: undefined })
      render(<RemediationSteps advice={advice} />)

      expect(screen.queryByText('Temporary Workarounds')).not.toBeInTheDocument()
    })

    it('should render estimated effort when present', () => {
      const advice = createMockAdvice({ estimatedEffort: 'low' })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('Estimated Effort:')).toBeInTheDocument()
      expect(screen.getByText('low')).toBeInTheDocument()
    })

    it('should not render estimated effort when not present', () => {
      const advice = createMockAdvice({ estimatedEffort: undefined })
      render(<RemediationSteps advice={advice} />)

      expect(screen.queryByText('Estimated Effort:')).not.toBeInTheDocument()
    })
  })

  describe('Command Copy Functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should render command when present', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('npm update lodash@4.17.21')).toBeInTheDocument()
    })

    it('should show copy button in command block', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      // Find the copy button
      const copyButtons = screen.getAllByText('Copy')
      expect(copyButtons.length).toBeGreaterThan(0)
    })

    it('should copy command to clipboard when button clicked', async () => {
      const advice = createMockAdvice()
      const onCopyCommand = vi.fn()
      render(<RemediationSteps advice={advice} onCopyCommand={onCopyCommand} />)

      const copyButtons = screen.getAllByText('Copy')
      fireEvent.click(copyButtons[0])

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('npm update lodash@4.17.21')
      expect(onCopyCommand).toHaveBeenCalledWith('npm update lodash@4.17.21')
    })

    it('should show "Copied!" text after copying', () => {
      const advice = createMockAdvice()
      render(<RemediationSteps advice={advice} />)

      const copyButtons = screen.getAllByText('Copy')
      fireEvent.click(copyButtons[0])

      // The button text should change to "Copied!"
      expect(screen.getAllByText('Copied!').length).toBeGreaterThan(0)
    })
  })

  describe('Priority Variants', () => {
    it('should render immediate priority', () => {
      const advice = createMockAdvice({ priority: 'immediate' })
      const { container } = render(<RemediationSteps advice={advice} />)

      expect(container.textContent).toContain('immediate')
      expect(container.textContent).toContain('Priority')
    })

    it('should render high priority', () => {
      const advice = createMockAdvice({ priority: 'high' })
      const { container } = render(<RemediationSteps advice={advice} />)

      expect(container.textContent).toContain('high')
      expect(container.textContent).toContain('Priority')
    })

    it('should render medium priority', () => {
      const advice = createMockAdvice({ priority: 'medium' })
      const { container } = render(<RemediationSteps advice={advice} />)

      expect(container.textContent).toContain('medium')
      expect(container.textContent).toContain('Priority')
    })

    it('should render low priority', () => {
      const advice = createMockAdvice({ priority: 'low' })
      const { container } = render(<RemediationSteps advice={advice} />)

      expect(container.textContent).toContain('low')
      expect(container.textContent).toContain('Priority')
    })
  })

  describe('Category Variants', () => {
    it('should render upgrade category', () => {
      const advice = createMockAdvice({ category: 'upgrade' })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('upgrade')).toBeInTheDocument()
    })

    it('should render patch category', () => {
      const advice = createMockAdvice({ category: 'patch' })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('patch')).toBeInTheDocument()
    })

    it('should render mitigation category', () => {
      const advice = createMockAdvice({ category: 'mitigation' })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('mitigation')).toBeInTheDocument()
    })

    it('should render monitor category', () => {
      const advice = createMockAdvice({ category: 'monitor' })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('monitor')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle steps without commands', () => {
      const advice = createMockAdvice({
        steps: [
          {
            step: 1,
            action: 'Manual action required',
            description: 'Do something manually',
          },
        ],
      })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('Manual action required')).toBeInTheDocument()
      // No command should be rendered
      expect(screen.queryByText('Copy')).not.toBeInTheDocument()
    })

    it('should handle empty workarounds array', () => {
      const advice = createMockAdvice({ workarounds: [] })
      render(<RemediationSteps advice={advice} />)

      expect(screen.queryByText('Temporary Workarounds')).not.toBeInTheDocument()
    })

    it('should handle step with empty command string', () => {
      const advice = createMockAdvice({
        steps: [
          {
            step: 1,
            action: 'Action with empty command',
            description: 'Description',
            command: '',
          },
        ],
      })
      render(<RemediationSteps advice={advice} />)

      expect(screen.getByText('Action with empty command')).toBeInTheDocument()
      // Empty command should not show copy button
      expect(screen.queryByText('Copy')).not.toBeInTheDocument()
    })
  })
})
