/**
 * KevService - CISA Known Exploited Vulnerabilities Service
 *
 * Manages the KEV catalog for identifying actively exploited vulnerabilities.
 * Uses a hybrid approach: bundled baseline + daily sync from CISA.
 *
 * @module KevService
 */

import type { Database } from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'

/**
 * KEV catalog entry from CISA
 */
export interface KevEntry {
  cveId: string
  vendorProject: string
  product: string
  vulnerabilityName: string
  dateAdded: string
  shortDescription: string
  requiredAction: string
  dueDate?: string
  knownRansomwareUse: boolean
  notes?: string
}

/**
 * CISA KEV JSON format
 */
interface KevCatalogJson {
  title: string
  catalogVersion: string
  dateReleased: string
  count: number
  vulnerabilities: Array<{
    cveID: string
    vendorProject: string
    product: string
    vulnerabilityName: string
    dateAdded: string
    shortDescription: string
    requiredAction: string
    dueDate: string
    knownRansomwareCampaignUse: string
    notes: string
  }>
}

/**
 * Sync result from CISA
 */
export interface KevSyncResult {
  success: boolean
  added: number
  removed: number
  unchanged: number
  total: number
  error?: string
  durationMs: number
}

/**
 * KEV service configuration
 */
export interface KevServiceConfig {
  /** CISA KEV catalog URL */
  cisaUrl: string
  /** Path to bundled baseline file */
  baselinePath: string
  /** Sync interval in hours (default: 24) */
  syncIntervalHours: number
  /** Enable auto-sync (default: true) */
  autoSync: boolean
}

const DEFAULT_CONFIG: KevServiceConfig = {
  cisaUrl: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  baselinePath: 'resources/kev-baseline.json',
  syncIntervalHours: 24,
  autoSync: true,
}

/**
 * KevService class
 *
 * Provides access to CISA Known Exploited Vulnerabilities catalog.
 * Implements hybrid approach: bundled baseline for offline use, daily sync for updates.
 */
export class KevService {
  private db: Database
  private config: KevServiceConfig
  private kevCache: Set<string> | null = null
  private lastSyncTime: Date | null = null
  private syncTimer: NodeJS.Timeout | null = null

