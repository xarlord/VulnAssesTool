# VulnAssesTool

**A comprehensive vulnerability assessment tool for SBOM analysis and security management.**

![VulnAssesTool](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Accessibility](https://img.shields.io/badge/accessibility-92%2F100-green) _(March 2026)_
![Tests](https://img.shields.io/badge/tests-3250%20passing-brightgreen) _(March 2026)_

## Overview

VulnAssesTool is an Electron-based desktop application that helps security teams and developers analyze Software Bill of Materials (SBOM) for vulnerabilities. It supports multiple SBOM formats (CycloneDX, SPDX) and provides comprehensive vulnerability assessment capabilities with advanced threat intelligence integration.

## Screenshots

Visual test captures and UI review screenshots are available in `docs/ui-reviews/screenshots/`, including dashboard, search, and settings views in both light and dark themes.

## Key Features

### Core Functionality

- **SBOM Import**: Upload and parse CycloneDX (JSON & XML) and SPDX format SBOM files
- **Vulnerability Scanning**: Automatic vulnerability lookups from NVD and OSV databases
- **Project Management**: Organize SBOMs into projects with tracking and statistics
- **Component Analysis**: View detailed component information including licenses and dependencies
- **Vulnerability Details**: In-depth vulnerability information with CVSS scores and severity ratings

### Threat Intelligence (v2.0)

#### KEV (Known Exploited Vulnerabilities)

- **CISA KEV Integration**: Real-time sync with CISA Known Exploited Vulnerabilities catalog
- **Exploitation Status**: Clear indicators for actively exploited vulnerabilities
- **Prioritization**: Automatic prioritization based on known exploitation status
- **Timeline Tracking**: Known exploitation dates and remediation deadlines

#### EPSS (Exploit Prediction Scoring System)

- **Probability Scores**: EPSS percentile and probability for each vulnerability
- **Risk-Based Filtering**: Filter by EPSS score to focus on likely-to-be-exploited CVEs
- **Trend Analysis**: Track EPSS score changes over time
- **Combined Scoring**: Integrated risk scoring combining CVSS + KEV + EPSS

### Advanced Security Features (v2.0)

#### Container Image Scanning

- **Docker & Podman**: Scan container images using Docker or Podman CLI
- **Automatic Layer Analysis**: Extract packages from all image layers
- **Package Database Detection**: Parses dpkg (Debian/Ubuntu), apk (Alpine), rpm (RHEL/Fedora)
- **CPE & PURL Generation**: Automatic CPE and PURL for each discovered package
- **Import to Project**: Add scanned packages as project components for vulnerability matching
- **Progress Tracking**: Real-time scan progress with per-layer breakdown

#### VEX (Vulnerability Exploitability eXchange)

- **CycloneDX VEX 1.5**: Generate standards-compliant VEX documents
- **Status Tracking**: Track vulnerable, not_affected, fixed, and under_investigation status
- **Justification Codes**: ISO 21434 compliant justifications (component_not_present, etc.)
- **Export Formats**: JSON and XML VEX document export

#### FPF (False Positive Filter) System

- **ISO 21434 Compliance**: Automotive-grade false positive management
- **Audit Trail**: Complete history of all filter decisions
- **Bulk Operations**: Apply filters to multiple vulnerabilities at once
- **Export & Import**: Share filter configurations across teams

### UX Excellence (v2.0)

#### Command Palette

- **Quick Access**: `Ctrl/Cmd + K` opens command palette
- **Fuzzy Search**: Find commands, pages, and actions instantly
- **Keyboard-First**: Full keyboard navigation support
- **Recent Items**: Quick access to recent projects and scans

#### Dependency Graph

- **Visual Analysis**: Interactive dependency relationship visualization
- **Vulnerability Highlighting**: See vulnerable dependencies at a glance
- **Filter & Search**: Find specific components in large dependency trees
- **Export**: Export graphs as images or data

#### Onboarding Tour

- **Guided Setup**: Step-by-step introduction for new users
- **Feature Discovery**: Highlights key features and capabilities
- **Skippable**: Users can skip or restart the tour anytime
- **Contextual Help**: In-app help and tooltips

#### Improved Loading States

- **Skeleton Loaders**: Smooth loading placeholders replace spinners
- **Empty States**: Helpful guidance when no content exists
- **Progressive Loading**: Content reveals progressively for better UX
- **Offline Indicator**: Clear visual indication when offline

#### Executive Dashboard

- **Risk Gauge**: Visual risk assessment gauge for at-a-glance status
- **Project Health Comparison**: Compare health scores across projects
- **Vulnerability Trends**: Track vulnerability counts over time
- **Team Productivity**: Monitor remediation progress and activity
- **Compliance Status**: Track compliance posture across projects

### Performance Optimizations

#### FTS5 Full-Text Search

- **10-100x faster** than traditional LIKE queries
- BM25 ranking for relevance-based results
- Intelligent tokenization and stemming
- Multi-column search across vulnerability data

#### XML Streaming Parser

- Handles large XML files efficiently (up to 50MB)
- Protection against XML Entity Expansion (XXE) attacks
- Schema validation for CycloneDX and SPDX
- Timeout protection (30-second limit)

#### Virtual Scrolling

- Efficient rendering of large vulnerability lists (10,000+ items)
- Only renders visible items for optimal memory usage
- Smooth scrolling performance regardless of dataset size

### Security Improvements

#### Secure API Key Storage

- Platform-specific encryption (DPAPI, Keychain, libsecret)
- Automatic migration from plaintext to encrypted storage
- Keys removed from renderer process memory
- No localStorage persistence of sensitive data

#### Content Security Policy

- Custom CSP headers restrict script sources
- Only allows connections to NVD and OSV APIs
- Prevents XSS and injection attacks
- Blocks unauthorized external connections

#### Input Validation & Sanitization

- SQL injection prevention on all database queries
- File size limits enforced (50MB max)
- Content-type validation for uploads
- IPC request validation and rate limiting

#### IPC Rate Limiting

- Per-channel request limits prevent abuse
- Priority queuing for critical operations
- Sliding window time-based tracking
- Configurable thresholds for different operations

### CVE Database Integration

VulnAssesTool includes a comprehensive local CVE database with full historical data from 1999 to present.

#### 📚 Full CVE Database

- **250,000+ CVEs**: Complete historical data from NVD (1999-present)
- **Offline Operation**: Works fully offline after initial database sync
- **Fast Searches**: Sub-second queries using SQLite FTS5 full-text search
- **Smart Sync**: Priority-based incremental sync (recent > medium > historical)

#### ⚡ Performance Optimized

- **Composite Indexes**: Optimized for CPE lookups, severity filtering, and year-based queries
- **Chunked Imports**: 1000 CVEs per batch for memory efficiency
- **Resume Capability**: Can resume interrupted imports from last position
- **Concurrent Downloads**: Configurable parallel requests (default: 3 concurrent)

#### 🔄 Sync Features

- **Delta Sync**: Only fetch CVEs modified since last sync
- **Auto-Sync**: Configurable schedule (daily/weekly/monthly/manual)
- **Bandwidth Aware**: Pause on metered connections
- **Idle Detection**: Sync during system idle time

#### 📊 Database Management

- **Storage Limits**: Configurable maximum database size
- **Pruning Options**: Remove CVEs older than specified year
- **Index Rebuild**: Rebuild indexes for optimal performance
- **Database Reset**: Clean slate when needed

### Advanced Features

#### 📊 Health Dashboard

- **Real-time Health Scoring**: Automatic security scores based on vulnerability severity and recency
- **Trend Analysis**: 7-day, 30-day, and 90-day trend visualization
- **Risk Levels**: Color-coded health indicators (Excellent/Good/Fair/Poor/Critical)
- **Staleness Indicators**: Track when data was last updated

#### 🔍 Global Search

- **Fast Search**: Instant search across projects, components, and vulnerabilities
- **Keyboard Navigation**: Arrow keys, Enter, and Escape shortcuts
- **Result Grouping**: Organized results by type for easy navigation
- **Search Suggestions**: Auto-suggest as you type

#### 🔔 Notification System

- **Toast Notifications**: In-app notifications for important events
- **Desktop Notifications**: Native OS notifications (when enabled)
- **Category Preferences**: Enable/disable notifications per category
  - Critical vulnerabilities
  - Scan completions
  - Available updates
  - System events
- **Notification Center**: Centralized notification hub with read/unread tracking

#### ⚙️ Settings Profiles

- **Profile Management**: Create and switch between different configuration profiles
- **Import/Export**: Backup and restore settings as JSON files
- **Default Profile**: Mark frequently-used profiles as default
- **Profile Isolation**: Keep separate settings for different workflows

#### 🎯 Filter Presets

- **Save Filters**: Save frequently-used filter combinations as presets
- **Quick Apply**: One-click filter application
- **CVSS Range Slider**: Filter vulnerabilities by CVSS score range
- **Multi-Select Filters**: Filter by severity, source, patch availability

#### 📦 Bulk Operations

- **Multi-Select**: Select multiple items for batch operations
- **Bulk Export**: Export multiple projects or vulnerabilities at once
- **Bulk Delete**: Remove multiple items with confirmation

#### 📋 Remediation Queue

- **Prioritized List**: Vulnerabilities sorted by severity and importance
- **Patch Status**: Quick view of available patches
- **Quick Actions**: Direct access to remediation steps

#### 📤 Export & Reporting

- **CSV Export**: Export vulnerability and component data to CSV
- **JSON Export**: Full project data export in machine-readable format
- **PDF Reports**: Generate formatted security assessment reports (via Electron printToPDF)
- **ISO 21434 PDF**: Automotive-grade false positive analysis reports with full compliance formatting
- **Audit Log Export**: Export audit trail in CSV, JSON, or PDF format
- **VEX Export**: Generate CycloneDX VEX 1.5 documents

## Installation

### Download Pre-built Binaries

Download the latest release for your platform from the [Releases](https://github.com/xarlord/d-fence-vulnerability-assesment-tool/releases) page:

| Platform | Format    | File                              |
| -------- | --------- | --------------------------------- |
| Windows  | Installer | `VulnAssesTool-Setup-2.0.0.exe`   |
| Windows  | Portable  | `VulnAssesTool-2.0.0-win.zip`     |
| macOS    | DMG       | `VulnAssesTool-2.0.0.dmg`         |
| macOS    | ZIP       | `VulnAssesTool-2.0.0-mac.zip`     |
| Linux    | AppImage  | `VulnAssesTool-2.0.0.AppImage`    |
| Linux    | DEB       | `vulnassesstool_2.0.0_amd64.deb`  |
| Linux    | RPM       | `vulnassesstool-2.0.0.x86_64.rpm` |

### Prerequisites (Development)

- Node.js 18+
- npm or yarn

### Development Setup

```bash
# Clone the repository
git clone https://github.com/xarlord/d-fence-vulnerability-assesment-tool.git
cd vuln-assess-tool

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Production Build from Source

```bash
# Build the application
npm run build

# Package for current platform
npm run dist

# Package for specific platforms
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
npm run dist:all     # All platforms
```

## Usage

### Creating a Project

1. Click "Create New Project" on the Dashboard
2. Enter project name and optional description
3. Import SBOM files (CycloneDX JSON or SPDX)
4. Wait for vulnerability analysis to complete

### Viewing Vulnerabilities

- Navigate to the Project Detail page
- View vulnerabilities grouped by severity
- Click on any vulnerability for detailed information including:
  - CVSS score and vector
  - CWE classifications
  - KEV status (if known exploited)
  - EPSS score (exploit probability)
  - Affected components
  - Available patches
  - External references (NVD, OSV)

### Using Threat Intelligence

- **KEV**: Vulnerabilities with known exploitation are highlighted with special indicators
- **EPSS**: Sort and filter by exploit probability scores
- **Combined View**: Use KEV + EPSS + CVSS for comprehensive risk assessment

### Generating VEX Documents

1. Navigate to a project with vulnerabilities
2. Use the FPF system to mark vulnerability status
3. Export as CycloneDX VEX document (JSON or XML)

### Using Health Dashboard

- View overall security health on the Dashboard
- Check individual project health scores
- Monitor trends over time (7, 30, 90 days)
- Identify projects needing attention

### Using Executive Dashboard

- Navigate to the Executive Dashboard from the main navigation
- View risk gauge for overall security posture
- Compare project health scores side by side
- Track vulnerability trends and compliance status
- Monitor team remediation productivity
- Click "Refresh" to reload analytics from current store data
- Click "Export Report" to download an executive summary PDF

### Scanning Container Images

1. Open a project and click **Scan Container** in the SBOM Files section
2. Enter the image reference (e.g., `nginx:1.21`, `alpine:latest`, `ghcr.io/org/image:v1`)
3. Select the container runtime (**Docker** or **Podman**)
4. Click **Scan Image** — the image is pulled, layers are extracted, and packages are detected
5. Review the results: layers breakdown, package counts, managers (dpkg/apk/rpm)
6. Click **Add Packages to Project** to import as components for vulnerability matching

**Prerequisites:** Docker or Podman must be installed and running on the host system.

### Generating ISO 21434 Reports

1. Navigate to a project and use the FPF system to filter false positives
2. From the FPF page, generate an ISO 21434 compliance report
3. Export as PDF with full audit trail, risk levels, and signature sections

### Exporting Audit Logs

1. Open the Audit Log panel from the sidebar
2. Apply any filters (date range, event type, severity)
3. Click the **Export** dropdown to choose CSV, JSON, or PDF format
4. The export respects your current filter selection

### Using Command Palette

- Press `Ctrl/Cmd + K` to open
- Type to search for commands, pages, or actions
- Use arrow keys to navigate
- Press Enter to execute

### Using Global Search

- Press the search icon or use the search page
- Type to search across all data
- Use arrow keys to navigate results
- Press Enter to open selected item

### Managing Notifications

- Click the bell icon in the header to view notifications
- Use "Mark all as read" to clear unread notifications
- Configure notification preferences in Settings

### Working with Settings Profiles

1. Go to Settings → Profiles
2. Click "Create New Profile" to save current settings
3. Give your profile a name and description
4. Optionally copy from an existing profile
5. Switch profiles anytime from the Settings page

### Exporting Data

- **Single Project**: Use the Export button on Project Detail page
- **All Projects**: Use "Export All Projects" on Dashboard
- **Formats**: CSV, JSON, PDF reports, VEX documents

## Development

### Project Structure

```
vuln-assess-tool/
├── electron/                # Electron main process
│   ├── main.ts              # App entry point (IPC handlers, window management)
│   ├── preload.ts           # Preload script (bridge to renderer)
│   ├── database/            # SQLite, NVD, OSV, FTS, bulk import
│   ├── services/            # Backup, cache, intelligence (KEV/EPSS), container scanning
│   ├── main/storage/        # Secure key storage (DPAPI/Keychain)
│   └── types/               # Shared electron types
├── src/
│   ├── renderer/            # React application
│   │   ├── components/      # UI components (ui/, cvss/, charts/, etc.)
│   │   ├── pages/           # Route pages (Dashboard, Settings, Search, etc.)
│   │   ├── lib/             # Business logic
│   │   │   ├── services/    # FPF, VEX, Container, Reports, Intelligence
│   │   │   ├── parsers/     # CycloneDX, SPDX parsers
│   │   │   ├── generators/  # CycloneDX, Excel generators
│   │   │   ├── export/      # CSV, JSON, PDF export
│   │   │   ├── analytics/   # Metrics, insights, report builder
│   │   │   ├── audit/       # Audit logging and export
│   │   │   ├── database/    # Client-side DB helpers
│   │   │   ├── health/      # Health score, trends
│   │   │   ├── notifications/ # Notification service & store
│   │   │   ├── search/      # Search index
│   │   │   ├── settings/    # Profiles, import/export
│   │   │   └── tour/        # Onboarding tour steps
│   │   └── store/           # Zustand state management
│   ├── shared/              # Shared types and constants
│   └── main/                # Legacy (types only)
├── orchestrator/            # Watchdog autonomous testing system
├── scripts/                 # Build, dev, and utility scripts
├── build/                   # Electron-builder resources (icons, entitlements)
├── e2e/                     # Playwright E2E tests
├── tests/                   # BDD and integration tests
└── docs/                    # Documentation and screenshots
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:analyze` - Build with bundle analysis
- `npm run lint` - Run ESLint
- `npm test` - Run test suite
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:e2e` - Run Playwright E2E tests
- `npm run test:bdd` - Run BDD tests
- `npm run dist` - Build and package for current platform
- `npm run dist:all` - Build and package for all platforms
- `npm run watchdog` - Run autonomous testing with auto-fix

### Watchdog Orchestrator (Autonomous Testing)

Watchdog is a self-healing testing system that verifies the application works correctly after updates:

```bash
# Run full verification with AI auto-fix
npm run watchdog

# Run specific phase only
npm run watchdog:phase build

# Report errors without auto-fixing
npm run watchdog:no-fix
```

**Verification Phases:**

1. **Build** - TypeScript compilation & Vite bundling
2. **Startup** - Electron main process initialization
3. **Render** - React UI renders without errors
4. **Functional** - Smoke tests for core features

**Features:**

- Real-time error interception from terminal, Vite, Electron, React
- AI-powered auto-fix using GLM API
- Session persistence and recovery
- Comprehensive markdown & JSON reports

**Requires:** `GLM_API_KEY` environment variable for AI auto-fix functionality.

See [docs/WATCHDOG_QUICK_REFERENCE.md](docs/WATCHDOG_QUICK_REFERENCE.md) for details.

### Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Desktop**: Electron 40
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Database**: better-sqlite3 + sql.js (WASM)
- **Testing**: Vitest + React Testing Library + Playwright
- **Icons**: Lucide React
- **Charts**: Recharts
- **Graphs**: React Flow + Cytoscape
- **PDF**: jsPDF + jspdf-autotable
- **Excel**: SheetJS (xlsx)
- **Forms**: react-hook-form + Zod

### API Integration

- **NVD API v2.0**: National Vulnerability Database with enhanced bulk download support
- **OSV API**: Open Source Vulnerabilities
- **CISA KEV**: Known Exploited Vulnerabilities catalog
- **FIRST EPSS**: Exploit Prediction Scoring System
- **Rate Limiting**: Built-in request throttling (5 req/30s without key, 50 req/30s with key)
- **Response Caching**: 1-hour TTL cache for API responses
- **Retry Logic**: Exponential backoff for transient failures

## Keyboard Shortcuts

| Shortcut       | Action                               |
| -------------- | ------------------------------------ |
| `Ctrl/Cmd + K` | Open command palette / global search |
| `Arrow Keys`   | Navigate search results              |
| `Enter`        | Open selected result                 |
| `Escape`       | Clear search / close modals          |
| `Ctrl/Cmd + ,` | Open Settings                        |

## Configuration

### Application Settings

- **Theme**: Light, Dark, or System
- **Font Size**: Small, Default, Large
- **Data Retention**: Configure how long to keep scan data
- **Auto-Refresh**: Enable automatic vulnerability data refresh
- **API Keys**: Optional NVD API key for higher rate limits

### CVE Database Settings

- **Sync Schedule**: Daily, Weekly, Monthly, or Manual
- **Storage Limit**: Maximum database size (512MB - Unlimited)
- **Prune Old CVEs**: Option to remove CVEs older than specified year
- **Search Result Limit**: 50, 100, 200, 500, or 1000 results
- **Search Cache**: Enable/disable with configurable size (32-256MB)
- **Performance Tuning**: Cache TTL and other optimization settings

### Threat Intelligence Settings

- **KEV Sync**: Enable/disable CISA KEV catalog sync
- **EPSS Updates**: Configure EPSS score update frequency
- **Combined Scoring**: Adjust weighting for CVSS + KEV + EPSS

### Notification Preferences

- Enable/disable notifications globally
- Enable desktop notifications
- Configure per-category preferences

### NVD API Configuration

#### Rate Limits

| Mode            | Requests per 30 seconds |
| --------------- | ----------------------- |
| Without API Key | 5                       |
| With API Key    | 50                      |

#### Getting an API Key

1. Visit [NVD API Key Request](https://nvd.nist.gov/developers/request-an-api-key)
2. Fill out the form with your organization details
3. Receive your API key via email (usually 1-2 business days)
4. Enter the key in Settings > API Configuration

#### Recommended Sync Schedules

| Use Case              | Recommended Schedule |
| --------------------- | -------------------- |
| Active Security Teams | Daily                |
| Regular Development   | Weekly               |
| Periodic Reviews      | Monthly              |
| Air-gapped Systems    | Manual               |

## Data Privacy

- All data is stored locally on your machine
- No data is sent to external servers except vulnerability databases
- SBOM files and project data remain on your local system
- Exported data does not contain sensitive credentials
- API keys encrypted using platform secure storage
- No sensitive data in renderer process or localStorage

## Roadmap

### Completed (v2.0.0)

#### Phase 1: Foundation ✅

- Database Schema Enhancement for 250K+ CVEs
- NVD API v2.0 Bulk Download Enhancement
- Bulk Data Import System with Resume Capability
- Incremental Sync Strategy with Priority Scheduling
- Settings Page Database Management UI
- Health Dashboard
- Global Search, Notifications, Filters, Bulk Operations
- Settings Profiles

#### Phase 2: Security Features ✅

- KEV (Known Exploited Vulnerabilities) Integration
- EPSS (Exploit Prediction Scoring System) Integration
- Combined Risk Scoring (CVSS + KEV + EPSS)

#### Phase 3: UX Excellence ✅

- VEX (Vulnerability Exploitability eXchange) Generator
- FPF (False Positive Filter) System with ISO 21434 Compliance
- Command Palette
- Dependency Graph Visualization
- Onboarding Tour
- Accessibility (WCAG 2.1 AA) - 92/100 score

#### Phase 4: Branding & Polish ✅

- Application Branding & Icons
- Loading States & Skeleton Loaders
- Empty State Components
- Error Boundaries
- Performance Optimization (Bundle analysis, lazy loading)
- Visual Consistency Audit (9/10 score)
- Documentation Updates

#### Phase 5: Autonomous Testing (Watchdog) ✅

- Multi-phase verification system (build, startup, render, functional)
- Real-time error interception from all sources
- AI-powered auto-fix using GLM API (glm-5)
- Session state persistence and recovery
- Comprehensive report generation

#### Phase 6: Feature Completion ✅

- Container image scanning (Docker/Podman) with layer extraction and package detection
- CycloneDX XML parsing support (in addition to JSON)
- ISO 21434 PDF report generation (jsPDF)
- Audit log export (CSV, JSON, PDF)
- PDF report generation via Electron printToPDF
- About dialog update checker (GitHub Releases API)
- Executive Dashboard real data refresh
- Auto-updater interval scheduling
- All missing IPC handlers wired (auto-sync, FTS search, cache management)

### Planned (v2.1)

- Fix remaining contrast issues (muted text 4.34 → 4.5:1)
- Lazy load heavy components (charts, dependency graph)
- Pre-seeded database distribution

### Planned (v2.5)

- Additional notification types
- Scheduled reports
- Enhanced PDF reports with charts
- Web Workers for large dataset processing
- Plugin system for custom vulnerability providers

### Planned (v3.0)

- SBOM generation from source code
- CI/CD integration (GitHub Actions, GitLab CI)
- AI-powered vulnerability prioritization
- Team collaboration features
- Cloud sync for settings
- Multi-language support (i18n)

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to the main repository.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or suggestions, please open an issue on GitHub repository.

---

**Version:** 2.0.0
**Last Updated:** March 2026
**Status:** Production Ready
**Accessibility Score:** 92/100 _(Lighthouse audit, March 2026)_
**Test Coverage:** 95%+
**Bundle Size:** ~570KB (gzip) _(as of March 2026)_
