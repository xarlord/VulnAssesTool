# VulnAssessTool - UI/UX Design & Data Models

## Application Structure

### Main Window Layout
```
┌─────────────────────────────────────────────────────────────┐
│  VulnAssessTool                                    □ - □ ×   │
├─────────────────────────────────────────────────────────────┤
│  File    Edit    View    Settings    Help                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DASHBOARD                                          │   │
│  │                                                     │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │   │
│  │  │   12    │  │    3    │  │    45   │              │   │
│  │  │Projects │  │Critical │  │Total Vulns│             │   │
│  │  └─────────┘  └─────────┘  └─────────┘              │   │
│  │                                                     │   │
│  │  [+ New Project]    [Import SBOM]                   │   │
│  │                                                     │   │
│  │  Recent Projects                                   │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ 📦 MyProject     3 vulnerabilities    [Scan] │  │   │
│  │  │ 📦 AppBackend    0 vulnerabilities    [Scan] │  │   │
│  │  │ 📦 FrontendApp  12 vulnerabilities    [Scan] │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Project Detail View
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard    MyProject                   □ - □ × │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Overview │ Components │ Vulnerabilities │ Settings │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                     │   │
│  │  Vulnerability Summary                              │   │
│  │  ┌──────┬───────┬───────┬───────┬───────┐           │   │
│  │  │CRITICAL│ HIGH  │ MEDIUM │ LOW   │ TOTAL│           │   │
│  │  │   3   │   5   │   8   │   2   │  18  │           │   │
│  │  └──────┴───────┴───────┴───────┴───────┘           │   │
│  │                                                     │   │
│  │  [Scan Now]  [Last scan: 2 hours ago]              │   │
│  │                                                     │   │
│  │  SBOM Files                                         │   │
│  │  📄 bom.json (CycloneDX)  [Remove]                 │   │
│  │  [+ Upload SBOM]                                    │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Vulnerability Detail Modal
```
┌─────────────────────────────────────────────────────────────┐
│  CVE-2024-1234                                    [Close] X │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Severity: ████████ CRITICAL (9.8)                         │
│                                                             │
│  Description                                               │
│  A remote code execution vulnerability exists in...        │
│                                                             │
│  Affected Components                                       │
│  • lodash@4.17.15                                          │
│  • webpack@5.23.0                                          │
│                                                             │
│  CVSS Score                                                │
│  Vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H      │
│                                                             │
│  References                                                │
│  🔗 NVD Entry                                              │
│  🔗 OSV Entry                                              │
│  🔗 Vendor Advisory                                        │
│                                                             │
│  [Copy CVE] [Export PDF]                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Settings Window
```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                            □ - □ × │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ General │ Appearance │ API Keys │ About            │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                     │   │
│  │  Theme                                             │   │
│  │  ◉ Light  ○ Dark  ○ System                         │   │
│  │                                                     │   │
│  │  Font Size                                         │   │
│  │  [Small] —●— [Default] ——— [Large]                 │   │
│  │                                                     │   │
│  │  Data Retention                                    │   │
│  │  Delete scan results older than: [30 days ▼]       │   │
│  │                                                     │   │
│  │                                                     │   │
│  │                                    [Save] [Cancel]  │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Color Scheme

### Light Theme
```css
--primary: #6366f1;        /* Indigo 500 */
--primary-dark: #4f46e5;    /* Indigo 600 */
--background: #ffffff;
--surface: #f8fafc;         /* Slate 50 */
--border: #e2e8f0;          /* Slate 200 */
--text-primary: #0f172a;    /* Slate 900 */
--text-secondary: #64748b;  /* Slate 500 */
```

### Dark Theme
```css
--primary: #818cf8;         /* Indigo 400 */
--primary-dark: #6366f1;    /* Indigo 500 */
--background: #0f172a;      /* Slate 900 */
--surface: #1e293b;         /* Slate 800 */
--border: #334155;          /* Slate 700 */
--text-primary: #f1f5f9;    /* Slate 100 */
--text-secondary: #94a3b8;  /* Slate 400 */
```

### Severity Colors
```css
--critical: #dc2626;        /* Red 600 */
--high: #ea580c;            /* Orange 600 */
--medium: #ca8a04;          /* Yellow 600 */
--low: #16a34a;             /* Green 600 */
```

---

## Data Models

### TypeScript Interfaces

```typescript
// Project
interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  lastScanAt?: Date;
  sbomFiles: SbomFile[];
  components: Component[];
  vulnerabilities: Vulnerability[];
  statistics: ProjectStatistics;
}

// SBOM File
interface SbomFile {
  id: string;
  filename: string;
  format: 'cyclonedx' | 'spdx';
  formatVersion: string;
  uploadedAt: Date;
  fileHash: string;
  componentCount: number;
}

// Component
interface Component {
  id: string;
  name: string;
  version: string;
  type: 'library' | 'framework' | 'application' | 'container' | 'other';
  purl?: string;           // Package URL
  cpe?: string;            // CPE identifier
  licenses: string[];
  supplier?: string;
  description?: string;
  hash?: string;
  vulnerabilities: string[]; // Vulnerability IDs
}

