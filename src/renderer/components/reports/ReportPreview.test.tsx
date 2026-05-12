import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock the report service functions
vi.mock('@/lib/services/reports', () => ({
  previewHTML: vi.fn(() => '<html><body><h1>Mock Report Preview</h1></body></html>'),
  downloadReport: vi.fn(),
  ReportGenerator: {
    generatePDF: vi.fn().mockResolvedValue({
      content: new Blob(['pdf-content'], { type: 'application/pdf' }),
      contentType: 'application/pdf',
      filename: 'report.pdf',
      size: 1024,
    }),
    generateHTML: vi.fn().mockResolvedValue({
      content: '<html><body>HTML report</body></html>',
      contentType: 'text/html',
      filename: 'report.html',
      size: 512,
    }),
  },
}))

// Mock Radix Dialog UI components to avoid portal/getComputedStyle issues
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open: _open, onOpenChange }: any) => <div data-testid="mock-dialog">{children}</div>,
  DialogContent: ({ children, className }: any) => (
    <div data-testid="mock-dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div data-testid="mock-dialog-header">{children}</div>,
  DialogTitle: ({ children, className }: any) => (
    <h2 data-testid="mock-dialog-title" className={className}>
      {children}
    </h2>
  ),
  DialogFooter: ({ children, className }: any) => (
    <div data-testid="mock-dialog-footer" className={className}>
      {children}
    </div>
  ),
}))

// Mock other UI components used by ReportPreview
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, value, onValueChange, className }: any) => (
    <div data-testid="mock-tabs" data-value={value} className={className}>
      {React.Children.map(children, (child: any) =>
        React.cloneElement(child, { activeTab: value, onTabChange: onValueChange }),
      )}
    </div>
  ),
  TabsList: ({ children, className, activeTab, onTabChange }: any) => (
    <div role="tablist" className={className}>
      {React.Children.map(children, (child: any) => React.cloneElement(child, { activeTab, onTabChange }))}
    </div>
  ),
  TabsTrigger: ({ children, value, activeTab, onTabChange, className }: any) => (
    <button
      role="tab"
      data-testid={`tab-${value}`}
      aria-selected={activeTab === value}
      className={className}
      onClick={() => onTabChange?.(value)}
    >
      {children}
    </button>
  ),
  TabsContent: ({ children, value, activeTab, className }: any) =>
    activeTab === value ? <div className={className}>{children}</div> : null,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="mock-badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="mock-select" data-value={value}>
      {React.Children.map(children, (child: any) => React.cloneElement(child, { onSelect: onValueChange }))}
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, onSelect }: any) => (
    <div data-value={value} onClick={() => onSelect?.(value)}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, id }: any) => <div id={id}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      data-testid="mock-switch"
    />
  ),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: any) => <div className={className}>{children}</div>,
}))

import { ReportPreview } from './ReportPreview'
import { previewHTML, downloadReport, ReportGenerator } from '@/lib/services/reports'

// Sample report data for tests
const mockReportData = {
  project: {
    id: 'project-1',
    name: 'Test Project',
    description: 'A test project for vulnerability assessment',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    sbomFiles: ['sbom.json'],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 10,
      criticalCount: 3,
      highCount: 2,
      mediumCount: 4,
      lowCount: 1,
      noneCount: 0,
      totalComponents: 25,
      vulnerableComponents: 8,
      kevCount: 1,
      avgEpssScore: 0.45,
    },
  },
  vulnerabilities: [],
  components: [],
  statistics: {
    totalVulnerabilities: 10,
    criticalCount: 3,
    highCount: 2,
    mediumCount: 4,
    lowCount: 1,
    noneCount: 0,
    totalComponents: 25,
    vulnerableComponents: 8,
    kevCount: 1,
    avgEpssScore: 0.45,
  },
}

