import { describe, it, expect } from 'vitest'
import { computeNextBackupTime } from './BackupService'

// Pure date-math tests for the backup scheduler (bug-hunt L2). No fake timers — `now` is passed in.

describe('computeNextBackupTime', () => {
  describe('daily', () => {
    it('returns today 02:00 when it is before 02:00', () => {
      const now = new Date('2026-08-05T01:00:00') // Wednesday 01:00 local
      const next = computeNextBackupTime('daily', now)
      expect(next.getHours()).toBe(2)
      expect(next.getDate()).toBe(now.getDate())
    })

    it('rolls to tomorrow 02:00 when 02:00 has passed', () => {
      const now = new Date('2026-08-05T03:00:00') // Wednesday 03:00 local
      const next = computeNextBackupTime('daily', now)
      expect(next.getHours()).toBe(2)
      expect(next.getDate()).toBe(now.getDate() + 1)
    })
  })

  describe('weekly', () => {
    it('returns THIS Sunday 02:00 when it is Sunday before 02:00 (not a week late)', () => {
      // 2026-08-02 is a Sunday. Before 02:00 the next weekly backup is today, not +7 days.
      const now = new Date('2026-08-02T01:00:00')
      expect(now.getDay()).toBe(0) // guard: really a Sunday
      const next = computeNextBackupTime('weekly', now)
      expect(next.getDay()).toBe(0)
      expect(next.getHours()).toBe(2)
      expect(next.getDate()).toBe(now.getDate()) // same Sunday
    })

    it('rolls to next Sunday when this Sunday 02:00 has passed', () => {
      const now = new Date('2026-08-02T03:00:00') // Sunday 03:00
      const next = computeNextBackupTime('weekly', now)
      expect(next.getDay()).toBe(0)
      expect(next.getDate()).toBe(now.getDate() + 7)
    })

    it('advances to the coming Sunday from a weekday', () => {
      const now = new Date('2026-08-05T12:00:00') // Wednesday (getDay 3)
      const next = computeNextBackupTime('weekly', now)
      expect(next.getDay()).toBe(0)
      // Wed -> Sun is 4 days ahead.
      expect(next.getDate()).toBe(now.getDate() + 4)
    })
  })
})