  constructor(db: Database, config: Partial<KevServiceConfig> = {}) {
    this.db = db
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize the KEV service
   * Loads baseline data if catalog is empty
   */
  async initialize(): Promise<void> {
    console.log('[KevService] Initializing...')

    // Check if catalog has data
    const count = this.getCatalogCount()

    if (count === 0) {
      console.log('[KevService] Catalog empty, loading baseline data...')
      await this.loadBaseline()
    } else {
      console.log(`[KevService] Catalog has ${count} entries`)
    }

    // Build cache for fast lookups
    await this.buildCache()

    // Check if sync is needed
    if (this.config.autoSync && (await this.isSyncNeeded())) {
      console.log('[KevService] Sync needed, starting background sync...')
      this.syncFromCisa().catch((err) => {
        console.error('[KevService] Background sync failed:', err)
      })
    }

    // Schedule periodic sync
    if (this.config.autoSync) {
      this.scheduleSync()
    }

    console.log('[KevService] Initialized successfully')
  }

  /**
   * Load bundled baseline data
   */
  async loadBaseline(): Promise<number> {
    try {
      // In Electron main process, always use app path
      const basePath = await this.getAppPath()

      const baselinePath = path.join(basePath, this.config.baselinePath)

      if (!fs.existsSync(baselinePath)) {
        console.warn('[KevService] Baseline file not found at:', baselinePath)
        // Create a minimal baseline with recent critical KEV entries
        return this.loadEmbeddedBaseline()
      }

      const content = fs.readFileSync(baselinePath, 'utf-8')
      const catalog: KevCatalogJson = JSON.parse(content)

      return this.importCatalog(catalog, 'baseline')
    } catch (error) {
      console.error('[KevService] Failed to load baseline:', error)
      // Fall back to embedded baseline
      return this.loadEmbeddedBaseline()
    }
  }

  /**
   * Load embedded baseline (minimal set of critical KEV entries)
   */
  private loadEmbeddedBaseline(): number {
    console.log('[KevService] Loading embedded baseline...')

    const embeddedBaseline: KevCatalogJson = {
      title: 'CISA Known Exploited Vulnerabilities Catalog (Embedded Baseline)',
      catalogVersion: '2024.1',
      dateReleased: new Date().toISOString().split('T')[0],
      count: EMBEDDED_KEV_ENTRIES.length,
      vulnerabilities: EMBEDDED_KEV_ENTRIES,
    }

    return this.importCatalog(embeddedBaseline, 'embedded')
  }

  /**
   * Get app path (Electron-specific)
   */
  private async getAppPath(): Promise<string> {
    // In Electron main process, use electron app
    try {
      const { app } = await import('electron')
      return app.getPath('userData')
    } catch {
      return process.cwd()
    }
  }

  /**
   * Import catalog data into database
   */
  private importCatalog(catalog: KevCatalogJson, source: string): number {
    const startTime = Date.now()
    let imported = 0

    // Use transaction for bulk insert
    this.db.run('BEGIN TRANSACTION')

    try {
      for (const vuln of catalog.vulnerabilities) {
        try {
          this.db.run(
            `
            INSERT OR REPLACE INTO kev_catalog (
              cve_id, vendor_project, product, vulnerability_name,
              date_added, short_description, required_action,
              due_date, known_ransomware_use, notes, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `,
            [
              vuln.cveID,
              vuln.vendorProject,
              vuln.product,
              vuln.vulnerabilityName,
              vuln.dateAdded,
              vuln.shortDescription,
              vuln.requiredAction,
              vuln.dueDate || null,
              vuln.knownRansomwareCampaignUse === 'Known' ? 1 : 0,
              vuln.notes || null,
            ],
          )

          // Update is_kev flag in cves table
          this.db.run('UPDATE cves SET is_kev = 1 WHERE id = ?', [vuln.cveID])

          imported++
        } catch (err) {
          console.warn(`[KevService] Failed to import ${vuln.cveID}:`, err)
        }
      }

      this.db.run('COMMIT')

      const duration = Date.now() - startTime
      console.log(`[KevService] Imported ${imported} KEV entries from ${source} in ${duration}ms`)

      return imported
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  /**
   * Sync latest KEV catalog from CISA
   */
  async syncFromCisa(): Promise<KevSyncResult> {
    const startTime = Date.now()
    console.log('[KevService] Starting sync from CISA...')

    try {
      // Fetch from CISA
      const response = await fetch(this.config.cisaUrl)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const catalog = (await response.json()) as KevCatalogJson

      // Get current entries for comparison
      const currentIds = this.getAllKevIds()
      const newIds = new Set(catalog.vulnerabilities.map((v) => v.cveID))

      // Calculate diff
      let added = 0
      let removed = 0
      let unchanged = 0

      for (const id of newIds) {
        if (!currentIds.has(id)) added++
        else unchanged++
      }

      for (const id of currentIds) {
        if (!newIds.has(id)) removed++
      }

      // Import new catalog
      const imported = this.importCatalog(catalog, 'CISA')

      // Update sync timestamp
      this.updateSyncTimestamp()

      // Rebuild cache
      await this.buildCache()

      const duration = Date.now() - startTime

      const result: KevSyncResult = {
        success: true,
        added,
        removed,
        unchanged,
        total: imported,
        durationMs: duration,
      }

      console.log(
        `[KevService] Sync complete: ${result.added} added, ${result.removed} removed, ${result.unchanged} unchanged`,
      )

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      console.error('[KevService] Sync failed:', error)

      return {
        success: false,
        added: 0,
        removed: 0,
        unchanged: 0,
        total: 0,
        error: String(error),
        durationMs: duration,
      }
    }
  }

  /**
   * Check if a CVE is in the KEV catalog
   */
  isKev(cveId: string): boolean {
    if (this.kevCache) {
      return this.kevCache.has(cveId)
    }

    // Fallback to database query
    const result = this.db.exec('SELECT 1 FROM kev_catalog WHERE cve_id = ?', [cveId])

    return result.length > 0 && result[0].values.length > 0
  }

  /**
   * Get KEV details for a specific CVE
   */
  getKevDetails(cveId: string): KevEntry | null {
    const result = this.db.exec(
      `
      SELECT
        cve_id, vendor_project, product, vulnerability_name,
        date_added, short_description, required_action,
        due_date, known_ransomware_use, notes
      FROM kev_catalog
      WHERE cve_id = ?
    `,
      [cveId],
    )

    if (result.length === 0 || result[0].values.length === 0) {
      return null
    }

    const row = result[0].values[0]

    return {
      cveId: row[0] as string,
      vendorProject: row[1] as string,
      product: row[2] as string,
      vulnerabilityName: row[3] as string,
      dateAdded: row[4] as string,
      shortDescription: row[5] as string,
      requiredAction: row[6] as string,
      dueDate: row[7] as string | undefined,
      knownRansomwareUse: row[8] === 1,
      notes: row[9] as string | undefined,
    }
  }

  /**
   * Get all KEV CVE IDs as a Set for fast lookups
   */
  getAllKevIds(): Set<string> {
    if (this.kevCache) {
      return this.kevCache
    }

    const result = this.db.exec('SELECT cve_id FROM kev_catalog')
    const ids = new Set<string>()

    if (result.length > 0) {
      for (const row of result[0].values) {
        ids.add(row[0] as string)
      }
    }

    return ids
  }

  /**
   * Get KEV entries by date range
   */
  getKevByDateRange(startDate: string, endDate: string): KevEntry[] {
    const result = this.db.exec(
      `
      SELECT
        cve_id, vendor_project, product, vulnerability_name,
        date_added, short_description, required_action,
        due_date, known_ransomware_use, notes
      FROM kev_catalog
      WHERE date_added >= ? AND date_added <= ?
      ORDER BY date_added DESC
    `,
      [startDate, endDate],
    )

    if (result.length === 0) {
      return []
    }

    return result[0].values.map((row) => ({
      cveId: row[0] as string,
      vendorProject: row[1] as string,
      product: row[2] as string,
      vulnerabilityName: row[3] as string,
      dateAdded: row[4] as string,
      shortDescription: row[5] as string,
      requiredAction: row[6] as string,
      dueDate: row[7] as string | undefined,
      knownRansomwareUse: row[8] === 1,
      notes: row[9] as string | undefined,
    }))
  }

  /**
   * Get catalog statistics
   */
  getCatalogStats(): { total: number; ransomwareRelated: number; lastUpdated: string | null } {
    const totalResult = this.db.exec('SELECT COUNT(*) FROM kev_catalog')
    const ransomwareResult = this.db.exec('SELECT COUNT(*) FROM kev_catalog WHERE known_ransomware_use = 1')
    const lastUpdatedResult = this.db.exec('SELECT MAX(updated_at) FROM kev_catalog')

    return {
      total: totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0,
      ransomwareRelated: ransomwareResult.length > 0 ? (ransomwareResult[0].values[0][0] as number) : 0,
      lastUpdated:
        lastUpdatedResult.length > 0 && lastUpdatedResult[0].values.length > 0
          ? (lastUpdatedResult[0].values[0][0] as string)
          : null,
    }
  }

  /**
   * Get catalog entry count
   */
  private getCatalogCount(): number {
    const result = this.db.exec('SELECT COUNT(*) FROM kev_catalog')
    return result.length > 0 ? (result[0].values[0][0] as number) : 0
  }

  /**
   * Build in-memory cache for fast lookups
   */
  private async buildCache(): Promise<void> {
    console.log('[KevService] Building cache...')
    this.kevCache = this.getAllKevIds()
    console.log(`[KevService] Cache built with ${this.kevCache.size} entries`)
  }

  /**
   * Check if sync is needed
   */
  private async isSyncNeeded(): Promise<boolean> {
    const result = this.db.exec(`
      SELECT value FROM sync_metadata WHERE key = 'kev_last_sync'
    `)

    if (result.length === 0 || result[0].values.length === 0) {
      return true
    }

    const lastSync = new Date(result[0].values[0][0] as string)
    const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)

    return hoursSinceSync >= this.config.syncIntervalHours
  }

  /**
   * Update sync timestamp
   */
  private updateSyncTimestamp(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    this.db.run(
      `
      INSERT OR REPLACE INTO sync_metadata (key, value)
      VALUES ('kev_last_sync', ?)
    `,
      [new Date().toISOString()],
    )

    this.lastSyncTime = new Date()
  }

  /**
   * Schedule periodic sync
   */
  private scheduleSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }

    const intervalMs = this.config.syncIntervalHours * 60 * 60 * 1000

    this.syncTimer = setInterval(() => {
      console.log('[KevService] Scheduled sync triggered')
      this.syncFromCisa().catch((err) => {
        console.error('[KevService] Scheduled sync failed:', err)
      })
    }, intervalMs)

    console.log(`[KevService] Scheduled sync every ${this.config.syncIntervalHours} hours`)
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    this.kevCache = null
    console.log('[KevService] Shutdown complete')
  }
}

