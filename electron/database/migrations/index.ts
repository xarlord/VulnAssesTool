/**
 * Database Migrations Module
 *
 * Provides schema migration functionality for the NVD database.
 */

export {
  getMigrations,
  runMigrations,
  rollbackToVersion,
  getSchemaVersion,
  isMigrationApplied,
} from './v2SchemaMigration.js'

export type { Migration, MigrationResult } from './v2SchemaMigration.js'
