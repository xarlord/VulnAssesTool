# VulnAssessTool - Architecture Documentation

**Version:** 1.0
**Last Updated:** 2026-02-12
**Status:** Active - Phase 2 (Architecture Design)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Electron Architecture](#electron-architecture)
4. [Layer Architecture](#layer-architecture)
5. [Component Architecture](#component-architecture)
6. [Data Model](#data-model)
7. [Security Architecture](#security-architecture)
8. [API Specifications](#api-specifications)
9. [Technology Decisions](#technology-decisions)
10. [Deployment Architecture](#deployment-architecture)
11. [Scalability Considerations](#scalability-considerations)

---

## System Overview

VulnAssessTool is an **Electron-based desktop application** that provides offline vulnerability assessment capabilities for Software Bill of Materials (SBOM). The application follows a **multi-process Electron architecture** with clear separation between:

- **Main Process:** Node.js environment for system operations, database access, and external API calls
- **Renderer Process:** Browser-based React UI for user interaction
- **Preload Script:** Secure bridge using Context Isolation for IPC communication

### Core Responsibilities

| Module | Responsibility |
|---------|---------------|
| **Project Management** | Create, edit, delete, and organize SBOM assessment projects |
| **SBOM Parsing** | Parse CycloneDX (JSON/XML) and SPDX format files |
| **Vulnerability Scanning** | Match components against local NVD database and external APIs |
| **Health Assessment** | Calculate component/project health scores (0-100 scale) |
| **Audit Logging** | Immutable audit trail for compliance (SOC 2, HIPAA) |
| **Reporting** | Export data as CSV, JSON, and PDF formats |

---

## High-Level Architecture

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        VulnAssessTool Application                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                    Renderer Process (React UI)                          │  │
│  │                                                                     │  │
│  │  ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐   │  │
│  │  │   Pages       │  │ Components │  │   Libraries      │   │  │
│  │  │               │  │            │  │                   │   │  │
│  │  │ • Dashboard   │  │ • Charts  │  │ • Zustand       │   │  │
│  │  │ • Search     │  │ • CVSS    │  │ • React Router  │   │  │
│  │  │ • Project Det.│  │ • Tables   │  │ • Recharts      │   │  │
│  │  │ • Settings   │  │ • Forms    │  │ • React Flow    │   │  │
│  │  │ • Executive  │  │ • Modals   │  │ • jsPDF         │   │  │
│  │  └───────────────┘  └──────────────┘  └───────────────────┘   │  │
│  │                                                                     │  │
│  │  ┌───────────────────────────────────────────────────────────────────────┐  │  │
│  │  │              Business Logic Layer (lib/)                          │  │  │
│  │  │                                                               │  │  │
│  │  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐   │  │  │
│  │  │ │ Parsers  │ │ Scanners │ │ Health   │ │ Analytics  │   │  │  │
│  │  │ │          │ │          │ │          │ │            │   │  │  │
│  │  │ │ CycloneDX│ │ Vuln     │ │ Score    │ │ Metrics    │   │  │  │
│  │  │ │ SPDX     │ │ Matcher  │ │ Trends   │ │ Reports    │   │  │  │
│  │  │ └──────────┘ └──────────┘ └──────────┘ └────────────┘   │  │  │
│  │  └───────────────────────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                │                                          │
│                                │ IPC (contextBridge)                       │
│                                ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                    Preload Script (Secure Bridge)                        │  │
│  │                                                                     │  │
│  │  • Exposes Database API via contextBridge                              │  │
│  │  • Type-safe IPC channel definitions                                   │  │
│  │  • No direct Node.js access to renderer                               │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                │                                          │
│                                ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                      Main Process (Node.js)                              │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    IPC Handlers (ipcMain)                          │  │  │
│  │  │                                                               │  │  │
│  │  │  • db:nvd-search        • db:nvd-get-by-cve                     │  │  │
│  │  │  • db:nvd-get-stats     • db:sync-status                       │  │  │
│  │  │  • db:sync-start       • app-version                           │  │  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                     │  │
│  │  ┌──────────────────────────────────────────────────────────────────────┐   │  │
│  │  │                   Database Layer (electron/database/)                │   │  │
│  │  │                                                              │   │  │
│  │  │  ┌──────────────────────────────────────────────────────────────┐    │   │  │
│  │  │  │           NvdDatabase (SQLite via sql.js)               │    │   │  │
│  │  │  │                                                          │    │   │  │
│  │  │  │  Tables:                                                │    │   │  │
│  │  │  │  • cves          • cpe_matches    • references            │    │   │  │
│  │  │  │  • metadata      • schema_migrations                    │    │   │  │
│  │  │  │                                                          │    │   │  │
│  │  │  │  Indexes: severity, cvss_score, published_at, cpe_text   │    │   │  │
│  │  │  └──────────────────────────────────────────────────────────────┘    │   │  │
│  │  │                                                              │   │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐  │   │  │
│  │  │  │ NVD      │ │ Rate     │ │ Stream     │ │ Bulk    │  │   │  │
│  │  │  │ Import    │ │ Limiter  │ │ Parser     │ │ DB      │  │   │  │
│  │  │  │ Manager   │ │          │ │            │ │         │  │   │  │
│  │  │  └──────────┘ └──────────┘ └────────────┘ └─────────┘  │   │  │
│  │  └──────────────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                │                                          │
│                                │                                          │
│                                ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                      External Systems                                   │  │
│  │                                                                     │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌──────────────────────┐        │  │
│  │  │ NVD API    │  │ OSV API  │  │ Local File System  │        │  │
│  │  │ (REST 2.0) │  │ (REST)   │  │                  │        │  │
│  │  │             │  │          │  │ • SBOM Files      │        │  │
│  │  │ 5 req/30s  │  │ 1000/hour│  │ • Database Files  │        │  │
│  │  │ (no key)    │  │          │  │ • Export Files   │        │  │
│  │  └─────────────┘  └──────────┘  └──────────────────────┘        │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌─────────────┐
│ User Input │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Renderer Process (React)                         │
│                                                                │
│  1. User uploads SBOM file                                      │
│  2. Parser extracts components (CycloneDX/SPDX)                │
│  3. Components stored in project state (Zustand)                  │
│  4. User initiates vulnerability scan                              │
└──────────────────────────────┬────────────────────────────────────────┘
                           │
                           │ IPC Request
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Main Process (Node.js)                          │
│                                                                │
│  5. Receive scan request via IPC                               │
│  6. Query local NVD database (SQLite)                          │
│  7. Return matching CVEs to renderer                           │
└──────────────────────────────┬────────────────────────────────────────┘
                           │
                           │ IPC Response
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Renderer Process (React)                         │
│                                                                │
│  8. Display vulnerabilities in UI                                │
│  9. Calculate health scores                                     │
│ 10. Generate visualizations                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Electron Architecture

### Process Model

VulnAssessTool uses Electron's **multi-process architecture** with strict security boundaries:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         Browser Window                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                   Renderer Process                                │ │
│  │                                                                   │ │
│  │  • React 19.2.0 application                                     │ │
│  │  • Vite 7.2.4 for HMR (dev) / bundling (prod)               │ │
│  │  • No direct Node.js access (nodeIntegration: false)              │ │
│  │  • Context Isolation enabled                                       │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│                                │ contextBridge                      │
│                                │ (Secure API Exposure)             │
│                                ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                   Preload Script                                  │ │
│  │                                                                   │ │
│  │  • Exposes typed Database API via contextBridge                      │ │
│  │  • Provides event listeners for sync progress                       │ │
│  │  • No raw Node.js APIs exposed                                  │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                │                                    │
│                                │ IPC Communication               │
│                                ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                   Main Process                                    │ │
│  │                                                                   │ │
│  │  • Node.js runtime environment                                    │ │
│  │  • Window management (BrowserWindow)                              │ │
│  │  • System integration (menu, dialogs, shell)                      │ │
│  │  • Database operations (SQLite via sql.js)                         │ │
│  │  • External API calls (NVD, OSV)                               │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Security Model

| Feature | Implementation | Status |
|---------|---------------|--------|
| **Context Isolation** | Enabled in webPreferences | ✅ Active |
| **Node Integration** | Disabled (nodeIntegration: false) | ✅ Active |
| **Sandbox** | Enabled for renderer | ✅ Active |
| **Content Security Policy** | Custom CSP via meta tag + session headers | ✅ Active |
| **Preload Script** | Secure bridge via contextBridge | ✅ Active |
| **API Key Storage** | Encrypted via Electron safeStorage, NOT in renderer state | ✅ Active |
| **Code Signing** | Configured in electron-builder | ⚠️ Pending Setup |

---

## Layer Architecture

The application follows a **layered architecture** with clear separation of concerns:

### 1. Presentation Layer (Renderer Process)

**Location:** `src/renderer/pages/`, `src/renderer/components/`

**Responsibilities:**
- UI rendering with React 19.2.0
- User interaction handling
- Display data visualization (charts, tables, graphs)
- Form input validation

**Key Components:**
```typescript
// Pages
- Dashboard              // Project list and quick actions
- ProjectDetail          // Individual project view with vulnerabilities
- Search                // Global search across projects
- Settings             // Application settings
- ExecutiveDashboard    // Portfolio-level metrics

// UI Components
- ProjectCard          // Project summary card
- VulnerabilityDetailModal // Detailed CVE information
- HealthScoreCard      // Health score visualization
- CvssScoreGauge      // CVSS score gauge
- ExportDialog         // Data export interface
```

### 2. Business Logic Layer

**Location:** `src/renderer/lib/`

**Responsibilities:**
- SBOM parsing (CycloneDX, SPDX)
- Vulnerability matching and scoring
- Health score calculation
- Data export formatting
- Audit logging

**Key Modules:**
```typescript
// Parsers
lib/
├── parsers/
│   ├── cyclonedx.ts      // CycloneDX JSON/XML parser
│   └── spdx.ts            // SPDX parser

// API & Scanning
├── api/
│   ├── nvd.ts             // NVD API client
│   ├── osv.ts             // OSV API client
│   ├── vulnMatcher.ts     // Component-to-vulnerability matching
│   └── providers/         // Provider abstraction layer

// Health & Analytics
├── health/
│   ├── healthScore.ts      // Score calculation (0-100)
│   └── trends.ts          // Trend analysis

// Audit & Compliance
├── audit/
│   ├── auditLogger.ts      // Audit event logging
│   ├── auditMiddleware.ts // Store middleware for audit
│   └── auditExporters.ts // Export to CSV/JSON/PDF

// Export & Reports
├── export/
│   ├── csv.ts             // CSV export
│   ├── json.ts            // JSON export
│   └── pdf.ts             // PDF report generation

// Settings & State
├── settings/
│   ├── profiles.ts         // Settings profile management
│   └── importExport.ts    // Profile import/export

// Other utilities
├── cache/
│   └── vulnCache.ts      // Vulnerability data caching

├── notifications/
│   └── notificationService.ts // Desktop notifications

├── refresh/
│   └── refreshService.ts  // Vulnerability data refresh

└── search/
    └── searchIndex.ts     // Full-text search
```

### 3. Data Layer

**Main Process:** `electron/database/`
**Renderer Process:** `src/renderer/lib/database/`

**Responsibilities:**
- SQLite database management
- Schema migrations
- Data persistence
- Query optimization

### 4. IPC Layer

**Preload Script:** `electron/preload.ts`
**Main Process Handlers:** `electron/main.ts`

**IPC Channels:**
```typescript
// Database Operations (DB_IPC_CHANNELS)
'db:nvd-search'        // Search NVD database
'db:nvd-get-by-cve'    // Get specific CVE
'db:nvd-get-stats'      // Database statistics
'db:sync-status'        // NVD sync status
'db:sync-start'         // Start NVD sync

// Application Channels
'ping'                 // Connection test
'app-version'           // Application version
'app-platform'          // Platform detection
'open-external'         // External URL handling
'theme-changed'        // Theme updates (renderer ← main)
'menu-action'          // Menu actions (main → renderer)

// Sync Progress (main → renderer)
'nvd-sync-progress'     // Sync progress updates
'nvd-sync-complete'     // Sync completion
'nvd-sync-error'        // Sync errors
```

---

## Component Architecture

### Renderer Process Components

```
src/renderer/
├── main.tsx                 // Application entry point
├── App.tsx                  // Root component with routing
├── pages/                   // Page-level components
│   ├── Dashboard.tsx
│   ├── ProjectDetail.tsx
│   ├── Search.tsx
│   └── Settings.tsx
├── components/               // Reusable UI components
│   ├── cvss/              // CVSS visualization
│   ├── charts/            // Chart components
│   ├── patch/             // Patch information
│   └── executive/        // Executive dashboard widgets
├── lib/                    // Business logic
│   ├── api/              // API clients
│   ├── parsers/          // SBOM parsers
│   ├── health/           // Health scoring
│   ├── audit/            // Audit logging
│   ├── export/           // Data export
│   ├── settings/         // Settings management
│   └── ...
└── store/                   // State management
    └── useStore.ts        // Zustand store
```

### State Management (Zustand)

```typescript
// Store Structure
interface AppState {
  // Settings
  settings: AppSettings
  updateSettings: (updates) => void

  // Settings Profiles
  settingsProfiles: SettingsProfile[]
  activeProfileId: string
  loadSettingsProfiles: () => void
  createSettingsProfile: (name, desc, settings) => void
  updateSettingsProfile: (id, updates) => void
  deleteSettingsProfile: (id) => void
  switchSettingsProfile: (id) => void

  // Projects
  projects: Project[]
  currentProject: Project | null
  addProject: (project) => void
  updateProject: (id, updates) => void
  deleteProject: (id) => void
  setCurrentProject: (project) => void
  refreshVulnerabilityData: (projectId) => Promise<void>

  // UI State
  sidebarOpen: boolean
  setSidebarOpen: (open) => void
  refreshingProjectIds: Set<string>
  setRefreshingProject: (projectId, isRefreshing) => void

  // Notifications
  notificationPreferences: NotificationPreferences
  updateNotificationPreferences: (prefs) => void
}
```

**Persistence:** Zustand persist middleware with localStorage

---

## Data Model

### Database Schema (SQLite)

**File Location:** `{userData}/nvd-data.db`
**Technology:** sql.js (WebAssembly SQLite)

#### Tables

##### 1. CVEs Table
```sql
CREATE TABLE cves (
  id TEXT PRIMARY KEY,                    -- CVE ID (e.g., CVE-2024-1234)
  description TEXT NOT NULL,              -- Vulnerability description
  cvss_score REAL,                        -- CVSS base score (0-10)
  cvss_vector TEXT,                       -- CVSS vector string
  severity CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  published_at TEXT NOT NULL,              -- ISO 8601 timestamp
  modified_at TEXT NOT NULL,               -- ISO 8601 timestamp
  source CHECK(source IN ('NVD', 'OSV'))  -- Data source
);

CREATE INDEX idx_cves_severity ON cves(severity);
CREATE INDEX idx_cves_cvss_score ON cves(cvss_score);
CREATE INDEX idx_cves_published_at ON cves(published_at);
```

##### 2. CPE Matches Table
```sql
CREATE TABLE cpe_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cve_id TEXT NOT NULL,                   -- Foreign key to cves
  cpe_text TEXT NOT NULL,                  -- CPE 2.3 string
  vulnerable INTEGER NOT NULL DEFAULT 0,     -- Boolean: 1=vulnerable
  FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
);

CREATE INDEX idx_cpe_matches_cve_id ON cpe_matches(cve_id);
CREATE INDEX idx_cpe_matches_cpe_text ON cpe_matches(cpe_text);
```

##### 3. References Table
```sql
CREATE TABLE "references" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cve_id TEXT NOT NULL,                   -- Foreign key to cves
  url TEXT NOT NULL,                       -- Reference URL
  source TEXT,                             -- Source name
  tags TEXT,                              -- Comma-separated tags
  FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
);

CREATE INDEX idx_references_cve_id ON "references"(cve_id);
```

##### 4. Metadata Table
```sql
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,                    -- Metadata key
  value TEXT NOT NULL                      -- Metadata value
);

-- Standard keys:
-- - last_sync_at: Last NVD sync timestamp
-- - schema_version: Current schema version
```

##### 5. Schema Migrations Table
```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,              -- Migration version number
  applied_at TEXT NOT NULL                 -- ISO 8601 timestamp
);
```

### In-Memory Data Models

#### Project Data Structure
```typescript
interface Project {
  id: string;                      // ULID-based unique ID
  name: string;                    // Project name
  description?: string;             // Optional description
  createdAt: Date;                // Creation timestamp
  updatedAt: Date;                 // Last update timestamp
  lastScanAt?: Date;              // Last scan time
  lastVulnDataRefresh?: Date;     // Last vuln data refresh
  sbomFiles: SbomFile[];         // Uploaded SBOM files
  components: Component[];         // Parsed components
  vulnerabilities: Vulnerability[];  // Matched vulnerabilities
  statistics: ProjectStatistics;   // Aggregate statistics
  dependencyGraph?: DependencyGraph;  // Optional dependency graph
}
```

#### Component Data Structure
```typescript
interface Component {
  id: string;                      // Component ULID
  name: string;                    // Component name
  version: string;                 // Component version
  type: 'library' | 'framework' | 'application' | 'container' | 'other';
  purl?: string;                   // Package URL
  cpe?: string;                    // CPE identifier
  licenses: string[];               // License list
  supplier?: string;               // Vendor/author
  description?: string;            // Component description
  hash?: string;                   // Component hash
  vulnerabilities: string[];         // Associated CVE IDs
  dependencies?: string[];          // Dependency component IDs
  dependents?: string[];           // Dependent component IDs
  patchInfo?: ComponentPatchInfo;   // Patch availability info
}
```

#### Vulnerability Data Structure
```typescript
interface Vulnerability {
  id: string;                      // CVE ID
  source: 'nvd' | 'osv' | 'both';  // Data source(s)
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  cvssScore?: number;              // CVSS score
  cvssVector?: string;             // CVSS vector string
  cvssBreakdown?: CvssBreakdown;  // Detailed CVSS analysis
  cwes?: string[];                // CWE identifiers
  description: string;             // Vulnerability description
  references: VulnerabilityReference[];  // External references
  affectedComponents: string[];      // Affected component IDs
  publishedAt?: Date;             // Publication date
  modifiedAt?: Date;              // Last modification date
  patchInfo?: PatchInfo;          // Patch information
  exploitStatus?: 'exploited' | 'publicly-disclosed' | 'not-exploited' | 'unknown';
}
```

### Data Relationships

```
Project (1) ──────┬──── (N) SbomFile
       │              │
       │              └── Component (1:N)
       │                     │
       │                     ├── (N:M) Vulnerability
       │                     │       │
       │                     │       └── CVE Details
       │                     │
       │                     ├── (N:N) Component (dependencies)
       │                     │
       │                     └── (N:N) Component (dependents)
       │
       └── ProjectStatistics (1:1)
```

---

## Security Architecture

### Electron Security Configuration

#### Main Process Security
```typescript
// electron/main.ts
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,        // ✅ Enabled
    nodeIntegration: false,          // ✅ Disabled
    webSecurity: true,              // ✅ Enabled (except E2E tests)
  }
})
```

#### Preload Script Security
```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // Only expose specific, typed APIs
  database: {
    search: (request) => ipcRenderer.invoke('db:nvd-search', request),
    getCve: (request) => ipcRenderer.invoke('db:nvd-get-by-cve', request),
    // ... other database methods
  }
})
```

### Data Protection

| Data Type | Current Protection | Status |
|-----------|-------------------|---------|
| **API Keys** | 🔒 Encrypted via Electron safeStorage | ✅ Implemented |
| **Project Data** | 🔒 Local SQLite file | ⚠️ Needs encryption |
| **Audit Logs** | 🔒 Immutable log | ✅ Secure |
| **Exported Reports** | 🔒 File system | ⚠️ Optional password protection |

**Secure Storage Implementation:**
- **Location:** `electron/main/storage/secureStorage.ts`
- **Method:** Electron safeStorage API
- **Platforms:**
  - Windows: DPAPI (Data Protection API)
  - macOS: Keychain Services
  - Linux: libsecret
- **Features:**
  - Automatic encryption/decryption
  - Migration from plaintext keys
  - Prefix-based encryption detection

#### Content Security Policy (CSP)

**Purpose:** Prevent XSS attacks and data injection attacks

**Implementation:**
1. **Meta Tag CSP** (`index.html`):
   ```html
   <meta http-equiv="Content-Security-Policy" content="default-src 'self'; ...">
   ```

2. **Session Header CSP** (`electron/main.ts`):
   ```typescript
   mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
     if (details.resourceType === 'mainFrame') {
       callback({
         responseHeaders: {
           ...details.responseHeaders,
           'Content-Security-Policy': '...'
         }
       })
     }
   })
   ```

**CSP Directives:**
- `default-src 'self'` - Only allow resources from same origin
- `script-src 'self' 'unsafe-inline' 'unsafe-eval'` - Allow inline scripts for React/JSX
- `connect-src 'self' https://...` - Allow API connections to NVD, OSV, GitHub
- `style-src 'self' 'unsafe-inline'` - Allow inline styles
- `img-src 'self' data: https:` - Allow images from self, data URIs, and HTTPS
- `object-src 'none'` - Block plugins (Flash, Java, etc.)

### API Security

#### NVD API
- **Base URL:** `https://services.nvd.nist.gov/rest/json/cves/2.0`
- **Rate Limits:** 5 requests / 30 seconds (without API key)
- **Rate Limiting:** Implemented in `electron/database/nvd/rateLimiter.ts`
- **Authentication:** Optional API key (header: `apiKey`)

#### OSV API
- **Base URL:** `https://api.osv.dev/v1`
- **Rate Limits:** ~1000 requests/hour
- **Authentication:** None required
- **Implementation:** `src/renderer/lib/api/osv.ts`

### Audit Trail Security

**Purpose:** Immutable audit log for compliance (SOC 2, HIPAA)

**Implementation:** `src/renderer/lib/audit/auditLogger.ts`

```typescript
interface AuditEvent {
  id: string;                      // ULID (time-ordered)
  timestamp: Date;                 // Event timestamp
  sessionId: string;                // Session identifier
  userId?: string;                  // Future: Multi-user support
  actionType: AuditActionType;      // CREATE/UPDATE/DELETE/SCAN/EXPORT
  entityType: AuditEntityType;       // project/sbom/vulnerability/...
  entityId: string;                 // Affected entity ID
  previousState?: unknown;          // Before state (for UPDATE/DELETE)
  newState?: unknown;              // After state (for CREATE/UPDATE)
  metadata?: AuditEventMetadata;    // Additional context
}
```

**Audit Storage:** Local file system (JSON)
**Immutability:** No update/delete operations on audit events
**Export Formats:** CSV, JSON, PDF

---

## API Specifications

### Internal IPC API

#### Database API

**Exposed via:** `window.electronAPI.database`

```typescript
interface DatabaseAPI {
  // Search Operations
  search(request: NvdSearchRequest): Promise<NvdSearchResponse>
  // NvdSearchRequest: { type: 'cve-id' | 'cpe' | 'text', query: string, limit?, offset? }
  // NvdSearchResponse: { success, results: CveResult[], total, limit, offset, error? }

  // Single CVE Lookup
  getCve(request: GetCveRequest): Promise<GetCveResponse>
  // GetCveRequest: { cveId: string }
  // GetCveResponse: { success, cve: CveResult | null, error? }

  // Database Statistics
  getStats(): Promise<GetStatsResponse>
  // GetStatsResponse: { success, stats: { totalCves, lastUpdate, dbSize, version }, error? }

  // Sync Operations
  getSyncStatus(): Promise<SyncStatusResponse>
  // SyncStatusResponse: { success, status: { isSyncing, progress, total, currentFile, error?, lastSync }, error? }

  startSync(request?: StartSyncRequest): Promise<StartSyncResponse>
  // StartSyncRequest: { force?, years?: number[] }
  // StartSyncResponse: { success, message, error? }

  // Event Listeners
  onSyncProgress(callback: (progress) => void): () => void  // Returns cleanup function
  onSyncComplete(callback: (result) => void): () => void
  onSyncError(callback: (error) => void): () => void
}
```

### External API Specifications

#### NVD API v2.0

**Base Endpoint:** `https://services.nvd.nist.gov/rest/json/cves/2.0`

**Endpoints:**

| Method | Endpoint | Description | Parameters |
|--------|-----------|-------------|--------------|
| GET | `/cve/{CVE_ID}` | Get specific CVE | `cvssMetricV31`, `cpeName` |
| GET | `/` | List CVEs | `isExact`, `hasCertNote`, `hasCertNote` |

**Response Format:**
```typescript
interface NvdApiResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities: NvdApiCve[];
}

interface NvdApiCve {
  id: string;                       // CVE-YYYY-NNNN
  sourceIdentifier: string;
  published: string;                 // ISO 8601
  lastModified: string;              // ISO 8601
  vulnStatus: string;
  descriptions: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31: Array<{
      cvssData: {
        version: string;
        vectorString: string;
        baseScore: number;
        baseSeverity: string;
      }
    }>
  };
  weaknesses?: Array<{ description: Array<{ lang: string; value: string }> }>;
  references?: Array<{ url: string; source: string; tags?: string[] }>;
  cpe?: Array<{
    criteria: string;
    matchCriteriaId: string;
    vulnerable: boolean;
  }>;
}
```

#### OSV API v1

**Base Endpoint:** `https://api.osv.dev/v1`

**Endpoints:**

| Method | Endpoint | Description | Parameters |
|--------|-----------|-------------|--------------|
| POST | `/query` | Query by package | `{ package: { name, ecosystem, purl } }` |
| GET | `/vulns/{ID}` | Get vulnerability by ID | - |

**Request Format:**
```typescript
interface OsvQueryRequest {
  package: {
    name: string;              // Package name
    ecosystem: string;         // npm, PyPI, Maven, Go, etc.
    purl?: string;            // Package URL
  };
  version?: string;            // Specific version
}
```

**Response Format:**
```typescript
interface OsvVulnerability {
  id: string;                       // OSV-YYYY-NNNN
  summary?: string;
  details: string;
  affected: Array<{
    package: { name: string; ecosystem: string; purl: string };
    ranges: Array<{
      type: string;            // SEMVER, ECOSYSTEM, etc.
      events: Array<{ introduced?: string; fixed?: string }>
    }>;
    versions?: string[];
  }>;
  published?: string;
  modified: string;
  references?: Array<{ type: string; url: string }>;
  severity?: Array<{ type: string; score: string }>;
  aliases?: string[];              // Related CVE IDs
}
```

---

## Technology Decisions

### Technology Stack

| Layer | Technology | Version | Rationale |
|--------|-------------|----------|------------|
| **Desktop Framework** | Electron | 40.1.0 | Cross-platform desktop, Node.js + Chromium |
| **Frontend Framework** | React | 19.2.0 | Latest features, concurrent rendering, large ecosystem |
| **Language** | TypeScript | ~5.9.3 | Type safety, better developer experience |
| **Build Tool** | Vite | 7.2.4 | Fast HMR, optimized builds, modern |
| **State Management** | Zustand | 5.0.11 | Lightweight, simple API, no boilerplate |
| **Styling** | Tailwind CSS | 3.4.19 | Utility-first, consistent design system |
| **Database (Local)** | sql.js | 1.12.0 | WebAssembly SQLite, works in Electron |
| **Database (Main)** | better-sqlite3 | 12.6.2 | Synchronous API for main process |
| **Routing** | React Router | 7.13.0 | Declarative routing, code splitting |
| **Charts** | Recharts | 3.7.0 | React-friendly, customizable |
| **Graphs** | React Flow | 11.11.4 | Dependency graph visualization |
| **PDF Generation** | jsPDF | 4.1.0 | Client-side PDF generation |
| **Excel Export** | XLSX | 0.18.5 | Spreadsheet generation |
| **Testing (Unit)** | Vitest | 4.0.18 | Fast, native ESM support |
| **Testing (E2E)** | Playwright | 1.58.1 | Cross-browser, reliable |
| **Testing (BDD)** | Cucumber.js | 12.6.0 | Gherkin syntax, business-readable |

### Rationale for Key Decisions

#### Electron vs. Tauri vs. NW.js
**Chosen: Electron 40.1.0**

| Criteria | Electron | Tauri | NW.js |
|----------|-----------|---------|---------|
| Cross-platform | ✅ Excellent | ✅ Good | ✅ Good |
| Community | ✅ Large | 🟡 Growing | 🟡 Mature |
| Documentation | ✅ Extensive | 🟡 Adequate | 🟡 Limited |
| Package Size | ❌ Large (~150MB) | ✅ Small (~5MB) | 🟡 Medium |
| Performance | ✅ Good | ✅ Excellent | 🟡 Good |
| Development Speed | ✅ Fast | 🟡 Moderate | ✅ Fast |

**Decision Factors:**
- Largest community and ecosystem
- Extensive documentation and examples
- Familiar development model (web technologies)
- Chrome DevTools integration

#### Zustand vs. Redux vs. Jotai
**Chosen: Zustand 5.0.11**

| Criteria | Zustand | Redux | Jotai |
|----------|----------|--------|--------|
| Bundle Size | ✅ ~1KB | ❌ ~15KB | 🟡 ~3KB |
| Boilerplate | ✅ Minimal | ❌ High | ✅ Minimal |
| Learning Curve | ✅ Low | ❌ High | ✅ Low |
| DevTools | 🟡 Third-party | ✅ Built-in | 🟡 Basic |
| Persistence | ✅ Built-in middleware | ❌ Requires setup | ✅ Built-in |

**Decision Factors:**
- Minimal boilerplate
- Built-in persistence middleware
- TypeScript support
- Simple mental model

#### sql.js vs. better-sqlite3 vs. Sequelize
**Chosen: sql.js (renderer) + better-sqlite3 (main)**

| Criteria | sql.js | better-sqlite3 | Sequelize |
|----------|---------|-----------------|------------|
| Renderer Compatible | ✅ Yes | ❌ No | ❌ No |
| WASM Performance | ✅ Good | 🟡 Better (native) | ❌ Overhead |
| Async API | ❌ No | ✅ Yes | ✅ Yes |
| Type Safety | 🟡 Basic | ✅ Good | ✅ Excellent |
| Setup Complexity | ✅ Low | 🟡 Medium | ❌ High |

**Decision Factors:**
- sql.js works in renderer (for browser testing)
- better-sqlite3 for main process performance
- Direct SQL control for optimization
- No ORM overhead

---

## Deployment Architecture

### Build Process

```
Development Build:
  Vite Dev Server (port 3000)
    ↓
  Renderer Process (HMR enabled)
    ↓
  Main Process (TypeScript compiled)
    ↓
  Electron loads from dev server

Production Build:
  1. TypeScript Compilation (Main Process)
     tsc -p tsconfig.main.json
     ↓ dist/electron/*.js

  2. Vite Build (Renderer Process)
     vite build
     ↓ dist/index.html + dist/assets/*

  3. Electron Builder
     electron-builder
     ↓
  Platform-specific installers:
     • Windows: NSIS installer
     • macOS: DMG image
     • Linux: AppImage
```

### Build Configuration

**electron-builder configuration:**
```json
{
  "appId": "com.vulnasstool.app",
  "productName": "VulnAssessTool",
  "directories": {
    "output": "release",
    "buildResources": "build"
  },
  "files": ["dist/**/*", "package.json"],
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "signAndEditExecutable": false
  },
  "mac": {
    "target": ["dmg"],
    "category": "public.app-category.developer-tools"
  },
  "linux": {
    "target": [{ "target": "AppImage", "arch": ["x64"] }],
    "category": "Development"
  }
}
```

### Code Signing

**Current Status:** ⚠️ Configured but not implemented

**Required for:**
- Windows: Code signing certificate
- macOS: Apple Developer certificate
- Linux: Optional (gpg signing)

**Implementation Steps:**
1. Obtain code signing certificates
2. Configure `electron-builder` with certificate paths
3. Set up CI/CD for secure signing
4. Verify signed installers

### Update Mechanism

**Planned:** electron-updater

**Current:** Manual updates via GitHub Releases

**Future Implementation:**
```typescript
import { autoUpdater } from 'electron-updater'

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'vulnasstool',
  repo: 'vuln-asses-tool'
})

autoUpdater.checkForUpdatesAndNotify()
```

### Distribution Channels

| Channel | Frequency | Purpose | Source |
|---------|-----------|---------|--------|
| **Stable** | Monthly | Production-ready | GitHub Releases |
| **Beta** | Bi-weekly | Pre-release testing | GitHub Pre-releases |
| **Nightly** | Daily | Latest features | CI/CD artifacts |

---

## Scalability Considerations

### Performance Requirements

| Metric | Target | Implementation Strategy |
|--------|---------|----------------------|
| **Application Startup** | < 3 seconds | Lazy loading, code splitting |
| **SBOM Import (1000 components)** | < 5 seconds | Stream parsing, batch inserts |
| **Vulnerability Scan (1000 components)** | < 10 seconds (local) | Indexed queries, result caching |
| **Dashboard Load (100 projects)** | < 2 seconds | Virtualization, pagination |
| **Search Response (10K+ components)** | < 1 second | Full-text search index |

### Scalability Targets

| Dimension | Target | Current Implementation |
|-----------|---------|----------------------|
| **Projects** | 1,000+ | ✅ ULID-based IDs, file-based storage |
| **Components per Project** | 50,000+ | ✅ Efficient data structures |
| **Vulnerability Records** | 1,000,000+ | ✅ SQLite with indexes |
| **Database Size** | 10GB+ | ✅ Streaming import, chunked queries |
| **Concurrent Users** | Single-user | ⚠️ Future: Multi-user cloud version |

### Optimization Strategies

#### Database Optimization
```sql
-- Current Indexes
CREATE INDEX idx_cves_severity ON cves(severity);
CREATE INDEX idx_cves_cvss_score ON cves(cvss_score);
CREATE INDEX idx_cves_published_at ON cves(published_at);
CREATE INDEX idx_cpe_matches_cve_id ON cpe_matches(cve_id);
CREATE INDEX idx_cpe_matches_cpe_text ON cpe_matches(cpe_text);

-- Planned: Full-Text Search
CREATE VIRTUAL TABLE cves_fts USING fts5(description, id);
```

#### UI Optimization
- **Virtual Scrolling:** For large lists (react-window/react-virtual)
- **Lazy Loading:** Code splitting by route
- **Memoization:** React.memo for expensive components
- **Debouncing:** Search input debouncing
- **Web Workers:** Heavy computations (CVSS calculation)

#### Data Loading Optimization
- **Pagination:** Limit result sets to 100 items
- **Streaming:** Process SBOM files in chunks
- **Caching:** Cache API responses (TTL: 1-24 hours)
- **Batching:** Group database writes

---

## Open Issues and Recommendations

### Critical Issues

| ID | Issue | Priority | Recommendation |
|-----|--------|-----------|-----------------|
| **ARCH-001** | API Key Security | HIGH | Implement safeStorage (keytar) for API keys |
| **ARCH-002** | Code Signing | HIGH | Obtain certificates and configure signing |
| **ARCH-003** | Auto-updater | MEDIUM | Implement electron-updater for seamless updates |

### Architecture Improvements

| ID | Improvement | Priority | Effort |
|-----|-------------|-----------|----------|
| **ARCH-004** | Implement Virtual Scrolling | MEDIUM | 2-3 days |
| **ARCH-005** | Add Full-Text Search | MEDIUM | 1-2 days |
| **ARCH-006** | Implement Database Connection Pooling | LOW | 3-5 days |
| **ARCH-007** | Add Data Encryption at Rest | HIGH | 5-7 days |

### Future Considerations

1. **Multi-user Support:** Add authentication and RBAC (Phase 5)
2. **Cloud Sync:** Synchronize projects across devices (Phase 4)
3. **Plugin System:** Extensible architecture for custom scanners (Phase 4)
4. **API Server:** REST API for CI/CD integration (Phase 4)
5. **Performance Monitoring:** Telemetry for performance insights (Phase 3)

---

## Appendix

### Related Documents

- **PRD.md** - Product Requirements Document
- **findings.md** - Project findings and issues
- **progress.md** - Development progress tracking

### References

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [CycloneDX Specification](https://cyclonedx.org/)
- [SPDX Specification](https://spdx.dev/)
- [NVD API v2.0](https://nvd.nist.gov/developers/vulnerabilities)
- [OSV API](https://osv.dev/docs/)

---

**Document History**

| Version | Date | Author | Changes |
|---------|--------|---------|----------|
| 1.0 | 2026-02-12 | System/Software Architect Agent | Initial architecture documentation |

---

**Approval Sign-Off**

| Role | Name | Signature | Date |
|-------|-------|-----------|-------|
| System Architect | AI Assistant | | 2026-02-12 |
| Engineering Lead | TBD | | |
| Security Lead | TBD | | |
