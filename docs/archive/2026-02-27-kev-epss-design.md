# KEV & EPSS Integration Design

**Created:** 2026-02-27
**Status:** Approved
**Phase:** 2 (Security Features)
**Branch:** `feature/v2-phase2-security`

---

## Overview

Integrate CISA Known Exploited Vulnerabilities (KEV) catalog and EPSS (Exploit Prediction Scoring System) to provide exploit intelligence and risk prioritization.

## Design Decisions

| Decision            | Choice                        | Rationale                                   |
| ------------------- | ----------------------------- | ------------------------------------------- |
| KEV Data Source     | Hybrid (bundled + daily sync) | Works offline from day one, stays current   |
| EPSS Data Source    | On-demand API lookup          | Smaller footprint, scores change frequently |
| Risk Prioritization | Composite score (0-100)       | Easy to understand, single sortable column  |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    External Data Sources                     │
├─────────────────────────┬───────────────────────────────────┤
│  CISA KEV Catalog       │  EPSS API (first.org)             │
│  (JSON, daily sync)     │  (per-CVE, on-demand)             │
└───────────┬─────────────┴──────────────┬────────────────────┘
            │                            │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Electron Main Process                       │
├─────────────────────────┬───────────────────────────────────┤
│  KevService             │  EpssService                      │
│  - Load bundled data    │  - API client                     │
│  - Daily sync           │  - Cache management (24h TTL)     │
│  - kev_catalog table    │  - epss columns in cves           │
├─────────────────────────┴───────────────────────────────────┤
│                      IPC Bridge                              │
├─────────────────────────────────────────────────────────────┤
│                    Renderer Process                          │
├─────────────────────────┬───────────────────────────────────┤
│  KevBadge               │  RiskScoreColumn                  │
│  - "Actively Exploited" │  - Composite 0-100 score          │
│  - Red warning badge    │  - Sort by risk priority          │
└─────────────────────────┴───────────────────────────────────┘
```

---

## Database Schema

### New Table: `kev_catalog`

```sql
CREATE TABLE kev_catalog (
  cve_id TEXT PRIMARY KEY,
  vendor_project TEXT,
  product TEXT,
  vulnerability_name TEXT,
  date_added TEXT,
  short_description TEXT,
  required_action TEXT,
  due_date TEXT,
  known_ransomware_use BOOLEAN DEFAULT 0,
  notes TEXT
);

CREATE INDEX idx_kev_date_added ON kev_catalog(date_added);
CREATE INDEX idx_kev_cve ON kev_catalog(cve_id);
```

### Modified Table: `cves`

```sql
ALTER TABLE cves ADD COLUMN is_kev BOOLEAN DEFAULT 0;
ALTER TABLE cves ADD COLUMN epss_score REAL;
ALTER TABLE cves ADD COLUMN epss_percentile REAL;
ALTER TABLE cves ADD COLUMN epss_updated_at TEXT;
```

### Migrations

- Migration 10: Create `kev_catalog` table
- Migration 11: Add EPSS columns to `cves` table

---

## KevService

**Location:** `electron/services/intelligence/KevService.ts`

```typescript
interface KevService {
  initialize(): Promise<void>
  loadBaseline(): Promise<void>
  syncFromCisa(): Promise<SyncResult>
  isKev(cveId: string): Promise<boolean>
  getKevDetails(cveId: string): Promise<KevEntry | null>
  getAllKevIds(): Promise<Set<string>>
}

interface KevEntry {
  cveId: string
  vendorProject: string
  product: string
  vulnerabilityName: string
  dateAdded: string
  requiredAction: string
  dueDate?: string
  knownRansomwareUse: boolean
}

interface SyncResult {
  success: boolean
  added: number
  removed: number
  unchanged: number
  error?: string
}
```

**Sync Schedule:**

- On app startup: Check if sync needed (compare last_sync with current date)
- Manual trigger: Settings page "Sync KEV Now" button
- Auto-sync: Every 24 hours if app is running

**Error Handling:**

- Fallback to bundled data if CISA URL unreachable
- Retry with exponential backoff (3 attempts)
- Log sync failures but don't block app usage

---

## EpssService

**Location:** `electron/services/intelligence/EpssService.ts`

```typescript
interface EpssService {
  getEpssScore(cveId: string): Promise<EpssScore | null>
  getEpssScores(cveIds: string[]): Promise<Map<string, EpssScore>>
  refreshEpssScore(cveId: string): Promise<EpssScore | null>
  cleanupCache(): Promise<number>
}