describe('ReportPreview', () => {
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    mockOnOpenChange.mockReset()
    // Reset mock implementations to defaults
    ;(previewHTML as any).mockReturnValue('<html><body><h1>Mock Report Preview</h1></body></html>')
    ;(ReportGenerator.generatePDF as any).mockResolvedValue({
      content: new Blob(['pdf-content'], { type: 'application/pdf' }),
      contentType: 'application/pdf',
      filename: 'report.pdf',
      size: 1024,
    })
    ;(ReportGenerator.generateHTML as any).mockResolvedValue({
      content: '<html><body>HTML Report</body></html>',
      contentType: 'text/html',
      filename: 'report.html',
      size: 512,
    })
  })

  const renderPreview = (
    open: boolean = true,
    data: typeof mockReportData | null = mockReportData,
    projectName?: string,
  ) => {
    return render(<ReportPreview open={open} onOpenChange={mockOnOpenChange} data={data} projectName={projectName} />)
  }

  describe('Rendering', () => {
    it('should render the dialog when open is true with report data', () => {
      renderPreview(true)

      expect(screen.getByText('Report Preview')).toBeInTheDocument()
    })

    it('should show report title', () => {
      renderPreview(true)

      expect(screen.getByText('Report Preview')).toBeInTheDocument()
    })

    it('should display quick stats badges when data has vulnerabilities', () => {
      renderPreview(true)

      expect(screen.getByText('10 total')).toBeInTheDocument()
    })

    it('should display critical count badge when critical vulnerabilities exist', () => {
      renderPreview(true)

      expect(screen.getByText('3 critical')).toBeInTheDocument()
    })

    it('should display high count badge when high vulnerabilities exist', () => {
      renderPreview(true)

      expect(screen.getByText('2 high')).toBeInTheDocument()
    })

    it('should not render critical/high badges when counts are zero', () => {
      const zeroData = {
        ...mockReportData,
        statistics: {
          ...mockReportData.statistics,
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
        },
      }

      renderPreview(true, zeroData)

      // No critical or high badges should appear when counts are zero
      expect(screen.queryByText(/\d+ critical/)).not.toBeInTheDocument()
      expect(screen.queryByText(/\d+ high/)).not.toBeInTheDocument()
    })
  })

  describe('Empty/Null Data Handling', () => {
    it('should render gracefully when data is null', () => {
      renderPreview(true, null)

      expect(screen.getByText('No data available for report preview')).toBeInTheDocument()
    })

    it('should show empty state message when no data is provided', () => {
      render(<ReportPreview open={true} onOpenChange={mockOnOpenChange} data={null} />)

      expect(screen.getByText('No data available for report preview')).toBeInTheDocument()
    })
  })

  describe('Tabs', () => {
    it('should render Preview and Options tabs', () => {
      renderPreview(true)

      expect(screen.getByTestId('tab-preview')).toBeInTheDocument()
      expect(screen.getByTestId('tab-options')).toBeInTheDocument()
    })

    it('should display preview tab as active by default', () => {
      renderPreview(true)

      // The iframe is rendered in the preview tab
      const iframe = document.querySelector('iframe[title="Report Preview"]')
      expect(iframe).toBeTruthy()
    })

    it('should switch to options tab when clicked', async () => {
      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByTestId('tab-options'))

      expect(screen.getByText('Report Title')).toBeInTheDocument()
    })
  })

  describe('Preview Tab', () => {
    it('should call previewHTML to generate the preview content', () => {
      renderPreview(true)

      expect(previewHTML).toHaveBeenCalled()
      const [dataArg, optionsArg] = (previewHTML as any).mock.calls[0]
      expect(dataArg).toEqual(mockReportData)
      expect(optionsArg.title).toContain('Project')
    })

    it('should render an iframe with the preview HTML', () => {
      renderPreview(true)

      const iframe = document.querySelector('iframe[title="Report Preview"]') as HTMLIFrameElement
      expect(iframe).toBeTruthy()
      expect(iframe?.getAttribute('srcDoc')).toContain('Mock Report Preview')
    })

    it('should handle previewHTML errors gracefully', () => {
      ;(previewHTML as any).mockImplementation(() => {
        throw new Error('Preview generation failed')
      })

      renderPreview(true)

      const iframe = document.querySelector('iframe[title="Report Preview"]') as HTMLIFrameElement
      expect(iframe).toBeTruthy()
      expect(iframe?.getAttribute('srcDoc')).toContain('Error generating preview')
    })
  })

  describe('Options Tab', () => {
    const switchToOptions = async () => {
      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByTestId('tab-options'))
      return user
    }

    it('should render report title input', async () => {
      await switchToOptions()

      expect(screen.getByText('Report Title')).toBeInTheDocument()
      const titleInput = document.querySelector('#title') as HTMLInputElement
      expect(titleInput).toBeTruthy()
    })

    it('should render theme selector', async () => {
      await switchToOptions()

      expect(screen.getByText('Theme')).toBeInTheDocument()
    })

    it('should render toggle options', async () => {
      await switchToOptions()

      expect(screen.getByText('Executive Summary')).toBeInTheDocument()
      expect(screen.getByText('Charts & Visualizations')).toBeInTheDocument()
      expect(screen.getByText('Recommendations')).toBeInTheDocument()
    })

    it('should render company name input', async () => {
      await switchToOptions()

      expect(screen.getByText('Company Name (optional)')).toBeInTheDocument()
    })

    it('should render logo upload area', async () => {
      await switchToOptions()

      expect(screen.getByText('Upload Logo')).toBeInTheDocument()
    })

    it('should allow changing the report title', async () => {
      const user = await switchToOptions()

      const titleInput = document.querySelector('#title') as HTMLInputElement
      expect(titleInput).toBeTruthy()

      await user.clear(titleInput)
      await user.type(titleInput, 'Custom Report Title')

      expect(titleInput.value).toBe('Custom Report Title')
    })
  })

  describe('Footer Actions', () => {
    it('should render Cancel button', () => {
      renderPreview(true)

      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('should render HTML download button', () => {
      renderPreview(true)

      expect(screen.getByText('HTML')).toBeInTheDocument()
    })

    it('should render Download PDF button', () => {
      renderPreview(true)

      expect(screen.getByText('Download PDF')).toBeInTheDocument()
    })

    it('should call onOpenChange(false) when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByText('Cancel'))

      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('should generate and download PDF when Download PDF button is clicked', async () => {
      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByText('Download PDF'))

      await vi.waitFor(() => {
        expect(ReportGenerator.generatePDF).toHaveBeenCalledWith(
          mockReportData,
          expect.objectContaining({
            title: expect.any(String),
          }),
        )
        expect(downloadReport).toHaveBeenCalled()
      })
    })

    it('should generate and download HTML when HTML button is clicked', async () => {
      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByText('HTML'))

      await vi.waitFor(() => {
        expect(ReportGenerator.generateHTML).toHaveBeenCalledWith(
          mockReportData,
          expect.objectContaining({
            title: expect.any(String),
          }),
        )
        expect(downloadReport).toHaveBeenCalled()
      })
    })

    it('should show loading state while generating PDF', async () => {
      // Make generatePDF hang
      let resolvePdf: () => void
      ;(ReportGenerator.generatePDF as any).mockReturnValue(
        new Promise((resolve) => {
          resolvePdf = resolve
        }),
      )

      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByText('Download PDF'))

      // Should disable button while generating
      await vi.waitFor(() => {
        expect(screen.getByText('Download PDF').closest('button')).toHaveAttribute('disabled')
      })

      // Resolve to clean up
      resolvePdf!()
    })

    it('should disable download buttons while generating', async () => {
      let resolvePdf: () => void
      ;(ReportGenerator.generatePDF as any).mockReturnValue(
        new Promise((resolve) => {
          resolvePdf = resolve
        }),
      )

      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByText('Download PDF'))

      // While generating, buttons should be disabled
      await vi.waitFor(() => {
        const htmlButton = screen.getByText('HTML').closest('button')
        const pdfButton = screen.getByText('Download PDF').closest('button')
        expect(htmlButton).toHaveAttribute('disabled')
        expect(pdfButton).toHaveAttribute('disabled')
      })

      resolvePdf!()
    })

    it('should handle PDF generation error gracefully', async () => {
      const consoleError = vi.fn()
      const originalError = console.error
      console.error = consoleError
      ;(ReportGenerator.generatePDF as any).mockRejectedValue(new Error('PDF generation failed'))

      const user = userEvent.setup()
      renderPreview(true)

      await user.click(screen.getByText('Download PDF'))

      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })

      console.error = originalError
    })
  })

  describe('Default Options', () => {
    it('should use project name in default report title', () => {
      renderPreview(true, mockReportData, 'My App')

      expect(previewHTML).toHaveBeenCalledWith(
        mockReportData,
        expect.objectContaining({
          title: 'My App - Vulnerability Assessment Report',
          projectName: 'My App',
        }),
      )
    })

    it('should default project name to "Project" when not provided', () => {
      renderPreview(true, mockReportData)

      expect(previewHTML).toHaveBeenCalledWith(
        mockReportData,
        expect.objectContaining({
          projectName: 'Project',
          title: 'Project - Vulnerability Assessment Report',
        }),
      )
    })
  })
})
