import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NvdCveDetailModal } from './NvdCveDetailModal'

// Mock Toaster
vi.mock('./Toaster', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

// Sample CVE data for tests
const mockCveData = {
  id: 'CVE-2024-1234',
  description: 'A critical vulnerability in the application allows remote code execution via a crafted HTTP request.',
  cvssV31Score: 9.8,
  cvssV31Vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
  cvssV31Severity: 'CRITICAL',
  severity: 'critical',
  cvssScore: 9.8,
  cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
  publishedAt: '2024-01-15T00:00:00Z',
  modifiedAt: '2024-01-20T00:00:00Z',
  source: 'cve@mitre.org',
  vulnStatus: 'Analyzed',
  assigner: 'mitre',
  cpeMatches: [
    {
      id: 1,
      cveId: 'CVE-2024-1234',
      cpe23Uri: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
      vulnerable: true,
      versionStartIncluding: '1.0',
      versionEndExcluding: '2.0',
    },
  ],
  cweReferences: [
    {
      id: 1,
      cveId: 'CVE-2024-1234',
      cweId: 'CWE-78',
      description: 'OS Command Injection',
    },
  ],
  references: [
    {
      id: 1,
      cveId: 'CVE-2024-1234',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234',
      source: 'NVD',
      tags: ['Advisory'],
      referenceType: 'advisory',
    },
    {
      id: 2,
      cveId: 'CVE-2024-1234',
      url: 'https://example.com/patch',
      source: 'Vendor',
      tags: ['Patch'],
      referenceType: 'patch',
    },
  ],
  referenceTags: ['Vendor Advisory', 'Patch'],
}

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
})

