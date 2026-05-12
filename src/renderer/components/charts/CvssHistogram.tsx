import React from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Vulnerability } from '@@/types'

interface CvssHistogramProps {
  vulnerabilities: Vulnerability[]
  height?: number
  binSize?: number
}

/**
 * Get fill color based on CVSS score
 * @internal - exported for testing
 */
export function getCvssFillColor(score: number): string {
  if (score >= 9) return '#dc2626'
  if (score >= 7) return '#ea580c'
  if (score >= 4) return '#ca8a04'
  if (score > 0) return '#16a34a'
  return '#6b7280'
}

/**
 * Calculate histogram bins from vulnerabilities
 * @internal - exported for testing
 */
export function calculateHistogramBins(
  vulnerabilities: Vulnerability[],
  binSize: number = 1,
): Array<{ range: string; score: number; count: number }> {
  // Create bins from 0 to 10
  const bins: number[] = []
  for (let i = 0; i <= 10; i += binSize) {
    bins.push(i)
  }

  // Count vulnerabilities in each bin
  const histogram = bins.map((bin, index) => {
    const nextBin = bins[index + 1] ?? 10
    const count = vulnerabilities.filter((vuln) => {
      if (!vuln.cvssScore) return false
      return vuln.cvssScore >= bin && vuln.cvssScore < nextBin
    }).length

    return {
      range: `${bin}-${nextBin}`,
      score: (bin + nextBin) / 2,
      count,
    }
  })

  return histogram.filter((h) => h.count > 0)
}

/**
 * CVSS Score Histogram Component
 * Displays the distribution of CVSS scores
 */
export const CvssHistogram = React.memo(function CvssHistogram({
  vulnerabilities,
  height = 300,
  binSize = 1,
}: CvssHistogramProps) {
  const data = React.useMemo(() => {
    return calculateHistogramBins(vulnerabilities, binSize)
  }, [vulnerabilities, binSize])

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border bg-white px-3 py-2 shadow-md">
          <p className="text-sm font-semibold">Score: {data.range}</p>
          <p className="text-xs text-gray-600">{data.count} vulnerabilities</p>
        </div>
      )
    }
    return null
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ea580c" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="range"
          tick={{ fill: '#6b7280', fontSize: 12 }}
          stroke="#9ca3af"
          label={{
            value: 'CVSS Score',
            position: 'insideBottom',
            offset: -5,
            style: { fontSize: 12, fill: '#6b7280' },
          }}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#6b7280' } }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="count" stroke="#ea580c" fillOpacity={1} fill="url(#colorCount)" />
      </AreaChart>
    </ResponsiveContainer>
  )
})