// Vulnerability
interface Vulnerability {
  id: string;              // CVE ID or OSV ID
  source: 'nvd' | 'osv' | 'both';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  cvssScore?: number;
  cvssVector?: string;
  cwes?: string[];         // CWE IDs
  description: string;
  references: VulnerabilityReference[];
  affectedComponents: string[]; // Component IDs
  publishedAt?: Date;
  modifiedAt?: Date;
}

// Vulnerability Reference
interface VulnerabilityReference {
  source: string;
  url: string;
  tags?: string[];
}

// Project Statistics
interface ProjectStatistics {
  totalVulnerabilities: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalComponents: number;
  vulnerableComponents: number;
}

// Scan Result
interface ScanResult {
  id: string;
  projectId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  vulnerabilitiesFound: number;
  componentsScanned: number;
  error?: string;
}

// Settings
interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'default' | 'large';
  nvdApiKey?: string;
  dataRetentionDays: number;
  autoRefresh: boolean;
}
```

---

## Component Structure

```
src/
├── main/                      # Electron main process
│   ├── index.ts              # Main entry point
│   ├── ipc/                  # IPC handlers
│   └── menu.ts               # Application menu
│
├── renderer/                  # React frontend
│   ├── App.tsx               # Root component
│   ├── main.tsx              # Renderer entry
│   │
│   ├── pages/                # Main views
│   │   ├── Dashboard.tsx
│   │   ├── ProjectDetail.tsx
│   │   └── Settings.tsx
│   │
│   ├── components/           # Reusable components
│   │   ├── ui/              # shadcn/ui components
│   │   ├── ProjectCard.tsx
│   │   ├── VulnerabilityList.tsx
│   │   ├── VulnerabilityModal.tsx
│   │   ├── ComponentList.tsx
│   │   ├── SeverityBadge.tsx
│   │   └── StatCard.tsx
│   │
│   ├── lib/                  # Core logic
│   │   ├── parsers/
│   │   │   ├── cyclonedx.ts
│   │   │   └── spdx.ts
│   │   ├── api/
│   │   │   ├── nvd.ts
│   │   │   └── osv.ts
│   │   ├── storage.ts        # Local storage
│   │   └── vuln-matcher.ts   # Matching logic
│   │
│   ├── store/                # State management
│   │   └── useStore.ts       # Zustand store
│   │
│   ├── types/                # TypeScript types
│   │   └── index.ts
│   │
│   └── styles/               # Global styles
│       └── globals.css
│
├── shared/                    # Shared code
│   └── constants.ts          # Shared constants
│
└── package.json
```

---

## User Flows

### 1. Create New Project
1. User clicks "+ New Project" on Dashboard
2. Modal appears with project name/description fields
3. User enters details and confirms
4. Project created, redirects to Project Detail view
5. User prompted to upload SBOM

### 2. Import SBOM & Scan
1. User clicks "Import SBOM" or "+ Upload SBOM"
2. File picker dialog appears
3. User selects .json or .xml file
4. File parsed and validated
5. Components extracted and stored
6. Automatic vulnerability scan triggered
7. Results displayed in Vulnerabilities tab

### 3. View Vulnerability Details
1. User sees vulnerability list with severity badges
2. User clicks on a vulnerability
3. Modal opens with full details
4. User can click external links to NVD/OSV
5. User can copy CVE ID or export as PDF

### 4. Change Settings
1. User opens Settings from menu or button
2. Changes theme (immediate preview)
3. Adjusts font size
4. Enters NVD API key (optional)
5. Clicks Save to persist changes

---

## API Integration Details

### NVD API v2.0
```typescript
// Get CVE by ID
GET https://services.nvd.nist.gov/rest/json/cves/2.0?cveId= CVE-2024-1234

// Search by CPE
GET https://services.nvd.nist.gov/rest/json/cves/2.0?cpeName=cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*

// Headers (if using API key)
apiKey: <your-api-key>
```

### OSV API v1
```typescript
// Query by package URL
POST https://api.osv.dev/v1/query
{
  "package": {
    "purl": "pkg:npm/lodash@4.17.15"
  }
}

// Get vulnerability by ID
GET https://api.osv.dev/v1/vulns/OSV-2024-1234
```

---

## Priority Features Implementation Order

1. **MVP (Minimum Viable Product)**
   - Project creation
   - CycloneDX SBOM upload
   - NVD vulnerability lookup
   - Basic dashboard
   - Vulnerability list view

2. **Essential Features**
   - SPDX support
   - OSV integration
   - Vulnerability detail modal
   - Settings (theme, API key)
   - Project deletion/editing

3. **Polish & Extras**
   - PDF export
   - Multiple SBOM files per project
   - Vulnerability filtering/sorting
   - Statistics charts
   - Keyboard shortcuts
