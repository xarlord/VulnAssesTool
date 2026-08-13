import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SbomUploadDialog } from './SbomUploadDialog'
import { useStore } from '@/store/useStore'
import * as cyclonedxParser from '@/lib/parsers/cyclonedx'
import * as spdxParser from '@/lib/parsers/spdx'
import * as cpePipeline from '@/lib/services/cpeEstimationPipeline'
import { sha256Hex } from '@/lib/crypto/sha256'

// Mock parsers
vi.mock('@/lib/parsers/cyclonedx')
vi.mock('@/lib/parsers/spdx')
vi.mock('@/lib/services/cpeEstimationPipeline', () => ({
  estimateCpesForComponents: vi.fn().mockImplementation((components: unknown[]) =>
    Promise.resolve({
      components,
      ambiguousComponents: [],
      reviewableComponents: [],
      summary: { autoSelected: 0, needsConfirmation: 0, noMatchFound: 0 },
    }),
  ),
  createCpeDatabaseSearchFn: vi.fn().mockReturnValue(vi.fn().mockResolvedValue([])),
}))
vi.mock('./CPEMatchDialog', () => ({
  CPEMatchDialog: (props: {
    open?: boolean
    onClose?: () => void
    onConfirm?: (s: Map<string, string>) => void
    ambiguousComponents?: unknown
  }) =>
    props.open ? (
      <div data-testid="cpe-match-dialog">
        {/* Exposes the mapped prop so tests can assert on the matchType derivation
            (real value vs the `?? 'token'` fallback) without reaching into component state. */}
        <pre data-testid="cpe-dialog-props">{JSON.stringify(props.ambiguousComponents)}</pre>
        <button data-testid="cpe-close-btn" onClick={() => props.onClose?.()}>
          Close CPE
        </button>
        <button data-testid="cpe-confirm-btn" onClick={() => props.onConfirm?.(new Map<string, string>())}>
          Confirm CPE
        </button>
        <button
          data-testid="cpe-confirm-with-selection-btn"
          onClick={() => props.onConfirm?.(new Map([['c1', 'cpe:2.3:a:foo:bar:1.0:*:*:*:*:*:*:*']]))}
        >
          Confirm CPE With Selection
        </button>
      </div>
    ) : null,
}))

// Helper to create a mock File with text() method
const createMockFile = (content: string, filename: string, sizeOverride?: number): File => {
  const file = {
    name: filename,
    type: 'application/json',
    lastModified: Date.now(),
    text: async () => content,
  } as unknown as File
  Object.defineProperty(file, 'size', { value: sizeOverride ?? content.length, configurable: true })
  return file
}

// Mock the store - use vi.hoisted so the mock fn is available inside vi.mock factory
const { mockUpdateProject, mockLogSbomUpload } = vi.hoisted(() => ({
  mockUpdateProject: vi.fn(),
  mockLogSbomUpload: vi.fn(),
}))

