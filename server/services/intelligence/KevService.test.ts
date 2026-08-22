/**
 * Unit tests for KevService freshness (bug-hunt C5, M8).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { KevService, getKevService, resetKevService } from './KevService.js'

// KevService.loadBaseline() reads real files via `import * as fs from 'fs'`. In ESM the `fs`
// module namespace object isn't configurable, so vi.spyOn(fs, ...) throws — mock the whole
// module instead, routing existsSync/readFileSync through mutable hooks each test can swap.
// Default (existsSync -> false) mirrors the real dev/CI environment, where the bundled
// resources/kev-baseline.json path never exists, so every OTHER describe in this file that
// calls initialize()/loadBaseline() still exercises the real embedded-baseline fallback.
const fsMockState = vi.hoisted(() => ({
  existsSyncImpl: (): boolean => false,
  readFileSyncImpl: (): string => '',
}))

// No importOriginal here: under the jsdom test environment 'fs' resolves to a browser-external
// stub, so pulling in "the real module" throws. KevService only ever calls existsSync/readFileSync,
// so a minimal full replacement (matching this repo's dbSeedingService.test.ts convention) is enough.
vi.mock('fs', () => ({
  existsSync: () => fsMockState.existsSyncImpl(),
  readFileSync: () => fsMockState.readFileSyncImpl(),
}))

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
  vi.stubGlobal('fetch', vi.fn(mockCisaFetchImpl(cveIds)))
}

/** Same fake-CISA-response shape as mockCisaFetch, but returned as a bare fn so callers can
 *  wrap it in their own `vi.fn(...)` to assert on call count/timing (e.g. via vi.waitFor). */
function mockCisaFetchImpl(
  cveIds: string[],
): () => Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }> {
  return async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => catalogJson(cveIds) })
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

describe('KevService — loadBaseline', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    fsMockState.existsSyncImpl = () => false
    fsMockState.readFileSyncImpl = () => ''
    db.close()
  })

  it('falls back to the embedded baseline when the bundled baseline file is missing', async () => {
    fsMockState.existsSyncImpl = () => false
    const service = new KevService(db, { autoSync: false })

    const imported = await service.loadBaseline()

    // WHY: a fresh install with no bundled resources/ dir must still ship with a working
    // offline KEV catalog instead of an empty one.
    expect(imported).toBeGreaterThan(0)
    expect(db.prepare('SELECT 1 FROM kev_catalog WHERE cve_id = ?').get('CVE-2019-0708')).toBeTruthy()
    const count = db.prepare('SELECT COUNT(*) as c FROM kev_catalog').get() as { c: number }
    expect(count.c).toBe(imported)
  })

  it('imports the bundled baseline file instead of the embedded set when it exists and parses', async () => {
    fsMockState.existsSyncImpl = () => true
    fsMockState.readFileSyncImpl = () => JSON.stringify(catalogJson(['CVE-2030-0001']))
    const service = new KevService(db, { autoSync: false })

    const imported = await service.loadBaseline()

    expect(imported).toBe(1)
    expect(db.prepare('SELECT 1 FROM kev_catalog WHERE cve_id = ?').get('CVE-2030-0001')).toBeTruthy()
    // WHY: proves the bundled-file branch is actually taken, not silently falling through to
    // the embedded set (which would leave this CVE missing and BlueKeep present instead).
    expect(db.prepare('SELECT 1 FROM kev_catalog WHERE cve_id = ?').get('CVE-2019-0708')).toBeUndefined()
  })

  it('falls back to the embedded baseline when the bundled file exists but fails to parse', async () => {
    fsMockState.existsSyncImpl = () => true
    fsMockState.readFileSyncImpl = () => 'not valid json{'
    const service = new KevService(db, { autoSync: false })

    const imported = await service.loadBaseline()

    // WHY: a corrupt bundled file must degrade to the embedded baseline, not crash startup.
    expect(imported).toBeGreaterThan(0)
    expect(db.prepare('SELECT 1 FROM kev_catalog WHERE cve_id = ?').get('CVE-2019-0708')).toBeTruthy()
    expect(console.error).toHaveBeenCalledWith('[KevService] Failed to load baseline:', expect.anything())
  })

  it('falls back to the embedded baseline when the file is valid JSON but "vulnerabilities" is not an array', async () => {
    fsMockState.existsSyncImpl = () => true
    fsMockState.readFileSyncImpl = () =>
      JSON.stringify({ title: 'x', catalogVersion: '1', dateReleased: '2099-01-01', count: 0, vulnerabilities: null })
    const service = new KevService(db, { autoSync: false })

    const imported = await service.loadBaseline()

    // WHY: importCatalog's `for (const vuln of catalog.vulnerabilities)` throws a TypeError on
    // a null/non-iterable field — this exercises importCatalog's own rollback-and-rethrow path
    // (distinct from a JSON.parse failure) and proves loadBaseline still recovers from it.
    expect(imported).toBeGreaterThan(0)
    expect(db.prepare('SELECT 1 FROM kev_catalog WHERE cve_id = ?').get('CVE-2019-0708')).toBeTruthy()
    expect(console.error).toHaveBeenCalledWith('[KevService] Failed to load baseline:', expect.anything())
  })
})

