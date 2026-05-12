// API URLs
// When running from localhost (Vite dev server), use proxy URLs to avoid CORS
// When running from file:// (packaged Electron), use direct URLs (no CORS restrictions)
// Note: In Electron dev mode, the renderer still loads from localhost, so CORS applies
const needsProxy =
  typeof window !== 'undefined' &&
  window.location != null &&
  (window.location.protocol === 'http:' || window.location.protocol === 'https:')

export const NVD_API_BASE_URL = needsProxy
  ? '/api/nvd' // Proxy through Vite dev server
  : 'https://services.nvd.nist.gov/rest/json/cves/2.0'

export const OSV_API_BASE_URL = needsProxy
  ? '/api/osv' // Proxy through Vite dev server
  : 'https://api.osv.dev/v1'

export const OSS_INDEX_API_BASE_URL = 'https://ossindex.sonatype.org/api/v3'
export const GITHUB_ADVISORY_API_BASE_URL = 'https://api.github.com/advisories'
export const SNYK_API_BASE_URL = 'https://api.snyk.io/v1'

// Severity thresholds
export const CRITICAL_SCORE_THRESHOLD = 9.0
export const HIGH_SCORE_THRESHOLD = 7.0
export const MEDIUM_SCORE_THRESHOLD = 4.0
export const LOW_SCORE_THRESHOLD = 0.1

// Severity levels
export const SEVERITY_LEVELS = {
  CRITICAL: 'critical' as const,
  HIGH: 'high' as const,
  MEDIUM: 'medium' as const,
  LOW: 'low' as const,
  NONE: 'none' as const,
}

// Font size mappings
export const FONT_SIZES = {
  small: '12px',
  default: '14px',
  large: '16px',
} as const

// Default settings
export const DEFAULT_SETTINGS = {
  theme: 'system' as const,
  fontSize: 'default' as const,
  dataRetentionDays: 30,
  autoRefresh: false,
  autoRefreshInterval: 24 as const, // hours
  vulnDataCacheTTL: 1 as const, // hours
  // New provider settings with defaults
  vulnProviders: {
    nvd: {
      enabled: true,
      priority: 1,
      rateLimit: {
        requestsPerHour: 600, // Without API key
        requestsPerMinute: 10,
      },
    },
    osv: {
      enabled: true,
      priority: 2,
      rateLimit: {
        requestsPerHour: 1000, // OSV has generous limits
      },
    },
    ossIndex: {
      enabled: false,
      priority: 3,
      rateLimit: {
        requestsPerHour: 1000,
        requestsPerMinute: 16,
      },
    },
    githubAdvisory: {
      enabled: false,
      priority: 4,
      rateLimit: {
        requestsPerHour: 5000, // With authentication
        requestsPerMinute: 83,
      },
    },
    snyk: {
      enabled: false,
      priority: 5,
      rateLimit: {
        requestsPerHour: 200, // Free tier
      },
    },
  },
  cvssVersion: '3.1' as const,
  showCvssBreakdown: true,
  maxGraphNodes: 500,
  showVulnerableOnly: false,
  // Database update schedule
  databaseUpdateSchedule: {
    enabled: false,
    frequency: 'weekly' as const,
    time: '02:00',
    dayOfWeek: 1, // Monday
    dayOfMonth: 1,
    bandwidthLimitKBps: 0, // Unlimited
    pauseOnBattery: true,
    wifiOnly: false,
  },
}

// Data retention
export const DATA_RETENTION_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
  { value: -1, label: 'Never' },
]

// ============================================================
// DATABASE SETTINGS
// ============================================================

/**
 * Default database settings
 */
export const DEFAULT_DATABASE_SETTINGS = {
  syncSchedule: 'weekly' as const,
  storage: {
    maxSizeMB: 2048, // 2 GB max
    pruneOldCves: false,
    pruneOlderThanYear: 2019, // Keep CVEs from 2020 onwards
  },
  performance: {
    searchResultLimit: 100,
    enableSearchCache: true,
    cacheSizeMB: 64,
    cacheTTLMinutes: 60,
  },
}

/**
 * Sync schedule options
 */
export const SYNC_SCHEDULE_OPTIONS = [
  { value: 'daily', label: 'Daily', description: 'Sync every day at the scheduled time' },
  { value: 'weekly', label: 'Weekly', description: 'Sync once a week' },
  { value: 'monthly', label: 'Monthly', description: 'Sync once a month' },
  { value: 'manual', label: 'Manual Only', description: 'Only sync when manually triggered' },
]

/**
 * Search result limit options
 */
export const SEARCH_RESULT_LIMIT_OPTIONS = [
  { value: 50, label: '50 results' },
  { value: 100, label: '100 results' },
  { value: 200, label: '200 results' },
  { value: 500, label: '500 results' },
  { value: 1000, label: '1000 results' },
]

/**
 * Cache size options (in MB)
 */
export const CACHE_SIZE_OPTIONS = [
  { value: 32, label: '32 MB' },
  { value: 64, label: '64 MB' },
  { value: 128, label: '128 MB' },
  { value: 256, label: '256 MB' },
]

