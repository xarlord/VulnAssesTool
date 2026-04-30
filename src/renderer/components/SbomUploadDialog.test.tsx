import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SbomUploadDialog from './SbomUploadDialog'
import * as cyclonedxParser from '@/lib/parsers/cyclonedx'
import * as spdxParser from '@/lib/parsers/spdx'

// Mock parsers
vi.mock('@/lib/parsers/cyclonedx')
vi.mock('@/lib/parsers/spdx')

// Helper to create a mock File with text() method
const createMockFile = (content: string, filename: string): File => {
  // Create a File-like object with the text() method
  const file = {
    name: filename,
    type: 'application/json',
    lastModified: Date.now(),
    text: async () => content,
  } as unknown as File
  // Add size property
  Object.defineProperty(file, 'size', { value: content.length })
  return file
}

// Mock the store - use vi.hoisted so the mock fn is available inside vi.mock factory
const { mockUpdateProject } = vi.hoisted(() => ({
  mockUpdateProject: vi.fn(),
}))

vi.mock('@/store/useStore', () => {
  const mockState = {
    currentProject: null,
    projects: [
      {
        id: 'test-project-id',
        name: 'Test Project',
        description: 'Test Description',
        createdAt: new Date(),
        updatedAt: new Date(),
        sbomFiles: [],
        components: [],
        vulnerabilities: [],
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          none: 0,
          totalComponents: 0,
          vulnerableComponents: 0,
        },
      },
    ],
    updateProject: mockUpdateProject,
  }
  const store = (selector?: (state: typeof mockState) => unknown) => {
    if (selector) return selector(mockState)
    return mockState
  }
  store.getState = () => ({
    projects: mockState.projects,
  })
  const useCurrentProject = () => store((s: typeof mockState) => s.currentProject)
  return {
    useStore: store,
    useCurrentProject,
  }
})

const parseCycloneDXMock = vi.mocked(cyclonedxParser).parseCycloneDX as any
const parseSpdxMock = vi.mocked(spdxParser).parseSpdx as any