describe('KevService — initialize', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    db.close()
  })

  it('loads baseline data on first run when the catalog is empty', async () => {
    const service = new KevService(db, { autoSync: false })

    await service.initialize()

    // WHY: a brand-new database must not stay empty after initialize() — offline users need
    // a usable KEV catalog before any network sync has ever run.
    const count = db.prepare('SELECT COUNT(*) as c FROM kev_catalog').get() as { c: number }
    expect(count.c).toBeGreaterThan(0)
  })

  it('skips baseline loading when the catalog already has data (avoids clobbering synced state)', async () => {
    seedKev(db, 'CVE-1900-0001')
    const service = new KevService(db, { autoSync: false })

    await service.initialize()

    const count = db.prepare('SELECT COUNT(*) as c FROM kev_catalog').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('triggers a background sync on init when no sync has ever run', async () => {
    seedKev(db, 'CVE-1900-0001')
    const fetchMock = vi.fn(mockCisaFetchImpl(['CVE-1900-0001']))
    vi.stubGlobal('fetch', fetchMock)
    const service = new KevService(db, { autoSync: true, cisaUrl: 'http://test.local' })

    await service.initialize()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    service.shutdown()
  })

  it('does not sync on init when the last sync is still within the configured interval', async () => {
    seedKev(db, 'CVE-1900-0001')
    db.prepare("INSERT INTO sync_metadata (key, value) VALUES ('kev_last_sync', ?)").run(new Date().toISOString())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const service = new KevService(db, { autoSync: true, cisaUrl: 'http://test.local' })

    await service.initialize()

    expect(fetchMock).not.toHaveBeenCalled()
    service.shutdown()
  })

  it('never syncs when autoSync is disabled, regardless of staleness', async () => {
    seedKev(db, 'CVE-1900-0001')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })

    await service.initialize()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a corrupt last-sync timestamp as needing a sync (fail-safe, not fail-forever)', async () => {
    seedKev(db, 'CVE-1900-0001')
    db.prepare("INSERT INTO sync_metadata (key, value) VALUES ('kev_last_sync', 'not-a-date')").run()
    const fetchMock = vi.fn(mockCisaFetchImpl(['CVE-1900-0001']))
    vi.stubGlobal('fetch', fetchMock)
    const service = new KevService(db, { autoSync: true, cisaUrl: 'http://test.local' })

    // WHY: Date.parse('not-a-date') is NaN, and `NaN >= interval` is false — without the
    // explicit isNaN guard a corrupted row would report "sync not needed" forever.
    await service.initialize()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    service.shutdown()
  })

  it('treats a last-sync timestamp older than syncIntervalHours as needing a sync', async () => {
    seedKev(db, 'CVE-1900-0001')
    const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    db.prepare("INSERT INTO sync_metadata (key, value) VALUES ('kev_last_sync', ?)").run(staleDate)
    const fetchMock = vi.fn(mockCisaFetchImpl(['CVE-1900-0001']))
    vi.stubGlobal('fetch', fetchMock)
    const service = new KevService(db, { autoSync: true, syncIntervalHours: 24, cisaUrl: 'http://test.local' })

    await service.initialize()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    service.shutdown()
  })
})

describe('KevService — syncFromCisa failure branches', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    db.close()
  })

  it('reports failure with the HTTP status when CISA responds with a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) })),
    )
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })

    const result = await service.syncFromCisa()

    // WHY: a CISA outage must surface as a structured failure result (for sync-status UI and
    // retry logic) instead of an unhandled rejection that could crash a scheduled sync.
    expect(result.success).toBe(false)
    expect(result.error).toContain('HTTP 503: Service Unavailable')
    expect(result.added).toBe(0)
    expect(typeof result.durationMs).toBe('number')
  })

  it('reports failure without throwing when the fetch itself rejects (network down)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      }),
    )
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })

    const result = await service.syncFromCisa()

    expect(result.success).toBe(false)
    expect(result.error).toContain('getaddrinfo ENOTFOUND')
  })
})

