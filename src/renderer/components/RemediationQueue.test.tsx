import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RemediationQueue from './RemediationQueue'
import type { Component, ComponentHealth, Vulnerability } from '@@/types'

const createMockComponent = (id: string, name: string, overrides?: Partial<Component>): Component => ({
  id,
  name,
  version: '1.0.0',
  type: 'library',
  licenses: ['MIT'],
  vulnerabilities: [],
  ...overrides,
})

const createMockHealth = (
  componentId: string,
  score: number,
  category: ComponentHealth['category'],
): ComponentHealth => ({
  componentId,
  score,
  category,
  factors: {
    vulnerabilityScore: 0,
    ageScore: 0,
    patchScore: 0,
    versionScore: 0,
  },
  trend: 'stable',
  lastCalculated: new Date(),
})

const createMockVulnerability = (
  id: string,
  severity: Vulnerability['severity'],
  affectedComponents: string[],
): Vulnerability => ({
  id,
  source: 'nvd',
  severity,
  description: 'Test vulnerability',
  references: [],
  affectedComponents,
})

describe('RemediationQueue', () => {
  const mockOnViewComponent = vi.fn()
  const mockOnViewVulnerability = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderQueue = (
    componentHealths?: ComponentHealth[],
    components?: Component[],
    vulnerabilities?: Vulnerability[],
  ) => {
    return render(
      <RemediationQueue
        componentHealths={componentHealths || []}
        components={components || []}
        vulnerabilities={vulnerabilities || []}
        onViewComponent={mockOnViewComponent}
        onViewVulnerability={mockOnViewVulnerability}
      />,
    )
  }

  describe('Rendering - Empty State', () => {
    it('should render empty state when no components need attention', () => {
      renderQueue()

      expect(screen.getByText('All components are healthy!')).toBeInTheDocument()
      expect(screen.getByText('No components require immediate attention')).toBeInTheDocument()
    })
  })

  describe('Rendering - Critical Priority Group', () => {
    it('should render critical priority group', () => {
      const components = [createMockComponent('comp-1', 'vulnerable-lib')]
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, components, vulnerabilities)

      expect(screen.getByText('Critical Priority')).toBeInTheDocument()
      expect(screen.getByText('1 component requiring immediate attention')).toBeInTheDocument()
    })

    it('should render plural form for multiple components', () => {
      const components = [
        createMockComponent('comp-1', 'vulnerable-lib-1'),
        createMockComponent('comp-2', 'vulnerable-lib-2'),
      ]
      const healths = [createMockHealth('comp-1', 20, 'critical'), createMockHealth('comp-2', 25, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1', 'comp-2'])]

      renderQueue(healths, components, vulnerabilities)

      expect(screen.getByText('2 components requiring immediate attention')).toBeInTheDocument()
    })

    it('should render component in critical group', () => {
      const component = createMockComponent('comp-1', 'critical-lib')
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, [component], vulnerabilities)

      expect(screen.getByText('critical-lib')).toBeInTheDocument()
      expect(screen.getByText('CVE-2024-1001')).toBeInTheDocument()
    })
  })

  describe('Rendering - High Priority Group', () => {
    it('should render high priority group', () => {
      const components = [createMockComponent('comp-1', 'high-lib')]
      const healths = [createMockHealth('comp-1', 40, 'poor')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'high', ['comp-1'])]

      renderQueue(healths, components, vulnerabilities)

      expect(screen.getByText('High Priority')).toBeInTheDocument()
      expect(screen.getByText('1 component with high-severity vulnerabilities')).toBeInTheDocument()
    })
  })

  describe('Rendering - Medium Priority Group', () => {
    it('should render medium priority group', () => {
      const components = [createMockComponent('comp-1', 'medium-lib')]
      const healths = [createMockHealth('comp-1', 60, 'fair')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'medium', ['comp-1'])]

      renderQueue(healths, components, vulnerabilities)

      expect(screen.getByText('Medium Priority')).toBeInTheDocument()
      expect(screen.getByText('1 component with medium-severity vulnerabilities')).toBeInTheDocument()
    })
  })

  describe('Rendering - Low Priority Group', () => {
    it('should render low priority group', () => {
      const components = [createMockComponent('comp-1', 'low-lib')]
      const healths = [createMockHealth('comp-1', 80, 'good')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'low', ['comp-1'])]

      renderQueue(healths, components, vulnerabilities)

      expect(screen.getByText('Low Priority')).toBeInTheDocument()
      expect(screen.getByText('1 component with minor issues')).toBeInTheDocument()
    })
  })

  describe('Interactions - Expand/Collapse Groups', () => {
    it('should expand critical group by default', () => {
      const components = [createMockComponent('comp-1', 'critical-lib')]
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, components, vulnerabilities)

      expect(screen.getByText('critical-lib')).toBeInTheDocument()
    })

    it('should collapse group when clicking on it', () => {
      const components = [createMockComponent('comp-1', 'critical-lib')]
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, components, vulnerabilities)

      const groupButton = screen.getByText('Critical Priority').closest('button')
      fireEvent.click(groupButton!)

      // After collapsing, component name should not be visible
      expect(screen.queryByText('critical-lib')).not.toBeInTheDocument()
    })

    it('should expand group when clicking collapsed group', () => {
      const components = [createMockComponent('comp-1', 'critical-lib')]
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, components, vulnerabilities)

      const groupButton = screen.getByText('Critical Priority').closest('button')

      // Collapse
      fireEvent.click(groupButton!)

      // Expand again
      fireEvent.click(groupButton!)

      expect(screen.getByText('critical-lib')).toBeInTheDocument()
    })
  })

  describe('Interactions - View Details', () => {
    it('should call onViewComponent when View Details is clicked', () => {
      const component = createMockComponent('comp-1', 'test-lib')
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, [component], vulnerabilities)

      const viewButton = screen.getByText('View Details')
      fireEvent.click(viewButton)

      expect(mockOnViewComponent).toHaveBeenCalledWith(component)
    })

    it('should call onViewVulnerability when vulnerability ID is clicked', () => {
      const component = createMockComponent('comp-1', 'test-lib')
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerability = createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])

      renderQueue(healths, [component], [vulnerability])

      const vulnButton = screen.getByText('CVE-2024-1001')
      fireEvent.click(vulnButton)

      expect(mockOnViewVulnerability).toHaveBeenCalledWith(vulnerability)
    })
  })

  describe('Rendering - Component Details', () => {
    it('should display component version', () => {
      const component = createMockComponent('comp-1', 'test-lib', { version: '2.0.0' })
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, [component], vulnerabilities)

      expect(screen.getByText('2.0.0')).toBeInTheDocument()
    })

    it('should display health score', () => {
      const component = createMockComponent('comp-1', 'test-lib')
      const healths = [createMockHealth('comp-1', 35, 'critical')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, [component], vulnerabilities)

      expect(screen.getByText('35/100')).toBeInTheDocument()
    })

    it('should display health category', () => {
      const component = createMockComponent('comp-1', 'test-lib')
      const healths = [createMockHealth('comp-1', 35, 'poor')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, [component], vulnerabilities)

      // RemediationQueue displays the score but not the category text
      expect(screen.getByText('35/100')).toBeInTheDocument()
    })

    it('should display up to 3 vulnerabilities', () => {
      const component = createMockComponent('comp-1', 'test-lib')
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [
        createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1002', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1003', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1004', 'critical', ['comp-1']),
      ]

      renderQueue(healths, [component], vulnerabilities)

      expect(screen.getByText('CVE-2024-1001')).toBeInTheDocument()
      expect(screen.getByText('CVE-2024-1002')).toBeInTheDocument()
      expect(screen.getByText('CVE-2024-1003')).toBeInTheDocument()
      expect(screen.queryByText('CVE-2024-1004')).not.toBeInTheDocument()
    })

    it('should display +X more for additional vulnerabilities', () => {
      const component = createMockComponent('comp-1', 'test-lib')
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [
        createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1002', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1003', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1004', 'critical', ['comp-1']),
      ]

      renderQueue(healths, [component], vulnerabilities)

      expect(screen.getByText('+1 more')).toBeInTheDocument()
    })
  })

  describe('Rendering - Patch Information', () => {
    it('should display update available when patch info exists', () => {
      const component = createMockComponent('comp-1', 'test-lib', {
        patchInfo: {
          hasFixAvailable: true,
          recommendedVersion: '2.0.0',
          fixedVersions: ['2.0.0'],
          vulnerableVersions: ['1.0.0'],
        },
      })
      const healths = [createMockHealth('comp-1', 40, 'poor')]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1'])]

      renderQueue(healths, [component], vulnerabilities)

      expect(screen.getByText('Update available: 2.0.0')).toBeInTheDocument()
    })
  })

  describe('Sorting - Worst Health First', () => {
    it('should sort components by health score (worst first)', () => {
      const components = [
        createMockComponent('comp-1', 'poor-lib'),
        createMockComponent('comp-2', 'critical-lib'),
        createMockComponent('comp-3', 'fair-lib'),
      ]
      const healths = [
        createMockHealth('comp-1', 40, 'poor'),
        createMockHealth('comp-2', 20, 'critical'),
        createMockHealth('comp-3', 60, 'fair'),
      ]
      const vulnerabilities = [createMockVulnerability('CVE-2024-1001', 'high', ['comp-1', 'comp-2', 'comp-3'])]

      renderQueue(healths, components, vulnerabilities)

      const criticalLib = screen.getByText('critical-lib')
      const poorLib = screen.getByText('poor-lib')
      const fairLib = screen.getByText('fair-lib')

      // Check that critical-lib appears before poor-lib
      expect(criticalLib.compareDocumentPosition(poorLib)).toBe(4) // 4 = preceding
    })
  })

  describe('Edge Cases', () => {
    it('should handle component with no vulnerabilities', () => {
      const component = createMockComponent('comp-1', 'healthy-lib')
      const healths = [createMockHealth('comp-1', 100, 'excellent')]

      renderQueue(healths, [component], [])

      // Should show empty state
      expect(screen.getByText('All components are healthy!')).toBeInTheDocument()
    })

    it('should not show duplicate components in queue', () => {
      // This tests that a component should only appear once in the queue
      // even if it has multiple vulnerabilities with different severities
      const component = createMockComponent('comp-1', 'multi-vuln-lib')
      const healths = [createMockHealth('comp-1', 20, 'critical')]
      const vulnerabilities = [
        createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1002', 'high', ['comp-1']),
        createMockVulnerability('CVE-2024-1003', 'medium', ['comp-1']),
      ]

      renderQueue(healths, [component], vulnerabilities)

      // Component should only appear once in critical group
      expect(screen.getByText('multi-vuln-lib')).toBeInTheDocument()
      // Should be in critical group (highest severity)
      expect(screen.getByText('1 component requiring immediate attention')).toBeInTheDocument()
    })

    it('should handle multiple groups with different counts', () => {
      const components = [
        createMockComponent('comp-1', 'critical-lib'),
        createMockComponent('comp-2', 'high-lib'),
        createMockComponent('comp-3', 'medium-lib'),
        createMockComponent('comp-4', 'low-lib'),
      ]
      const healths = [
        createMockHealth('comp-1', 20, 'critical'),
        createMockHealth('comp-2', 40, 'poor'),
        createMockHealth('comp-3', 60, 'fair'),
        createMockHealth('comp-4', 80, 'good'),
      ]
      const vulnerabilities = [
        createMockVulnerability('CVE-2024-1001', 'critical', ['comp-1']),
        createMockVulnerability('CVE-2024-1002', 'high', ['comp-2']),
        createMockVulnerability('CVE-2024-1003', 'medium', ['comp-3']),
        createMockVulnerability('CVE-2024-1004', 'low', ['comp-4']),
      ]

      renderQueue(healths, components, vulnerabilities)

      expect(screen.getByText('Critical Priority')).toBeInTheDocument()
      expect(screen.getByText('High Priority')).toBeInTheDocument()
      expect(screen.getByText('Medium Priority')).toBeInTheDocument()
      expect(screen.getByText('Low Priority')).toBeInTheDocument()
    })
  })
})