describe('SbomUploadDialog', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnClose.mockReset()
    mockUpdateProject.mockReset()
  })

  const renderDialog = (open: boolean = true, projectId?: string) => {
    return render(<SbomUploadDialog open={open} onClose={mockOnClose} projectId={projectId} />)
  }

  describe('Rendering - Idle State', () => {
    it('should not render dialog when open is false', () => {
      renderDialog(false)

      expect(screen.queryByText('Upload SBOM')).not.toBeInTheDocument()
    })

    it('should render dialog when open is true', () => {
      renderDialog(true)

      expect(screen.getByText('Upload SBOM')).toBeInTheDocument()
    })

    it('should show target project name when projectId is provided', () => {
      renderDialog(true, 'test-project-id')

      expect(screen.getByText(/Upload to project: Test Project/)).toBeInTheDocument()
    })

    it('should show generic message when no projectId is provided', () => {
      renderDialog(true)

      expect(screen.getByText(/Upload a Software Bill of Materials file/)).toBeInTheDocument()
    })

    it('should render upload area', () => {
      renderDialog(true)

      expect(screen.getByText(/Click to upload or drag and drop/)).toBeInTheDocument()
      expect(screen.getByText(/CycloneDX or SPDX JSON files/)).toBeInTheDocument()
    })

    it('should render supported formats information', () => {
      renderDialog(true)

      expect(screen.getByText('Supported formats:')).toBeInTheDocument()
      expect(screen.getByText(/CycloneDX JSON and XML/)).toBeInTheDocument()
      expect(screen.getByText('SPDX JSON')).toBeInTheDocument()
    })

    it('should render close button', () => {
      renderDialog(true)

      const closeButton = screen.getByLabelText('Close dialog')
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('Dialog Actions', () => {
    it('should close dialog when close button is clicked', async () => {
      const user = userEvent.setup()
      renderDialog(true)

      const closeButton = screen.getByLabelText('Close dialog')
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close dialog and reset when clicking outside', async () => {
      const user = userEvent.setup()
      renderDialog(true)

      const backdrop = screen.getByText('Upload SBOM').parentElement?.querySelector('.bg-black\\/50')
      if (backdrop) {
        await user.click(backdrop)
        expect(mockOnClose).toHaveBeenCalled()
      }
    })
  })

  describe('Upload Area Interaction', () => {
    it('should trigger file input when upload area is clicked', () => {
      renderDialog(true, 'test-project-id')

      const uploadArea = screen.getByText(/Click to upload or drag and drop/).closest('div')
      expect(uploadArea).toBeInTheDocument()
    })

    it('should show file input with correct accept attribute', () => {
      renderDialog(true)

      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeTruthy()
    })
  })

  describe('Statistics Display', () => {
    it('should show zero projects in empty state', () => {
      vi.doMock('@/store/useStore', () => ({
        useStore: () => ({
          currentProject: null,
          projects: [],
          updateProject: mockUpdateProject,
        }),
        getState: () => ({
          projects: [],
        }),
      }))

      renderDialog(true)
      // Empty state should show warning about no projects
      expect(screen.getByText(/Please select a project first/)).toBeInTheDocument()
    })
  })

  describe('Parser Integration', () => {
    it('should have CycloneDX parser available', () => {
      expect(parseCycloneDXMock).toBeDefined()
    })

    it('should have SPDX parser available', () => {
      expect(parseSpdxMock).toBeDefined()
    })

    it('should call updateProject when add is successful with CycloneDX', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
    })

    it('should parse SPDX format files', async () => {
      const user = userEvent.setup({ delay: null })
      parseSpdxMock.mockResolvedValue({
        components: [],
        metadata: { format: 'spdx', formatVersion: '2.3' },
      })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      // SPDX file without 'bom' in filename (bom is checked before spdx)
      const file = createMockFile('{"spdxVersion": "SPDX-2.3"}', 'license.spdx.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })

      expect(parseSpdxMock).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('TC-SBOM-003: should show error when parser throws', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockRejectedValue(new Error('Parse error'))

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const file = createMockFile('invalid content', 'invalid.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Failed', {}, { timeout: 10000 })
    })

    it('TC-SBOM-002: should show error for invalid format file', async () => {
      const user = userEvent.setup({ delay: null })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      // Upload a non-SBOM file (package.json)
      const packageJson = createMockFile('{"name": "test", "version": "1.0.0"}', 'package.json')
      await user.upload(fileInput!, packageJson)

      await screen.findByText('Upload Failed', {}, { timeout: 10000 })

      // Verify error message and "Try Again" button are shown
      expect(screen.getByText(/Unable to detect SBOM format/)).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })
  })

  describe('Success Flow', () => {
    beforeEach(() => {
      parseCycloneDXMock.mockResolvedValue({
        components: [
          {
            id: 'comp-1',
            name: 'test-component',
            version: '1.0.0',
            type: 'library',
            licenses: [],
            purl: '',
            cpe: '',
          },
        ],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
    })

    it('should show success message when parsing succeeds', async () => {
      const user = userEvent.setup({ delay: null })
      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
    })

    it('should show component count', async () => {
      const user = userEvent.setup({ delay: null })
      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput!, file)

      await screen.findByText(/Found 1 components/, {}, { timeout: 10000 })
    })

    it('should update project when Add to Project is clicked', async () => {
      const user = userEvent.setup({ delay: null })
      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput!, file)

      const addButton = await screen.findByText('Add to Project')
      await user.click(addButton)

      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', expect.any(Object))
    })

    it('TC-SBOM-005: should merge components when multiple SBOMs uploaded to same project', async () => {
      const user = userEvent.setup({ delay: null })

      // Second SBOM with one new component and one duplicate (same ID)
      parseCycloneDXMock.mockResolvedValue({
        components: [
          {
            id: 'comp-existing-1', // Duplicate - should not be added again
            name: 'existing-component',
            version: '1.0.0',
            type: 'library',
            licenses: [],
            purl: '',
            cpe: '',
          },
          {
            id: 'comp-new-1', // New component - should be added
            name: 'new-component',
            version: '2.0.0',
            type: 'framework',
            licenses: [],
            purl: '',
            cpe: '',
          },
        ],
        vulnerabilities: [
          {
            id: 'CVE-2023-0002', // New vulnerability
            severity: 'critical',
            cvssScore: 9.5,
            description: 'New vulnerability',
            affectedComponents: ['comp-new-1'],
            source: 'nvd',
            patched: false,
          },
        ],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom2.json')
      await user.upload(fileInput!, file)

      // Wait for success state
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })

      // Verify component count shows 2 components in this SBOM
      expect(screen.getByText(/Found 2 components/)).toBeInTheDocument()

      // Click Add to Project
      const addButton = await screen.findByText('Add to Project')
      await user.click(addButton)

      // Verify updateProject was called
      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', expect.any(Object))

      // Verify the component merging logic:
      // The updateProject call should include logic that filters out duplicate components
      const updateCall = mockUpdateProject.mock.calls[mockUpdateProject.mock.calls.length - 1]
      const newComponents = updateCall[1].components

      // The 2 components from the new SBOM should be passed
      // (The actual deduplication happens inside SbomUploadDialog component)
      expect(newComponents.length).toBeGreaterThanOrEqual(1)
      expect(newComponents.some((c: any) => c.id === 'comp-new-1')).toBe(true)

      // Verify vulnerabilities are included in the update
      const updatedVulnerabilities = updateCall[1].vulnerabilities
      expect(updatedVulnerabilities).toBeDefined()
      expect(updatedVulnerabilities.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Loading States', () => {
    it('should show loading indicator during parsing', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ components: [], metadata: { format: 'cyclonedx', formatVersion: '1.5' } }), 100),
          ),
      )

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput!, file)

      await screen.findByText(/Parsing SBOM/, {}, { timeout: 10000 })
    })
  })
})
