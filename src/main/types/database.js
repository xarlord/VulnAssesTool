/**
 * IPC Type Definitions for Database Operations
 *
 * Defines the communication protocol between renderer and main process
 * for NVD database operations via IPC.
 */
/**
 * IPC Channel Names
 */
export const DB_IPC_CHANNELS = {
    /** Search NVD database */
    SEARCH: 'db:nvd-search',
    /** Get specific CVE by ID */
    GET_CVE: 'db:nvd-get-by-cve',
    /** Get database statistics */
    GET_STATS: 'db:nvd-get-stats',
    /** Get sync status */
    GET_SYNC_STATUS: 'db:sync-status',
    /** Start NVD sync */
    START_SYNC: 'db:sync-start',
};
/**
 * Error codes for database operations
 */
export var DatabaseErrorCode;
(function (DatabaseErrorCode) {
    DatabaseErrorCode["DATABASE_NOT_INITIALIZED"] = "DATABASE_NOT_INITIALIZED";
    DatabaseErrorCode["DATABASE_LOCKED"] = "DATABASE_LOCKED";
    DatabaseErrorCode["INVALID_CVE_FORMAT"] = "INVALID_CVE_FORMAT";
    DatabaseErrorCode["INVALID_CPE_FORMAT"] = "INVALID_CPE_FORMAT";
    DatabaseErrorCode["SEARCH_FAILED"] = "SEARCH_FAILED";
    DatabaseErrorCode["SYNC_IN_PROGRESS"] = "SYNC_IN_PROGRESS";
    DatabaseErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    DatabaseErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(DatabaseErrorCode || (DatabaseErrorCode = {}));
