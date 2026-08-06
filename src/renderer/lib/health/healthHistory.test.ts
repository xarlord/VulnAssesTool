import { describe, it, expect, beforeEach } from 'vitest'
import { getHealthHistory, recordHealthScore } from './healthHistory'

// FR-05.3's trend line needs a persisted score history. These tests pin the contract the
// Health tab and trend chart depend on: recording appends one point per project, a second
// recording on the SAME day overwrites (so the trend tracks latest state, not every view),
// scores are clamped/rounded, projects are isolated, and corrupt storage degrades to empty.
const STORAGE_KEY = 'vuln-assess-health-history'

describe('healthHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns an empty history for a project with no data', () => {
    expect(getHealthHistory('p1')).toEqual([])
  })

  it('records a score and reads it back, rounded', () => {
    recordHealthScore('p1', 87.6)
    const history = getHealthHistory('p1')
    expect(history).toHaveLength(1)
    expect(history[0].score).toBe(88)
    expect(history[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('overwrites the same day rather than appending a second point', () => {
    recordHealthScore('p1', 50)
    const after = recordHealthScore('p1', 70)
    expect(after).toHaveLength(1) // one calendar day -> one point
    expect(after[0].score).toBe(70) // latest score of the day wins
  })

  it('clamps scores to the 0-100 range', () => {
    expect(recordHealthScore('lo', -20)[0].score).toBe(0)
    expect(recordHealthScore('hi', 150)[0].score).toBe(100)
  })

  it('keeps history per project isolated', () => {
    recordHealthScore('p1', 40)
    recordHealthScore('p2', 90)
    expect(getHealthHistory('p1')[0].score).toBe(40)
    expect(getHealthHistory('p2')[0].score).toBe(90)
  })

  it('preserves earlier days when a new day is recorded', () => {
    // Seed a prior day directly, then record today; both must survive, oldest first.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ p1: [{ date: '2000-01-01', score: 30 }] }))
    const after = recordHealthScore('p1', 80)
    expect(after).toHaveLength(2)
    expect(after[0]).toEqual({ date: '2000-01-01', score: 30 }) // oldest first
    expect(after[1].score).toBe(80)
  })

  it('degrades to an empty history when storage is corrupt (does not throw)', () => {
    localStorage.setItem(STORAGE_KEY, 'not json{')
    expect(getHealthHistory('p1')).toEqual([])
    // ...and a subsequent record still works, starting fresh.
    expect(recordHealthScore('p1', 55)).toHaveLength(1)
  })
})
