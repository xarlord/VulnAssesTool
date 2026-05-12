/**
 * Enhanced NVD Database Manager with Bulk Operations
 * Extends the base NvdDatabase with batch insert capabilities
 * for efficient bulk loading of millions of CVEs.
 */

import type { CPEMatch, Reference, CVEWithDetails } from '../types.js'
import { getDatabase as getBaseDatabase, NvdDatabase } from '../nvdDb.js'

export interface BulkImportOptions {
  batchSize?: number // Commit batch size (default: 1000 CVEs)
  autoCommit?: boolean // Auto-commit after each batch (default: true)
  onProgress?: (stats: BulkImportStats) => void
}

export interface BulkImportStats {
  totalCVEs: number
  processedCVEs: number
  batchesProcessed: number
  currentBatch: number
  failedCVEs: number
  startTime: number
  endTime?: number
}

export interface BulkImportResult {
  success: boolean
  totalCVEs: number
  importedCVEs: number
  failedCVEs: number
  skippedCVEs: number
  duration: number
  error?: string
}

/**
 * Enhanced Database Manager with Bulk Operations
 */
export class BulkDatabaseManager {
  private db: NvdDatabase
  private transactionActive = false
  private pendingCVEs: CVEWithDetails[] = []
  private pendingCPEMatches: Map<string, CPEMatch[]> = new Map()
  private pendingReferences: Map<string, Reference[]> = new Map()
  private totalProcessed = 0
  private batchSize: number

  constructor(dbPath?: string) {
    this.db = getBaseDatabase(dbPath)
    this.batchSize = 1000
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (!this.db.isInitialized()) {
      await this.db.initialize()
    }
  }

  /**
   * Bulk import CVEs with batch processing
   */
  async bulkImportCVEs(cves: CVEWithDetails[], options: BulkImportOptions = {}): Promise<BulkImportResult> {
    const startTime = Date.now()
    const batchSize = options.batchSize || 1000

    let importedCVEs = 0
    let failedCVEs = 0
    const skippedCVEs = 0
    let batchesProcessed = 0

    try {
      const totalCVEs = cves.length

      options.onProgress?.({
        totalCVEs,
        processedCVEs: 0,
        batchesProcessed: 0,
        currentBatch: 0,
        failedCVEs: 0,
        startTime,
      })

      // Process in batches
      for (let i = 0; i < cves.length; i += batchSize) {
        const batch = cves.slice(i, Math.min(i + batchSize, cves.length))
        const batchNumber = Math.floor(i / batchSize) + 1

        try {
          // Start transaction for this batch
          await this.beginTransaction()

          // Insert batch
          let batchImported = 0
          let batchFailed = 0

          for (const cve of batch) {
            try {
              await this.upsertCVEInTransaction(cve)
              await this.insertCPEMatchesInTransaction(cve.id, cve.cpe_matches || [])
              await this.insertReferencesInTransaction(cve.id, cve.references || [])
              batchImported++
            } catch (error) {
              batchFailed++
              console.error(`Failed to import ${cve.id}:`, error)
            }
          }

          // Commit transaction
          await this.commitTransaction()

          importedCVEs += batchImported
          failedCVEs += batchFailed
          batchesProcessed++

          options.onProgress?.({
            totalCVEs,
            processedCVEs: importedCVEs + failedCVEs,
            batchesProcessed,
            currentBatch: batchNumber,
            failedCVEs,
            startTime,
          })
        } catch (error) {
          await this.rollbackTransaction()
          failedCVEs += batch.length
          console.error(`Batch ${batchNumber} failed:`, error)
        }
      }

      const endTime = Date.now()

      return {
        success: true,
        totalCVEs,
        importedCVEs,
        failedCVEs,
        skippedCVEs,
        duration: endTime - startTime,
      }
    } catch (error) {
      await this.rollbackTransaction()

      return {
        success: false,
        totalCVEs: cves.length,
        importedCVEs,
        failedCVEs,
        skippedCVEs,
        duration: Date.now() - startTime,
        error: (error as Error).message,
      }
    }
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    if (this.transactionActive) {
      return // Already in transaction
    }

    this.transactionActive = true
    this.pendingCVEs = []
    this.pendingCPEMatches.clear()
    this.pendingReferences.clear()
    this.totalProcessed = 0
  }