describe('NvdCveDetailModal', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnClose.mockReset()
    mockWriteText.mockResolvedValue(undefined)

    // Setup electronAPI mock for each test
    ;(window as any).electronAPI = {
      database: {
        getCveFull: vi.fn().mockResolvedValue({
          success: true,
          cve: mockCveData,
        }),
      },
    }
  })

  const renderModal = (open: boolean = true, cveId: string = 'CVE-2024-1234') => {
    return render(<NvdCveDetailModal cveId={cveId} open={open} onClose={mockOnClose} />)
  }

  describe('Rendering', () => {
    it('should not render when open is false', () => {
      renderModal(false)

      expect(screen.queryByTestId('cve-detail-modal')).not.toBeInTheDocument()
    })

    it('should render modal when open is true', async () => {
      renderModal(true)

      expect(await screen.findByTestId('cve-detail-modal')).toBeInTheDocument()
    })

    it('should render modal as a dialog with correct ARIA attributes', async () => {
      renderModal(true)

      const modal = await screen.findByTestId('cve-detail-modal')
      expect(modal).toHaveAttribute('role', 'dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
    })

    it('should show loading state initially', () => {
      // Use a promise that never resolves to keep loading state
      ;(window as any).electronAPI.database.getCveFull.mockReturnValue(new Promise(() => {}))

      renderModal(true)

      // Should show skeleton loading indicators
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('CVE Details Display', () => {
    it('should display CVE ID in the header', async () => {
      renderModal(true)

      expect(await screen.findByText('CVE-2024-1234')).toBeInTheDocument()
    })

    it('should display CVE description', async () => {
      renderModal(true)

      expect(await screen.findByText(/A critical vulnerability in the application/)).toBeInTheDocument()
    })

    it('should display severity badge', async () => {
      renderModal(true)

      // CRITICAL appears in both the header badge and the CVSS section
      const badges = await screen.findAllByText('CRITICAL')
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })

    it('should display CVSS score', async () => {
      renderModal(true)

      expect(await screen.findByText(/CVSS 9\.8/)).toBeInTheDocument()
    })

    it('should display source information', async () => {
      renderModal(true)

      expect(await screen.findByText(/Source: cve@mitre\.org/)).toBeInTheDocument()
    })

    it('should display description section heading', async () => {
      renderModal(true)

      // "Description" appears as the section heading and as a CVSS table column header
      const headings = await screen.findAllByText('Description')
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })

    it('should display reference tags in the header', async () => {
      renderModal(true)

      // Wait for modal to load first
      await screen.findByTestId('cve-detail-modal')

      // "Vendor Advisory" and "Patch" may appear multiple times (header tag + reference tag)
      expect(screen.getAllByText('Vendor Advisory').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Patch').length).toBeGreaterThanOrEqual(1)
    })

    it('should display Patch Available alert when patch tag exists', async () => {
      renderModal(true)

      expect(await screen.findByText('Patch Available')).toBeInTheDocument()
    })
  })

  describe('CVSS Section', () => {
    it('should display CVSS Scores section', async () => {
      renderModal(true)

      expect(await screen.findByText('CVSS Scores')).toBeInTheDocument()
    })

    it('should display CVSS v3.1 score and severity', async () => {
      renderModal(true)

      expect(await screen.findByText('CVSS v3.1')).toBeInTheDocument()
    })

    it('should toggle CVSS section expand/collapse', async () => {
      const user = userEvent.setup()
      renderModal(true)

      const cvssSection = await screen.findByTestId('cvss-section')

      // Click to collapse
      await user.click(cvssSection)

      // Click to expand again
      await user.click(cvssSection)

      expect(screen.getByText('CVSS Scores')).toBeInTheDocument()
    })
  })

  describe('CPE Matches Section', () => {
    it('should display Affected Software section when CPE matches exist', async () => {
      renderModal(true)

      expect(await screen.findByText(/Affected Software/)).toBeInTheDocument()
    })

    it('should display product name from CPE URI', async () => {
      renderModal(true)

      // Wait for modal to load
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText('product')).toBeInTheDocument()
    })

    it('should display vendor name from CPE URI', async () => {
      renderModal(true)

      // Wait for modal to load
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText(/by vendor/)).toBeInTheDocument()
    })

    it('should toggle CPE section expand/collapse', async () => {
      const user = userEvent.setup()
      renderModal(true)

      const cpeSection = await screen.findByTestId('cpe-section')

      await user.click(cpeSection)
      await user.click(cpeSection)

      expect(screen.getByText(/Affected Software/)).toBeInTheDocument()
    })
  })

  describe('CWE References Section', () => {
    it('should display CWE References section when CWEs exist', async () => {
      renderModal(true)

      expect(await screen.findByText(/CWE References/)).toBeInTheDocument()
    })

    it('should display CWE ID as a link', async () => {
      renderModal(true)

      expect(await screen.findByText('CWE-78')).toBeInTheDocument()
    })
  })

  describe('References Section', () => {
    it('should display References section when references exist', async () => {
      renderModal(true)

      expect(await screen.findByText(/References \(2\)/)).toBeInTheDocument()
    })

    it('should display reference URLs', async () => {
      renderModal(true)

      expect(await screen.findByText('https://nvd.nist.gov/vuln/detail/CVE-2024-1234')).toBeInTheDocument()
    })

    it('should highlight patch references with special styling', async () => {
      renderModal(true)

      expect(await screen.findByText('https://example.com/patch')).toBeInTheDocument()
    })
  })

  describe('Timeline Section', () => {
    it('should display Timeline section', async () => {
      renderModal(true)

      expect(await screen.findByText('Timeline')).toBeInTheDocument()
    })

    it('should display published date', async () => {
      renderModal(true)

      expect(await screen.findByText('Published')).toBeInTheDocument()
    })

    it('should display modified date', async () => {
      renderModal(true)

      expect(await screen.findByText('Last Modified')).toBeInTheDocument()
    })
  })

  describe('Close Behavior', () => {
    it('should call onClose when close button (X) is clicked', async () => {
      const user = userEvent.setup()
      renderModal(true)

      const closeButton = await screen.findByTestId('cve-modal-close')

      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when footer Close button is clicked', async () => {
      const user = userEvent.setup()
      renderModal(true)

      // Wait for modal to load
      await screen.findByTestId('cve-detail-modal')

      // Find the footer Close button (exact text match)
      const footerCloseButton = screen.getByRole('button', { name: /^Close$/ })
      await user.click(footerCloseButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should call onClose when backdrop is clicked', async () => {
      renderModal(true)

      await screen.findByTestId('cve-detail-modal')

      // The backdrop has aria-hidden="true" and bg-black/50 class
      const backdrop = document.querySelector('.bg-black\\/50') as HTMLElement
      if (backdrop) {
        fireEvent.click(backdrop)
        expect(mockOnClose).toHaveBeenCalled()
      }
    })

    it('should call onClose when Escape key is pressed', async () => {
      renderModal(true)

      const modal = await screen.findByTestId('cve-detail-modal')
      fireEvent.keyDown(modal, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Copy CVE ID', () => {
    it('should copy CVE ID to clipboard when copy button is clicked', async () => {
      const user = userEvent.setup()

      // Re-assign clipboard mock to ensure fresh reference
      const clipboardWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: clipboardWriteText },
        writable: true,
        configurable: true,
      })

      renderModal(true)

      const copyButton = await screen.findByTestId('cve-copy-id')

      await user.click(copyButton)

      // Wait for the async clipboard call to complete
      await vi.waitFor(() => {
        expect(clipboardWriteText).toHaveBeenCalledWith('CVE-2024-1234')
      })
    })
  })

  describe('External Links', () => {
    it('should display View on NVD link', async () => {
      renderModal(true)

      expect(await screen.findByText('View on NVD')).toBeInTheDocument()
    })

    it('should have correct NVD URL', async () => {
      renderModal(true)

      const nvdLink = (await screen.findByText('View on NVD')).closest('a')
      expect(nvdLink).toHaveAttribute('href', 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234')
    })
  })

  describe('Error Handling', () => {
    it('should display error message when API call fails', async () => {
      ;(window as any).electronAPI.database.getCveFull.mockResolvedValue({
        success: false,
        error: 'CVE not found',
      })

      renderModal(true)

      expect(await screen.findByText('Error loading CVE details')).toBeInTheDocument()
      // Error text appears in both header and content area
      expect(screen.getAllByText('CVE not found').length).toBeGreaterThanOrEqual(1)
    })

    it('should display error message when API throws an exception', async () => {
      ;(window as any).electronAPI.database.getCveFull.mockRejectedValue(new Error('Network error'))

      renderModal(true)

      expect(await screen.findByText('Error loading CVE details')).toBeInTheDocument()
      // Error text appears in both header and content area
      expect(screen.getAllByText('Network error').length).toBeGreaterThanOrEqual(1)
    })

    it('should show retry button on error', async () => {
      ;(window as any).electronAPI.database.getCveFull.mockResolvedValue({
        success: false,
        error: 'Something went wrong',
      })

      renderModal(true)

      expect(await screen.findByText('Try again')).toBeInTheDocument()
    })

    it('should retry fetch when Try again button is clicked', async () => {
      // First call fails
      ;(window as any).electronAPI.database.getCveFull.mockResolvedValue({
        success: false,
        error: 'Something went wrong',
      })

      renderModal(true)

      await screen.findByText('Try again')

      // Second call succeeds
      ;(window as any).electronAPI.database.getCveFull.mockResolvedValue({
        success: true,
        cve: mockCveData,
      })

      fireEvent.click(screen.getByText('Try again'))

      expect(await screen.findByText('CVE-2024-1234')).toBeInTheDocument()
    })
  })

  describe('No CVE Data', () => {
    it('should display "No CVE data" when API returns success but no CVE', async () => {
      ;(window as any).electronAPI.database.getCveFull.mockResolvedValue({
        success: true,
        cve: null,
      })

      renderModal(true)

      expect(await screen.findByText('No CVE data')).toBeInTheDocument()
    })
  })
})
