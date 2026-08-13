import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BinarySbomDialog } from './BinarySbomDialog'
import { useStore } from '@/store/useStore'
import { sha256Hex } from '@/lib/crypto/sha256'

// Hoisted mocks referenced inside vi.mock factories.
const {
  mockUpdateProject,
  mockLogSbomUpload,
  mockGenerateFromFile,
  mockGenerateFromPath,
  mockGenerateFromImage,
  mockOnGenerateProgress,
  mockGetPlatform,
  mockParseCycloneDX,
} = vi.hoisted(() => ({
  mockUpdateProject: vi.fn(),
  mockLogSbomUpload: vi.fn(),
  mockGenerateFromFile: vi.fn(),
  mockGenerateFromPath: vi.fn(),
  mockGenerateFromImage: vi.fn(),
  mockOnGenerateProgress: vi.fn(),
  mockGetPlatform: vi.fn(),
  mockParseCycloneDX: vi.fn(),
}))

const CYCLONEDX_JSON = '{"bomFormat":"CycloneDX","specVersion":"1.5","marker":"binary"}'

// getPlatform and parseCycloneDX are mockable per-test (not just a fixed factory) so
// tests can exercise the "platform unavailable", path/image modes, and
// vulnerability/component-count branches without a second vi.mock per scenario.
vi.mock('@/lib/platform', () => ({
  getPlatform: mockGetPlatform,
}))

vi.mock('@/lib/parsers/cyclonedx', () => ({
  parseCycloneDX: mockParseCycloneDX,
}))

vi.mock('@/lib/services/cpeEstimationPipeline', () => ({
  estimateCpesForComponents: vi.fn().mockImplementation((components: unknown[]) => Promise.resolve({ components })),
  createCpeDatabaseSearchFn: vi.fn().mockReturnValue(vi.fn().mockResolvedValue([])),
}))

// M10: importing a generated SBOM must record an audit event.
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
        sbomFiles: [],
        components: [],
        vulnerabilities: [],
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 0,
          vulnerableComponents: 0,
        },
      },
    ],
    updateProject: mockUpdateProject,
  }
  const store = (selector?: (state: typeof mockState) => unknown) => (selector ? selector(mockState) : mockState)
  store.getState = () => ({ projects: mockState.projects })
  return {
    useStore: store,
    useCurrentProject: () => null,
  }
})

const createMockFile = (name: string): File => {
  const file = { name, type: 'application/octet-stream', text: async () => '' } as unknown as File
  Object.defineProperty(file, 'size', { value: 1024, configurable: true })
  return file
}

async function generateAndImport(filename = 'firmware.bin') {
  const user = userEvent.setup({ delay: null })
  render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(fileInput, createMockFile(filename))
  await user.click(screen.getByRole('button', { name: /Generate SBOM/i }))

  await screen.findByText('SBOM Generated', {}, { timeout: 10000 })
  await user.click(await screen.findByText(/Add \d+ Components to Project/))

  const call = mockUpdateProject.mock.calls[mockUpdateProject.mock.calls.length - 1]
  const sbomFiles = call[1].sbomFiles
  return sbomFiles[sbomFiles.length - 1]
}

// Shared by the failure-path tests below: stay on the default (file) mode, pick a
// file so the button is enabled, and submit.
async function selectFileAndGenerate(user: ReturnType<typeof userEvent.setup>, filename = 'firmware.bin') {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(fileInput, createMockFile(filename))
  await user.click(screen.getByRole('button', { name: /Generate SBOM/i }))
}

