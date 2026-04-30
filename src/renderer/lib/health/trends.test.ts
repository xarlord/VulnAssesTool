import { describe, it, expect } from 'vitest'
import {
  calculateTrend,
  calculateTrendFromHistory,
  calculateTrendPercentage,
  getTrendIcon,
  getTrendColor,
} from './trends'

describe('calculateTrend', () => {
  it('should return unknown when previous score is undefined', () => {
    expect(calculateTrend(80, undefined)).toBe('unknown')
  })

  it('should return unknown when previous score is null', () => {
    expect(calculateTrend(80, null)).toBe('unknown')
  })

  it('should return improving when score increased by more than 5 points', () => {
    expect(calculateTrend(86, 80)).toBe('improving') // 6 point increase
    expect(calculateTrend(90, 84)).toBe('improving') // 6 point increase
    expect(calculateTrend(100, 94)).toBe('improving') // 6 point increase
  })

  it('should return degrading when score decreased by more than 5 points', () => {
    expect(calculateTrend(74, 80)).toBe('degrading') // 6 point decrease
    expect(calculateTrend(70, 76)).toBe('degrading') // 6 point decrease
    expect(calculateTrend(0, 6)).toBe('degrading') // 6 point decrease
  })

  it('should return stable when score changed by 5 points or less', () => {
    expect(calculateTrend(80, 80)).toBe('stable')
    expect(calculateTrend(82, 80)).toBe('stable')
    expect(calculateTrend(78, 80)).toBe('stable')
    expect(calculateTrend(85, 80)).toBe('stable')
    expect(calculateTrend(75, 80)).toBe('stable')
  })

  it('should handle edge cases at score boundaries', () => {
    expect(calculateTrend(0, 5)).toBe('stable')
    expect(calculateTrend(0, 6)).toBe('degrading')
    expect(calculateTrend(100, 95)).toBe('stable')
    expect(calculateTrend(100, 94)).toBe('improving')
  })

  it('should handle extreme values', () => {
    expect(calculateTrend(100, 0)).toBe('improving')
    expect(calculateTrend(0, 100)).toBe('degrading')
  })
})

describe('calculateTrendFromHistory', () => {
  it('should return unknown for empty array', () => {
    expect(calculateTrendFromHistory([])).toBe('unknown')
  })

  it('should return unknown for single score', () => {
    expect(calculateTrendFromHistory([80])).toBe('unknown')
  })

  it('should return improving when scores increased over time', () => {
    expect(calculateTrendFromHistory([70, 75, 80, 85])).toBe('improving')
    expect(calculateTrendFromHistory([60, 80])).toBe('improving')
  })

  it('should return degrading when scores decreased over time', () => {
    expect(calculateTrendFromHistory([85, 80, 75, 70])).toBe('degrading')
    expect(calculateTrendFromHistory([80, 60])).toBe('degrading')
  })

  it('should return stable when scores changed by 5 points or less', () => {
    expect(calculateTrendFromHistory([80, 82, 79, 81])).toBe('stable')
    expect(calculateTrendFromHistory([75, 80])).toBe('stable')
  })

  it('should only consider oldest and newest scores', () => {
    // Middle scores should be ignored
    expect(calculateTrendFromHistory([60, 40, 50, 90])).toBe('improving')
    expect(calculateTrendFromHistory([90, 100, 50, 80])).toBe('degrading')
  })

  it('should handle multiple data points with fluctuations', () => {
    expect(calculateTrendFromHistory([70, 75, 72, 78, 80, 76, 85])).toBe('improving')
    expect(calculateTrendFromHistory([85, 80, 82, 78, 75, 80, 70])).toBe('degrading')
  })
})

describe('calculateTrendPercentage', () => {
  it('should return null when previous score is undefined', () => {
    expect(calculateTrendPercentage(80, undefined)).toBeNull()
  })

  it('should return null when previous score is null', () => {
    expect(calculateTrendPercentage(80, null)).toBeNull()
  })

  it('should return null when previous score is 0', () => {
    expect(calculateTrendPercentage(80, 0)).toBeNull()
  })

  it('should calculate positive percentage for improvement', () => {
    expect(calculateTrendPercentage(90, 80)).toBe(12.5) // (90-80)/80 * 100
    expect(calculateTrendPercentage(100, 50)).toBe(100) // (100-50)/50 * 100
  })

  it('should calculate negative percentage for degradation', () => {
    expect(calculateTrendPercentage(70, 80)).toBe(-12.5) // (70-80)/80 * 100
    expect(calculateTrendPercentage(50, 100)).toBe(-50) // (50-100)/100 * 100
  })

  it('should return 0 when scores are the same', () => {
    expect(calculateTrendPercentage(80, 80)).toBe(0)
  })

  it('should handle decimal results', () => {
    const result = calculateTrendPercentage(85, 75)
    expect(result).toBeCloseTo(13.33, 2)
  })

  it('should handle very small previous scores', () => {
    expect(calculateTrendPercentage(10, 1)).toBe(900) // (10-1)/1 * 100
  })

  it('should handle scores that result in negative percentages', () => {
    expect(calculateTrendPercentage(20, 40)).toBe(-50) // (20-40)/40 * 100
  })
})

describe('getTrendIcon', () => {
  it('should return TrendingUp for improving', () => {
    expect(getTrendIcon('improving')).toBe('TrendingUp')
  })

  it('should return TrendingDown for degrading', () => {
    expect(getTrendIcon('degrading')).toBe('TrendingDown')
  })

  it('should return Minus for stable', () => {
    expect(getTrendIcon('stable')).toBe('Minus')
  })

  it('should return HelpCircle for unknown', () => {
    expect(getTrendIcon('unknown')).toBe('HelpCircle')
  })
})

describe('getTrendColor', () => {
  it('should return green for improving', () => {
    expect(getTrendColor('improving')).toBe('text-green-600')
  })

  it('should return red for degrading', () => {
    expect(getTrendColor('degrading')).toBe('text-red-600')
  })

  it('should return gray for stable', () => {
    expect(getTrendColor('stable')).toBe('text-gray-600')
  })

  it('should return light gray for unknown', () => {
    expect(getTrendColor('unknown')).toBe('text-gray-400')
  })
})
