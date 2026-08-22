/**
 * BDD Step Definitions for NVD Sync Scheduling
 *
 * Implements the non-@wip scenarios in database/update-scheduler.feature against the real
 * `server/database/nvd/nvdDeltaSync.ts`, backed by an in-memory better-sqlite3 database
 * migrated to the v2 schema — the same way the module's unit tests set up.
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber'
import { expect } from 'vitest'
import Database from 'better-sqlite3'
import { createNvdDeltaSync, type NvdDeltaSync } from '../../../server/database/nvd/nvdDeltaSync.ts'
import { runMigrations } from '../../../server/database/migrations/v2SchemaMigration.ts'

/** The Settings UI's four choices, and the hour counts SYNC_INTERVAL_HOURS maps them to. */
const SCHEDULE_HOURS: Record<string, number> = { manual: 0, daily: 24, weekly: 168, monthly: 720 }

interface SchedulerTestContext {
  db: InstanceType<typeof Database> | null
  deltaSync: NvdDeltaSync | null
}

const context: SchedulerTestContext = { db: null, deltaSync: null }

function requireSync(): NvdDeltaSync {
  if (!context.deltaSync) throw new Error('No delta-sync service — a Given step must create one first')
  return context.deltaSync
}

function hoursFor(schedule: string): number {
  const hours = SCHEDULE_HOURS[schedule]
  if (hours === undefined) throw new Error(`Unknown sync schedule "${schedule}"`)
  return hours
}

Before({ tags: '@scheduler' }, function () {
  context.db = null
  context.deltaSync = null
})

After({ tags: '@scheduler' }, function () {
  // disableAutoSync clears the scheduler's timer; without it the interval keeps a handle
  // open and cucumber hangs at the end of the run.
  context.deltaSync?.disableAutoSync()
  context.db?.close()
  context.db = null
  context.deltaSync = null
})

Given('a delta-sync service on a fresh database', function () {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)
  runMigrations(db, 0)
  context.db = db
  context.deltaSync = createNvdDeltaSync(db)
})

Given('the sync schedule is {string}', function (schedule: string) {
  requireSync().setAutoSyncInterval(hoursFor(schedule))
})

Given('auto-sync is enabled every {int} hours', function (hours: number) {
  requireSync().enableAutoSync({ intervalHours: hours })
})

When('I set the sync schedule to {string}', function (schedule: string) {
  requireSync().setAutoSyncInterval(hoursFor(schedule))
})

When('I enable auto-sync every {int} hours', function (hours: number) {
  requireSync().enableAutoSync({ intervalHours: hours })
})

When('I disable auto-sync', function () {
  requireSync().disableAutoSync()
})

When('the delta-sync service is recreated against the same database', function () {
  if (!context.db) throw new Error('No database in scope')
  // Deliberately NOT calling disableAutoSync() on the outgoing instance: it writes
  // auto_sync_enabled = 0, which would erase the very state this scenario is checking
  // survives. setAutoSyncInterval starts no timer, so there is nothing to clean up here.
  context.deltaSync = createNvdDeltaSync(context.db)
})

Then('the persisted sync interval should be {int} hours', function (hours: number) {
  expect(requireSync().getSyncStatus().autoSyncIntervalHours).toBe(hours)
})

Then('auto-sync should be {word}', function (state: string) {
  if (state !== 'enabled' && state !== 'disabled') {
    throw new Error(`Expected "enabled" or "disabled", got "${state}"`)
  }
  expect(requireSync().getSyncStatus().autoSyncEnabled).toBe(state === 'enabled')
})
