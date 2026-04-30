/**
 * Database Version Manager
 *
 * Manages database version tracking for:
 * - Detecting when pre-seeded database needs updates
 * - Tracking schema version compatibility
 * - Managing database build/seed versioning
 *
 * Version Format: MAJOR.MINOR.PATCH-BUILD
 * - MAJOR: Breaking schema changes (requires full rebuild)
 * - MINOR: New features (backward compatible)
 * - PATCH: Bug fixes (backward compatible)
 * - BUILD: Data freshness timestamp (YYYYMMDD)
 */

import type { Database } from 'sql.js'

// Metadata keys for version tracking
const VERSION_KEY = 'db_version'
const SCHEMA_VERSION_KEY = 'schema_version'
const SEED_VERSION_KEY = 'seed_version'
const LAST_SYNC_KEY = 'last_sync_at'
const SEED_DATE_KEY = 'seed_date'
const SEED_CVE_COUNT_KEY = 'seed_cve_count'

/**
 * Database version information
 */
export interface DatabaseVersion {
  /** Full version string (e.g., "2.1.0-20250224") */
  version: string
  /** Major version - breaking changes */
  major: number
  /** Minor version - new features */
  minor: number
  /** Patch version - bug fixes */
  patch: number
  /** Build date - data freshness (YYYYMMDD) */
  buildDate: number
  /** Schema version */
  schemaVersion: number
  /** Seed data version */
  seedVersion: string
  /** When the seed data was created */
  seedDate: string | null
  /** Number of CVEs in the seed */
  seedCveCount: number
  /** Last successful sync timestamp */
  lastSyncAt: string | null
}

/**
 * Version comparison result
 */
export type VersionComparison = 'newer' | 'same' | 'older' | 'incompatible'

/**
 * Options for version manager
 */
export interface VersionManagerOptions {
  /** Current application version */
  appVersion: string
  /** Current schema version */
  schemaVersion: number
  /** Minimum compatible schema version */
  minSchemaVersion: number
}

/**
 * Database Version Manager
 */
export class DbVersionManager {
  private db: Database
  private options: VersionManagerOptions

  constructor(db: Database, options: VersionManagerOptions) {
    this.db = db
    this.options = options
  }

  /**
   * Get current database version information
   */
  getVersion(): DatabaseVersion {
    const versionStr = this.getMetadataValue(VERSION_KEY, '0.0.0-0')
    const schemaVersion = parseInt(this.getMetadataValue(SCHEMA_VERSION_KEY, '0'), 10)
    const seedVersion = this.getMetadataValue(SEED_VERSION_KEY, '0')
    const seedDate = this.getMetadataValue(SEED_DATE_KEY, '')
    const seedCveCount = parseInt(this.getMetadataValue(SEED_CVE_COUNT_KEY, '0'), 10)
    const lastSyncAt = this.getMetadataValue(LAST_SYNC_KEY, '')

    const parsed = this.parseVersion(versionStr)

    return {
      version: versionStr,
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      buildDate: parsed.buildDate,
      schemaVersion,
      seedVersion,
      seedDate: seedDate || null,
      seedCveCount,
      lastSyncAt: lastSyncAt || null,
    }
  }

  /**
   * Set database version
   */
  setVersion(version: Partial<DatabaseVersion>): void {
    if (version.version) {
      this.setMetadataValue(VERSION_KEY, version.version)
    }
    if (version.schemaVersion !== undefined) {
      this.setMetadataValue(SCHEMA_VERSION_KEY, version.schemaVersion.toString())
    }
    if (version.seedVersion) {
      this.setMetadataValue(SEED_VERSION_KEY, version.seedVersion)
    }
    if (version.seedDate) {
      this.setMetadataValue(SEED_DATE_KEY, version.seedDate)
    }
    if (version.seedCveCount !== undefined) {
      this.setMetadataValue(SEED_CVE_COUNT_KEY, version.seedCveCount.toString())
    }
    if (version.lastSyncAt) {
      this.setMetadataValue(LAST_SYNC_KEY, version.lastSyncAt)
    }
  }

  /**
   * Check if database is compatible with current application
   */
  isCompatible(): boolean {
    const version = this.getVersion()
    return version.schemaVersion >= this.options.minSchemaVersion
  }

  /**
   * Check if this is a first run (no data or incompatible)
   */
  isFirstRun(): boolean {
    const version = this.getVersion()

    // No version set means fresh database
    if (version.version === '0.0.0-0') {
      return true
    }

    // Check for minimum CVE count (indicates seeded data)
    if (version.seedCveCount === 0 && this.getTotalCveCount() === 0) {
      return true
    }

    // Schema incompatibility requires fresh start
    if (!this.isCompatible()) {
      return true
    }

    return false
  }

  /**
   * Check if database needs an update (newer seed available)
   */
  needsUpdate(latestSeedVersion: string, latestSeedDate: string): boolean {
    const version = this.getVersion()

    // Check seed version first
    const comparison = this.compareSeedVersions(version.seedVersion, latestSeedVersion)
    if (comparison === 'older') {
      return true
    }

    // Check seed date for data freshness
    if (version.seedDate && latestSeedDate) {
      const currentSeedDate = parseInt(version.seedDate.replace(/-/g, ''), 10)
      const newSeedDate = parseInt(latestSeedDate.replace(/-/g, ''), 10)
      if (newSeedDate > currentSeedDate) {
        return true
      }
    }

    return false
  }