describe('BinarySbomDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPlatform.mockReturnValue({
      sbom: {
        generateFromFile: mockGenerateFromFile,
        generateFromPath: mockGenerateFromPath,
        generateFromImage: mockGenerateFromImage,
        // Progress subscription returns an unsubscribe cleanup.
        onGenerateProgress: mockOnGenerateProgress,
      },
    })
    mockOnGenerateProgress.mockReturnValue(() => {})
    mockGenerateFromFile.mockResolvedValue({ success: true, cyclonedxJson: CYCLONEDX_JSON })
    mockParseCycloneDX.mockResolvedValue({
      components: [{ id: 'c1', name: 'openssl', version: '3.0.0', type: 'library', licenses: [], purl: '', cpe: '' }],
      vulnerabilities: [],
      metadata: { format: 'cyclonedx', formatVersion: '1.5' },
    })
    const project = useStore.getState().projects[0]
    project.sbomFiles = []
    project.components = []
    project.vulnerabilities = []
  })

  it('stores the SHA-256 of the generated CycloneDX as fileHash, not a random value (H5/M2)', async () => {
    // WHY: the old code set fileHash to `${Date.now()}-${Math.random()}`. A generated
    // SBOM's hash must be the real, reproducible SHA-256 of its CycloneDX content.
    const sbomFile = await generateAndImport()

    expect(sbomFile.fileHash).toMatch(/^[0-9a-f]{64}$/)
    expect(sbomFile.fileHash).toBe(await sha256Hex(CYCLONEDX_JSON))
  })

  it('records an SBOM-upload audit event mirroring the stored SBOM file (M10)', async () => {
    const sbomFile = await generateAndImport('firmware.bin')

    expect(mockLogSbomUpload).toHaveBeenCalledWith(
      'test-project-id',
      'Test Project',
      sbomFile.filename,
      'cyclonedx',
      sbomFile.componentCount,
    )
  })

  describe('Target project resolution', () => {
    it('warns and disables Generate when no project is selected, instead of silently doing nothing', async () => {
      // WHY: with no projectId prop and no currentProject, targetProject is falsy.
      // A user who reaches this dialog without picking a project first must be told
      // why nothing happens, not left with a dead Generate button.
      render(<BinarySbomDialog open onClose={vi.fn()} />)

      expect(screen.getByText(/Please select a project first before generating an SBOM/)).toBeInTheDocument()
      expect(screen.getByText('Generate an SBOM from a compiled artifact or container image')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Generate SBOM/i })).toBeDisabled()
    })

    it('does not import or close if the target project became unresolvable after a successful generation', async () => {
      // WHY: handleImport only re-checks targetProject at click time. If the project
      // was removed (or the dialog is re-parented to a stale id) between a successful
      // generation and the user clicking "Add", importing must be a safe no-op rather
      // than calling updateProject with a project that no longer exists.
      const user = userEvent.setup({ delay: null })
      const onClose = vi.fn()
      const { rerender } = render(<BinarySbomDialog open onClose={onClose} projectId="test-project-id" />)

      await selectFileAndGenerate(user)
      await screen.findByText('SBOM Generated', {}, { timeout: 10000 })

      rerender(<BinarySbomDialog open onClose={onClose} projectId="deleted-project-id" />)

      await user.click(await screen.findByText(/Add \d+ Components to Project/))

      expect(mockUpdateProject).not.toHaveBeenCalled()
      expect(mockLogSbomUpload).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Local path and container image modes', () => {
    it('scans a server-side local path via generateFromPath and labels the result with that path', async () => {
      // WHY: "Local path" mode must call generateFromPath (not generateFromFile) and
      // must not silently upload — it scans in place on the server host.
      const user = userEvent.setup({ delay: null })
      mockGenerateFromPath.mockResolvedValue({ success: true, cyclonedxJson: CYCLONEDX_JSON })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await user.click(screen.getByRole('button', { name: 'Local path' }))
      // No path typed yet — Generate must stay disabled, same guard as file mode.
      expect(screen.getByRole('button', { name: /Generate SBOM/i })).toBeDisabled()

      await user.type(screen.getByRole('textbox'), '/srv/images/firmware-build')
      await user.click(screen.getByRole('button', { name: /Generate SBOM/i }))

      await screen.findByText('SBOM Generated', {}, { timeout: 10000 })
      expect(mockGenerateFromPath).toHaveBeenCalledWith('/srv/images/firmware-build')
      expect(mockGenerateFromFile).not.toHaveBeenCalled()
      expect(screen.getByText(/in \/srv\/images\/firmware-build/)).toBeInTheDocument()
    })

    it('scans a container image reference via generateFromImage and labels the result with that ref', async () => {
      const user = userEvent.setup({ delay: null })
      mockGenerateFromImage.mockResolvedValue({ success: true, cyclonedxJson: CYCLONEDX_JSON })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await user.click(screen.getByRole('button', { name: 'Container image' }))
      expect(screen.getByRole('button', { name: /Generate SBOM/i })).toBeDisabled()

      await user.type(screen.getByRole('textbox'), 'alpine:3.19')
      await user.click(screen.getByRole('button', { name: /Generate SBOM/i }))

      await screen.findByText('SBOM Generated', {}, { timeout: 10000 })
      expect(mockGenerateFromImage).toHaveBeenCalledWith('alpine:3.19')
      expect(screen.getByText(/in alpine:3\.19/)).toBeInTheDocument()
    })
  })

  describe('Generation failure paths', () => {
    it('shows a specific error when the platform has no SBOM generation API', async () => {
      // WHY: on an old/incompatible client build, platform.sbom may be missing
      // entirely. The user needs an actionable message, not a silent hang or crash.
      const user = userEvent.setup({ delay: null })
      mockGetPlatform.mockReturnValue({})
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      await screen.findByText('Generation Failed', {}, { timeout: 10000 })
      expect(screen.getByText('SBOM generation is not available. Please update the application.')).toBeInTheDocument()
    })

    it('surfaces the server-reported error message when Syft reports failure', async () => {
      const user = userEvent.setup({ delay: null })
      mockGenerateFromFile.mockResolvedValue({ success: false, error: 'syft binary not found on PATH' })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      await screen.findByText('Generation Failed', {}, { timeout: 10000 })
      expect(screen.getByText('syft binary not found on PATH')).toBeInTheDocument()
    })

    it('falls back to a generic message when the result is missing cyclonedxJson and has no error text', async () => {
      // WHY: a "successful" result with no CycloneDX payload and no error string is
      // still unusable — the user must see SOME message, not a blank/broken screen.
      const user = userEvent.setup({ delay: null })
      mockGenerateFromFile.mockResolvedValue({ success: true })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      await screen.findByText('Generation Failed', {}, { timeout: 10000 })
      expect(screen.getByText('SBOM generation failed')).toBeInTheDocument()
    })

    it('falls back to a generic message when a non-Error value is thrown', async () => {
      const user = userEvent.setup({ delay: null })
      mockGenerateFromFile.mockRejectedValue('boom-not-an-error')
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      await screen.findByText('Generation Failed', {}, { timeout: 10000 })
      expect(screen.getByText('SBOM generation failed')).toBeInTheDocument()
    })
  })

  describe('Success screen reflects the actual scan result', () => {
    it('reports the vulnerability count when the generated SBOM contains known vulnerabilities', async () => {
      const user = userEvent.setup({ delay: null })
      mockParseCycloneDX.mockResolvedValue({
        components: [{ id: 'c1', name: 'openssl', version: '3.0.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        vulnerabilities: [
          {
            id: 'CVE-2024-0001',
            source: 'nvd',
            severity: 'critical',
            description: 'x',
            references: [],
            affectedComponents: ['c1'],
          },
          {
            id: 'CVE-2024-0002',
            source: 'nvd',
            severity: 'high',
            description: 'y',
            references: [],
            affectedComponents: ['c1'],
          },
        ],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      await screen.findByText(/and 2 vulnerabilities/, {}, { timeout: 10000 })
    })

    it('treats a parser response without a vulnerabilities array as zero, without crashing', async () => {
      // WHY: `parsedResult.vulnerabilities || []` is what protects `.length` reads in
      // the success screen. If that fallback were dropped, a parser response that
      // omits `vulnerabilities` would crash rendering instead of showing 0.
      const user = userEvent.setup({ delay: null })
      mockParseCycloneDX.mockResolvedValue({
        components: [{ id: 'c1', name: 'openssl', version: '3.0.0', type: 'library', licenses: [], purl: '', cpe: '' }],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      const successText = await screen.findByText(/Found 1 components/, {}, { timeout: 10000 })
      expect(successText.textContent).not.toMatch(/vulnerabilities/)
    })

    it('hides the component preview and disables Add when Syft finds zero components', async () => {
      const user = userEvent.setup({ delay: null })
      mockParseCycloneDX.mockResolvedValue({
        components: [],
        vulnerabilities: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      await screen.findByText('SBOM Generated', {}, { timeout: 10000 })
      expect(screen.queryByText(/Component Preview/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add 0 Components to Project' })).toBeDisabled()
    })

    it('shows an overflow count for components beyond the first 10 in the preview list', async () => {
      const user = userEvent.setup({ delay: null })
      const components = Array.from({ length: 12 }, (_, i) => ({
        id: `c${i}`,
        name: `component-${i}`,
        version: '1.0.0',
        type: 'library',
        licenses: [],
        purl: '',
        cpe: '',
      }))
      mockParseCycloneDX.mockResolvedValue({
        components,
        vulnerabilities: [],
        metadata: { format: 'cyclonedx', formatVersion: '1.5' },
      })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)

      await screen.findByText('SBOM Generated', {}, { timeout: 10000 })
      expect(screen.getByText(/\.\.\. and 2 more/)).toBeInTheDocument()
    })
  })

  describe('Resetting and closing the dialog', () => {
    it('returns to the mode picker and clears the selected file when Generate Another is clicked', async () => {
      // WHY: resetState must actually clear file/mode/parsed state, not just flip the
      // step — otherwise "Generate Another" would leave a stale file wired up while
      // showing an idle UI that looks ready for fresh input.
      const user = userEvent.setup({ delay: null })
      render(<BinarySbomDialog open onClose={vi.fn()} projectId="test-project-id" />)

      await selectFileAndGenerate(user)
      await screen.findByText('SBOM Generated', {}, { timeout: 10000 })

      await user.click(screen.getByRole('button', { name: 'Generate Another' }))

      expect(screen.queryByText('SBOM Generated')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Upload artifact' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Generate SBOM/i })).toBeDisabled()
    })

    it('closes via Cancel without touching the project when nothing has been generated yet', async () => {
      const user = userEvent.setup({ delay: null })
      const onClose = vi.fn()
      render(<BinarySbomDialog open onClose={onClose} projectId="test-project-id" />)

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(mockUpdateProject).not.toHaveBeenCalled()
    })

    it('unsubscribes the in-flight progress listener when dismissed mid-generation', async () => {
      // WHY: progressRef holds a live subscription while Syft runs. If the dialog is
      // dismissed (Escape) before generation settles, failing to call that cleanup
      // would leak a progress listener that keeps calling setState after the user
      // has moved on.
      const user = userEvent.setup({ delay: null })
      const mockCleanup = vi.fn()
      mockOnGenerateProgress.mockReturnValue(mockCleanup)
      mockGenerateFromFile.mockImplementation(() => new Promise(() => {})) // never settles
      const onClose = vi.fn()

      render(<BinarySbomDialog open onClose={onClose} projectId="test-project-id" />)
      await selectFileAndGenerate(user)
      await screen.findByText('Generating SBOM...', {}, { timeout: 10000 })

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(mockCleanup).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
