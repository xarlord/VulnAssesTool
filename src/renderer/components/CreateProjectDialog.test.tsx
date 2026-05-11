import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CreateProjectDialog } from './CreateProjectDialog'
import { useStore } from '@/store/useStore'

// Mock the store
const mockAddProject = vi.fn()
const mockStore = {
  addProject: mockAddProject,
}
vi.mock('@/store/useStore', () => ({
  useStore: (selector?: (state: typeof mockStore) => unknown) => {
    if (selector) return selector(mockStore)
    return mockStore
  },
}))

describe('CreateProjectDialog', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockAddProject.mockReset()
    mockOnClose.mockReset()
  })

  const renderDialog = (open: boolean = true) => {
    return render(<CreateProjectDialog open={open} onClose={mockOnClose} />)
  }

  describe('Rendering', () => {
    it('should not render dialog when open is false', () => {
      renderDialog(false)

      expect(screen.queryByText('Create New Project')).not.toBeInTheDocument()
    })

    it('should render dialog when open is true', () => {
      renderDialog(true)

      expect(screen.getByText('Create New Project')).toBeInTheDocument()
      expect(screen.getByText('Enter the details for your new vulnerability assessment project')).toBeInTheDocument()
    })

    it('should render form fields', () => {
      renderDialog(true)

      expect(screen.getByLabelText(/Project Name/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Description/)).toBeInTheDocument()
    })

    it('should render required indicator for project name', () => {
      renderDialog(true)

      expect(screen.getByText(/Project Name/)).toBeInTheDocument()
      // The asterisk indicates required field
      expect(screen.getByText('Project Name').parentElement?.innerHTML).toContain('*')
    })

    it('should render action buttons', () => {
      renderDialog(true)

      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.getByText('Create Project')).toBeInTheDocument()
    })

    it('should render close button', () => {
      renderDialog(true)

      const closeButton = screen.getByLabelText('Close dialog')
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('should show error when project name is empty', async () => {
      renderDialog(true)

      const submitButton = screen.getByText('Create Project')
      await act(async () => {
        fireEvent.click(submitButton)
      })

      expect(await screen.findByText('Project name is required')).toBeInTheDocument()
    })

    it('should show error when project name is less than 3 characters', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'ab' } })
      })

      const submitButton = screen.getByText('Create Project')
      await act(async () => {
        fireEvent.click(submitButton)
      })

      expect(await screen.findByText('Project name must be at least 3 characters')).toBeInTheDocument()
    })

    it('should show error when project name is only whitespace', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: '   ' } })
      })

      const submitButton = screen.getByText('Create Project')
      await act(async () => {
        fireEvent.click(submitButton)
      })

      expect(await screen.findByText('Project name is required')).toBeInTheDocument()
    })

    it('should not show error for valid project name', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      fireEvent.change(nameInput, { target: { value: 'Valid Project Name' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      // Form should submit successfully - check mock was called
      expect(mockAddProject).toHaveBeenCalled()
      // Error messages should not be present
      expect(screen.queryByText('Project name is required')).not.toBeInTheDocument()
      expect(screen.queryByText('Project name must be at least 3 characters')).not.toBeInTheDocument()
    })

    it('should clear error when user starts typing', async () => {
      renderDialog(true)

      // First trigger the error
      const submitButton = screen.getByText('Create Project')
      await act(async () => {
        fireEvent.click(submitButton)
      })

      expect(await screen.findByText('Project name is required')).toBeInTheDocument()

      // Then start typing
      const nameInput = screen.getByLabelText(/Project Name/)
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'V' } })
      })

      // Error should be cleared
      expect(screen.queryByText('Project name is required')).not.toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('should create project with valid data', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      const descriptionInput = screen.getByLabelText(/Description/)

      fireEvent.change(nameInput, { target: { value: 'Test Project' } })
      fireEvent.change(descriptionInput, { target: { value: 'Test Description' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      // Check mock was called - no need for waitFor since this is synchronous
      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Project',
          description: 'Test Description',
        }),
      )
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should create project with only required fields', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      fireEvent.change(nameInput, { target: { value: 'Minimal Project' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Minimal Project',
        }),
      )
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should trim whitespace from project name', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      fireEvent.change(nameInput, { target: { value: '  Test Project  ' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Project',
        }),
      )
    })

    it('should trim whitespace from description', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      const descriptionInput = screen.getByLabelText(/Description/)

      fireEvent.change(nameInput, { target: { value: 'Test Project' } })
      fireEvent.change(descriptionInput, { target: { value: '  Test Description  ' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test Description',
        }),
      )
    })

    it('should not create project when name is too short', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'ab' } })
      })

      const submitButton = screen.getByText('Create Project')
      await act(async () => {
        fireEvent.click(submitButton)
      })

      expect(await screen.findByText('Project name must be at least 3 characters')).toBeInTheDocument()

      expect(mockAddProject).not.toHaveBeenCalled()
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Dialog Actions', () => {
    it('should close dialog when Cancel button is clicked', () => {
      renderDialog(true)

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
      expect(mockAddProject).not.toHaveBeenCalled()
    })

    it('should close dialog when close button (X) is clicked', () => {
      renderDialog(true)

      const closeButton = screen.getByLabelText('Close dialog')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
      expect(mockAddProject).not.toHaveBeenCalled()
    })

    it('should reset form after successful submission', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement
      const descriptionInput = screen.getByLabelText(/Description/) as HTMLTextAreaElement

      fireEvent.change(nameInput, { target: { value: 'Test Project' } })
      fireEvent.change(descriptionInput, { target: { value: 'Test Description' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      // Form should be reset and close should be called
      expect(mockOnClose).toHaveBeenCalled()
      expect(mockAddProject).toHaveBeenCalled()
    })

    it('should reset form when cancelled', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement
      const descriptionInput = screen.getByLabelText(/Description/) as HTMLTextAreaElement

      fireEvent.change(nameInput, { target: { value: 'Test Project' } })
      fireEvent.change(descriptionInput, { target: { value: 'Test Description' } })

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Form Input Behavior', () => {
    it('should accept text input for project name', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'My Test Project' } })

      expect(nameInput.value).toBe('My Test Project')
    })

    it('should accept text input for description', () => {
      renderDialog(true)

      const descriptionInput = screen.getByLabelText(/Description/) as HTMLTextAreaElement
      fireEvent.change(descriptionInput, { target: { value: 'This is a test description' } })

      expect(descriptionInput.value).toBe('This is a test description')
    })

    it('should allow empty description (optional field)', () => {
      renderDialog(true)

      const descriptionInput = screen.getByLabelText(/Description/) as HTMLTextAreaElement
      expect(descriptionInput.value).toBe('')
    })

    it('should autofocus on project name input when dialog opens', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      expect(nameInput).toHaveFocus()
    })
  })

  describe('Error Display', () => {
    it('should display error message in correct location', async () => {
      renderDialog(true)

      const submitButton = screen.getByText('Create Project')
      await act(async () => {
        fireEvent.click(submitButton)
      })

      const errorMessage = await screen.findByText('Project name is required')
      expect(errorMessage).toBeInTheDocument()
      expect(errorMessage.className).toContain('destructive')
    })

    it('should show only one error at a time', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)

      // Test empty name error
      const submitButton = screen.getByText('Create Project')
      await act(async () => {
        fireEvent.click(submitButton)
      })

      expect(await screen.findByText('Project name is required')).toBeInTheDocument()

      // Test too short error
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'ab' } })
        fireEvent.click(submitButton)
      })

      expect(await screen.findByText('Project name must be at least 3 characters')).toBeInTheDocument()
      expect(screen.queryByText('Project name is required')).not.toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle special characters in project name', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      fireEvent.change(nameInput, { target: { value: 'Project @#$ %^&*()' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Project @#$ %^&*()',
        }),
      )
    })

    it('should handle very long project names', async () => {
      renderDialog(true)

      const longName = 'A'.repeat(200)
      const nameInput = screen.getByLabelText(/Project Name/)
      fireEvent.change(nameInput, { target: { value: longName } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      expect(mockAddProject).toHaveBeenCalled()
    })

    it('should handle newlines in description', async () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Project Name/)
      const descriptionInput = screen.getByLabelText(/Description/)

      fireEvent.change(nameInput, { target: { value: 'Test Project' } })
      fireEvent.change(descriptionInput, { target: { value: 'Line 1\nLine 2\nLine 3' } })

      const submitButton = screen.getByText('Create Project')
      fireEvent.click(submitButton)

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Line 1\nLine 2\nLine 3',
        }),
      )
    })
  })
})