  /**
   * Compare two versions
   */
  compareVersions(v1: string, v2: string): VersionComparison {
    const parsed1 = this.parseVersion(v1)
    const parsed2 = this.parseVersion(v2)

    // Check major version for incompatibility
    if (parsed1.major !== parsed2.major) {
      return 'incompatible'
    }

    // Compare minor, patch, buildDate
    if (parsed1.minor > parsed2.minor) return 'newer'
    if (parsed1.minor < parsed2.minor) return 'older'
    if (parsed1.patch > parsed2.patch) return 'newer'
    if (parsed1.patch < parsed2.patch) return 'older'
    if (parsed1.buildDate > parsed2.buildDate) return 'newer'
    if (parsed1.buildDate < parsed2.buildDate) return 'older'

    return 'same'
  }

  /**
   * Compare seed versions (format: YYYYMMDD or semantic version)
   */
  compareSeedVersions(v1: string, v2: string): VersionComparison {
    // Handle numeric seed versions (YYYYMMDD format)
    const num1 = parseInt(v1, 10)
    const num2 = parseInt(v2, 10)

    if (!isNaN(num1) && !isNaN(num2)) {
      if (num1 > num2) return 'newer'
      if (num1 < num2) return 'older'
      return 'same'
    }

    // Fall back to semantic version comparison
    return this.compareVersions(v1, v2)
  }

  /**
   * Record successful seed operation
   */
  recordSeed(version: string, cveCount: number, seedDate: string): void {
    const _parsed = this.parseVersion(version)

    this.setVersion({
      version,
      schemaVersion: this.options.schemaVersion,
      seedVersion: version,
      seedDate,
      seedCveCount: cveCount,
    })
  }

  /**
   * Record successful sync
   */
  recordSync(timestamp: string): void {
    this.setMetadataValue(LAST_SYNC_KEY, timestamp)
  }

  /**
   * Get the current seed information for display
   */
  getSeedInfo(): {
    hasSeed: boolean
    seedDate: string | null
    cveCount: number
    needsHistoricalSync: boolean
  } {
    const version = this.getVersion()
    const totalCves = this.getTotalCveCount()

    // Check if we have seed data
    const hasSeed = version.seedCveCount > 0 || totalCves > 0

    // Determine if historical sync is needed
    // If we have less CVEs than expected for full history (250K+), we need historical sync
    const needsHistoricalSync = hasSeed && totalCves < 200000

    return {
      hasSeed,
      seedDate: version.seedDate,
      cveCount: version.seedCveCount || totalCves,
      needsHistoricalSync,
    }
  }

  /**
   * Get total CVE count from database
   */
  private getTotalCveCount(): number {
    try {
      const result = this.db.exec('SELECT COUNT(*) FROM cves')
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0] as number
      }
    } catch {
      // Table might not exist yet
    }
    return 0
  }

  /**
   * Parse version string into components
   */
  private parseVersion(version: string): {
    major: number
    minor: number
    patch: number
    buildDate: number
  } {
    const defaultResult = { major: 0, minor: 0, patch: 0, buildDate: 0 }

    if (!version || version === '0.0.0-0') {
      return defaultResult
    }

    // Format: MAJOR.MINOR.PATCH-BUILD or MAJOR.MINOR.PATCH
    const parts = version.split('-')
    const versionParts = parts[0].split('.')

    const major = parseInt(versionParts[0] || '0', 10)
    const minor = parseInt(versionParts[1] || '0', 10)
    const patch = parseInt(versionParts[2] || '0', 10)
    const buildDate = parseInt(parts[1] || '0', 10)

    return { major, minor, patch, buildDate }
  }

  /**
   * Get metadata value from database
   */
  private getMetadataValue(key: string, defaultValue: string): string {
    try {
      const result = this.db.exec('SELECT value FROM metadata WHERE key = ?', [key])
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0] as string
      }
    } catch {
      // Table might not exist yet
    }
    return defaultValue
  }

  /**
   * Set metadata value in database
   */
  private setMetadataValue(key: string, value: string): void {
    this.db.run(
      `
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
      [key, value],
    )
  }
}

/**
 * Create a version manager instance
 */
export function createDbVersionManager(db: Database, options?: Partial<VersionManagerOptions>): DbVersionManager {
  const defaultOptions: VersionManagerOptions = {
    appVersion: '2.0.0',
    schemaVersion: 12, // Current schema version from migrations
    minSchemaVersion: 0,
    ...options,
  }

  return new DbVersionManager(db, defaultOptions)
}

/**
 * Get current build date as YYYYMMDD
 */
export function getCurrentBuildDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Generate a version string from components
 */
export function generateVersion(major: number, minor: number, patch: number, buildDate?: number): string {
  const build = buildDate || parseInt(getCurrentBuildDate(), 10)
  return `${major}.${minor}.${patch}-${build}`
}

/**
 * Pre-defined seed versions for releases
 */
export const SEED_VERSIONS = {
  /** Latest seed version */
  LATEST: '2.0.0-20250224',
  /** Minimum compatible version */
  MIN_COMPATIBLE: '2.0.0',
  /** Years included in pre-seed (2024-2025) */
  PRE_SEED_YEARS: [2024, 2025] as const,
  /** Historical data start year */
  HISTORICAL_START_YEAR: 1999,
}
