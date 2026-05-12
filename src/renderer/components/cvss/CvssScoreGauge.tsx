import React from 'react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import type { CvssBreakdown } from '@@/types'
import { getSeverityColorHex, getRadarChartData } from '@/lib/cvss'

interface CvssScoreGaugeProps {
  breakdown: CvssBreakdown
  size?: number
  showLabel?: boolean
  showSubScores?: boolean
}

/**
 * CVSS Score Gauge Component
 * Displays a radar chart visualization of CVSS metrics with prominent score display
 */
export const CvssScoreGauge = React.memo(function CvssScoreGauge({
  breakdown,
  size = 200,
  showLabel = true,
  showSubScores = true,
}: CvssScoreGaugeProps) {
  const radarData = getRadarChartData(breakdown)
  const scoreColor = getSeverityColorHex(breakdown.severity)

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={size} height={size}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 10 }} className="text-xs" />
          <PolarRadiusAxis angle={90} domain={[0, 1]} tick={{ fill: '#9ca3af', fontSize: 8 }} tickCount={3} />
          <Radar
            name="CVSS Metrics"
            dataKey="value"
            stroke={scoreColor}
            fill={scoreColor}
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
      {showLabel && (
        <div className="mt-2 text-center">
          {/* Main CVSS Score - Made more prominent */}
          <div className="relative">
            <div
              className="text-5xl font-extrabold tracking-tight"
              style={{ color: scoreColor, textShadow: `0 2px 4px ${scoreColor}30` }}
            >
              {breakdown.scores.baseScore}
            </div>
            <div className="text-xs text-gray-500 font-medium mt-0.5">out of 10.0</div>
          </div>
          {/* Severity Badge - More prominent */}
          <div
            className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide"
            style={{
              backgroundColor: `${scoreColor}20`,
              color: scoreColor,
              border: `2px solid ${scoreColor}40`,
            }}
          >
            {breakdown.severity}
          </div>
        </div>
      )}
      {/* Sub-scores: Impact and Exploitability */}
      {showSubScores && (
        <div className="mt-4 w-full grid grid-cols-2 gap-3">
          <div className="text-center p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Impact</div>
            <div className="text-lg font-bold text-gray-800">{breakdown.scores.impactSubScore}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Exploitability</div>
            <div className="text-lg font-bold text-gray-800">{breakdown.scores.exploitabilitySubScore}</div>
          </div>
        </div>
      )}
    </div>
  )
})
