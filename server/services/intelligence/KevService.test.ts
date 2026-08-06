/**
 * Unit tests for KevService freshness (bug-hunt C5, M8).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { KevService } from './KevService.js'

function makeDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE kev_catalog (
      cve_id TEXT PRIMARY KEY, vendor_project TEXT, product TEXT, vulnerability_name TEXT,
      date_added TEXT, short_description TEXT, required_action TEXT, due_date TEXT,
      known_ransomware_use INTEGER, notes TEXT, updated_at TEXT
    );
    CREATE TABLE cves (id TEXT PRIMARY KEY, is_kev INTEGER DEFAULT 0);
    CREATE TABLE sync_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return db
}

/** Seed one already-known KEV entry (kev_catalog row + cves.is_kev = 1). */
function seedKev(db: InstanceType<typeof Database>, cveId: string): void {
  db.prepare(
    `INSERT INTO kev_catalog (cve_id, vendor_project, product, vulnerability_name, date_added,
       short_description, required_action, due_date, known_ransomware_use, notes, updated_at)
     VALUES (?, 'V', 'P', 'name', '2099-01-01', 'desc', 'act', NULL, 0, NULL, datetime('now'))`,
  ).run(cveId)
  db.prepare('INSERT OR REPLACE INTO cves (id, is_kev) VALUES (?, 1)').run(cveId)
}

function catalogJson(cveIds: string[]): unknown {
  return {
    title: 'CISA KEV',
    catalogVersion: '2099.1',
    dateReleased: '2099-01-01',
    count: cveIds.length,
    vulnerabilities: cveIds.map((cveID) => ({
      cveID,
      vendorProject: 'V',
      product: 'P',
      vulnerabilityName: 'name',
      dateAdded: '2099-01-01',
      shortDescription: 'desc',
      requiredAction: 'act',
      dueDate: '2099-02-01',
      knownRansomwareCampaignUse: 'Unknown',
      notes: '',
    })),
  }
}

function mockCisaFetch(cveIds: string[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => catalogJson(cveIds) })),
  )
}

describe('KevService freshness', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    db.close()
  })

  it('C5: reflects newly-synced CVEs without a restart (buildCache rebuilds from DB)', async () => {
    seedKev(db, 'CVE-1900-0001')
    db.prepare('INSERT INTO cves (id, is_kev) VALUES (?, 0)').run('CVE-1900-0002')
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })
    await service.initialize()
    expect(service.isKev('CVE-1900-0002')).toBe(false)

    mockCisaFetch(['CVE-1900-0001', 'CVE-1900-0002'])
    await service.syncFromCisa()

    // WHY: buildCache() previously re-read its own stale cache, so a CVE added by a
    // post-init sync stayed invisible to isKev() until a full restart.
    expect(service.isKev('CVE-1900-0002')).toBe(true)
  })

  it('M8: delists CVEs dropped from the catalog (is_kev cleared, row removed)', async () => {
    seedKev(db, 'CVE-1900-0001')
    seedKev(db, 'CVE-1900-9999')
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })
    await service.initialize()
    expect(service.isKev('CVE-1900-9999')).toBe(true)

    mockCisaFetch(['CVE-1900-0001'])
    const result = await service.syncFromCisa()

    // WHY: importCatalog only INSERT OR REPLACE + SET is_kev=1, so a delisted CVE used to
    // keep is_kev=1 forever and the reported `removed` count matched no real DB change.
    expect(result.removed).toBe(1)
    expect(service.isKev('CVE-1900-9999')).toBe(false)
    const catalogRow = db.prepare('SELECT COUNT(*) as c FROM kev_catalog WHERE cve_id = ?').get('CVE-1900-9999') as {
      c: number
    }
    expect(catalogRow.c).toBe(0)
    const cveRow = db.prepare('SELECT is_kev FROM cves WHERE id = ?').get('CVE-1900-9999') as { is_kev: number }
    expect(cveRow.is_kev).toBe(0)
  })
})