/**
 * Embedded KEV baseline entries (critical/exploited vulnerabilities)
 * This is a minimal set for offline functionality
 */
const EMBEDDED_KEV_ENTRIES: KevCatalogJson['vulnerabilities'] = [
  {
    cveID: 'CVE-2024-1709',
    vendorProject: 'ConnectWise',
    product: 'ScreenConnect',
    vulnerabilityName: 'ConnectWise ScreenConnect Authentication Bypass',
    dateAdded: '2024-02-21',
    shortDescription:
      'ConnectWise ScreenConnect versions 23.9.7 and prior contain an authentication bypass vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2024-03-11',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2024-27198',
    vendorProject: 'JetBrains',
    product: 'TeamCity',
    vulnerabilityName: 'JetBrains TeamCity Authentication Bypass',
    dateAdded: '2024-03-04',
    shortDescription: 'JetBrains TeamCity versions prior to 2023.11.4 contain an authentication bypass vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2024-03-25',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2024-3400',
    vendorProject: 'Palo Alto Networks',
    product: 'PAN-OS',
    vulnerabilityName: 'Palo Alto Networks PAN-OS Command Injection',
    dateAdded: '2024-04-12',
    shortDescription: 'Palo Alto Networks PAN-OS contains a command injection vulnerability in GlobalProtect.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2024-05-02',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2023-44487',
    vendorProject: 'Multiple',
    product: 'HTTP/2',
    vulnerabilityName: 'HTTP/2 Rapid Reset Attack',
    dateAdded: '2023-10-10',
    shortDescription: 'Multiple HTTP/2 implementations are vulnerable to a DoS attack via rapid reset of streams.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-10-31',
    knownRansomwareCampaignUse: 'Unknown',
    notes: 'Widely exploited vulnerability affecting many products.',
  },
  {
    cveID: 'CVE-2023-38545',
    vendorProject: 'curl',
    product: 'libcurl',
    vulnerabilityName: 'curl Heap Buffer Overflow',
    dateAdded: '2023-10-11',
    shortDescription:
      'curl/libcurl versions 7.69.0 through 8.3.0 contain a heap buffer overflow in SOCKS5 proxy handshake.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-11-01',
    knownRansomwareCampaignUse: 'Unknown',
    notes: '',
  },
  {
    cveID: 'CVE-2023-46604',
    vendorProject: 'Apache',
    product: 'ActiveMQ',
    vulnerabilityName: 'Apache ActiveMQ RCE',
    dateAdded: '2023-11-01',
    shortDescription: 'Apache ActiveMQ versions 5.18.0 through 5.18.2 contain a remote code execution vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-11-21',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2023-22518',
    vendorProject: 'Atlassian',
    product: 'Confluence Data Center/Server',
    vulnerabilityName: 'Atlassian Confluence Improper Authorization',
    dateAdded: '2023-10-31',
    shortDescription: 'Atlassian Confluence Data Center and Server contain an improper authorization vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-11-21',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2023-20198',
    vendorProject: 'Cisco',
    product: 'IOS XE',
    vulnerabilityName: 'Cisco IOS XE Web UI Privilege Escalation',
    dateAdded: '2023-10-16',
    shortDescription: 'Cisco IOS XE Web UI contains a privilege escalation vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-11-06',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2023-4966',
    vendorProject: 'Citrix',
    product: 'NetScaler ADC/NetScaler Gateway',
    vulnerabilityName: 'Citrix NetScaler ADC and Gateway Buffer Overflow',
    dateAdded: '2023-10-10',
    shortDescription: 'Citrix NetScaler ADC and NetScaler Gateway contain a buffer overflow vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-10-31',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Also known as "Citrix Bleed"',
  },
  {
    cveID: 'CVE-2023-3519',
    vendorProject: 'Citrix',
    product: 'NetScaler ADC/NetScaler Gateway',
    vulnerabilityName: 'Citrix NetScaler ADC and Gateway RCE',
    dateAdded: '2023-07-18',
    shortDescription: 'Citrix NetScaler ADC and NetScaler Gateway contain a remote code execution vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-08-07',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2023-2868',
    vendorProject: 'Barracuda',
    product: 'Email Security Gateway',
    vulnerabilityName: 'Barracuda Email Security Gateway Remote Command Injection',
    dateAdded: '2023-05-23',
    shortDescription: 'Barracuda Email Security Gateway contains a remote command injection vulnerability.',
    requiredAction: 'Apply updates per vendor instructions; replace appliance if compromised.',
    dueDate: '2023-06-12',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2023-27997',
    vendorProject: 'Fortinet',
    product: 'FortiOS/FortiProxy',
    vulnerabilityName: 'Fortinet FortiOS Heap-Based Buffer Overflow',
    dateAdded: '2023-06-12',
    shortDescription: 'Fortinet FortiOS and FortiProxy contain a heap-based buffer overflow in SSL-VPN.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-07-03',
    knownRansomwareCampaignUse: 'Known',
    notes: '',
  },
  {
    cveID: 'CVE-2023-23397',
    vendorProject: 'Microsoft',
    product: 'Outlook',
    vulnerabilityName: 'Microsoft Outlook Elevation of Privilege',
    dateAdded: '2023-03-14',
    shortDescription: 'Microsoft Outlook contains an elevation of privilege vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-04-03',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Exploited by APT groups',
  },
  {
    cveID: 'CVE-2022-47986',
    vendorProject: 'IBM',
    product: 'Aspera FASP',
    vulnerabilityName: 'IBM Aspera FASP RCE',
    dateAdded: '2023-02-28',
    shortDescription:
      'IBM Aspera FASP contains a remote code execution vulnerability in the HTTP file transfer service.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2023-03-20',
    knownRansomwareCampaignUse: 'Unknown',
    notes: '',
  },
  {
    cveID: 'CVE-2022-41082',
    vendorProject: 'Microsoft',
    product: 'Exchange Server',
    vulnerabilityName: 'Microsoft Exchange Server RCE (ProxyNotShell)',
    dateAdded: '2022-09-29',
    shortDescription: 'Microsoft Exchange Server contains a remote code execution vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2022-10-19',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Part of ProxyNotShell exploit chain',
  },
  {
    cveID: 'CVE-2022-41040',
    vendorProject: 'Microsoft',
    product: 'Exchange Server',
    vulnerabilityName: 'Microsoft Exchange Server SSRF (ProxyNotShell)',
    dateAdded: '2022-09-29',
    shortDescription: 'Microsoft Exchange Server contains a server-side request forgery vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2022-10-19',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Part of ProxyNotShell exploit chain',
  },
  {
    cveID: 'CVE-2021-44228',
    vendorProject: 'Apache',
    product: 'Log4j',
    vulnerabilityName: 'Apache Log4j RCE (Log4Shell)',
    dateAdded: '2021-12-11',
    shortDescription: 'Apache Log4j contains a remote code execution vulnerability via JNDI lookup.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2021-12-31',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Also known as Log4Shell; extremely widespread impact',
  },
  {
    cveID: 'CVE-2021-45046',
    vendorProject: 'Apache',
    product: 'Log4j',
    vulnerabilityName: 'Apache Log4j RCE (Log4Shell variant)',
    dateAdded: '2021-12-14',
    shortDescription: 'Apache Log4j contains an additional RCE vulnerability in certain non-default configurations.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2022-01-03',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Related to Log4Shell',
  },
  {
    cveID: 'CVE-2020-1472',
    vendorProject: 'Microsoft',
    product: 'Windows Server',
    vulnerabilityName: 'Windows Server Netlogon Elevation of Privilege (Zerologon)',
    dateAdded: '2020-08-11',
    shortDescription: 'Windows Server contains an elevation of privilege vulnerability in Netlogon.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2020-08-31',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Also known as Zerologon',
  },
  {
    cveID: 'CVE-2019-0708',
    vendorProject: 'Microsoft',
    product: 'Windows Remote Desktop Services',
    vulnerabilityName: 'Windows RDS RCE (BlueKeep)',
    dateAdded: '2019-05-14',
    shortDescription: 'Windows Remote Desktop Services contains a remote code execution vulnerability.',
    requiredAction: 'Apply updates per vendor instructions.',
    dueDate: '2019-06-03',
    knownRansomwareCampaignUse: 'Known',
    notes: 'Also known as BlueKeep',
  },
]

// Singleton instance
let kevServiceInstance: KevService | null = null

/**
 * Get or create KevService singleton
 */
export function getKevService(db?: Database): KevService {
  if (!kevServiceInstance && db) {
    kevServiceInstance = new KevService(db)
  }
  if (!kevServiceInstance) {
    throw new Error('KevService not initialized. Call getKevService(db) first.')
  }
  return kevServiceInstance
}

/**
 * Reset KevService singleton (for testing)
 */
export function resetKevService(): void {
  if (kevServiceInstance) {
    kevServiceInstance.shutdown()
    kevServiceInstance = null
  }
}
