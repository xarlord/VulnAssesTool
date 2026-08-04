import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BinarySbomDialog } from './BinarySbomDialog'
import { useStore } from '@/store/useStore'
import { sha256Hex } from '@/lib/crypto/sha256'

// Hoisted mocks referenced inside vi.mock factories.
const { mockUpdateProject, mockLogSbomUpload, mockGenerateFromFile } = vi.hoisted(() => ({
  mockUpdateProject: vi.fn(),
  mockLogSbomUpload: vi.fn(),
  mockGenerateFromFile: vi.fn(),
}))

const CYCLONEDX_JSON = '{"bomFormat":"CycloneDX","specVersion":"1.5","marker":"binary"}'

vi.mock('@/lib/platform', () => ({
  getPlatform: () => ({
    sbom: {
      generateFromFile: mockGenerateFromFile,
      // Progress subscription returns an unsubscribe cleanup.
      onGenerateProgress: () => () => {},
    },
  }),
}))

vi.mock('@/lib/parsers/cyclonedx', () => ({
  parseCycloneDX: vi.fn().mockResolvedValue({
    components: [{ id: 'c1', name: 'openssl', version: '3.0.0', type: 'library', licenses: [], purl: '', cpe: '' }],
    vulnerabilities: [],
    metadata: { format: 'cyclonedx', formatVersion: '1.5' },
  }),
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

describe('BinarySbomDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateFromFile.mockResolvedValue({ success: true, cyclonedxJson: CYCLONEDX_JSON })
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
})