describe('KevService — importCatalog partial failure', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    db.close()
  })

  it('skips a single malformed entry but still imports the rest of the catalog', async () => {
    const goodEntry = {
      cveID: 'CVE-1900-0001',
      vendorProject: 'V',
      product: 'P',
      vulnerabilityName: 'name',
      dateAdded: '2099-01-01',
      shortDescription: 'desc',
      requiredAction: 'act',
      dueDate: '2099-02-01',
      knownRansomwareCampaignUse: 'Unknown',
      notes: '',
    }
    // An object where a bind-able scalar is expected makes better-sqlite3's .run() throw,
    // exercising the per-row try/catch inside importCatalog's loop.
    const badEntry = { ...goodEntry, cveID: 'CVE-1900-0002', notes: { unexpected: 'object' } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          title: 'CISA KEV',
          catalogVersion: '2099.1',
          dateReleased: '2099-01-01',
          count: 2,
          vulnerabilities: [badEntry, goodEntry],
        }),
      })),
    )
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })

    const result = await service.syncFromCisa()

    // WHY: one malformed upstream entry must not abort the whole import — the rest of a
    // real catalog (hundreds of legitimate entries) must still land.
    expect(result.total).toBe(1)
    expect(db.prepare('SELECT 1 FROM kev_catalog WHERE cve_id = ?').get('CVE-1900-0001')).toBeTruthy()
    expect(db.prepare('SELECT 1 FROM kev_catalog WHERE cve_id = ?').get('CVE-1900-0002')).toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith('[KevService] Failed to import CVE-1900-0002:', expect.anything())
  })
})

describe('KevService — removeKevEntries no-op branch', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    db.close()
  })

  it('leaves the catalog untouched when a sync reports no delistings', async () => {
    seedKev(db, 'CVE-1900-0001')
    mockCisaFetch(['CVE-1900-0001', 'CVE-1900-0002'])
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })

    const result = await service.syncFromCisa()

    expect(result.removed).toBe(0)
    expect(service.isKev('CVE-1900-0001')).toBe(true)
  })
})

