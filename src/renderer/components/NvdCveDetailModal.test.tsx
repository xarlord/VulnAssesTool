import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getPlatform } from '@/lib/platform'
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

    // Configure platform mock for getCveFull
    const platform = getPlatform()
    vi.mocked(platform.database.getCveFull).mockResolvedValue({
      success: true,
      cve: mockCveData,
    })
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
      vi.mocked(getPlatform().database.getCveFull).mockReturnValue(new Promise(() => {}))

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
    // The dialog now has two buttons whose accessible name is exactly "Close": the
    // built-in Radix dismiss control (icon + sr-only "Close" text) and the footer's
    // text-only "Close" button. Disambiguate by presence of an icon.
    const getIconCloseButton = () => {
      const closeButtons = screen.getAllByRole('button', { name: 'Close' })
      const iconButton = closeButtons.find((btn) => btn.querySelector('svg'))
      if (!iconButton) throw new Error('Expected to find the built-in dialog close button')
      return iconButton
    }

    const getFooterCloseButton = () => {
      const closeButtons = screen.getAllByRole('button', { name: 'Close' })
      const footerButton = closeButtons.find((btn) => !btn.querySelector('svg'))
      if (!footerButton) throw new Error('Expected to find the footer close button')
      return footerButton
    }

    it('should call onClose when the built-in dialog close (X) button is clicked', async () => {
      const user = userEvent.setup()
      renderModal(true)

      await screen.findByTestId('cve-detail-modal')

      await user.click(getIconCloseButton())

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when footer Close button is clicked', async () => {
      const user = userEvent.setup()
      renderModal(true)

      // Wait for modal to load
      await screen.findByTestId('cve-detail-modal')

      await user.click(getFooterCloseButton())

      expect(mockOnClose).toHaveBeenCalled()
    })

    // Radix's Dialog no longer exposes a clickable backdrop element (the overlay
    // dismisses via internal outside-pointer-down handling, which is unreliable to
    // simulate under jsdom); Escape exercises the same onOpenChange dismiss path and
    // replaces the old "click backdrop" coverage.
    it('should call onClose when Escape key is pressed', async () => {
      renderModal(true)

      await screen.findByTestId('cve-detail-modal')
      fireEvent.keyDown(document, { key: 'Escape' })

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
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: false,
        error: 'CVE not found',
      })

      renderModal(true)

      expect(await screen.findByText('Error loading CVE details')).toBeInTheDocument()
      // Error text appears in both header and content area
      expect(screen.getAllByText('CVE not found').length).toBeGreaterThanOrEqual(1)
    })

    it('should display error message when API throws an exception', async () => {
      vi.mocked(getPlatform().database.getCveFull).mockRejectedValue(new Error('Network error'))

      renderModal(true)

      expect(await screen.findByText('Error loading CVE details')).toBeInTheDocument()
      // Error text appears in both header and content area
      expect(screen.getAllByText('Network error').length).toBeGreaterThanOrEqual(1)
    })

    it('should show retry button on error', async () => {
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: false,
        error: 'Something went wrong',
      })

      renderModal(true)

      expect(await screen.findByText('Try again')).toBeInTheDocument()
    })

    it('should retry fetch when Try again button is clicked', async () => {
      // First call fails
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: false,
        error: 'Something went wrong',
      })

      renderModal(true)

      await screen.findByText('Try again')

      // Second call succeeds
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: true,
        cve: mockCveData,
      })

      fireEvent.click(screen.getByText('Try again'))

      expect(await screen.findByText('CVE-2024-1234')).toBeInTheDocument()
    })
  })

  describe('No CVE Data', () => {
    it('should display "No CVE data" when API returns success but no CVE', async () => {
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: true,
        cve: null,
      })

      renderModal(true)

      expect(await screen.findByText('No CVE data')).toBeInTheDocument()
    })
  })

  describe('Non-vulnerable CPE Matches', () => {
    it('should display "Not Affected" section for non-vulnerable CPE matches', async () => {
      const dataWithNonVuln = {
        ...mockCveData,
        cpeMatches: [
          {
            id: 1,
            cveId: 'CVE-2024-1234',
            cpe23Uri: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
            vulnerable: true,
            versionStartIncluding: '1.0',
            versionEndExcluding: '2.0',
          },
          { id: 2, cveId: 'CVE-2024-1234', cpe23Uri: 'cpe:2.3:a:vendor:product:3.0:*:*:*:*:*:*:*', vulnerable: false },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: dataWithNonVuln })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText('Not Affected (Fixed Versions)')).toBeInTheDocument()
      expect(screen.getByText(/Version 3\.0 is not affected/)).toBeInTheDocument()
    })
  })

  describe('CPE Version Range Details', () => {
    it('should display versionStartExcluding in CPE match', async () => {
      const data = {
        ...mockCveData,
        cpeMatches: [
          {
            id: 1,
            cveId: 'CVE-2024-1234',
            cpe23Uri: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
            vulnerable: true,
            versionStartExcluding: '1.0',
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText(/From \(>\):/)).toBeInTheDocument()
      expect(screen.getByText('1.0')).toBeInTheDocument()
    })

    it('should display versionEndIncluding in CPE match', async () => {
      const data = {
        ...mockCveData,
        cpeMatches: [
          {
            id: 1,
            cveId: 'CVE-2024-1234',
            cpe23Uri: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
            vulnerable: true,
            versionEndIncluding: '2.5',
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText(/Up to \(≤\):/)).toBeInTheDocument()
      expect(screen.getByText('2.5')).toBeInTheDocument()
    })

    it('should display all version range fields together', async () => {
      const data = {
        ...mockCveData,
        cpeMatches: [
          {
            id: 1,
            cveId: 'CVE-2024-1234',
            cpe23Uri: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
            vulnerable: true,
            versionStartIncluding: '1.0',
            versionStartExcluding: '1.5',
            versionEndIncluding: '3.0',
            versionEndExcluding: '3.5',
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText(/From \(≥\):/)).toBeInTheDocument()
      expect(screen.getByText(/From \(>\):/)).toBeInTheDocument()
      expect(screen.getByText(/Up to \(≤\):/)).toBeInTheDocument()
      expect(screen.getByText(/Up to \(<\):/)).toBeInTheDocument()
    })
  })

  describe('CWE Section Toggle', () => {
    it('should collapse and expand CWE section on toggle click', async () => {
      const user = userEvent.setup()
      renderModal(true)

      const cweButton = await screen.findByTestId('cwe-section')
      const cweContent = cweButton.nextElementSibling!
      expect(cweContent.className).toContain('max-h-[500px]')

      await user.click(cweButton)
      expect(cweContent.className).toContain('max-h-0')

      await user.click(cweButton)
      expect(cweContent.className).toContain('max-h-[500px]')
    })
  })

  describe('References Section Toggle', () => {
    it('should collapse and expand References section on toggle click', async () => {
      const user = userEvent.setup()
      renderModal(true)

      const refsButton = await screen.findByTestId('references-section')
      const refsContent = refsButton.nextElementSibling!
      expect(refsContent.className).toContain('max-h-[2000px]')

      await user.click(refsButton)
      expect(refsContent.className).toContain('max-h-0')

      await user.click(refsButton)
      expect(refsContent.className).toContain('max-h-[2000px]')
    })
  })

  describe('Copy Error Handling', () => {
    it('should show error toast when clipboard write fails', async () => {
      const user = userEvent.setup()
      const { toast } = await import('./Toaster')

      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        writable: true,
        configurable: true,
      })

      renderModal(true)
      const copyButton = await screen.findByTestId('cve-copy-id')
      await user.click(copyButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard')
      })
    })
  })

  describe('Assigner and VulnStatus Display', () => {
    it('should display assigner when present', async () => {
      renderModal(true)
      await screen.findByTestId('cve-detail-modal')
      expect(screen.getByText(/Assigner: mitre/)).toBeInTheDocument()
    })

    it('should display vuln status when present', async () => {
      renderModal(true)
      await screen.findByTestId('cve-detail-modal')
      expect(screen.getByText(/Status: Analyzed/)).toBeInTheDocument()
    })
  })

  describe('Multiple CVSS Sources', () => {
    it('should display multi-source CVSS summary table when multiple metrics exist', async () => {
      const dataWithMultipleMetrics = {
        ...mockCveData,
        cvssMetrics: [
          {
            source: 'nvd@nist.gov',
            type: 'Primary',
            version: '3.1' as const,
            score: 9.8,
            severity: 'CRITICAL',
            vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          },
          {
            source: 'msrc@microsoft.com',
            type: 'Secondary',
            version: '3.1' as const,
            score: 8.5,
            severity: 'HIGH',
            vector: 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:C/C:H/I:H/A:H',
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: true,
        cve: dataWithMultipleMetrics,
      })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // Multi-source summary heading
      expect(screen.getByText('All CVSS Scores (Multiple Sources)')).toBeInTheDocument()
      // Source names
      expect(screen.getByText('nvd@nist.gov')).toBeInTheDocument()
      expect(screen.getByText('msrc@microsoft.com')).toBeInTheDocument()
      // Type badges — Primary uses a distinct style, Secondary uses default
      expect(screen.getByText('Primary')).toBeInTheDocument()
      expect(screen.getByText('Secondary')).toBeInTheDocument()
      // Version column (both metrics are v3.1)
      expect(screen.getAllByText('v3.1').length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('CVSS v3.0 Section', () => {
    it('should display CVSS v3.0 score and vector table', async () => {
      const dataWithV30 = {
        ...mockCveData,
        cvssV31Score: undefined,
        cvssV31Vector: undefined,
        cvssV31Severity: undefined,
        cvssV30Score: 7.5,
        cvssV30Vector: 'CVSS:3.0/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H',
        cvssV30Severity: 'HIGH',
        referenceTags: [] as string[],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: true,
        cve: dataWithV30,
      })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText('CVSS v3.0')).toBeInTheDocument()
      // v3-specific metric names (v2 uses different names like "Access Vector")
      expect(screen.getByText('Attack Vector')).toBeInTheDocument()
      expect(screen.getByText('Attack Complexity')).toBeInTheDocument()
      expect(screen.getByText('Privileges Required')).toBeInTheDocument()
    })
  })

  describe('CVSS v2.0 Section', () => {
    it('should display CVSS v2.0 score and vector table', async () => {
      const dataWithV2 = {
        ...mockCveData,
        cvssV31Score: undefined,
        cvssV31Vector: undefined,
        cvssV31Severity: undefined,
        cvssV30Score: undefined,
        cvssV30Vector: undefined,
        cvssV30Severity: undefined,
        cvssV2Score: 6.8,
        cvssV2Vector: 'CVSS:2.0/AV:N/AC:L/Au:N/C:C/I:C/A:C',
        cvssV2Severity: 'HIGH',
        referenceTags: [] as string[],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: true,
        cve: dataWithV2,
      })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      expect(screen.getByText('CVSS v2.0')).toBeInTheDocument()
      // v2-specific metric names (v3 uses different names like "Attack Vector")
      expect(screen.getByText('Access Vector')).toBeInTheDocument()
      expect(screen.getByText('Authentication')).toBeInTheDocument()
      expect(screen.getByText('Access Complexity')).toBeInTheDocument()
    })
  })

  describe('CVSS Vector Parsing Edge Cases', () => {
    it('should recognize legacy CVSS v2 vectors that omit the "CVSS:2.0" prefix (older NVD records)', async () => {
      const data = {
        ...mockCveData,
        cvssV31Score: undefined,
        cvssV31Vector: undefined,
        cvssV31Severity: undefined,
        cvssV2Score: 6.8,
        cvssV2Vector: 'AV:N/AC:L/Au:N/C:C/I:C/A:C',
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // "Authentication" only exists in the CVSS v2 metric map. If a bare (unprefixed)
      // v2 vector were misdetected as v3, 'Au' would match nothing and this label
      // — along with the whole Authentication row — would silently disappear.
      expect(screen.getByText('Authentication')).toBeInTheDocument()
    })

    it('should drop unrecognized metric codes and fall back to the raw code for unrecognized values', async () => {
      const data = {
        ...mockCveData,
        cvssV31Vector: 'CVSS:3.1/AV:Z/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:H',
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // 'E' (Exploit Code Maturity, a temporal-metric code this parser doesn't model)
      // must be skipped rather than rendered as a garbled row.
      expect(screen.queryByText('E')).not.toBeInTheDocument()
      // 'Z' isn't a valid Attack Vector value — the parser must show the raw code
      // rather than crashing or silently hiding the row.
      const avRow = screen.getByText('AV').closest('tr')
      expect(avRow).toHaveTextContent('Z')
    })
  })

  describe('Fetch Error Fallback Messages', () => {
    it('should show a generic message when the API reports failure without an error string', async () => {
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({
        success: false,
        cve: null,
      })

      renderModal(true)

      // A backend that reports failure without a message must not leave users staring
      // at a blank error area. (Text appears in both the header and content area, as
      // in the existing "API call fails" test above.)
      const messages = await screen.findAllByText('Failed to fetch CVE details')
      expect(messages.length).toBeGreaterThanOrEqual(1)
    })

    it('should show a generic message when a non-Error value is thrown', async () => {
      vi.mocked(getPlatform().database.getCveFull).mockRejectedValue('boom')

      renderModal(true)

      // Rejections aren't guaranteed to be Error instances (e.g. a thrown string) —
      // reading `.message` off a non-Error would be unsafe, so this must fall back
      // to a safe generic message instead.
      const messages = await screen.findAllByText('An error occurred')
      expect(messages.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Severity Fallback Handling', () => {
    it('should fall back to the neutral NONE token for an unrecognized severity value instead of breaking', async () => {
      const data = { ...mockCveData, severity: 'UNKNOWN' }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)

      // A severity outside the known set must still degrade gracefully rather than render an
      // undefined CSS class. It now resolves to the neutral `severity-none` token rather than
      // LOW's green: 'none' is the least-alarming choice and honestly represents "unknown",
      // and it matches how Search.tsx normalizes these same NVD-sourced strings. The second
      // assertion is the point of the change — the old raw `text-green-600`/`bg-green-100`
      // pair measured 3.00:1 in light mode, so no raw palette class may come back here; only
      // the token, which globals.css keeps WCAG-AA in both themes (see severity.test.ts).
      const badge = await screen.findByText('UNKNOWN')
      expect(badge.className).toContain('severity-none')
      expect(badge.className).not.toMatch(/(text|bg)-(red|orange|amber|yellow|green)-\d{2,3}/)
    })

    it('should fall back to the overall CVE severity when a per-version severity is missing', async () => {
      const data = {
        ...mockCveData,
        cvssV31Score: 9.8,
        cvssV31Vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        cvssV31Severity: undefined,
        cvssV30Score: 9.0,
        cvssV30Vector: 'CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        cvssV30Severity: undefined,
        cvssV2Score: 7.5,
        cvssV2Vector: 'CVSS:2.0/AV:N/AC:L/Au:N/C:P/I:P/A:P',
        cvssV2Severity: undefined,
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // Older/partial NVD records can carry a per-version score without a matching
      // per-version severity label. Each of the three CVSS blocks must still show a
      // sensible severity by falling back to the CVE's overall severity.
      expect(screen.getByText('CVSS v3.1')).toBeInTheDocument()
      expect(screen.getByText('CVSS v3.0')).toBeInTheDocument()
      expect(screen.getByText('CVSS v2.0')).toBeInTheDocument()
      expect(screen.getAllByText('critical')).toHaveLength(3)
    })
  })

  describe('CVSS Section Visible via Supplementary Metrics Only', () => {
    it('should show the CVSS Scores section when only cvssMetrics is present (no primary score)', async () => {
      const data = {
        ...mockCveData,
        cvssV31Score: undefined,
        cvssV31Vector: undefined,
        cvssV31Severity: undefined,
        cvssMetrics: [
          {
            source: 'nvd@nist.gov',
            type: 'Primary',
            version: '3.1' as const,
            score: 9.8,
            severity: 'CRITICAL',
            vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          },
          {
            source: 'cna@vendor.com',
            type: 'Secondary',
            version: '3.1' as const,
            score: 8.1,
            severity: 'HIGH',
            vector: 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:C/C:H/I:H/A:H',
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // With no cvssV31/V30/V2 score, the section's visibility depends entirely on
      // cvssMetrics — a vendor-supplied score must not be hidden just because NVD's
      // own primary score is absent.
      expect(screen.getByText('CVSS Scores')).toBeInTheDocument()
      expect(screen.getByText('All CVSS Scores (Multiple Sources)')).toBeInTheDocument()
      expect(screen.getByText('cna@vendor.com')).toBeInTheDocument()
      expect(screen.queryByText('CVSS v3.1')).not.toBeInTheDocument()
    })
  })

  describe('CPE Match Data Edge Cases', () => {
    it('should describe an unbounded-below range using versionEndExcluding alone', async () => {
      const data = {
        ...mockCveData,
        cpeMatches: [
          {
            id: 1,
            cveId: 'CVE-2024-1234',
            cpe23Uri: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*:*',
            vulnerable: true,
            versionEndExcluding: '4.0',
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // A match can specify only an upper bound with no lower bound at all — this must
      // still be recognized as a version range, not treated as "all versions".
      expect(screen.getByText(/up to 4\.0 \(exclusive\)/)).toBeInTheDocument()
      expect(screen.getByText(/Up to \(<\):/)).toBeInTheDocument()
    })

    it('should show "Unknown Product" for a malformed CPE URI instead of crashing', async () => {
      const data = {
        ...mockCveData,
        cpeMatches: [{ id: 1, cveId: 'CVE-2024-1234', cpe23Uri: 'cpe:2.3:a', vulnerable: true }],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // Real feeds occasionally carry truncated/malformed CPE strings — the modal must
      // degrade to a labeled placeholder rather than rendering blank or throwing.
      expect(screen.getByText('Unknown Product')).toBeInTheDocument()
    })

    it('should display "*" as the version when a well-formed CPE URI has an empty version field', async () => {
      const data = {
        ...mockCveData,
        cpeMatches: [
          {
            id: 1,
            cveId: 'CVE-2024-1234',
            cpe23Uri: 'cpe:2.3:a:vendor:product::*:*:*:*:*:*:*',
            vulnerable: true,
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // No version range bounds and an empty version segment: the match still needs a
      // non-blank display value, so it must fall back to the CPE wildcard "*".
      expect(screen.getByText('Version *')).toBeInTheDocument()
    })
  })

  describe('CWE Reference Edge Cases', () => {
    it('should link non-numeric CWE ids (e.g. NVD-CWE-noinfo) without extracting a bogus number', async () => {
      const data = {
        ...mockCveData,
        cweReferences: [{ id: 1, cveId: 'CVE-2024-1234', cweId: 'NVD-CWE-noinfo' }],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // NVD uses non-numeric sentinel CWE ids when no mapping is available. The regex
      // that extracts a MITRE definition number finds nothing, so the '' fallback
      // must be used instead of throwing on a null match.
      const cweLink = screen.getByText('NVD-CWE-noinfo').closest('a')
      expect(cweLink).toHaveAttribute('href', 'https://cwe.mitre.org/data/definitions/.html')
    })
  })

  describe('Reference Tag Collection Edge Cases', () => {
    it('should render a reference with neither referenceType nor tags without a tag row', async () => {
      const data = {
        ...mockCveData,
        references: [{ id: 1, cveId: 'CVE-2024-1234', url: 'https://example.com/no-tags' }],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)

      // Some references carry only a bare URL. Tag collection must handle a missing
      // referenceType and a missing/empty tags array without pushing anything, so no
      // tag pill row should render for this reference.
      const bareLink = (await screen.findByText('https://example.com/no-tags')).closest('a')
      expect(bareLink?.querySelector('span')).toBeNull()
    })

    it('should style an unrecognized reference tag with the neutral default instead of a known-type color', async () => {
      const data = {
        ...mockCveData,
        references: [
          {
            id: 1,
            cveId: 'CVE-2024-1234',
            url: 'https://example.com/release-notes',
            referenceType: 'Release Notes',
          },
        ],
      }
      vi.mocked(getPlatform().database.getCveFull).mockResolvedValue({ success: true, cve: data })

      renderModal(true)
      await screen.findByTestId('cve-detail-modal')

      // "Release Notes" (a real NVD reference tag) doesn't contain 'patch', 'vendor',
      // 'advisory', or 'exploit' — it must fall back to the neutral default style
      // rather than being miscolored or crashing on an undefined style lookup.
      const tagPill = screen.getByText('Release Notes')
      expect(tagPill.className).toContain('bg-muted')
      expect(tagPill.className).toContain('text-muted-foreground')
    })
  })
})
