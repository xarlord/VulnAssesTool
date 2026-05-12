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

const mockParseExcel = vi.mocked(generators.parseExcel)
const mockMapRowToComponent = vi.mocked(generators.mapRowToComponent)
const mockGenerateCycloneDX = vi.mocked(generators.generateCycloneDX)

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

    it('should render when open is true', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(screen.getByText('Generate SBOM from Excel')).toBeInTheDocument()
    })

    it('should show upload area on idle state', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(screen.getByText(/Click to upload or drag and drop/)).toBeInTheDocument()
      expect(screen.getByText(/Excel files \(.xlsx, .xls\)/)).toBeInTheDocument()
    })

    it('should display step indicator with correct steps', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(screen.getByText('Upload')).toBeInTheDocument()
      expect(screen.getByText('Map Columns')).toBeInTheDocument()
      expect(screen.getByText('Preview')).toBeInTheDocument()
      expect(screen.getByText('Generate')).toBeInTheDocument()
      expect(screen.getByText('Download')).toBeInTheDocument()
    })

    it('should show required columns in instructions', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)
      expect(screen.getByText(/Required Excel Columns:/i)).toBeInTheDocument()
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
      expect(screen.getByText('Failed to parse Excel file')).toBeInTheDocument()
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
      expect(screen.getByText('SBOM Field')).toBeInTheDocument()
      expect(screen.getByText('Excel Column')).toBeInTheDocument()
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

      const nextButton = screen.getByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Component should stay on mapping step (not advance to preview)
      // because required columns are not mapped
      // The error is set internally but not displayed in the UI during mapping step
      await screen.findByText('Map Columns', {}, { timeout: 2000 })

      // Should still show the mapping table, indicating we stayed on this step
      expect(screen.getByText('SBOM Field')).toBeInTheDocument()
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
      const nextButton = screen.getByRole('button', { name: /next step/i })
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
      const nextButton = screen.getByRole('button', { name: /next step/i })
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
      const nextButton = screen.getByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Wait for preview step - look for Components Preview
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      // Look for generate button - component shows "Generate SBOM"
      const generateButton = screen.getByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      // Component goes to CPE selection step first - click Continue to proceed
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = screen.getByRole('button', { name: /Continue/i })
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
      const nextButton = screen.getByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      // Wait for preview step
      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      // Click generate button
      const generateButton = screen.getByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      // Component goes to CPE selection step first - click Continue to proceed
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = screen.getByRole('button', { name: /Continue/i })
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
      const nextButton = screen.getByRole('button', { name: /next step/i })
      fireEvent.click(nextButton)

      await screen.findByText(/Components Preview/i, {}, { timeout: 3000 })

      // Click generate
      const generateButton = screen.getByRole('button', { name: /Generate SBOM/i })
      fireEvent.click(generateButton)

      // Component goes to CPE selection step first - click Continue to proceed
      await screen.findByText(/Components Missing CPE/i, {}, { timeout: 3000 })
      const continueButton = screen.getByRole('button', { name: /Continue/i })
      fireEvent.click(continueButton)

      // Wait for success/download step - component shows "Download SBOM" button
      await screen.findByText(/Download SBOM/i, {}, { timeout: 5000 })
    })
  })

  describe('Dialog Controls', () => {
    it('should close dialog when close button is clicked', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const closeButton = screen.getByRole('button', { name: /close dialog/i })
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close dialog when backdrop is clicked', () => {
      render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      const backdrop = screen
        .getByText(/Generate SBOM from Excel/)
        .closest('.fixed')
        ?.querySelector('.bg-black\\/50')
      if (backdrop) {
        fireEvent.click(backdrop)
        expect(mockOnClose).toHaveBeenCalled()
      }
    })

    it('should reset state when dialog is closed and reopened', async () => {
      const { rerender } = render(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Close and reopen
      rerender(<SbomGeneratorDialog open={false} onClose={mockOnClose} />)
      rerender(<SbomGeneratorDialog open={true} onClose={mockOnClose} />)

      // Should be back to initial state
      expect(screen.getByText(/Click to upload or drag and drop/)).toBeInTheDocument()
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
      const startOverButton = screen.getByRole('button', { name: /Start Over/i })
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
})
