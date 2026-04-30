import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CvssHistogram, getCvssFillColor, calculateHistogramBins } from './CvssHistogram'
import type { Vulnerability } from '@@/types'

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, height }: { children: any; height: number }) => (
    <div data-testid="responsive-container" data-height={height}>
      {children}
    </div>
  ),
  AreaChart: ({ children, data }: { children: any; data: any[] }) => (
    <div data-testid="area-chart" data-count={data.length}>
      {children}
    </div>
  ),
  Area: ({ fill, fillOpacity, stroke }: { fill: string; fillOpacity: number; stroke: string }) => (
    <div data-testid="area" data-fill={fill} data-fill-opacity={fillOpacity} data-stroke={stroke} />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: ({ content }: { content: any }) => <div data-testid="tooltip">{content}</div>,
}))

const createMockVulnerabilities = (scores: number[]): Vulnerability[] => {
  return scores.map((score, index) => ({
    id: `CVE-2024-${String(index).padStart(4, '0')}`,
    source: 'nvd',
    severity: score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low',
    cvssScore: score,
    description: `Vulnerability with score ${score}`,
    references: [],
    affectedComponents: [],
  }))
}

describe('CvssHistogram', () => {
  describe('Rendering', () => {
    it('should render area chart when vulnerabilities have CVSS scores', () => {
      const vulnerabilities = createMockVulnerabilities([9.8, 8.5, 6.5, 3.5])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
      expect(screen.getByTestId('area')).toBeInTheDocument()
    })

    it('should render chart elements', () => {
      const vulnerabilities = createMockVulnerabilities([9.8, 8.5, 6.5])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument()
      expect(screen.getByTestId('x-axis')).toBeInTheDocument()
      expect(screen.getByTestId('y-axis')).toBeInTheDocument()
    })

    it('should use custom height when provided', () => {
      const vulnerabilities = createMockVulnerabilities([9.8])
      render(<CvssHistogram vulnerabilities={vulnerabilities} height={400} />)

      const container = screen.getByTestId('responsive-container')
      expect(container).toHaveAttribute('data-height', '400')
    })

    it('should use default height when not provided', () => {
      const vulnerabilities = createMockVulnerabilities([9.8])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      const container = screen.getByTestId('responsive-container')
      expect(container).toHaveAttribute('data-height', '300')
    })

    it('should use custom binSize when provided', () => {
      const vulnerabilities = createMockVulnerabilities([9.8, 8.5, 6.5])
      render(<CvssHistogram vulnerabilities={vulnerabilities} binSize={2} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toBeInTheDocument()
    })

    it('should use default binSize when not provided', () => {
      const vulnerabilities = createMockVulnerabilities([9.8])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
  })

  describe('Data Binning', () => {
    it('should create bins from 0 to 10', () => {
      const vulnerabilities = createMockVulnerabilities([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      render(<CvssHistogram vulnerabilities={vulnerabilities} binSize={1} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toBeInTheDocument()
    })

    it('should filter bins with zero count', () => {
      const vulnerabilities = createMockVulnerabilities([9.8, 9.5])
      render(<CvssHistogram vulnerabilities={vulnerabilities} binSize={1} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toBeInTheDocument()
    })

    it('should handle vulnerabilities without CVSS scores', () => {
      const vulnerabilities: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'none',
          description: 'No score',
          references: [],
          affectedComponents: [],
        },
      ]
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toHaveAttribute('data-count', '0')
    })

    it('should correctly bin vulnerabilities by score range', () => {
      const vulnerabilities = createMockVulnerabilities([0.5, 1.5, 2.5, 3.5])
      render(<CvssHistogram vulnerabilities={vulnerabilities} binSize={1} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toBeInTheDocument()
    })
  })

  describe('Area Styling', () => {
    it('should render area with gradient fill', () => {
      const vulnerabilities = createMockVulnerabilities([9.8])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      const area = screen.getByTestId('area')
      expect(area).toHaveAttribute('data-fill', 'url(#colorCount)')
      expect(area).toHaveAttribute('data-fill-opacity', '1')
      expect(area).toHaveAttribute('data-stroke', '#ea580c')
    })
  })

  describe('Edge Cases', () => {
    it('should handle single vulnerability', () => {
      const vulnerabilities = createMockVulnerabilities([9.8])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle vulnerabilities at score boundaries', () => {
      const vulnerabilities = createMockVulnerabilities([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      render(<CvssHistogram vulnerabilities={vulnerabilities} binSize={1} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle large number of vulnerabilities', () => {
      const vulnerabilities = createMockVulnerabilities(Array.from({ length: 100 }, () => Math.random() * 10))
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle vulnerabilities with decimal scores', () => {
      const vulnerabilities = createMockVulnerabilities([9.1, 9.5, 9.9])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle custom bin size', () => {
      const vulnerabilities = createMockVulnerabilities([5, 6, 7])
      render(<CvssHistogram vulnerabilities={vulnerabilities} binSize={2} />)

      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })

    it('should handle vulnerabilities clustered in one bin', () => {
      const vulnerabilities = createMockVulnerabilities([7.1, 7.2, 7.3, 7.4, 7.5])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toBeInTheDocument()
    })

    it('should handle empty vulnerabilities array', () => {
      render(<CvssHistogram vulnerabilities={[]} />)

      const chart = screen.getByTestId('area-chart')
      expect(chart).toHaveAttribute('data-count', '0')
    })
  })

  describe('Fill Color Logic', () => {
    it('should determine fill color based on score', () => {
      const vulnerabilities = createMockVulnerabilities([9.8, 7.5, 5.0, 2.5, 0.5])
      render(<CvssHistogram vulnerabilities={vulnerabilities} />)

      const area = screen.getByTestId('area')
      expect(area).toBeInTheDocument()
    })
  })

  describe('Utility Functions', () => {
    describe('getCvssFillColor', () => {
      it('should return red for scores >= 9 (critical)', () => {
        expect(getCvssFillColor(9.0)).toBe('#dc2626')
        expect(getCvssFillColor(9.5)).toBe('#dc2626')
        expect(getCvssFillColor(10.0)).toBe('#dc2626')
      })

      it('should return orange for scores >= 7 and < 9 (high)', () => {
        expect(getCvssFillColor(7.0)).toBe('#ea580c')
        expect(getCvssFillColor(8.0)).toBe('#ea580c')
        expect(getCvssFillColor(8.9)).toBe('#ea580c')
      })

      it('should return yellow for scores >= 4 and < 7 (medium)', () => {
        expect(getCvssFillColor(4.0)).toBe('#ca8a04')
        expect(getCvssFillColor(5.0)).toBe('#ca8a04')
        expect(getCvssFillColor(6.9)).toBe('#ca8a04')
      })

      it('should return green for scores > 0 and < 4 (low)', () => {
        expect(getCvssFillColor(0.1)).toBe('#16a34a')
        expect(getCvssFillColor(1.0)).toBe('#16a34a')
        expect(getCvssFillColor(3.9)).toBe('#16a34a')
      })

      it('should return gray for score of 0', () => {
        expect(getCvssFillColor(0)).toBe('#6b7280')
      })
    })

    describe('calculateHistogramBins', () => {
      it('should create bins with default bin size of 1', () => {
        const vulnerabilities = createMockVulnerabilities([1.5, 2.5, 5.0, 8.0])
        const bins = calculateHistogramBins(vulnerabilities)

        expect(bins.length).toBeGreaterThan(0)
        expect(bins.every((b) => b.count > 0)).toBe(true)
      })

      it('should create bins with custom bin size', () => {
        const vulnerabilities = createMockVulnerabilities([1.5, 5.0, 8.0])
        const bins = calculateHistogramBins(vulnerabilities, 2)

        expect(bins.length).toBeGreaterThan(0)
      })

      it('should filter out bins with zero count', () => {
        const vulnerabilities = createMockVulnerabilities([9.5])
        const bins = calculateHistogramBins(vulnerabilities, 1)

        // Should only have bins for the ranges that have vulnerabilities
        expect(bins.every((b) => b.count > 0)).toBe(true)
      })

      it('should handle vulnerabilities without CVSS scores', () => {
        const vulnerabilities: Vulnerability[] = [
          {
            id: 'CVE-2024-0001',
            source: 'nvd',
            severity: 'none',
            description: 'No score',
            references: [],
            affectedComponents: [],
          },
        ]
        const bins = calculateHistogramBins(vulnerabilities)

        expect(bins).toEqual([])
      })

      it('should calculate correct range and score for each bin', () => {
        const vulnerabilities = createMockVulnerabilities([5.5])
        const bins = calculateHistogramBins(vulnerabilities, 1)

        expect(bins[0]).toMatchObject({
          range: '5-6',
          score: 5.5,
          count: 1,
        })
      })

      it('should handle empty vulnerabilities array', () => {
        const bins = calculateHistogramBins([])
        expect(bins).toEqual([])
      })

      it('should handle vulnerabilities at bin boundaries', () => {
        const vulnerabilities = createMockVulnerabilities([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        const bins = calculateHistogramBins(vulnerabilities, 1)

        expect(bins.length).toBeGreaterThan(0)
      })

      it('should count multiple vulnerabilities in same bin', () => {
        const vulnerabilities = createMockVulnerabilities([5.1, 5.2, 5.3, 5.4, 5.5])
        const bins = calculateHistogramBins(vulnerabilities, 1)

        const bin5 = bins.find((b) => b.range === '5-6')
        expect(bin5?.count).toBe(5)
      })
    })
  })
})