// M10: the dialog must record an SBOM-upload audit event on import.
vi.mock('@/lib/audit', () => ({
  logSbomUpload: mockLogSbomUpload,
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
const estimateCpesMock = vi.mocked(cpePipeline).estimateCpesForComponents as any

describe('SbomUploadDialog', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnClose.mockReset()
    mockUpdateProject.mockReset()
    // The store mock's project object is a shared module-level closure that
    // clearAllMocks does not reset; tests that seed existing components/sbomFiles
    // must not leak into the next test, so reset the mutable fields here.
    const project = useStore.getState().projects[0]
    project.components = []
    project.vulnerabilities = []
    project.sbomFiles = []
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
      expect(screen.getByText(/CycloneDX or SPDX files/)).toBeInTheDocument()
    })

    it('should render supported formats information', () => {
      renderDialog(true)

      expect(screen.getByText('Supported formats:')).toBeInTheDocument()
      expect(screen.getByText(/CycloneDX \(JSON, XML\)/)).toBeInTheDocument()
      // SPDX must be advertised as tag-value and RDF/XML capable, not JSON-only,
      // now that parseSpdx() accepts those formats (FR-02.2).
      expect(screen.getByText(/SPDX \(JSON, tag-value, RDF\/XML\)/)).toBeInTheDocument()
    })

    it('should render close button', () => {
      renderDialog(true)

      const closeButton = screen.getByRole('button', { name: 'Close' })
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('Dialog Actions', () => {
    it('should close dialog when close button is clicked', async () => {
      const user = userEvent.setup()
      renderDialog(true)

      const closeButton = screen.getByRole('button', { name: 'Close' })
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close dialog when Escape key is pressed', () => {
      renderDialog(true)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalled()
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
      // The accept filter must offer every extension parseSpdx()/parseCycloneDX()
      // branch on, or a user cannot pick a .spdx/.rdf file through the native
      // file-open dialog even though the parser supports it (FR-02.2).
      const accept = fileInput?.getAttribute('accept')
      expect(accept).toContain('.spdx')
      expect(accept).toContain('.tag')
      expect(accept).toContain('.tv')
      expect(accept).toContain('.rdf')
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

      // Seed the project with comp-existing-1 already present (no sbomFileId), so
      // the upload's duplicate of it must be filtered out by the dedup rule.
      useStore.getState().projects[0].components = [
        {
          id: 'comp-existing-1',
          name: 'existing-component',
          version: '1.0.0',
          type: 'library',
          licenses: [],
          purl: '',
          cpe: '',
        },
      ]

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
      const mergedComponents = updateCall[1].components

      // Newly imported components are tagged with an sbomFileId; the seeded
      // pre-existing one is not. Exactly comp-new-1 should be newly added —
      // comp-existing-1 must be dropped by dedup, not re-added. This assertion
      // fails if the dedup filter is removed (comp-existing-1 would appear twice).
      const addedComponents = mergedComponents.filter((c: any) => c.sbomFileId)
      expect(addedComponents).toHaveLength(1)
      expect(addedComponents[0].id).toBe('comp-new-1')
      expect(addedComponents.some((c: any) => c.id === 'comp-existing-1')).toBe(false)
      // The pre-existing component survives exactly once (not duplicated).
      expect(mergedComponents.filter((c: any) => c.id === 'comp-existing-1')).toHaveLength(1)

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

  describe('File Validation', () => {
    it('should reject files exceeding 50MB limit', async () => {
      const user = userEvent.setup({ delay: null })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const largeFile = createMockFile('{"bomFormat": "CycloneDX"}', 'large-bom.json', 60 * 1024 * 1024)
      await user.upload(fileInput!, largeFile)

      await screen.findByText('Upload Failed', {}, { timeout: 10000 })
      expect(screen.getByText(/exceeds maximum allowed size/)).toBeInTheDocument()
    })

    it('should reject empty files', async () => {
      const user = userEvent.setup({ delay: null })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()

      const emptyFile = createMockFile('', 'empty.json')
      Object.defineProperty(emptyFile, 'size', { value: 0 })
      await user.upload(fileInput!, emptyFile)

      await screen.findByText('Upload Failed', {}, { timeout: 10000 })
      expect(screen.getByText(/empty/)).toBeInTheDocument()
    })

    it('should detect CycloneDX format from filename with "bom"', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseCycloneDXMock).toHaveBeenCalled()
    })

    it('should detect SPDX format from filename', async () => {
      const user = userEvent.setup({ delay: null })
      parseSpdxMock.mockResolvedValue({
        components: [],
        metadata: { format: 'spdx', formatVersion: '2.3' },
      })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"spdxVersion": "SPDX-2.3"}', 'license.spdx.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseSpdxMock).toHaveBeenCalled()
    })

    it('should detect format from JSON content when filename is ambiguous', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX", "specVersion": "1.5"}', 'report.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseCycloneDXMock).toHaveBeenCalled()
    })

    it('should detect SPDX from content when filename is ambiguous', async () => {
      const user = userEvent.setup({ delay: null })
      parseSpdxMock.mockResolvedValue({
        components: [],
        metadata: { format: 'spdx', formatVersion: '2.3' },
      })

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"spdxVersion": "SPDX-2.3", "SPDXID": "SPDXRef-Document"}', 'data.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseSpdxMock).toHaveBeenCalled()
    })
  })

  describe('Retry Flow', () => {
    it('should reset state and return to idle when Try Again is clicked', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockRejectedValue(new Error('Parse error'))

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('invalid content', 'invalid.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Failed', {}, { timeout: 10000 })

      const tryAgainButton = screen.getByText('Try Again')
      await user.click(tryAgainButton)

      expect(screen.getByText(/Click to upload or drag and drop/)).toBeInTheDocument()
    })
  })

  describe('Confirm Flow', () => {
    it('should not add duplicate components to project', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [
          {
            id: 'comp-1',
            name: 'existing-component',
            version: '1.0.0',
            type: 'library',
            licenses: [],
            purl: '',
            cpe: '',
          },
        ],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })

      // Project already contains comp-1; uploading the same id must not add a
      // second copy. WHY: re-uploading an overlapping SBOM is a routine action,
      // and a broken dedup would silently double-count components and inflate the
      // component total shown on the Overview tab.
      useStore.getState().projects[0].components = [
        {
          id: 'comp-1',
          name: 'existing-component',
          version: '1.0.0',
          type: 'library',
          licenses: [],
          purl: '',
          cpe: '',
        },
      ]

      renderDialog(true, 'test-project-id')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput!, file)

      await screen.findByText('Upload Successful', {}, { timeout: 10000 })

      const addButton = await screen.findByText('Add to Project')
      await user.click(addButton)

      const updateCall = mockUpdateProject.mock.calls[mockUpdateProject.mock.calls.length - 1]
      const mergedComponents = updateCall[1].components
      // comp-1 must appear exactly once — the uploaded duplicate is filtered out.
      expect(mergedComponents.filter((c: any) => c.id === 'comp-1')).toHaveLength(1)
    })
  })

  describe('SBOM file formatVersion labeling (FR-02.3)', () => {
    async function uploadAndConfirm(filename: string, content: string) {
      const user = userEvent.setup({ delay: null })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput!, createMockFile(content, filename))
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      const addButton = await screen.findByText('Add to Project')
      await user.click(addButton)
      const updateCall = mockUpdateProject.mock.calls[mockUpdateProject.mock.calls.length - 1]
      const sbomFiles = updateCall[1].sbomFiles
      return sbomFiles[sbomFiles.length - 1]
    }

    it('records the real parsed CycloneDX spec version, not a hardcoded 1.5', async () => {
      // A CycloneDX 1.2 file must be labeled 1.2 in the stored SbomFile metadata.
      // WHY: the stored formatVersion is what the UI and reports show as the SBOM's
      // spec version; hardcoding 1.5 misrepresents every non-1.5 CycloneDX file.
      parseCycloneDXMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'x', version: '1', type: 'library', licenses: [], purl: '', cpe: '' }],
        vulnerabilities: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.2' },
      })

      const sbomFile = await uploadAndConfirm('bom.json', '{"bomFormat": "CycloneDX"}')
      expect(sbomFile.formatVersion).toBe('1.2')
    })

    it('records the real parsed SPDX spec version, not a hardcoded 2.3', async () => {
      parseSpdxMock.mockResolvedValue({
        components: [{ id: 's1', name: 'y', version: '1', type: 'library', licenses: [], purl: '', cpe: '' }],
        vulnerabilities: [],
        metadata: { format: 'spdx', formatVersion: '2.2' },
      })

      const sbomFile = await uploadAndConfirm('data.json', '{"spdxVersion": "SPDX-2.2", "SPDXID": "SPDXRef-Document"}')
      expect(sbomFile.formatVersion).toBe('2.2')
    })
  })

  describe('SBOM fileHash + audit wiring (H5/M2/M10)', () => {
    beforeEach(() => {
      parseCycloneDXMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'x', version: '1', type: 'library', licenses: [], purl: '', cpe: '' }],
        vulnerabilities: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
    })

    async function uploadAndConfirm(content: string, filename = 'bom.json') {
      const user = userEvent.setup({ delay: null })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, createMockFile(content, filename))
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      await user.click(await screen.findByText('Add to Project'))
      const call = mockUpdateProject.mock.calls[mockUpdateProject.mock.calls.length - 1]
      const sbomFiles = call[1].sbomFiles
      return sbomFiles[sbomFiles.length - 1]
    }

    it('stores the SHA-256 of the file content as fileHash, not a random value', async () => {
      // WHY: the old code set fileHash to `${Date.now()}-${Math.random()}`, which is
      // neither a hash nor reproducible — two uploads of the same bytes got different
      // "hashes". A content hash must be the real SHA-256 hex of the file content.
      const content = '{"bomFormat": "CycloneDX", "marker": "abc"}'
      const sbomFile = await uploadAndConfirm(content)

      expect(sbomFile.fileHash).toMatch(/^[0-9a-f]{64}$/)
      expect(sbomFile.fileHash).toBe(await sha256Hex(content))
    })

    it('records an SBOM-upload audit event mirroring the stored SBOM file', async () => {
      // WHY: the audit trail must reflect the actual persisted upload — same filename,
      // format and component count as the SbomFile written to the project. Previously
      // logSbomUpload was implemented but never called, so uploads left no audit record.
      const sbomFile = await uploadAndConfirm('{"bomFormat": "CycloneDX"}', 'my-bom.json')

      expect(mockLogSbomUpload).toHaveBeenCalledWith(
        'test-project-id',
        'Test Project',
        sbomFile.filename,
        sbomFile.format,
        sbomFile.componentCount,
      )
    })
  })

  describe('Upload Area Keyboard', () => {
    it('should trigger file input on Enter key', () => {
      renderDialog(true, 'test-project-id')
      const uploadArea = screen.getByRole('button', { name: 'Upload SBOM file' })
      fireEvent.keyDown(uploadArea, { key: 'Enter' })
      expect(document.querySelector('input[type="file"]')).toBeTruthy()
    })

    it('should trigger file input on Space key', () => {
      renderDialog(true, 'test-project-id')
      const uploadArea = screen.getByRole('button', { name: 'Upload SBOM file' })
      fireEvent.keyDown(uploadArea, { key: ' ' })
      expect(document.querySelector('input[type="file"]')).toBeTruthy()
    })

    it('should not trigger file input when no project is selected', () => {
      renderDialog(true)
      const uploadArea = screen.getByRole('button', { name: 'Upload SBOM file' })
      fireEvent.keyDown(uploadArea, { key: 'Enter' })
      expect(document.querySelector('input[type="file"]')).toBeTruthy()
    })
  })

  describe('CPE Estimation Stats', () => {
    it('should display CPE estimation stats when present', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        ambiguousComponents: [],
        reviewableComponents: [],
        summary: { autoSelected: 5, needsConfirmation: 2, noMatchFound: 1 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('CPE Estimation Results', {}, { timeout: 10000 })
      expect(screen.getByText('Auto-selected')).toBeInTheDocument()
      expect(screen.getByText('Need confirmation')).toBeInTheDocument()
      expect(screen.getByText('No match found')).toBeInTheDocument()
    })
  })

  describe('Component Preview Overflow', () => {
    it('should show overflow count when more than 5 components', async () => {
      const user = userEvent.setup({ delay: null })
      const components = Array.from({ length: 8 }, (_, i) => ({
        id: `comp-${i}`,
        name: `component-${i}`,
        version: `${i}.0.0`,
        type: 'library',
        licenses: [],
        purl: '',
        cpe: '',
      }))
      parseCycloneDXMock.mockResolvedValue({
        components,
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components,
        ambiguousComponents: [],
        reviewableComponents: [],
        summary: { autoSelected: 0, needsConfirmation: 0, noMatchFound: 0 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 15000 })
      expect(screen.getByText(/and 3 more/)).toBeInTheDocument()
    })
  })

  describe('Upload Different File', () => {
    it('should return to idle when Upload Different File is clicked', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      await user.click(screen.getByText('Upload Different File'))
      expect(screen.getByText(/Click to upload or drag and drop/)).toBeInTheDocument()
    })
  })

  describe('Non-Error Rejection', () => {
    it('should show generic error for non-Error thrown', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockRejectedValue('string error')
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Failed', {}, { timeout: 10000 })
      expect(screen.getByText('Failed to parse SBOM file')).toBeInTheDocument()
    })
  })

  describe('CPE Match Dialog Interactions', () => {
    it('should close CPE match dialog via onClose callback', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components: [],
        ambiguousComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              {
                cpe: 'cpe:2.3:a:*:comp:*',
                vendor: '*',
                product: 'comp',
                confidence: 'medium',
                matchScore: 50,
              },
            ],
            needsUserConfirmation: true,
          },
        ],
        reviewableComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              {
                cpe: 'cpe:2.3:a:*:comp:*',
                vendor: '*',
                product: 'comp',
                confidence: 'medium',
                matchScore: 50,
              },
            ],
            needsUserConfirmation: true,
          },
        ],
        summary: { autoSelected: 0, needsConfirmation: 1, noMatchFound: 0 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(screen.getByTestId('cpe-match-dialog')).toBeInTheDocument()
      // fireEvent (not userEvent) — userEvent's pointer-events check trips on the
      // mocked CPEMatchDialog, which isn't rendered through a real Radix portal.
      fireEvent.click(screen.getByTestId('cpe-close-btn'))
      expect(screen.queryByTestId('cpe-match-dialog')).not.toBeInTheDocument()
    })

    it('should apply CPE selections on confirm', async () => {
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components: [],
        ambiguousComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              {
                cpe: 'cpe:2.3:a:*:comp:*',
                vendor: '*',
                product: 'comp',
                confidence: 'medium',
                matchScore: 50,
              },
            ],
            needsUserConfirmation: true,
          },
        ],
        reviewableComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              {
                cpe: 'cpe:2.3:a:*:comp:*',
                vendor: '*',
                product: 'comp',
                confidence: 'medium',
                matchScore: 50,
              },
            ],
            needsUserConfirmation: true,
          },
        ],
        summary: { autoSelected: 0, needsConfirmation: 1, noMatchFound: 0 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      // fireEvent (not userEvent) — see note above.
      fireEvent.click(screen.getByTestId('cpe-confirm-btn'))
      expect(screen.queryByTestId('cpe-match-dialog')).not.toBeInTheDocument()
    })

    it('applies a real user CPE selection to the matching component instead of leaving it unchanged', async () => {
      // WHY: handleCpeConfirm's `if (selectedCPE)` branch is the whole point of the CPE
      // match dialog — if a real selection were silently dropped (only the "no selection"
      // else-branch worked), users could never correct an ambiguous/no-match CPE guess.
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        ambiguousComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              { cpe: 'cpe:2.3:a:*:comp:*', vendor: '*', product: 'comp', confidence: 'medium', matchScore: 50 },
            ],
            needsUserConfirmation: true,
          },
        ],
        reviewableComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              { cpe: 'cpe:2.3:a:*:comp:*', vendor: '*', product: 'comp', confidence: 'medium', matchScore: 50 },
            ],
            needsUserConfirmation: true,
          },
        ],
        summary: { autoSelected: 0, needsConfirmation: 1, noMatchFound: 0 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })

      fireEvent.click(screen.getByTestId('cpe-confirm-with-selection-btn'))
      expect(screen.queryByTestId('cpe-match-dialog')).not.toBeInTheDocument()

      // Confirm the applied selection actually reaches the persisted project data.
      const addButton = await screen.findByText('Add to Project')
      await user.click(addButton)
      const updateCall = mockUpdateProject.mock.calls[mockUpdateProject.mock.calls.length - 1]
      const savedComponent = updateCall[1].components.find((c: { id: string }) => c.id === 'c1')
      expect(savedComponent.cpe).toBe('cpe:2.3:a:foo:bar:1.0:*:*:*:*:*:*:*')
      expect(savedComponent.hasMissingCpe).toBe(false)
    })

    it('leaves a component untouched when the user made no selection for it (else-branch of the CPE map lookup)', async () => {
      // WHY: covers the counterpart of the branch above — an empty selections map
      // (user confirmed without picking anything) must not fabricate a cpe value.
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        ambiguousComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              { cpe: 'cpe:2.3:a:*:comp:*', vendor: '*', product: 'comp', confidence: 'medium', matchScore: 50 },
            ],
            needsUserConfirmation: true,
          },
        ],
        reviewableComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              { cpe: 'cpe:2.3:a:*:comp:*', vendor: '*', product: 'comp', confidence: 'medium', matchScore: 50 },
            ],
            needsUserConfirmation: true,
          },
        ],
        summary: { autoSelected: 0, needsConfirmation: 1, noMatchFound: 0 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })

      fireEvent.click(screen.getByTestId('cpe-confirm-btn')) // passes an empty Map

      const addButton = await screen.findByText('Add to Project')
      await user.click(addButton)
      const updateCall = mockUpdateProject.mock.calls[mockUpdateProject.mock.calls.length - 1]
      const savedComponent = updateCall[1].components.find((c: { id: string }) => c.id === 'c1')
      expect(savedComponent.cpe).toBe('')
    })

    it('passes through a real matchType from the estimation service instead of the "before provenance tracking" fallback', async () => {
      // WHY: `matchType: cpe.matchType ?? 'token'` exists to backfill results produced
      // before provenance tracking shipped. If a real matchType ('exact'/'fuzzy') were
      // always overwritten by the fallback, the CPE match dialog would mislabel every
      // exact/fuzzy match as a plain token match, hiding real match-confidence info.
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        ambiguousComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              {
                cpe: 'cpe:2.3:a:*:comp:1.0',
                vendor: '*',
                product: 'comp',
                confidence: 'high',
                matchScore: 90,
                matchType: 'exact',
              },
            ],
            needsUserConfirmation: true,
          },
        ],
        reviewableComponents: [
          {
            componentId: 'c1',
            componentName: 'comp',
            componentVersion: '1.0',
            estimatedCPEs: [
              {
                cpe: 'cpe:2.3:a:*:comp:1.0',
                vendor: '*',
                product: 'comp',
                confidence: 'high',
                matchScore: 90,
                matchType: 'exact',
              },
            ],
            needsUserConfirmation: true,
          },
        ],
        summary: { autoSelected: 0, needsConfirmation: 1, noMatchFound: 0 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })

      const propsJson = screen.getByTestId('cpe-dialog-props').textContent || '[]'
      const parsed = JSON.parse(propsJson) as Array<{ suggestedCPEs: Array<{ matchType: string }> }>
      expect(parsed[0].suggestedCPEs[0].matchType).toBe('exact')
    })
  })

  describe('CPE estimation timeout (raceWithTimeout budget)', () => {
    it('proceeds with the parsed components as-is when CPE estimation exceeds its time budget, so the dialog never hangs on a slow local NVD lookup', async () => {
      // Real fake-timers (vi.useFakeTimers) hang RTL's setTimeout-based async utilities
      // (findBy/waitFor) and, worse, can leak into later tests if the test times out
      // before `useRealTimers` runs. Instead, spy on the global setTimeout and collapse
      // only the 20000ms budget call to 0ms — everything else (microtasks, real awaits)
      // still runs on real timers, so the rest of the component behaves normally.
      const realSetTimeout = global.setTimeout
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation(((
        fn: (...args: unknown[]) => void,
        ms?: number,
        ...args: unknown[]
      ) => {
        const collapsedMs = ms === 20000 ? 0 : ms
        return realSetTimeout(fn, collapsedMs, ...args)
      }) as typeof setTimeout)

      try {
        const user = userEvent.setup({ delay: null })
        parseCycloneDXMock.mockResolvedValue({
          components: [{ id: 'c1', name: 'x', version: '1', type: 'library', licenses: [], purl: '', cpe: '' }],
          metadata: { format: 'cyclonedx', formatVersion: '1.5' },
        })
        // Never resolves — forces raceWithTimeout to settle via the (collapsed) timeout branch.
        estimateCpesMock.mockImplementation(() => new Promise(() => {}))

        renderDialog(true, 'test-project-id')
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
        const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
        await user.upload(fileInput, file)

        await screen.findByText('Upload Successful', {}, { timeout: 10000 })
        expect(screen.getByText(/Found 1 components/)).toBeInTheDocument()
        // No CPE stats block: estimation never produced a summary because it timed out.
        expect(screen.queryByText('CPE Estimation Results')).not.toBeInTheDocument()
      } finally {
        setTimeoutSpy.mockRestore()
        // vi.clearAllMocks() (beforeEach) clears call history but NOT a custom
        // mockImplementation — restore the module's default resolved behavior so
        // it doesn't leak into later tests as a never-resolving promise.
        estimateCpesMock.mockImplementation((components: unknown[]) =>
          Promise.resolve({
            components,
            ambiguousComponents: [],
            reviewableComponents: [],
            summary: { autoSelected: 0, needsConfirmation: 0, noMatchFound: 0 },
          }),
        )
      }
    })
  })

  describe('detectFormat non-JSON (XML/tag-value) content branch', () => {
    it('detects CycloneDX from an XML "<CycloneDX" marker when the content is not JSON', async () => {
      // WHY: covers the catch{} path of detectFormat — content that fails JSON.parse
      // (e.g. real CycloneDX XML) must still be recognized via XML markers, not always
      // fall through to "unknown".
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('<CycloneDXDocument xmlns="x"></CycloneDXDocument>', 'artifact.xml')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseCycloneDXMock).toHaveBeenCalled()
    })

    it('detects SPDX from an XML/RDF "SPDX"/"Document" marker when the content is not JSON', async () => {
      const user = userEvent.setup({ delay: null })
      parseSpdxMock.mockResolvedValue({
        components: [],
        metadata: { format: 'spdx', formatVersion: '2.3' },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      // Deliberately avoids the substring "bom" so it doesn't hit the cyclonedx XML branch.
      const file = createMockFile('<rdf:RDF>SPDX license info</rdf:RDF>', 'license-info.rdf')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseSpdxMock).toHaveBeenCalled()
    })

    it('reports unknown format for non-JSON content with no recognizable XML markers', async () => {
      const user = userEvent.setup({ delay: null })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      // Filename keeps a .json extension (accepted by the file input's `accept` list —
      // userEvent.upload() silently skips files whose extension isn't in that list)
      // even though the content itself is deliberately not valid JSON.
      const file = createMockFile('just some plain unstructured text', 'notes.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Failed', {}, { timeout: 10000 })
      expect(screen.getByText(/Unable to detect SBOM format/)).toBeInTheDocument()
    })
  })

  describe('detectFormat JSON-content secondary conditions (specVersion / SPDXID only)', () => {
    it('detects CycloneDX from specVersion alone when bomFormat is absent', async () => {
      // WHY: `parsed.bomFormat || parsed.specVersion` — this exercises the second
      // operand. A regression that dropped the specVersion check would misdetect any
      // CycloneDX file that omits the (optional) bomFormat field as "unknown".
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.4' },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"specVersion": "1.4", "components": []}', 'inventory.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseCycloneDXMock).toHaveBeenCalled()
    })

    it('detects SPDX from SPDXID alone when spdxVersion is absent', async () => {
      const user = userEvent.setup({ delay: null })
      parseSpdxMock.mockResolvedValue({
        components: [],
        metadata: { format: 'spdx', formatVersion: '2.3' },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"SPDXID": "SPDXRef-Document", "packages": []}', 'inventory2.json')
      await user.upload(fileInput, file)
      await screen.findByText('Upload Successful', {}, { timeout: 10000 })
      expect(parseSpdxMock).toHaveBeenCalled()
    })
  })

  describe('No file selected (input change with an empty file list)', () => {
    it('does nothing and stays on the idle upload prompt when the file list is empty', () => {
      // WHY: `const file = e.target.files?.[0]; if (!file) return` guards against a
      // change event firing with no file (e.g. user cancels the native file picker).
      // Without this guard, the dialog would attempt to validate/parse `undefined`.
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(fileInput, { target: { files: [] } })
      expect(screen.getByText(/Click to upload or drag and drop/)).toBeInTheDocument()
      expect(screen.queryByText('Upload Failed')).not.toBeInTheDocument()
    })
  })

  describe('CPE estimation stats partial display (independent >0 conditions)', () => {
    it('shows only the non-zero stat categories, not empty stat tiles for zero counts', async () => {
      // WHY: the three `stat > 0 && (<div>...)` checks are independent branches — a
      // single all-nonzero test can't prove that a zero count is actually suppressed
      // rather than rendered as an empty/zero tile.
      const user = userEvent.setup({ delay: null })
      parseCycloneDXMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      estimateCpesMock.mockResolvedValue({
        components: [{ id: 'c1', name: 'comp', version: '1.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        ambiguousComponents: [],
        reviewableComponents: [],
        summary: { autoSelected: 3, needsConfirmation: 0, noMatchFound: 0 },
      })
      renderDialog(true, 'test-project-id')
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createMockFile('{"bomFormat": "CycloneDX"}', 'bom.json')
      await user.upload(fileInput, file)
      await screen.findByText('CPE Estimation Results', {}, { timeout: 10000 })
      expect(screen.getByText('Auto-selected')).toBeInTheDocument()
      expect(screen.queryByText('Need confirmation')).not.toBeInTheDocument()
      expect(screen.queryByText('No match found')).not.toBeInTheDocument()
    })
  })
})