  /**
   * Commit the current transaction
   */
  async commitTransaction(): Promise<void> {
    if (!this.transactionActive) {
      return
    }

    try {
      // Use sql.js transaction
      // Note: This is a simplified version - sql.js doesn't support real transactions
      // We need to use the underlying db directly
      await this.flushPending()
      this.transactionActive = false
    } catch (error) {
      this.transactionActive = false
      throw error
    }
  }

  /**
   * Rollback the current transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (!this.transactionActive) {
      return
    }

    this.pendingCVEs = []
    this.pendingCPEMatches.clear()
    this.pendingReferences.clear()
    this.totalProcessed = 0
    this.transactionActive = false
  }

  /**
   * Flush pending operations to database
   */
  private async flushPending(): Promise<void> {
    // For sql.js, we need to use the underlying database
    // This is a limitation - we can't do real bulk inserts without direct SQL access
    // For now, we'll call individual upserts but batch the saveToDisk calls

    for (const cve of this.pendingCVEs) {
      await this.db.upsertCVE(cve)
      const cpeMatches = this.pendingCPEMatches.get(cve.id) || []
      await this.db.insertCPEMatches(cve.id, cpeMatches)
      const references = this.pendingReferences.get(cve.id) || []
      await this.db.insertReferences(cve.id, references)
    }

    this.pendingCVEs = []
    this.pendingCPEMatches.clear()
    this.pendingReferences.clear()
    this.totalProcessed = 0
  }

  /**
   * Upsert CVE in current transaction
   */
  private async upsertCVEInTransaction(cve: CVEWithDetails): Promise<void> {
    this.pendingCVEs.push(cve)
    this.totalProcessed++

    // Auto-flush if batch size reached
    if (this.totalProcessed >= this.batchSize) {
      await this.flushPending()
    }
  }

  /**
   * Insert CPE matches in current transaction
   */
  private async insertCPEMatchesInTransaction(cveId: string, matches: CPEMatch[]): Promise<void> {
    if (!this.pendingCPEMatches.has(cveId)) {
      this.pendingCPEMatches.set(cveId, [])
    }
    const entry = this.pendingCPEMatches.get(cveId)
    if (entry) entry.push(...matches)
  }

  /**
   * Insert references in current transaction
   */
  private async insertReferencesInTransaction(cveId: string, refs: Reference[]): Promise<void> {
    if (!this.pendingReferences.has(cveId)) {
      this.pendingReferences.set(cveId, [])
    }
    const entry = this.pendingReferences.get(cveId)
    if (entry) entry.push(...refs)
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalCVEs: number
    dbSize: number
    dbPath: string
  } {
    return {
      totalCVEs: this.db.getTotalCVECount(),
      dbSize: this.db.getDbSize(),
      dbPath: this.db.getDbPath(),
    }
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    await this.db.close()
  }

  /**
   * Get the underlying database instance
   */
  getDatabase(): NvdDatabase {
    return this.db
  }
}

// Singleton instance
let bulkDbInstance: BulkDatabaseManager | null = null

/**
 * Get or create the bulk database manager instance
 */
export function getBulkDatabase(dbPath?: string): BulkDatabaseManager {
  if (!bulkDbInstance) {
    bulkDbInstance = new BulkDatabaseManager(dbPath)
  }
  return bulkDbInstance
}

/**
 * Reset the bulk database manager instance
 */
export async function resetBulkDatabase(): Promise<void> {
  if (bulkDbInstance) {
    await bulkDbInstance.close()
    bulkDbInstance = null
  }
}