describe('KevService — read accessors', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    db.close()
  })

  it('isKev falls back to a direct DB query when the cache has not been built yet', () => {
    seedKev(db, 'CVE-1900-0001')
    const service = new KevService(db, { autoSync: false })

    // No initialize()/buildCache() call here — kevCache is still null.
    expect(service.isKev('CVE-1900-0001')).toBe(true)
    expect(service.isKev('CVE-1900-9999')).toBe(false)
  })

  it('getKevDetails returns null for a CVE that is not in the catalog', () => {
    const service = new KevService(db, { autoSync: false })

    expect(service.getKevDetails('CVE-1900-9999')).toBeNull()
  })

  it('getKevDetails maps a full row (dueDate, notes, ransomware flag) to the KevEntry shape', () => {
    db.prepare(
      `INSERT INTO kev_catalog (cve_id, vendor_project, product, vulnerability_name, date_added,
         short_description, required_action, due_date, known_ransomware_use, notes, updated_at)
       VALUES ('CVE-1900-0001', 'V', 'P', 'name', '2099-01-01', 'desc', 'act', '2099-02-01', 1, 'a note', datetime('now'))`,
    ).run()
    const service = new KevService(db, { autoSync: false })

    const entry = service.getKevDetails('CVE-1900-0001')

    expect(entry).toEqual({
      cveId: 'CVE-1900-0001',
      vendorProject: 'V',
      product: 'P',
      vulnerabilityName: 'name',
      dateAdded: '2099-01-01',
      shortDescription: 'desc',
      requiredAction: 'act',
      dueDate: '2099-02-01',
      knownRansomwareUse: true,
      notes: 'a note',
    })
  })

  it('getKevDetails maps a null dueDate/notes to undefined and a 0 ransomware flag to false', () => {
    seedKev(db, 'CVE-1900-0001') // due_date/notes NULL, known_ransomware_use 0
    const service = new KevService(db, { autoSync: false })

    const entry = service.getKevDetails('CVE-1900-0001')

    // WHY: downstream consumers (VEX/report generators) treat `undefined` as "no due date" —
    // if a SQL NULL leaked through untouched it would break optional-field checks there.
    expect(entry?.dueDate).toBeUndefined()
    expect(entry?.notes).toBeUndefined()
    expect(entry?.knownRansomwareUse).toBe(false)
  })

  it('getAllKevIds queries the database directly when no cache has been built', () => {
    seedKev(db, 'CVE-1900-0001')
    const service = new KevService(db, { autoSync: false })

    const ids = service.getAllKevIds()

    expect(ids.has('CVE-1900-0001')).toBe(true)
  })

  it('getAllKevIds returns the in-memory cache once buildCache has populated it', async () => {
    seedKev(db, 'CVE-1900-0001')
    const service = new KevService(db, { autoSync: false })
    await service.initialize()

    const ids = service.getAllKevIds()

    expect(ids.has('CVE-1900-0001')).toBe(true)
  })

  it('getKevByDateRange filters to the given window and maps null fields to undefined', () => {
    db.prepare(
      `INSERT INTO kev_catalog (cve_id, vendor_project, product, vulnerability_name, date_added,
         short_description, required_action, due_date, known_ransomware_use, notes, updated_at)
       VALUES ('CVE-1900-0001', 'V', 'P', 'name', '2020-01-01', 'desc', 'act', NULL, 0, NULL, datetime('now'))`,
    ).run()
    db.prepare(
      `INSERT INTO kev_catalog (cve_id, vendor_project, product, vulnerability_name, date_added,
         short_description, required_action, due_date, known_ransomware_use, notes, updated_at)
       VALUES ('CVE-1900-0002', 'V', 'P', 'name', '2050-06-01', 'desc', 'act', NULL, 0, NULL, datetime('now'))`,
    ).run()
    const service = new KevService(db, { autoSync: false })

    const entries = service.getKevByDateRange('2019-01-01', '2021-01-01')

    // WHY: proves the date filter is a real bound WHERE clause (not the whole catalog) and
    // that null optional fields don't leak through as raw SQL NULL.
    expect(entries).toHaveLength(1)
    expect(entries[0].cveId).toBe('CVE-1900-0001')
    expect(entries[0].dueDate).toBeUndefined()
    expect(entries[0].notes).toBeUndefined()
  })

  it('getCatalogStats reports all-zero/null when the catalog is empty', () => {
    const service = new KevService(db, { autoSync: false })

    expect(service.getCatalogStats()).toEqual({ total: 0, ransomwareRelated: 0, lastUpdated: null })
  })

  it('getCatalogStats counts ransomware-flagged entries and reports a non-null lastUpdated', () => {
    seedKev(db, 'CVE-1900-0001') // known_ransomware_use = 0
    db.prepare(
      `INSERT INTO kev_catalog (cve_id, vendor_project, product, vulnerability_name, date_added,
         short_description, required_action, due_date, known_ransomware_use, notes, updated_at)
       VALUES ('CVE-1900-0002', 'V', 'P', 'name', '2099-01-01', 'desc', 'act', NULL, 1, NULL, datetime('now'))`,
    ).run()
    const service = new KevService(db, { autoSync: false })

    const stats = service.getCatalogStats()

    expect(stats.total).toBe(2)
    expect(stats.ransomwareRelated).toBe(1)
    expect(stats.lastUpdated).not.toBeNull()
  })
})

describe('KevService — scheduleSync / shutdown', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    db.close()
  })

  it('actually invokes a sync when the scheduled interval elapses (not just a timer object)', async () => {
    vi.useFakeTimers()
    // Fresh sync_metadata means the *initial* isSyncNeeded check is false, isolating this
    // test to the scheduled-timer path — any fetch call here must come from the timer tick.
    db.prepare("INSERT INTO sync_metadata (key, value) VALUES ('kev_last_sync', ?)").run(new Date().toISOString())
    seedKev(db, 'CVE-1900-0001')
    const fetchMock = vi.fn(mockCisaFetchImpl(['CVE-1900-0001']))
    vi.stubGlobal('fetch', fetchMock)
    const service = new KevService(db, { autoSync: true, syncIntervalHours: 24, cisaUrl: 'http://test.local' })
    await service.initialize()
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    // WHY: a callback that scheduled successfully but silently did nothing would look
    // identical from outside until the interval actually elapsed — this proves it fires.
    expect(fetchMock).toHaveBeenCalled()

    service.shutdown()
  })

  it('clears a previously scheduled timer instead of stacking a second one on re-init', async () => {
    vi.useFakeTimers()
    // A fresh sync_metadata row avoids a real fetch firing during this timer-focused test.
    db.prepare("INSERT INTO sync_metadata (key, value) VALUES ('kev_last_sync', ?)").run(new Date().toISOString())
    seedKev(db, 'CVE-1900-0001')
    const service = new KevService(db, { autoSync: true, syncIntervalHours: 24 })

    await service.initialize()
    expect(vi.getTimerCount()).toBe(1)

    await service.initialize()

    // WHY: without clearing the old interval first, every re-init would leak another
    // background timer, eventually firing overlapping syncs against the same DB.
    expect(vi.getTimerCount()).toBe(1)

    service.shutdown()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shutdown is a safe no-op when autoSync never scheduled a timer', async () => {
    const service = new KevService(db, { autoSync: false })
    await service.initialize()

    expect(() => service.shutdown()).not.toThrow()
  })
})

