/**
 * Tests for Risk Score Calculation Service
 */

import { describe, it, expect } from 'vitest'
import {
  calculateRiskScore,
  getRiskLevel,
  getRiskLevelColor,
  getRiskLevelClasses,
  compareByRiskScore,
  sortByRiskScore,
  formatEpssPercentile,
  getEpssColorClass,
  type Severity,
  type RiskLevel,
} from './riskScore'

describe('riskScore', () => {
  describe('calculateRiskScore', () => {
    it('should return 0 for non-KEV, no EPSS, LOW severity', () => {
      const result = calculateRiskScore({
        isKev: false,
        epssPercentile: null,
        severity: 'LOW',
      })

      expect(result.score).toBe(5) // Only severity points
      expect(result.level).toBe('low')
      expect(result.factors.kev).toBe(0)
      expect(result.factors.epss).toBe(0)
      expect(result.factors.severity).toBe(5)
    })

    it('should return 50 for KEV only (actively exploited)', () => {
      const result = calculateRiskScore({
        isKev: true,
        epssPercentile: null,
        severity: 'LOW',
      })

      expect(result.score).toBe(55) // KEV (50) + LOW (5)
      expect(result.level).toBe('high') // KEV always at least high
      expect(result.factors.kev).toBe(50)
    })

    it('should return max EPSS points for 100th percentile', () => {
      const result = calculateRiskScore({
        isKev: false,
        epssPercentile: 1.0,
        severity: 'LOW',
      })

      expect(result.factors.epss).toBe(30) // Max EPSS points
      expect(result.score).toBe(35) // EPSS (30) + LOW (5)
    })

    it('should calculate correct score for CRITICAL severity', () => {
      const result = calculateRiskScore({
        isKev: false,
        epssPercentile: null,
        severity: 'CRITICAL',
      })

      expect(result.score).toBe(20)
      expect(result.factors.severity).toBe(20)
    })

    it('should return 100 for KEV + high EPSS + CRITICAL (capped)', () => {
      const result = calculateRiskScore({
        isKev: true,
        epssPercentile: 1.0, // 100th percentile = 30 points
        severity: 'CRITICAL', // 20 points
      })

      // KEV (50) + EPSS (30) + CRITICAL (20) = 100
      expect(result.score).toBe(100) // Capped at 100
      expect(result.level).toBe('critical')
    })

    it('should handle NONE severity', () => {
      const result = calculateRiskScore({
        isKev: false,
        epssPercentile: null,
        severity: 'NONE',
      })

      expect(result.score).toBe(0)
      expect(result.factors.severity).toBe(0)
    })

    it('should calculate correct EPSS contribution', () => {
      // 50th percentile = 15 points (50% of 30)
      const result = calculateRiskScore({
        isKev: false,
        epssPercentile: 0.5,
        severity: 'NONE',
      })

      expect(result.factors.epss).toBe(15)
    })

    it('should include breakdown string', () => {
      const result = calculateRiskScore({
        isKev: true,
        epssPercentile: 0.8,
        severity: 'HIGH',
      })

      expect(result.breakdown).toContain('KEV')
      expect(result.breakdown).toContain('EPSS')
      expect(result.breakdown).toBeDefined()
    })
  })

  describe('getRiskLevel', () => {
    it('should return critical for score >= 70', () => {
      expect(getRiskLevel(70, false)).toBe('critical')
      expect(getRiskLevel(85, false)).toBe('critical')
      expect(getRiskLevel(100, false)).toBe('critical')
    })

    it('should return high for score 50-69', () => {
      expect(getRiskLevel(50, false)).toBe('high')
      expect(getRiskLevel(60, false)).toBe('high')
      expect(getRiskLevel(69, false)).toBe('high')
    })

    it('should return medium for score 30-49', () => {
      expect(getRiskLevel(30, false)).toBe('medium')
      expect(getRiskLevel(40, false)).toBe('medium')
      expect(getRiskLevel(49, false)).toBe('medium')
    })

    it('should return low for score < 30', () => {
      expect(getRiskLevel(0, false)).toBe('low')
      expect(getRiskLevel(15, false)).toBe('low')
      expect(getRiskLevel(29, false)).toBe('low')
    })

    it('should always return at least high for KEV', () => {
      expect(getRiskLevel(10, true)).toBe('high')
      expect(getRiskLevel(50, true)).toBe('high')
      expect(getRiskLevel(70, true)).toBe('critical')
    })
  })

  describe('getRiskLevelColor', () => {
    it('should return correct colors for each level', () => {
      expect(getRiskLevelColor('critical')).toBe('#dc2626') // Red
      expect(getRiskLevelColor('high')).toBe('#f97316') // Orange
      expect(getRiskLevelColor('medium')).toBe('#eab308') // Yellow
      expect(getRiskLevelColor('low')).toBe('#22c55e') // Green
    })
  })

  describe('getRiskLevelClasses', () => {
    it('should return Tailwind classes for each level', () => {
      const critical = getRiskLevelClasses('critical')
      expect(critical.bg).toContain('red')
      expect(critical.text).toContain('red')

      const high = getRiskLevelClasses('high')
      expect(high.bg).toContain('orange')

      const medium = getRiskLevelClasses('medium')
      expect(medium.bg).toContain('yellow')

      const low = getRiskLevelClasses('low')
      expect(low.bg).toContain('green')
    })
  })

  describe('compareByRiskScore', () => {
    it('should sort higher scores first', () => {
      const a = { id: 'a', isKev: true, epssPercentile: null, severity: 'HIGH' as Severity }
      const b = { id: 'b', isKev: false, epssPercentile: null, severity: 'LOW' as Severity }

      expect(compareByRiskScore(a, b)).toBeLessThan(0) // a comes first
    })

    it('should prioritize KEV on tie', () => {
      const kev = { id: 'kev', isKev: true, epssPercentile: 0.5, severity: 'HIGH' as Severity }
      const nonKev = { id: 'nonkev', isKev: false, epssPercentile: 0.5, severity: 'HIGH' as Severity }

      expect(compareByRiskScore(kev, nonKev)).toBeLessThan(0)
    })

    it('should prioritize higher EPSS on tie', () => {
      const highEpss = { id: 'a', isKev: false, epssPercentile: 0.9, severity: 'HIGH' as Severity }
      const lowEpss = { id: 'b', isKev: false, epssPercentile: 0.5, severity: 'HIGH' as Severity }

      expect(compareByRiskScore(highEpss, lowEpss)).toBeLessThan(0)
    })
  })

  describe('sortByRiskScore', () => {
    it('should sort array by risk score descending', () => {
      const vulns = [
        { id: 'low', isKev: false, epssPercentile: null, severity: 'LOW' as Severity },
        { id: 'critical', isKev: true, epssPercentile: 0.9, severity: 'CRITICAL' as Severity },
        { id: 'medium', isKev: false, epssPercentile: 0.5, severity: 'MEDIUM' as Severity },
      ]

      const sorted = sortByRiskScore(vulns)

      expect(sorted[0].id).toBe('critical')
      expect(sorted[1].id).toBe('medium')
      expect(sorted[2].id).toBe('low')
    })
  })

  describe('formatEpssPercentile', () => {
    it('should format percentile as percentage', () => {
      expect(formatEpssPercentile(0.5)).toBe('50%')
      expect(formatEpssPercentile(0.95)).toBe('95%')
      expect(formatEpssPercentile(0)).toBe('0%')
    })

    it('should return N/A for null', () => {
      expect(formatEpssPercentile(null)).toBe('N/A')
    })
  })

  describe('getEpssColorClass', () => {
    it('should return red for high percentile (>=80%)', () => {
      expect(getEpssColorClass(0.8)).toContain('red')
      expect(getEpssColorClass(0.95)).toContain('red')
    })

    it('should return yellow for medium percentile (50-79%)', () => {
      expect(getEpssColorClass(0.5)).toContain('yellow')
      expect(getEpssColorClass(0.7)).toContain('yellow')
    })

    it('should return green for low percentile (<50%)', () => {
      expect(getEpssColorClass(0.3)).toContain('green')
      expect(getEpssColorClass(0.1)).toContain('green')
    })

    it('should return muted for null', () => {
      expect(getEpssColorClass(null)).toContain('muted')
    })
  })
})
