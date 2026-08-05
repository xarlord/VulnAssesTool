/**
 * SbomGeneratorDialog Component Tests
 *
 * BDD-style tests for the Excel to CycloneDX SBOM Generator dialog
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SbomGeneratorDialog } from '../SbomGeneratorDialog'
import * as generators from '@/lib/generators'
import * as cpeUtils from '@/lib/utils/cpeUtils'

// Mock File.prototype.arrayBuffer for jsdom environment
// This avoids the FileReader callback issues in jsdom
const originalArrayBuffer = File.prototype.arrayBuffer
beforeEach(() => {
  File.prototype.arrayBuffer = function () {
    // Return a mock ArrayBuffer with the file content
    const encoder = new TextEncoder()
    return Promise.resolve(encoder.encode('mock file content').buffer as ArrayBuffer)
  }
})

afterEach(() => {
  File.prototype.arrayBuffer = originalArrayBuffer
})

// Mock the generator modules
vi.mock('@/lib/generators/excelParser', () => ({
  parseExcel: vi.fn(),
  mapRowToComponent: vi.fn(),
}))

vi.mock('@/lib/generators/cyclonedxGenerator', () => ({
  generateCycloneDX: vi.fn(),
}))

vi.mock('@/lib/utils/cpeUtils', () => ({
  suggestCPEs: vi.fn(),
  isValidCPE: vi.fn(),
}))

const mockParseExcel = vi.mocked(generators.parseExcel)
const mockMapRowToComponent = vi.mocked(generators.mapRowToComponent)
const mockGenerateCycloneDX = vi.mocked(generators.generateCycloneDX)
const mockSuggestCPEs = vi.mocked(cpeUtils.suggestCPEs)
const mockIsValidCPE = vi.mocked(cpeUtils.isValidCPE)

describe('SbomGeneratorDialog', () => {
  const mockOnClose = vi.fn()
  const mockExcelRows = [
    { name: 'react', version: '18.2.0', type: 'library', license: 'MIT' },
    { name: 'lodash', version: '4.17.21', type: 'library', license: 'MIT' },
  ]

  const mockComponents: generators.Component[] = [
    {
      id: 'pkg:npm/react@18.2.0',
      name: 'react',
      version: '18.2.0',
      type: 'library',
      licenses: ['MIT'],
      vulnerabilities: [],
    },
    {
      id: 'pkg:npm/lodash@4.17.21',
      name: 'lodash',
      version: '4.17.21',
      type: 'library',
      licenses: ['MIT'],
      vulnerabilities: [],
    },
  ]

  const mockSbomOutput = {
    content: JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      serialNumber: 'urn:uuid:test',
      metadata: { timestamp: '2025-02-11T00:00:00.000Z' },
      components: mockComponents,
    }),
    filename: 'sbom-20250211-000000.json',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementations
    mockMapRowToComponent.mockImplementation((row) => {
      if (!row.name || !row.version) return null
      return {
        id: `pkg:npm/${row.name}@${row.version}`,
        name: row.name,
        version: row.version,
        type: (row.type as any) || 'library',
        licenses: row.license ? [row.license] : [],
        vulnerabilities: [],
      }
    })
    mockSuggestCPEs.mockReturnValue([
      {
        cpe: 'cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*',
        vendor: 'facebook',
        product: 'react',
        confidence: 'high',
        source: 'known_mapping',
      },
    ])
    mockIsValidCPE.mockImplementation((cpe: string) => cpe.startsWith('cpe:2.3:'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
  })

  describe('Dialog Rendering', () => {
    it('should not render when open is false', () => {
      const { container } = render(<SbomGeneratorDialog open={false} onClose={mockOnClose} />)
      expect(container.firstChild).toBe(null)
    })

    it('should render when open is true', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(await screen.findByText('Generate SBOM from Excel')).toBeInTheDocument()
    })

    it('should show upload area on idle state', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(await screen.findByText(/Click to upload or drag and drop/)).toBeInTheDocument()
      expect(await screen.findByText(/Excel files \(.xlsx, .xls\)/)).toBeInTheDocument()
    })

    it('should display step indicator with correct steps', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(await screen.findByText('Upload')).toBeInTheDocument()
      expect(await screen.findByText('Map Columns')).toBeInTheDocument()
      expect(await screen.findByText('Preview')).toBeInTheDocument()
      expect(await screen.findByText('Generate')).toBeInTheDocument()
      expect(await screen.findByText('Download')).toBeInTheDocument()
    })

    it('should show required columns in instructions', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(await screen.findByText(/Required Excel Columns:/i)).toBeInTheDocument()
      const container = screen.getByText(/Required Excel Columns:/i).parentElement?.parentElement
      expect(container?.textContent).toContain('name')
      expect(container?.textContent).toContain('Component name')
    })
  })

  describe('File Upload', () => {
    it('should have file input with accept attribute', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(input).toBeInTheDocument()
      expect(input.accept).toBe('.xlsx,.xls')
    })

    it('should show loading state while parsing', async () => {
      mockParseExcel.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockExcelRows), 100)
          }),
      )

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      // Should show uploading/loading state
      await screen.findByText(/Parsing|Uploading|Loading/i, {}, { timeout: 2000 })
    })

    it('should handle file upload error', async () => {
      mockParseExcel.mockRejectedValue(new Error('Failed to parse Excel file'))

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['invalid'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      // Wait for error state - component shows "Error" heading with error message below
      await screen.findByText('Error', {}, { timeout: 3000 })
      expect(await screen.findByText('Failed to parse Excel file')).toBeInTheDocument()
    })
  })

  describe('Column Mapping', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
    })

    it('should show detected columns after file upload', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      // Wait for mapping step to appear
      await screen.findByText(/Map Columns|Detected columns/i, {}, { timeout: 3000 })
    })

    it('should show mapping table', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      expect(await screen.findByText('SBOM Field')).toBeInTheDocument()
      expect(await screen.findByText('Excel Column')).toBeInTheDocument()
    })

    it('should validate required columns before proceeding', async () => {
      // Mock with missing required columns
      mockParseExcel.mockResolvedValue([{ invalid: 'data' }] as any)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Component should stay on mapping step (not advance to preview)
      // because required columns are not mapped
      // The error is set internally but not displayed in the UI during mapping step
      await screen.findByText('Map Columns', {}, { timeout: 2000 })

      // Should still show the mapping table, indicating we stayed on this step
      expect(await screen.findByText('SBOM Field')).toBeInTheDocument()
    })
  })

  describe('Preview & Generate', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)
    })

    it('should show metadata form after column mapping', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Upload file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      // Wait for mapping step
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      // Click next to go to preview
      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Should show preview step with metadata - component shows "SBOM Metadata" heading
      await screen.findByText('SBOM Metadata', {}, { timeout: 3000 })
    })

    it('should allow editing metadata', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Upload file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      // Wait for mapping step
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      // Click next to go to preview
      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Should be in preview step with editable metadata - look for "SBOM Metadata"
      await screen.findByText('SBOM Metadata', {}, { timeout: 3000 })
    })

    it('should generate SBOM when Generate button is clicked', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Upload file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      // Wait for mapping step
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      // Click next to go to preview
      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Wait for preview step - look for Components Preview
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      // Look for generate button - component shows "Generate SBOM"
      const generateButton = await screen.findByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      // Component goes to CPE selection step first - click Continue to proceed
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = await screen.findByRole('button', { name: /Continue/i })
      fireEvent.click(continueButton)

      // Wait for generation to complete - success state shows "SBOM Generated Successfully!"
      await screen.findByText(/SBOM Generated Successfully/i, {}, { timeout: 5000 })
    })

    it('should show success state after generation', async () => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Upload file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      // Wait for mapping step
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      // Click next to go to preview
      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Wait for preview step
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      // Click generate button
      const generateButton = await screen.findByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      // Component goes to CPE selection step first - click Continue to proceed
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = await screen.findByRole('button', { name: /Continue/i })
      fireEvent.click(continueButton)

      // Wait for success - component shows "SBOM Generated Successfully!"
      await screen.findByText(/SBOM Generated Successfully/i, {}, { timeout: 5000 })
    })
  })

  describe('Download', () => {
    it('should show download button after generation', async () => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Upload file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      // Wait for mapping step
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      // Navigate through steps
      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      // Click generate
      const generateButton = await screen.findByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      // Component goes to CPE selection step first - click Continue to proceed
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = await screen.findByRole('button', { name: /Continue/i })
      fireEvent.click(continueButton)

      // Wait for success/download step - component shows "Download SBOM" button
      await screen.findByText(/Download SBOM/i, {}, { timeout: 5000 })
    })
  })

  describe('Dialog Controls', () => {
    it('should close dialog when close button is clicked', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const closeButton = await screen.findByRole('button', { name: 'Close' })
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close dialog when Escape is pressed', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should reset state when dialog is closed and reopened', async () => {
      const { rerender } = render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Close and reopen
      rerender(<SbomGeneratorDialog open={false} onClose={mockOnClose} />)
      rerender(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Should be back to initial state
      expect(await screen.findByText(/Click to upload or drag and drop/)).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should show error for empty Excel file', async () => {
      mockParseExcel.mockResolvedValue([])

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      // Component shows: "The Excel file appears to be empty or has no valid data rows."
      await screen.findByText(/empty or has no valid data/i, {}, { timeout: 3000 })
    })

    it('should allow starting over after error', async () => {
      mockParseExcel.mockResolvedValue([])

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      // Wait for error state - component shows "Error" heading with error message
      await screen.findByText('Error', {}, { timeout: 3000 })

      // Look for start over button - component shows "Start Over"
      const startOverButton = await screen.findByRole('button', { name: /Start Over/i })
      fireEvent.click(startOverButton)

      // Should be back to upload state
      await screen.findByText(/Click to upload or drag and drop/i, {}, { timeout: 2000 })
    })
  })

  describe('Drag and Drop', () => {
    it('should handle drag over events', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const dropZone = screen.getByText(/Click to upload or drag and drop/).closest('div')

      if (dropZone) {
        fireEvent.dragOver(dropZone)
        // Should not cause errors
      }
    })

    it('should handle file drop via file input', async () => {
      mockParseExcel.mockResolvedValue(mockExcelRows)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(input, { target: { files: [file] } })

      // Should progress to mapping step
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
    })
  })

  describe('Drop with Invalid File Type', () => {
    it('should show error when non-Excel file is dropped', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const dropZone = screen.getByText(/Click to upload or drag and drop/).closest('div')
      if (dropZone) {
        const file = new File(['content'], 'test.txt', { type: 'text/plain' })
        const dropEvent = {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: { files: [file] },
        }

        fireEvent.drop(dropZone, dropEvent)

        await screen.findByText('Error', {}, { timeout: 3000 })
        expect(await screen.findByText(/Please upload an Excel file/)).toBeInTheDocument()
      }
    })
  })

  describe('Column Mapping Changes', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
    })

    it('should allow changing column mapping via select', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      // The "Map Columns" heading renders before the mapping selects; wait for the
      // selects themselves so this doesn't race under CI load.
      await waitFor(() => expect(document.querySelectorAll('select').length).toBeGreaterThan(0))
      const selects = document.querySelectorAll('select')

      if (selects.length > 0) {
        fireEvent.change(selects[0], { target: { value: '' } })
        // Should clear mapping for that column
      }
    })

    it('should cancel from mapping step', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const cancelButton = await screen.findByText('Cancel')
      fireEvent.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Metadata Editing', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
    })

    it('should allow editing SBOM name', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText('SBOM Metadata', {}, { timeout: 3000 })

      const nameInput = document.querySelector('input[placeholder="My Application SBOM"]') as HTMLInputElement
      if (nameInput) {
        fireEvent.change(nameInput, { target: { value: 'Custom SBOM Name' } })
        expect(nameInput.value).toBe('Custom SBOM Name')
      }
    })

    it('should allow editing version', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText('SBOM Metadata', {}, { timeout: 3000 })

      const versionInput = document.querySelector('input[placeholder="1.0.0"]') as HTMLInputElement
      if (versionInput) {
        fireEvent.change(versionInput, { target: { value: '2.0.0' } })
        expect(versionInput.value).toBe('2.0.0')
      }
    })

    it('should navigate back from preview to mapping', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      const backButton = await screen.findByText('Back')
      fireEvent.click(backButton)

      await screen.findByText('Map Columns', {}, { timeout: 3000 })
    })
  })

  describe('CPE Selection Step', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)
    })

    it('should allow skipping all CPEs and show generating state', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      const generateButton = await screen.findByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })

      const skipAllButtons = await screen.findAllByText('Skip All')
      fireEvent.click(skipAllButtons[0])

      await screen.findByText(/Generating CycloneDX SBOM/i, {}, { timeout: 5000 })
    })

    it('should navigate back from CPE selection to preview', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      const generateButton = await screen.findByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })

      const backButtons = await screen.findAllByText('Back')
      fireEvent.click(backButtons[0])

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })
    })
  })

  describe('Download', () => {
    it('should trigger download when Download SBOM is clicked', async () => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      const generateButton = await screen.findByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = await screen.findByRole('button', { name: /Continue/i })
      fireEvent.click(continueButton)

      await screen.findByText(/SBOM Generated Successfully/i, {}, { timeout: 5000 })

      const downloadSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
      const downloadButton = await screen.findByText('Download SBOM')
      fireEvent.click(downloadButton)
      expect(downloadSpy).toHaveBeenCalled()
      downloadSpy.mockRestore()
    })
  })

  describe('Error State', () => {
    it('should close from error state', async () => {
      mockParseExcel.mockRejectedValue(new Error('Failed to parse Excel file'))

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['invalid'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Error', {}, { timeout: 3000 })

      const closeButtons = await screen.findAllByText('Close')
      fireEvent.click(closeButtons[closeButtons.length - 1])

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Generation Error', () => {
    it('should show error when CycloneDX generation fails', async () => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockRejectedValue(new Error('Generation failed'))

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })

      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      const nextButton = await screen.findByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      const generateButton = await screen.findByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = await screen.findByRole('button', { name: /Continue/i })
      fireEvent.click(continueButton)

      await screen.findByText('Error', {}, { timeout: 5000 })
      expect(await screen.findByText('Generation failed')).toBeInTheDocument()
    })
  })

  describe('Drag and Drop with Valid File', () => {
    it('should handle drag and drop of valid .xlsx file', async () => {
      mockParseExcel.mockResolvedValue(mockExcelRows)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const dropZone = screen.getByText(/Click to upload or drag and drop/).closest('div')
      if (dropZone) {
        const file = new File(['content'], 'test.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        fireEvent.drop(dropZone, {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: { files: [file] },
        })

        await screen.findByText('Map Columns', {}, { timeout: 3000 })
        expect(await screen.findByText('SBOM Field')).toBeInTheDocument()
      }
    })

    it('should handle drop with no files gracefully', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const dropZone = screen.getByText(/Click to upload or drag and drop/).closest('div')
      if (dropZone) {
        fireEvent.drop(dropZone, {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: { files: [] },
        })

        expect(await screen.findByText(/Click to upload or drag and drop/)).toBeInTheDocument()
      }
    })
  })

  describe('CPE Selection UI Interactions', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)
      mockSuggestCPEs.mockReturnValue([
        {
          cpe: 'cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*',
          vendor: 'facebook',
          product: 'react',
          confidence: 'high',
          source: 'known_mapping',
        },
      ])
    })

    async function navigateToCpeSelection() {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /Generate SBOM/i }))
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
    }

    it('should open CPE editing UI when Select CPE is clicked', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      await navigateToCpeSelection()

      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])

      await screen.findByText('Suggested CPEs:', {}, { timeout: 3000 })
      expect(await screen.findByPlaceholderText(/cpe:2.3:a:vendor:product/)).toBeInTheDocument()
      expect(await screen.findByText('Apply')).toBeInTheDocument()
      expect(await screen.findByText('Skip this component')).toBeInTheDocument()
    })

    it('should select a suggested CPE and update list', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      await navigateToCpeSelection()

      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])
      await screen.findByText('Suggested CPEs:', {}, { timeout: 3000 })

      const allButtons = await screen.findAllByRole('button')
      const suggestionBtn = allButtons.find((b) => b.textContent?.includes('cpe:2.3:a:facebook:react'))
      if (suggestionBtn) fireEvent.click(suggestionBtn)

      await screen.findByText(/Components Missing CPE \(1\)/, {}, { timeout: 3000 })
    })

    it('should submit a valid custom CPE', async () => {
      mockIsValidCPE.mockReturnValue(true)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      await navigateToCpeSelection()

      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])
      await screen.findByText('Or enter a custom CPE:', {}, { timeout: 3000 })

      const cpeInput = await screen.findByPlaceholderText(/cpe:2.3:a:vendor:product/)
      fireEvent.change(cpeInput, { target: { value: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*' } })

      fireEvent.click(await screen.findByText('Apply'))

      await screen.findByText(/Components Missing CPE \(1\)/, {}, { timeout: 3000 })
    })

    it('should reject invalid custom CPE without changing step', async () => {
      mockIsValidCPE.mockReturnValue(false)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      await navigateToCpeSelection()

      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])
      await screen.findByText('Or enter a custom CPE:', {}, { timeout: 3000 })

      const cpeInput = await screen.findByPlaceholderText(/cpe:2.3:a:vendor:product/)
      fireEvent.change(cpeInput, { target: { value: 'invalid-cpe' } })

      fireEvent.click(await screen.findByText('Apply'))

      expect(mockIsValidCPE).toHaveBeenCalledWith('invalid-cpe')
    })

    it('should not call isValidCPE for empty custom CPE', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      await navigateToCpeSelection()

      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])
      await screen.findByText('Or enter a custom CPE:', {}, { timeout: 3000 })

      fireEvent.click(await screen.findByText('Apply'))

      expect(mockIsValidCPE).not.toHaveBeenCalled()
    })

    it('should skip a single component CPE', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      await navigateToCpeSelection()

      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])
      await screen.findByText('Skip this component', {}, { timeout: 3000 })

      fireEvent.click(await screen.findByText('Skip this component'))

      await waitFor(() => {
        expect(screen.queryByText('Skip this component')).not.toBeInTheDocument()
      })
    })

    it('should update progress indicator after CPE selection', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      await navigateToCpeSelection()

      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])
      await screen.findByText('Suggested CPEs:', {}, { timeout: 3000 })

      const allButtons = await screen.findAllByRole('button')
      const suggestionBtn = allButtons.find((b) => b.textContent?.includes('cpe:2.3:a:facebook:react'))
      if (suggestionBtn) fireEvent.click(suggestionBtn)

      await screen.findByText(/1 of 2 components have CPE/, {}, { timeout: 3000 })
      expect(await screen.findByText(/1 reviewed/)).toBeInTheDocument()
    })

    it('should show Enter CPE manually when no suggestions available', async () => {
      mockSuggestCPEs.mockReturnValue([])
      mockParseExcel.mockResolvedValue([{ name: 'unknown-lib', version: '1.0.0' }])
      mockMapRowToComponent.mockImplementation((row) => ({
        id: `pkg:npm/${row.name}@${row.version}`,
        name: row.name,
        version: row.version,
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      }))

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /Generate SBOM/i }))
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })

      expect(await screen.findByText('Enter CPE manually')).toBeInTheDocument()
    })
  })

  describe('Direct Generation Without CPE Step', () => {
    it('should skip CPE selection when all components have CPEs', async () => {
      mockParseExcel.mockResolvedValue([
        { name: 'react', version: '18.2.0', cpe: 'cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*' },
      ])
      mockMapRowToComponent.mockImplementation((row) => ({
        id: `pkg:npm/${row.name}@${row.version}`,
        name: row.name,
        version: row.version,
        type: 'library' as const,
        licenses: [],
        vulnerabilities: [],
        cpe: row.cpe ? String(row.cpe) : undefined,
      }))
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /Generate SBOM/i }))

      await screen.findByText(/SBOM Generated Successfully|Generating CycloneDX/i, {}, { timeout: 5000 })
      expect(screen.queryByText(/Components Missing CPE/)).not.toBeInTheDocument()
    })
  })

  describe('Component Preview Edge Cases', () => {
    it('should show "and N more" when more than 10 components', async () => {
      const manyRows = Array.from({ length: 15 }, (_, i) => ({
        name: `component-${i}`,
        version: `1.0.${i}`,
        type: 'library',
        license: 'MIT',
      }))
      mockParseExcel.mockResolvedValue(manyRows)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      // Generous async-wait + per-test budgets: the parse→map→preview re-render chain is CPU-bound
      // and occasionally exceeds the tight 3s waits under the parallel full-suite run. Correct in
      // isolation — this only guards against load-induced flakiness.
      await screen.findByText('Map Columns', {}, { timeout: 15000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/, {}, { timeout: 15000 })

      expect(await screen.findByText(/and 5 more components/)).toBeInTheDocument()
    }, 20_000)

    it('should truncate long CPE strings in preview table', async () => {
      const longCpe = 'cpe:2.3:a:very-long-vendor-name:very-long-product-name:1.0.0-beta.1:build123456789:*:*:*:*:*:*:*'
      mockParseExcel.mockResolvedValue([{ name: 'comp', version: '1.0.0', cpe: longCpe }])
      mockMapRowToComponent.mockImplementation((row) => ({
        id: `pkg:npm/${row.name}@${row.version}`,
        name: row.name,
        version: row.version,
        type: 'library' as const,
        licenses: [],
        vulnerabilities: [],
        cpe: row.cpe ? String(row.cpe) : undefined,
      }))

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/, {}, { timeout: 3000 })

      const truncatedEl = await screen.findByTitle(longCpe)
      expect(truncatedEl.textContent).toContain('...')
    })
  })

  describe('Mapping Error Handling', () => {
    it('should handle component creation error for individual rows', async () => {
      mockParseExcel.mockResolvedValue([
        { name: 'bad', version: '1.0' },
        { name: 'good', version: '2.0' },
      ])
      mockMapRowToComponent.mockImplementation((row) => {
        if (row.name === 'bad') {
          throw new Error('Invalid component data')
        }
        return {
          id: `pkg:npm/${row.name}@${row.version}`,
          name: row.name,
          version: row.version,
          type: 'library' as const,
          licenses: [],
          vulnerabilities: [],
        }
      })

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/, {}, { timeout: 3000 })

      expect(await screen.findByText(/Components Preview \(1\)/)).toBeInTheDocument()
    })

    it('should show error when all component creations fail', async () => {
      mockParseExcel.mockResolvedValue([{ name: 'bad', version: '1.0' }])
      mockMapRowToComponent.mockImplementation(() => {
        throw new Error('Cannot create component')
      })

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))

      await screen.findByText(/No valid components/, {}, { timeout: 3000 })
    })
  })

  describe('Metadata Editing Extended', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
    })

    it('should allow editing description field', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText('SBOM Metadata', {}, { timeout: 3000 })

      const descInput = document.querySelector('input[placeholder="SBOM for my application"]') as HTMLInputElement
      if (descInput) {
        fireEvent.change(descInput, { target: { value: 'Test description' } })
        expect(descInput.value).toBe('Test description')
      }
    })

    it('should allow editing author field', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText('SBOM Metadata', {}, { timeout: 3000 })

      const authorInput = document.querySelector('input[placeholder="Your Name or Company"]') as HTMLInputElement
      if (authorInput) {
        fireEvent.change(authorInput, { target: { value: 'Test Author' } })
        expect(authorInput.value).toBe('Test Author')
      }
    })
  })

  describe('Additional Branch Coverage', () => {
    beforeEach(() => {
      mockParseExcel.mockResolvedValue(mockExcelRows)
      mockGenerateCycloneDX.mockResolvedValue(mockSbomOutput)
    })

    it('should stay on idle step when file input change has no file', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      // Fire change event with no files — triggers early return on line 100
      fireEvent.change(input, { target: { files: [] } })

      // Should remain on idle step — upload area still visible, mapping table not shown
      expect(await screen.findByText(/Click to upload or drag and drop/)).toBeInTheDocument()
      expect(screen.queryByText('SBOM Field')).not.toBeInTheDocument()
      expect(screen.queryByText('Excel Column')).not.toBeInTheDocument()
    })

    it('should trigger file input click when drop zone is clicked', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

      const dropZone = screen.getByText(/Click to upload or drag and drop/).closest('div')
      if (!dropZone) throw new Error('Drop zone element not found')

      // Clicking the drop zone should call fileInputRef.current.click()
      fireEvent.click(dropZone)
      expect(clickSpy).toHaveBeenCalled()

      clickSpy.mockRestore()
    })

    it('should show error when generation fails from CPE confirm step', async () => {
      mockGenerateCycloneDX.mockRejectedValue(new Error('CPE generation failed'))

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /Generate SBOM/i }))
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })

      // Click Continue — triggers handleCpeSelectionConfirm which calls generateCycloneDX
      fireEvent.click(await screen.findByRole('button', { name: /Continue/i }))

      await screen.findByText('Error', {}, { timeout: 5000 })
      expect(await screen.findByText('CPE generation failed')).toBeInTheDocument()
    })

    it('should show error when generation fails without CPE step', async () => {
      mockParseExcel.mockResolvedValue([
        { name: 'react', version: '18.2.0', cpe: 'cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*' },
      ])
      mockMapRowToComponent.mockImplementation((row) => ({
        id: `pkg:npm/${row.name}@${row.version}`,
        name: row.name,
        version: row.version,
        type: 'library' as const,
        licenses: [],
        vulnerabilities: [],
        cpe: row.cpe ? String(row.cpe) : undefined,
      }))
      mockGenerateCycloneDX.mockRejectedValue(new Error('Direct generation failed'))

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      // All components have CPEs — should skip CPE step and go straight to generating
      fireEvent.click(await screen.findByRole('button', { name: /Generate SBOM/i }))

      await screen.findByText('Error', {}, { timeout: 5000 })
      expect(await screen.findByText('Direct generation failed')).toBeInTheDocument()
    })

    it('should handle drag and drop of .xls file', async () => {
      mockParseExcel.mockResolvedValue(mockExcelRows)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const dropZone = screen.getByText(/Click to upload or drag and drop/).closest('div')
      if (!dropZone) throw new Error('Drop zone element not found')

      const file = new File(['content'], 'data.xls', {
        type: 'application/vnd.ms-excel',
      })
      fireEvent.drop(dropZone, {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: [file] },
      })

      // .xls should pass the regex check and proceed to mapping
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      expect(await screen.findByText('SBOM Field')).toBeInTheDocument()
    })

    it('should show Change CPE button after selecting a CPE and allow re-editing', async () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Navigate to CPE selection
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      fireEvent.click(await screen.findByRole('button', { name: /Generate SBOM/i }))
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })

      // Click "Select CPE" for the first component
      const selectCpeButtons = await screen.findAllByText(/Select CPE/)
      fireEvent.click(selectCpeButtons[0])
      await screen.findByText('Suggested CPEs:', {}, { timeout: 3000 })

      // Select a suggested CPE for the first component
      const allButtons = await screen.findAllByRole('button')
      const suggestionBtn = allButtons.find((b) => b.textContent?.includes('cpe:2.3:a:facebook:react'))
      if (suggestionBtn) fireEvent.click(suggestionBtn)

      // After selection, only 1 component still needs CPE
      await screen.findByText(/Components Missing CPE \(1\)/, {}, { timeout: 3000 })

      // The first component now has a CPE and shows "CPE selected" badge + "Change CPE" button
      // Because it was removed from componentsNeedingCpe, we verify via the remaining count
      expect(await screen.findByText(/1 of 2 components have CPE/)).toBeInTheDocument()
      expect(await screen.findByText(/1 reviewed/)).toBeInTheDocument()

      // The remaining component without CPE should still show "Select CPE"
      const remainingSelectButtons = await screen.findAllByText(/Select CPE|Enter CPE manually/)
      expect(remainingSelectButtons.length).toBeGreaterThan(0)
    })

    it('should show "Enter CPE manually" with no suggestions and allow custom CPE entry', async () => {
      mockSuggestCPEs.mockReturnValue([])
      mockParseExcel.mockResolvedValue([{ name: 'custom-lib', version: '2.0.0' }])
      mockMapRowToComponent.mockImplementation((row) => ({
        id: `pkg:npm/${row.name}@${row.version}`,
        name: row.name,
        version: row.version,
        type: 'library' as const,
        licenses: [],
        vulnerabilities: [],
      }))
      mockIsValidCPE.mockReturnValue(true)

      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      fireEvent.change(input, { target: { files: [file] } })
      await screen.findByText('Map Columns', {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /next step/i }))
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })
      fireEvent.click(await screen.findByRole('button', { name: /Generate SBOM/i }))
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })

      // Should show "Enter CPE manually" (no suggestions)
      expect(await screen.findByText('Enter CPE manually')).toBeInTheDocument()

      // Click to open editing UI — should NOT show "Suggested CPEs:" section
      fireEvent.click(await screen.findByText('Enter CPE manually'))
      await screen.findByText('Or enter a custom CPE:', {}, { timeout: 3000 })
      expect(screen.queryByText('Suggested CPEs:')).not.toBeInTheDocument()

      // Enter and submit a valid custom CPE
      const cpeInput = await screen.findByPlaceholderText(/cpe:2.3:a:vendor:product/)
      fireEvent.change(cpeInput, { target: { value: 'cpe:2.3:a:vendor:custom-lib:2.0.0:*:*:*:*:*:*:*' } })
      fireEvent.click(await screen.findByText('Apply'))

      // After applying custom CPE, the component has a CPE assigned
      // The "Components Missing CPE" count drops to 0, but the component is still listed
      // The progress indicator shows "1 of 1 components have CPE"
      await screen.findByText(/1 of 1 components have CPE/, {}, { timeout: 3000 })
      expect(await screen.findByText(/1 reviewed/)).toBeInTheDocument()
      expect(await screen.findByText(/Components Missing CPE \(0\)/)).toBeInTheDocument()
    })
  })
})