interface EpssScore {
  cveId: string
  score: number // 0.0 to 1.0
  percentile: number // 0.0 to 1.0
  fetchedAt: Date
}
```

**API Details:**

- Endpoint: `https://api.first.org/data/v1/epss`
- Query: `?cve=CVE-2024-1234` or `?cve=CVE-2024-1234,CVE-2024-5678` (batch up to 100)
- Rate limit: 10 req/sec max (self-imposed)
- Response time: ~200-500ms

**Cache Strategy:**

- Store in `cves` table with 24-hour TTL
- Check `epss_updated_at` before API call
- Background cleanup of stale entries weekly

---

## Risk Score Calculation

**Location:** `src/renderer/lib/services/riskScore.ts`

```typescript
interface RiskScoreResult {
  score: number // 0-100
  factors: {
    kev: number // 0 or 50
    epss: number // 0-30
    severity: number // 5-20
  }
  breakdown: string
}

function calculateRiskScore(input: {
  isKev: boolean
  epssPercentile: number | null
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
}): RiskScoreResult
```

**Scoring Formula:**

- KEV: 50 points if actively exploited
- EPSS: 0-30 points based on percentile (percentile \* 30)
- Severity: Critical=20, High=15, Medium=10, Low=5, None=0
- Total: Min(100, kev + epss + severity)

---

## UI Components

| Component              | Location                                   | Purpose                               |
| ---------------------- | ------------------------------------------ | ------------------------------------- |
| `KevBadge.tsx`         | `src/renderer/components/vulnerabilities/` | Red "Actively Exploited" badge        |
| `EpssCell.tsx`         | `src/renderer/components/vulnerabilities/` | EPSS percentile with color coding     |
| `RiskScoreCell.tsx`    | `src/renderer/components/vulnerabilities/` | Composite score 0-100 with visual bar |
| `RiskScoreTooltip.tsx` | `src/renderer/components/vulnerabilities/` | Breakdown on hover                    |

**Color Coding:**

- KEV Badge: Red background with white text
- EPSS: Green (<50%), Yellow (50-80%), Red (>80%)
- Risk Score: Gradient from green (0) to red (100)

---

## Task List

| ID     | Task                                             | Effort | Depends On             |
| ------ | ------------------------------------------------ | ------ | ---------------------- |
| P2-001 | Create kev_catalog database table (migration 10) | 0.5d   | -                      |
| P2-002 | Add EPSS columns to cves table (migration 11)    | 0.5d   | -                      |
| P2-003 | Create bundled KEV baseline data                 | 0.5d   | -                      |
| P2-004 | Implement KevService                             | 1d     | P2-001, P2-003         |
| P2-005 | Add KEV sync to startup workflow                 | 0.5d   | P2-004                 |
| P2-006 | Implement EpssService                            | 1d     | P2-002                 |
| P2-007 | Create IPC handlers for KEV/EPSS                 | 0.5d   | P2-004, P2-006         |
| P2-008 | Implement risk score calculation                 | 0.5d   | -                      |
| P2-009 | Create KevBadge component                        | 0.5d   | P2-007                 |
| P2-010 | Create EpssCell component                        | 0.5d   | P2-007                 |
| P2-011 | Create RiskScoreCell component                   | 0.5d   | P2-008                 |
| P2-012 | Add KEV/EPSS columns to vulnerability list       | 0.5d   | P2-009, P2-010, P2-011 |
| P2-013 | Add KEV sync to Settings page                    | 0.5d   | P2-004                 |
| P2-014 | Write unit tests                                 | 1.5d   | All                    |
| P2-015 | Write E2E tests                                  | 1d     | All                    |

**Total: ~10 days**

---

## Success Criteria

- [ ] KEV data loads on first launch from bundled baseline
- [ ] KEV syncs daily from CISA when online
- [ ] EPSS scores fetched on-demand and cached for 24h
- [ ] Risk score displayed on all vulnerability lists
- [ ] Sort by risk score works correctly
- [ ] All unit tests passing (95%+ coverage)
- [ ] E2E tests for KEV badge display