/**
 * Database size limit options (in MB)
 */
export const DATABASE_SIZE_OPTIONS = [
  { value: 512, label: '512 MB' },
  { value: 1024, label: '1 GB' },
  { value: 2048, label: '2 GB' },
  { value: 4096, label: '4 GB' },
  { value: 0, label: 'Unlimited' },
]

/**
 * Pruning year options (keep CVEs from this year onwards)
 */
export const PRUNE_YEAR_OPTIONS = [
  { value: 2024, label: '2024 onwards (most recent)' },
  { value: 2020, label: '2020 onwards (5 years)' },
  { value: 2015, label: '2015 onwards (10 years)' },
  { value: 2010, label: '2010 onwards (15 years)' },
  { value: 2005, label: '2005 onwards (20 years)' },
  { value: 1999, label: 'Keep all (1999 onwards)' },
]

// Auto-refresh intervals
export const AUTO_REFRESH_INTERVAL_OPTIONS = [
  { value: 1, label: 'Every hour' },
  { value: 6, label: 'Every 6 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Daily' },
  { value: 168, label: 'Weekly' },
]

// Cache TTL options
export const CACHE_TTL_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 24, label: '24 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
]

// Project file storage
export const PROJECTS_DIR = 'projects'
export const SETTINGS_FILE = 'settings.json'

// Provider display names
export const PROVIDER_NAMES = {
  nvd: 'NVD (National Vulnerability Database)',
  osv: 'OSV (Open Source Vulnerabilities)',
  ossIndex: 'OSS Index (Sonatype)',
  githubAdvisory: 'GitHub Advisory Database',
  snyk: 'Snyk Vulnerability Database',
}

// Provider descriptions
export const PROVIDER_DESCRIPTIONS = {
  nvd: 'US government repository of standards based vulnerability management data',
  osv: 'Open source vulnerability database for all open source projects',
  ossIndex: 'Free vulnerability database by Sonatype with rich remediation data',
  githubAdvisory: "GitHub's security advisory database with patched version information",
  snyk: 'Commercial vulnerability database with exploit status and workarounds',
}

// CVSS metric values for parsing
export const CVSS_METRIC_VALUES = {
  attackVector: {
    N: 'Network',
    A: 'Adjacent',
    L: 'Local',
    P: 'Physical',
  },
  attackComplexity: {
    L: 'Low',
    H: 'High',
  },
  privilegesRequired: {
    N: 'None',
    L: 'Low',
    H: 'High',
  },
  userInteraction: {
    N: 'None',
    R: 'Required',
  },
  scope: {
    U: 'Unchanged',
    C: 'Changed',
  },
  confidentialityImpact: {
    H: 'High',
    L: 'Low',
    N: 'None',
  },
  integrityImpact: {
    H: 'High',
    L: 'Low',
    N: 'None',
  },
  availabilityImpact: {
    H: 'High',
    L: 'Low',
    N: 'None',
  },
}

// Patch availability status colors
export const PATCH_STATUS_COLORS = {
  available: 'text-green-600 bg-green-100',
  partial: 'text-yellow-600 bg-yellow-100',
  upstream: 'text-blue-600 bg-blue-100',
  investigating: 'text-gray-600 bg-gray-100',
  none: 'text-red-600 bg-red-100',
}

// Patch availability status labels
export const PATCH_STATUS_LABELS = {
  available: 'Fix Available',
  partial: 'Partial Fix',
  upstream: 'Fix Upstream',
  investigating: 'Investigating',
  none: 'No Fix Available',
}

// Severity colors for charts
export const SEVERITY_COLORS = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
  none: '#6b7280',
}

// ============================================================
// VULNERABILITY SEARCH LIMITS
// ============================================================

/**
 * Maximum number of results to return from CPE-based vulnerability search
 * Higher values provide more comprehensive results but may impact performance
 * Note: Maximum value is 1000 to match IPC request validator limits
 */
export const VULN_SEARCH_CPE_LIMIT = 1000

/**
 * Maximum number of results to return from text-based (name) vulnerability search
 * Lower than CPE limit since text search is less precise and may return noise
 */
export const VULN_SEARCH_NAME_LIMIT = 100

// ============================================================
// E2E TEST TIMEOUTS (milliseconds)
// ============================================================

/**
 * Default timeout for E2E test operations
 */
export const E2E_DEFAULT_TIMEOUT = 30000

/**
 * Timeout for waiting on selectors in E2E tests
 */
export const E2E_SELECTOR_TIMEOUT = 15000

/**
 * Short timeout for quick UI interactions
 */
export const E2E_SHORT_TIMEOUT = 5000

/**
 * Timeout for DOM content loaded state
 */
export const E2E_LOAD_TIMEOUT = 30000

/**
 * Delay for UI animations and transitions
 */
export const E2E_UI_DELAY = 500

/**
 * Delay for search input debounce
 */
export const E2E_SEARCH_DELAY = 1000