describe('KevService — getKevService / resetKevService singleton', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    resetKevService()
    db.close()
  })

  it('throws a descriptive error when called before any instance exists', () => {
    expect(() => getKevService()).toThrow('KevService not initialized. Call getKevService(db) first.')
  })

  it('returns the same instance on repeated calls, ignoring a later db argument', () => {
    const first = getKevService(db)
    const otherDb = makeDb()

    const second = getKevService(otherDb)

    // WHY: the singleton must not silently swap its DB handle mid-run — other call sites
    // rely on getKevService() (no args) resolving to the instance wired up at startup.
    expect(second).toBe(first)
    otherDb.close()
  })

  it('creates a fresh instance after resetKevService (test isolation / hot restart)', () => {
    const first = getKevService(db)
    resetKevService()
    const second = getKevService(db)

    expect(second).not.toBe(first)
  })

  it('resetKevService is a safe no-op when no instance has been created', () => {
    expect(() => resetKevService()).not.toThrow()
  })
})

// SEC-2 (docs/reports/code-review-2026-08-22.md). syncFromCisa delists every CVE absent from the
// fetched catalog. That is right for a genuine CISA removal and catastrophic for a response that
// merely looks like a catalog — an HTTP 200 carrying an empty or truncated list wipes the lot, and
// isKev() then answers false for every CVE in the product. The pre-existing failure tests only
// covered a *failed* fetch; this one succeeds, which is exactly why it got through.
describe('KevService — implausible catalogs are refused (SEC-2)', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    db.close()
  })

  /** Seed `count` KEV entries so the shrink guard's minimum-size condition is met. */
  function seedMany(count: number): string[] {
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      const id = `CVE-1900-${String(i).padStart(4, '0')}`
      seedKev(db, id)
      ids.push(id)
    }
    return ids
  }

  it('refuses an HTTP-200 empty catalog and keeps every existing entry', async () => {
    const ids = seedMany(60)
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })
    await service.initialize()

    mockCisaFetch([])
    const result = await service.syncFromCisa()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/empty/i)
    // The whole point: KEV status must survive a bad response.
    expect(service.isKev(ids[0])).toBe(true)
    expect(service.isKev(ids[59])).toBe(true)
    const row = db.prepare('SELECT COUNT(*) as c FROM kev_catalog').get() as { c: number }
    expect(row.c).toBe(60)
  })

  it('refuses a catalog that lost more than a fifth of its entries', async () => {
    const ids = seedMany(60)
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })
    await service.initialize()

    // A truncated response carrying only 40 of the 60 known entries (a 33% drop).
    mockCisaFetch(ids.slice(0, 40))
    const result = await service.syncFromCisa()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/implausible/i)
    expect(service.isKev(ids[50])).toBe(true)
  })

  it('still applies a plausible update, including genuine delistings', async () => {
    const ids = seedMany(60)
    const service = new KevService(db, { autoSync: false, cisaUrl: 'http://test.local' })
    await service.initialize()

    // 5 delisted (8%), 1 added — an ordinary CISA update, which must NOT be refused.
    mockCisaFetch([...ids.slice(0, 55), 'CVE-1900-7777'])
    const result = await service.syncFromCisa()

    expect(result.success).toBe(true)
    expect(result.removed).toBe(5)
    expect(service.isKev(ids[59])).toBe(false)
    expect(service.isKev('CVE-1900-7777')).toBe(true)
  })
})
